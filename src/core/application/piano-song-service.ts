import { pianoNoteMatches, pianoSongMs, stepStartMs } from '../domain/piano-songs';
import type { PianoSong } from '../domain/piano-songs';
import type { Midi } from '../domain/note';
import type { Clock } from '../ports/clock';
import type { ExpectationSink } from '../ports/expectation-sink';
import type { NoteInput, Unsubscribe } from '../ports/note-input';

/** Cómo se toca: la canción espera a que toques cada paso, o las notas caen a su ritmo y las tocas a tiempo. */
export type PianoMode = 'espera' | 'tempo';
export type PianoSpeed = 'lento' | 'medio' | 'normal';

export const PIANO_SPEEDS: readonly {
  readonly id: PianoSpeed;
  readonly factor: number;
  readonly label: string;
}[] = [
  { id: 'lento', factor: 0.5, label: 'Lento' },
  { id: 'medio', factor: 0.75, label: 'Medio' },
  { id: 'normal', factor: 1, label: 'Normal' },
];

export const speedFactorOf = (speed: PianoSpeed): number =>
  PIANO_SPEEDS.find((item) => item.id === speed)?.factor ?? 1;

/** En «a tempo»: cuánto antes o después de su hora se acepta una nota (ms). */
export const HIT_WINDOW_MS = 380;
/** En «a tempo»: los segundos de cuenta atrás antes de la primera nota (ms). */
export const LEAD_IN_MS = 2500;

export type StepState = 'pendiente' | 'bien' | 'fallo';
export type PianoPhase = 'listo' | 'tocando' | 'terminada';

export interface PianoSnapshot {
  readonly open: boolean;
  readonly song: PianoSong | null;
  readonly mode: PianoMode;
  readonly speed: PianoSpeed;
  readonly phase: PianoPhase;
  /** El paso que toca ahora (en «a tempo»: el primero sin resolver). */
  readonly index: number;
  readonly states: readonly StepState[];
  /** Notas del paso actual ya tocadas. */
  readonly doneNotes: readonly Midi[];
  /** Las notas tocadas ahora mismo (las que se iluminan en el teclado un momento). */
  readonly pressed: readonly Midi[];
  /** Una nota que no era la del paso. */
  readonly wrong: Midi | null;
  /** Cuánto se desvió cada paso acertado «a tempo» (ms; negativo = adelantado). */
  readonly errors: readonly (number | null)[];
}

const CLOSED: PianoSnapshot = {
  open: false,
  song: null,
  mode: 'espera',
  speed: 'normal',
  phase: 'listo',
  index: 0,
  states: [],
  doneNotes: [],
  pressed: [],
  wrong: null,
  errors: [],
};

/** Una nota tocada se ve iluminada este tiempo (ms). */
const PRESS_MS = 220;

/**
 * Caso de uso de las canciones de piano. Lleva el «cabezal» (en qué punto de la canción van las notas que
 * caen): en «esperar» avanza hasta la nota que toca y se queda ahí hasta que la tocas; en «a tempo» no se
 * detiene y cada paso se da por bueno si lo tocas dentro de su ventana de tiempo.
 */
export class PianoSongService {
  private readonly inputs: readonly NoteInput[];
  private readonly clock: Clock;
  private readonly expectation: ExpectationSink | undefined;
  private readonly listening: { enter(): void; leave(): void } | undefined;
  private readonly listeners = new Set<() => void>();
  private unsubscribes: Unsubscribe[] = [];
  private snapshot: PianoSnapshot = CLOSED;
  /** El cabezal: en el instante `wallAt` (reloj de la app) iba por `songAt` (ms de canción). */
  private songAt = 0;
  private wallAt = 0;
  private running = false;
  private pressedAt = new Map<Midi, number>();
  /** «A tempo»: las notas que ya se tocaron de cada paso. */
  private hits: Set<Midi>[] = [];
  private lastExpectation: string | null = null;

  constructor(deps: {
    readonly inputs: readonly NoteInput[];
    readonly clock: Clock;
    readonly expectation?: ExpectationSink | undefined;
    /** Cómo escucha el micrófono mientras hay una canción abierta (el de piano) y cómo vuelve al salir. */
    readonly listening?: { enter(): void; leave(): void } | undefined;
  }) {
    this.inputs = deps.inputs;
    this.clock = deps.clock;
    this.expectation = deps.expectation;
    this.listening = deps.listening;
  }

  getSnapshot = (): PianoSnapshot => this.snapshot;

  subscribe = (listener: () => void): Unsubscribe => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  open(song: PianoSong, mode: PianoMode = 'espera', speed: PianoSpeed = 'normal'): void {
    this.unsubscribes.forEach((off) => off());
    this.unsubscribes = this.inputs.map((input) => input.subscribe((event) => this.onNote(event)));
    if (!this.snapshot.open) this.listening?.enter();
    this.begin(song, mode, speed);
  }

  close(): void {
    this.unsubscribes.forEach((off) => off());
    this.unsubscribes = [];
    this.running = false;
    this.setExpectation(null);
    if (this.snapshot.open) this.listening?.leave();
    this.set(CLOSED);
  }

  restart(): void {
    if (this.snapshot.song) this.begin(this.snapshot.song, this.snapshot.mode, this.snapshot.speed);
  }

  setMode(mode: PianoMode): void {
    if (this.snapshot.song && mode !== this.snapshot.mode) {
      this.begin(this.snapshot.song, mode, this.snapshot.speed);
    }
  }

  setSpeed(speed: PianoSpeed): void {
    if (this.snapshot.song && speed !== this.snapshot.speed) {
      this.begin(this.snapshot.song, this.snapshot.mode, speed);
    }
  }

  /** En «a tempo» da la salida (con una cuenta atrás); en «esperar» no hace falta: empieza con la primera nota. */
  start(): void {
    const { song, mode, phase } = this.snapshot;
    if (!song || phase !== 'listo') return;
    this.songAt = mode === 'tempo' ? -LEAD_IN_MS : 0;
    this.wallAt = this.clock.now();
    this.running = true;
    this.set({ ...this.snapshot, phase: 'tocando' });
    this.syncExpectation();
  }

  /** Dónde va el cabezal ahora (ms de canción); lo usa la pantalla para dibujar las notas que caen. */
  playhead(now: number = this.clock.now()): number {
    const { song, mode, speed, index } = this.snapshot;
    if (!song) return 0;
    const factor = speedFactorOf(speed);
    if (!this.running) {
      if (this.snapshot.phase === 'terminada') return pianoSongMs(song, factor);
      return mode === 'tempo' ? -LEAD_IN_MS : 0;
    }
    const moving = this.songAt + (now - this.wallAt);
    if (mode === 'tempo') return moving;
    // Esperar: el cabezal se detiene en la nota que toca.
    const step = song.steps[index];
    return step ? Math.min(moving, stepStartMs(song, step, factor)) : moving;
  }

  /** Lo llama la pantalla a cada fotograma: en «a tempo» da por falladas las notas que ya pasaron. */
  tick(now: number = this.clock.now()): void {
    const current = this.snapshot;
    const song = current.song;
    if (!current.open || !song || !this.running) return;
    let changed = false;
    // Las notas iluminadas se apagan.
    const stillPressed = current.pressed.filter(
      (midi) => now - (this.pressedAt.get(midi) ?? -Infinity) < PRESS_MS,
    );
    if (stillPressed.length !== current.pressed.length) changed = true;
    if (current.mode === 'tempo') {
      const factor = speedFactorOf(current.speed);
      const at = this.songAt + (now - this.wallAt);
      const states = [...current.states];
      for (let index = current.index; index < song.steps.length; index++) {
        const step = song.steps[index];
        if (!step) break;
        if (states[index] !== 'pendiente') continue;
        if (at <= stepStartMs(song, step, factor) + HIT_WINDOW_MS) break;
        states[index] = 'fallo';
        changed = true;
      }
      if (changed) {
        const next = this.firstPending(states);
        const finished = at > pianoSongMs(song, factor) + HIT_WINDOW_MS && next === -1;
        this.set({
          ...current,
          states,
          index: next === -1 ? current.index : next,
          doneNotes: this.doneOf(next === -1 ? current.index : next),
          pressed: stillPressed,
          phase: finished ? 'terminada' : current.phase,
        });
        if (finished) this.running = false;
        this.syncExpectation();
      }
    } else if (changed) {
      this.set({ ...current, pressed: stillPressed });
    }
  }

  private begin(song: PianoSong, mode: PianoMode, speed: PianoSpeed): void {
    this.running = false;
    this.songAt = 0;
    this.hits = song.steps.map(() => new Set<Midi>());
    this.pressedAt = new Map();
    this.setExpectation(null);
    this.set({
      ...CLOSED,
      open: true,
      song,
      mode,
      speed,
      states: song.steps.map(() => 'pendiente' as const),
      errors: song.steps.map(() => null),
    });
  }

  private firstPending(states: readonly StepState[]): number {
    return states.findIndex((state) => state === 'pendiente');
  }

  private doneOf(index: number): Midi[] {
    return [...(this.hits[index] ?? [])];
  }

  private onNote(event: { type: string; note: Midi; at: number }): void {
    const current = this.snapshot;
    const song = current.song;
    if (!current.open || !song || current.phase === 'terminada' || event.type !== 'on') return;
    // En «esperar» la primera nota correcta pone en marcha la canción.
    if (current.phase === 'listo') {
      if (current.mode === 'tempo') return;
      this.songAt = 0;
      this.wallAt = event.at;
      this.running = true;
    }
    const factor = speedFactorOf(current.speed);
    this.pressedAt.set(event.note, event.at);
    const pressed = [...new Set([...current.pressed, event.note])];

    if (current.mode === 'espera') {
      this.onWaiting(current, song, event, pressed);
      return;
    }
    // A tempo: se busca el primer paso sin resolver, dentro de su ventana, que pida esta nota.
    const at = this.songAt + (event.at - this.wallAt);
    const states = [...current.states];
    const errors = [...current.errors];
    for (let index = current.index; index < song.steps.length; index++) {
      const step = song.steps[index];
      if (!step || states[index] !== 'pendiente') continue;
      const start = stepStartMs(song, step, factor);
      if (start - HIT_WINDOW_MS > at) break;
      if (at > start + HIT_WINDOW_MS) continue;
      const wanted = step.notes.find(
        (note) => pianoNoteMatches(note, event.note) && !(this.hits[index] as Set<Midi>).has(note),
      );
      if (wanted === undefined) continue;
      (this.hits[index] as Set<Midi>).add(wanted);
      if ((this.hits[index] as Set<Midi>).size >= step.notes.length) {
        states[index] = 'bien';
        errors[index] = at - start;
      }
      const next = this.firstPending(states);
      this.set({
        ...current,
        states,
        errors,
        pressed,
        wrong: null,
        index: next === -1 ? current.index : next,
        doneNotes: this.doneOf(next === -1 ? current.index : next),
        phase:
          next === -1 && states.every((state) => state !== 'pendiente')
            ? 'terminada'
            : current.phase,
      });
      if (this.firstPending(states) === -1) this.running = false;
      this.syncExpectation();
      return;
    }
    this.set({ ...current, pressed, wrong: event.note });
  }

  private onWaiting(
    current: PianoSnapshot,
    song: PianoSong,
    event: { note: Midi; at: number },
    pressed: Midi[],
  ): void {
    const step = song.steps[current.index];
    if (!step) return;
    const wanted = step.notes.find(
      (note) =>
        pianoNoteMatches(note, event.note) && !(this.hits[current.index] as Set<Midi>).has(note),
    );
    if (wanted === undefined) {
      this.set({ ...current, pressed, wrong: event.note });
      return;
    }
    const hit = this.hits[current.index] as Set<Midi>;
    hit.add(wanted);
    if (hit.size < step.notes.length) {
      this.set({ ...current, pressed, wrong: null, doneNotes: [...hit] });
      return;
    }
    // El paso está completo: el cabezal sigue hacia el siguiente.
    const factor = speedFactorOf(current.speed);
    this.songAt = Math.min(this.songAt + (event.at - this.wallAt), stepStartMs(song, step, factor));
    this.wallAt = event.at;
    const states = current.states.map((state, index) => (index === current.index ? 'bien' : state));
    const next = current.index + 1;
    const finished = next >= song.steps.length;
    if (finished) this.running = false;
    this.set({
      ...current,
      states: states as StepState[],
      pressed,
      wrong: null,
      index: finished ? current.index : next,
      doneNotes: [],
      phase: finished ? 'terminada' : 'tocando',
    });
    this.syncExpectation();
  }

  /** Dice al micrófono qué acorde se espera (si el paso tiene varias notas), para que lo verifique de verdad. */
  private syncExpectation(): void {
    const { song, index, phase } = this.snapshot;
    const step = song?.steps[index];
    const notes = phase === 'tocando' && step && step.notes.length > 1 ? step.notes : null;
    this.setExpectation(notes);
  }

  private setExpectation(notes: readonly Midi[] | null): void {
    const key = notes === null ? 'ninguna' : notes.join('-');
    if (key === this.lastExpectation) return;
    this.lastExpectation = key;
    try {
      this.expectation?.setExpectation(notes);
    } catch {
      // Un verificador que falla no debe romper la canción.
    }
  }

  private set(next: PianoSnapshot): void {
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
}
