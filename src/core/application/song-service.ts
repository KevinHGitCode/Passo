import { judgePace, paceText, stepMatches, stepMs } from '../domain/songs';
import type { Pace, Song, SpeedId, StepResult } from '../domain/songs';
import type { Midi } from '../domain/note';
import type { NoteInput, Unsubscribe } from '../ports/note-input';

/** Un sonido a menos de esto del anterior es la misma pulsación (la cuerda aún suena). */
const MIN_GAP_MS = 250;

export type SongPhase = 'listo' | 'tocando' | 'terminada';

export interface SongFeedback {
  readonly text: string;
  readonly pace: Pace;
  /** El paso al que llegaste (el que se juzgó). */
  readonly step: number;
}

export interface SongSnapshot {
  readonly open: boolean;
  readonly song: Song | null;
  readonly speed: SpeedId;
  readonly phase: SongPhase;
  /** El paso que toca ahora. */
  readonly index: number;
  readonly results: readonly (StepResult | null)[];
  readonly feedback: SongFeedback | null;
  /** Una nota que no era la del paso (solo si se oyó con seguridad). */
  readonly wrong: Midi | null;
  /** Lo que debería tardar llegar al paso actual (`null` en el primero: ahí empieza el tiempo). */
  readonly idealMs: number | null;
  /** Cambia con cada paso (la pantalla reinicia con él la barra del tiempo ideal). */
  readonly turn: number;
}

const CLOSED: SongSnapshot = {
  open: false,
  song: null,
  speed: 'normal',
  phase: 'listo',
  index: 0,
  results: [],
  feedback: null,
  wrong: null,
  idealMs: null,
  turn: 0,
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

  constructor(deps: {
    readonly input?: NoteInput | undefined;
    /** Cómo escucha el micrófono mientras hay una canción abierta (y cómo vuelve a escuchar al salir). */
    readonly listening?: { enter(): void; leave(): void } | undefined;
  }) {
    this.input = deps.input;
    this.listening = deps.listening;
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
    if (!this.snapshot.open) this.listening?.enter();
    this.begin(song, speed);
  }

  close(): void {
    if (this.snapshot.open) this.listening?.leave();
    this.unsubscribe?.();
    this.unsubscribe = null;
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

  private begin(song: Song, speed: SpeedId): void {
    this.lastHitAt = -Infinity;
    this.set({
      ...CLOSED,
      open: true,
      song,
      speed,
      results: song.steps.map(() => null),
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
    if (event.at - this.lastHitAt < MIN_GAP_MS) return;
    const step = song.steps[current.index];
    if (!step) return;
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

  private set(next: SongSnapshot): void {
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
}
