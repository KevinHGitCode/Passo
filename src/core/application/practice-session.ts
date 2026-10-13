import { evaluate, LEVEL_1_CONFIG, startRound } from '../domain/exercise';
import type { ExerciseState, Outcome, RoundConfig } from '../domain/exercise';
import type { Midi, NotationMode } from '../domain/note';
import type { InputSource, NoteEvent } from '../domain/note-event';
import type { Rng } from '../domain/rng';
import type { AudioOutput } from '../ports/audio-output';
import type { Clock } from '../ports/clock';
import type { NoteInput, Unsubscribe } from '../ports/note-input';

export type SessionPhase = 'inactiva' | 'en-curso' | 'pausada' | 'completada';

export interface SessionFeedback {
  /** Aumenta con cada pulsación evaluada; sirve para reiniciar animaciones y anuncios. */
  readonly id: number;
  readonly outcome: Exclude<Outcome, { kind: 'ignorado' }>;
}

/** Foto inmutable del estado: cambia de identidad en cada cambio (apta para useSyncExternalStore). */
export interface SessionSnapshot {
  readonly phase: SessionPhase;
  readonly pauseReason: 'desconexion' | 'manual' | null;
  readonly notation: NotationMode;
  readonly exercise: ExerciseState | null;
  readonly feedback: SessionFeedback | null;
  /** Teclas que están pulsadas ahora mismo. */
  readonly pressed: readonly Midi[];
  readonly hits: number;
  readonly errors: number;
}

export interface PracticeSessionDeps {
  readonly inputs: readonly NoteInput[];
  readonly audio: AudioOutput;
  readonly clock: Clock;
  readonly rng: Rng;
  readonly notation?: NotationMode;
  readonly config?: RoundConfig;
}

/** Caso de uso: orquesta entradas, evaluación pura, sonido y notificación a la interfaz. */
export class PracticeSession {
  private readonly deps: PracticeSessionDeps;
  private readonly config: RoundConfig;
  private readonly listeners = new Set<() => void>();
  private readonly subscriptions: Unsubscribe[] = [];
  private snapshot: SessionSnapshot;
  private feedbackCounter = 0;
  private lastSource: InputSource | null = null;

  constructor(deps: PracticeSessionDeps) {
    this.deps = deps;
    this.config = deps.config ?? LEVEL_1_CONFIG;
    this.snapshot = {
      phase: 'inactiva',
      pauseReason: null,
      notation: deps.notation ?? 'latina',
      exercise: null,
      feedback: null,
      pressed: [],
      hits: 0,
      errors: 0,
    };
    for (const input of deps.inputs) {
      this.subscriptions.push(input.subscribe((event) => this.handleEvent(event)));
      this.subscriptions.push(input.subscribeStatus((status) => this.handleStatus(input, status)));
    }
  }

  getSnapshot = (): SessionSnapshot => this.snapshot;

  subscribe = (listener: () => void): Unsubscribe => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Empieza una ronda nueva (también sirve para repetir tras terminar). */
  start(): void {
    const exercise = startRound(this.config, this.deps.rng, this.deps.clock.now());
    this.feedbackCounter = 0;
    this.update({
      phase: 'en-curso',
      pauseReason: null,
      exercise,
      feedback: null,
      pressed: [],
      hits: 0,
      errors: 0,
    });
  }

  pause(): void {
    if (this.snapshot.phase === 'en-curso')
      this.update({ phase: 'pausada', pauseReason: 'manual' });
  }

  resume(): void {
    if (this.snapshot.phase === 'pausada') this.update({ phase: 'en-curso', pauseReason: null });
  }

  setNotation(notation: NotationMode): void {
    if (notation !== this.snapshot.notation) this.update({ notation });
  }

  dispose(): void {
    this.subscriptions.splice(0).forEach((unsubscribe) => unsubscribe());
    this.listeners.clear();
  }

  private handleStatus(input: NoteInput, status: ReturnType<NoteInput['getStatus']>): void {
    if (input.source !== this.lastSource) return;
    if (this.snapshot.phase === 'en-curso' && status.kind === 'desconectado') {
      this.update({ phase: 'pausada', pauseReason: 'desconexion' });
    } else if (
      this.snapshot.phase === 'pausada' &&
      this.snapshot.pauseReason === 'desconexion' &&
      status.kind === 'conectado'
    ) {
      this.update({ phase: 'en-curso', pauseReason: null });
    }
  }

  private handleEvent(event: NoteEvent): void {
    this.lastSource = event.source;
    const isOn = event.type === 'on' && event.velocity > 0;
    if (isOn) this.deps.audio.noteOn(event.note, event.velocity);
    else this.deps.audio.noteOff(event.note);

    const pressed = isOn
      ? this.snapshot.pressed.includes(event.note)
        ? this.snapshot.pressed
        : [...this.snapshot.pressed, event.note]
      : this.snapshot.pressed.filter((note) => note !== event.note);

    const { exercise, phase } = this.snapshot;
    if (phase !== 'en-curso' || exercise === null || !isOn) {
      if (pressed !== this.snapshot.pressed) this.update({ pressed });
      return;
    }

    const result = evaluate(exercise, event, {
      rng: this.deps.rng,
      notation: this.snapshot.notation,
    });
    if (result.outcome.kind === 'ignorado') {
      this.update({ pressed });
      return;
    }

    this.feedbackCounter += 1;
    this.update({
      exercise: result.state,
      phase: result.state.finished ? 'completada' : 'en-curso',
      feedback: { id: this.feedbackCounter, outcome: result.outcome },
      pressed,
      hits: result.state.completedTargets,
      errors: result.state.attempts.filter((attempt) => !attempt.isCorrect).length,
    });
  }

  private update(changes: Partial<SessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...changes };
    this.listeners.forEach((listener) => listener());
  }
}
