import {
  barText,
  checkChord,
  expectedStrokes,
  judgeBar,
  judgePace,
  paceText,
  previewEvents,
  speedFactor,
  stepMatches,
  stepMs,
} from '../domain/songs';
import type {
  BarJudgement,
  ChordCheck,
  ExpectedStroke,
  Pace,
  PlayedStroke,
  PreviewEvent,
  Song,
  SpeedId,
  StepResult,
} from '../domain/songs';
import type { AudioOutput } from '../ports/audio-output';
import type { Clock } from '../ports/clock';
import type { Midi } from '../domain/note';
import type { NoteInput, Unsubscribe } from '../ports/note-input';
import type { StrumEvent, StrumListener } from './strum-listener';

/** Un sonido a menos de esto del anterior es la misma pulsación (la cuerda aún suena). */
const MIN_GAP_MS = 250;
/** Tras escuchar la canción el micrófono sigue oyendo la sala un momento: no cuenta como tocar. */
const PREVIEW_GUARD_MS = 700;

/** Pone una función en hora; devuelve cómo cancelarla. */
export type Schedule = (run: () => void, ms: number) => () => void;

export type SongPhase = 'listo' | 'tocando' | 'terminada';

export interface SongFeedback {
  readonly text: string;
  readonly pace: Pace;
  /** El paso al que llegaste (el que se juzgó). */
  readonly step: number;
}

/** Cómo salió el rasgueo de un compás: los golpes y el acorde que se oyó. */
export interface BarReport {
  readonly judgement: BarJudgement;
  readonly chord: ChordCheck | null;
}

/** El compás de rasgueo que se está tocando: los golpes que pide y los que van. */
export interface LiveBar {
  readonly expected: readonly ExpectedStroke[];
  readonly strokes: readonly PlayedStroke[];
}

export interface SongSnapshot {
  readonly open: boolean;
  readonly song: Song | null;
  readonly speed: SpeedId;
  readonly phase: SongPhase;
  /** El paso que toca ahora. */
  readonly index: number;
  readonly results: readonly (StepResult | null)[];
  /** El rasgueo de cada compás ya tocado (solo en los acordes). */
  readonly bars: readonly (BarReport | null)[];
  /** El compás de rasgueo en curso (entre su primer golpe y su final), si lo hay. */
  readonly live: LiveBar | null;
  readonly feedback: SongFeedback | null;
  /** Una nota que no era la del paso (solo si se oyó con seguridad). */
  readonly wrong: Midi | null;
  /** Lo que debería tardar llegar al paso actual (`null` en el primero: ahí empieza el tiempo). */
  readonly idealMs: number | null;
  /** Cambia con cada paso (la pantalla reinicia con él la barra del tiempo ideal). */
  readonly turn: number;
  /** Está sonando la canción (la «vista previa»), y por qué paso va. */
  readonly previewing: boolean;
  readonly previewIndex: number | null;
}

const CLOSED: SongSnapshot = {
  open: false,
  song: null,
  speed: 'normal',
  phase: 'listo',
  index: 0,
  results: [],
  bars: [],
  live: null,
  feedback: null,
  wrong: null,
  idealMs: null,
  turn: 0,
  previewing: false,
  previewIndex: null,
};

/**
 * Caso de uso de las canciones: espera a que toques cada paso, mide cuánto tardaste en llegar a él frente a
 * lo que tocaba al tempo elegido y lo dice («va bien», «vas lento», «el cambio de acorde tardó demasiado»).
 * No hay reloj que corra solo: el tiempo cuenta desde tu primer sonido y cada paso lo marca tu propio ataque.
 */
export class SongService {
  private readonly input: NoteInput | undefined;
  private readonly listening: { enter(): void; leave(): void } | undefined;
  private readonly listeners = new Set<() => void>();
  private unsubscribe: Unsubscribe | null = null;
  private lastHitAt = -Infinity;
  private snapshot: SongSnapshot = CLOSED;
  private readonly audio: AudioOutput | undefined;
  private readonly clock: Clock | undefined;
  private readonly schedule: Schedule;
  private cancelPreview: (() => void) | null = null;
  private sounding = new Set<number>();
  private ignoreUntil = -Infinity;
  private readonly strums: StrumListener | undefined;
  private strumUnsubscribe: Unsubscribe | null = null;
  /** El compás de rasgueo en curso: desde el primer golpe hasta que pasa a lo siguiente. */
  private bar: {
    readonly t0: number;
    readonly expected: readonly ExpectedStroke[];
    readonly strokes: PlayedStroke[];
    chord: ChordCheck | null;
    readonly pace: StepResult | null;
    cancel: (() => void) | null;
  } | null = null;

  constructor(deps: {
    readonly input?: NoteInput | undefined;
    /** Cómo escucha el micrófono mientras hay una canción abierta (y cómo vuelve a escuchar al salir). */
    readonly listening?: { enter(): void; leave(): void } | undefined;
    /** Con él se puede escuchar la canción antes de tocarla. */
    readonly audio?: AudioOutput | undefined;
    readonly clock?: Clock | undefined;
    /** Cómo se pone una función en hora (el navegador usa un temporizador); sin él, la canción no avanza sola. */
    readonly schedule?: Schedule | undefined;
    /** Oye los golpes y los acordes del rasgueo (los pasos de acorde se juzgan con él, no con notas sueltas). */
    readonly strums?: StrumListener | undefined;
  }) {
    this.input = deps.input;
    this.listening = deps.listening;
    this.audio = deps.audio;
    this.clock = deps.clock;
    this.schedule = deps.schedule ?? (() => () => undefined);
    this.strums = deps.strums;
  }

  getSnapshot = (): SongSnapshot => this.snapshot;

  subscribe = (listener: () => void): Unsubscribe => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Abre una canción desde el principio y empieza a escuchar las notas. */
  open(song: Song, speed: SpeedId = 'normal'): void {
    this.unsubscribe?.();
    this.unsubscribe = this.input?.subscribe((event) => this.onNote(event)) ?? null;
    this.strumUnsubscribe?.();
    this.strumUnsubscribe = null;
    if (this.strums && song.steps.some((step) => step.kind === 'acorde')) {
      this.strumUnsubscribe = this.strums.subscribe((event) => this.onStrum(event));
      this.strums.start('acorde');
    } else {
      this.strums?.stop();
    }
    if (!this.snapshot.open) this.listening?.enter();
    this.begin(song, speed);
  }

  close(): void {
    this.endPreview(false);
    if (this.snapshot.open) this.listening?.leave();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.strumUnsubscribe?.();
    this.strumUnsubscribe = null;
    this.strums?.stop();
    this.dropBar();
    this.lastHitAt = -Infinity;
    this.set(CLOSED);
  }

  /** Vuelve al primer paso (con la misma velocidad). */
  restart(): void {
    if (this.snapshot.song) this.begin(this.snapshot.song, this.snapshot.speed);
  }

  /** Cambia la velocidad (empieza de nuevo: los tiempos esperados ya no valen). */
  setSpeed(speed: SpeedId): void {
    if (!this.snapshot.song || speed === this.snapshot.speed) return;
    this.begin(this.snapshot.song, speed);
  }

  /** Hay con qué escuchar la canción. */
  canPreview(): boolean {
    return this.audio !== undefined;
  }

  /**
   * Hace sonar la canción entera a la velocidad elegida, paso a paso (solo antes de empezar a tocar o al
   * terminar). Mientras suena no se oye al micrófono, y un momento después tampoco.
   */
  preview(): void {
    const { song, speed, phase, previewing } = this.snapshot;
    const audio = this.audio;
    if (!audio || !song || !this.snapshot.open || previewing || phase === 'tocando') return;
    const events = previewEvents(song, speed);
    this.set({ ...this.snapshot, previewing: true, previewIndex: 0, wrong: null });
    const run = (position: number): void => {
      const event = events[position];
      if (!event) {
        this.endPreview(true);
        return;
      }
      this.play(event, audio);
      const next = events[position + 1];
      if (!next) {
        // Un último respiro para que se oiga el final antes de dar la canción por terminada.
        this.cancelPreview = this.schedule(() => this.endPreview(true), 400);
        return;
      }
      const wait = next.at - event.at;
      if (wait <= 0) run(position + 1);
      else this.cancelPreview = this.schedule(() => run(position + 1), wait);
    };
    run(0);
  }

  /** Corta la canción si suena. */
  stopPreview(): void {
    this.endPreview(true);
  }

  private play(event: PreviewEvent, audio: AudioOutput): void {
    if (event.type === 'paso') {
      this.set({ ...this.snapshot, previewIndex: event.index });
    } else if (event.type === 'on') {
      this.sounding.add(event.midi);
      audio.noteOn(event.midi, event.velocity);
    } else {
      this.sounding.delete(event.midi);
      audio.noteOff(event.midi);
    }
  }

  private endPreview(notify: boolean): void {
    this.cancelPreview?.();
    this.cancelPreview = null;
    for (const midi of this.sounding) this.audio?.noteOff(midi);
    this.sounding.clear();
    if (!this.snapshot.previewing) return;
    this.ignoreUntil = (this.clock?.now() ?? 0) + PREVIEW_GUARD_MS;
    if (notify) this.set({ ...this.snapshot, previewing: false, previewIndex: null });
  }

  private begin(song: Song, speed: SpeedId): void {
    this.endPreview(false);
    this.dropBar();
    this.lastHitAt = -Infinity;
    this.set({
      ...CLOSED,
      open: true,
      song,
      speed,
      results: song.steps.map(() => null),
      bars: song.steps.map(() => null),
      turn: this.snapshot.turn + 1,
    });
  }

  private onNote(event: {
    type: string;
    note: Midi;
    at: number;
    confidence?: string | undefined;
  }): void {
    const current = this.snapshot;
    const song = current.song;
    if (!current.open || !song || current.phase === 'terminada' || event.type !== 'on') return;
    // El micrófono oye la propia canción: mientras suena (y un momento después) no es el que toca.
    if (current.previewing || event.at < this.ignoreUntil) return;
    if (event.at - this.lastHitAt < MIN_GAP_MS) return;
    const step = song.steps[current.index];
    // Los acordes se juzgan con los golpes del rasgueo (onStrum), no con una nota suelta.
    if (!step || step.kind === 'acorde') return;
    if (!stepMatches(step, event.note)) {
      // Solo se avisa de una nota equivocada si se oyó con seguridad (el micrófono duda a veces).
      if (event.confidence === undefined || event.confidence === 'alta') {
        this.set({ ...current, wrong: event.note });
      }
      return;
    }

    let result: StepResult | null = null;
    let feedback: SongFeedback | null = null;
    if (current.index > 0) {
      const previous = song.steps[current.index - 1];
      if (previous) {
        result = judgePace(stepMs(song, previous, current.speed), event.at - this.lastHitAt);
        feedback = {
          text: paceText(step.kind, result.pace, result.deltaMs),
          pace: result.pace,
          step: current.index,
        };
      }
    }
    this.lastHitAt = event.at;
    const results = current.results.map((value, index) =>
      index === current.index ? result : value,
    );
    const next = current.index + 1;
    const finished = next >= song.steps.length;
    const nextStep = song.steps[next];
    this.set({
      ...current,
      phase: finished ? 'terminada' : 'tocando',
      index: finished ? current.index : next,
      results,
      feedback,
      wrong: null,
      idealMs: finished || !nextStep ? null : stepMs(song, step, current.speed),
      turn: current.turn + 1,
    });
  }

  private dropBar(): void {
    this.bar?.cancel?.();
    this.bar = null;
  }

  /** Un golpe o un acorde oído mientras el paso es un acorde: empieza el compás, cuenta golpes y mide el acorde. */
  private onStrum(event: StrumEvent): void {
    const current = this.snapshot;
    const song = current.song;
    if (!current.open || !song || current.phase === 'terminada') return;
    if (current.previewing || event.at < this.ignoreUntil) return;
    const step = song.steps[current.index];
    if (!step || step.kind !== 'acorde') return;

    if (event.kind === 'golpe') {
      const stroke: PlayedStroke = { at: event.at, direction: event.direction };
      if (this.bar === null) {
        if (event.at - this.lastHitAt < MIN_GAP_MS) return;
        const duration = stepMs(song, step, current.speed);
        const expected = expectedStrokes(step, duration);
        const previous = song.steps[current.index - 1];
        const pace =
          current.index > 0 && previous
            ? judgePace(stepMs(song, previous, current.speed), event.at - this.lastHitAt)
            : null;
        this.lastHitAt = event.at;
        const beatMs = 60_000 / (song.bpm * speedFactor(current.speed));
        const bar = { t0: event.at, expected, strokes: [stroke], chord: null, pace, cancel: null };
        this.bar = bar as NonNullable<SongService['bar']>;
        // El compás se cierra poco antes de que toque el siguiente acorde.
        this.bar.cancel = this.schedule(
          () => this.closeBar(),
          Math.max(450, duration - 0.3 * beatMs),
        );
        this.set({ ...current, live: { expected, strokes: [stroke] }, wrong: null });
        return;
      }
      this.bar.strokes.push(stroke);
      this.set({
        ...current,
        live: { expected: this.bar.expected, strokes: [...this.bar.strokes] },
      });
      if (this.bar.strokes.length >= this.bar.expected.length && this.bar.chord !== null)
        this.closeBar();
    } else if (event.kind === 'acorde' && this.bar !== null && this.bar.chord === null) {
      // El acorde se mide con el primer golpe del compás (los demás se mezclan con las cuerdas que aún suenan).
      if (Math.abs(event.at - this.bar.t0) > 5 || !event.clean) return;
      this.bar.chord = checkChord(step, event.notes);
      if (this.bar.strokes.length >= this.bar.expected.length) this.closeBar();
    }
  }

  /** Termina el compás de rasgueo: juzga los golpes y el acorde, lo dice y pasa al paso siguiente. */
  private closeBar(): void {
    const bar = this.bar;
    const current = this.snapshot;
    const song = current.song;
    if (!bar || !song) return;
    bar.cancel?.();
    this.bar = null;
    const step = song.steps[current.index];
    if (!step || step.kind !== 'acorde') return;

    const judgement = judgeBar(bar.expected, bar.strokes, bar.t0);
    const report: BarReport = { judgement, chord: bar.chord };
    const parts: string[] = [];
    if (bar.pace) parts.push(paceText('acorde', bar.pace.pace, bar.pace.deltaMs));
    if (bar.chord?.status === 'otro') {
      parts.push(`Oí ${bar.chord.heard ?? '?'} y pedía ${step.chord}`);
    } else if (bar.chord?.status === 'dudoso') {
      parts.push(`El acorde no está claro (¿${bar.chord.heard ?? step.chord}?)`);
    } else if (bar.chord === null) {
      parts.push('No pude medir el acorde: déjalo sonar un momento tras el primer golpe');
    } else {
      parts.push(`Acorde ${step.chord} bien`);
    }
    parts.push(barText(judgement));
    const clean =
      judgement.ok === judgement.total &&
      bar.chord?.status === 'bien' &&
      (bar.pace === null || bar.pace.pace === 'a-tiempo');
    const feedback: SongFeedback = {
      text: parts.join(' · '),
      pace: bar.pace?.pace ?? (clean ? 'a-tiempo' : 'lento'),
      step: current.index,
    };
    const results = current.results.map((value, index) =>
      index === current.index ? bar.pace : value,
    );
    const bars = current.bars.map((value, index) => (index === current.index ? report : value));
    const next = current.index + 1;
    const finished = next >= song.steps.length;
    const nextStep = song.steps[next];
    this.set({
      ...current,
      phase: finished ? 'terminada' : 'tocando',
      index: finished ? current.index : next,
      results,
      bars,
      live: null,
      feedback,
      wrong: null,
      idealMs: finished || !nextStep ? null : stepMs(song, step, current.speed),
      turn: current.turn + 1,
    });
  }

  private set(next: SongSnapshot): void {
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
}
