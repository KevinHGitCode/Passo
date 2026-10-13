import { evaluate, LEVEL_1_CONFIG, startRound } from '../domain/exercise';
import type { ExerciseState, Outcome, RoundConfig, RoundSummary } from '../domain/exercise';
import type { Midi, NotationMode } from '../domain/note';
import type { InputSource, NoteEvent } from '../domain/note-event';
import type { Rng } from '../domain/rng';
import type { AudioOutput } from '../ports/audio-output';
import type { Clock } from '../ports/clock';
import type { InputStatus, NoteInput, Unsubscribe } from '../ports/note-input';

export type SessionPhase = 'inactiva' | 'en-curso' | 'pausada' | 'completada';

export interface SessionFeedback {
  /** Aumenta con cada pulsación evaluada (nunca se reinicia); sirve para animaciones y anuncios. */
  readonly id: number;
  readonly outcome: Exclude<Outcome, { kind: 'ignorado' }>;
}

/** Foto inmutable del estado: cambia de identidad en cada cambio (apta para useSyncExternalStore). */
export interface SessionSnapshot {
  readonly phase: SessionPhase;
  readonly pauseReason: 'desconexion' | 'manual' | null;
  readonly notation: NotationMode;
  /** Ayuda activada: la tecla objetivo se ilumina. Se registra en cada intento. */
  readonly help: boolean;
  readonly exercise: ExerciseState | null;
  readonly feedback: SessionFeedback | null;
  /** Teclas que están pulsadas ahora mismo. */
  readonly pressed: readonly Midi[];
  readonly hits: number;
  readonly errors: number;
  /** Resumen de la ronda terminada (solo en la fase 'completada'). */
  readonly summary: RoundSummary | null;
}

export interface PracticeSessionDeps {
  readonly inputs: readonly NoteInput[];
  readonly audio: AudioOutput;
  readonly clock: Clock;
  readonly rng: Rng;
  readonly notation?: NotationMode;
  readonly config?: RoundConfig;
  /**
   * Fuentes cuyo sonido genera la app. Por defecto solo el teclado del PC: un piano MIDI
   * ya suena por sí mismo y sintetizarlo también produciría un eco.
   */
  readonly audioSources?: readonly InputSource[];
}

/** Caso de uso: orquesta entradas, evaluación pura, sonido y notificación a la interfaz. */
export class PracticeSession {
  private readonly deps: PracticeSessionDeps;
  private readonly config: RoundConfig;
  private readonly audioSources: readonly InputSource[];
  private readonly listeners = new Set<() => void>();
  private readonly subscriptions: Unsubscribe[] = [];
  private snapshot: SessionSnapshot;
  private feedbackCounter = 0;
  private lastSource: InputSource | null = null;

  constructor(deps: PracticeSessionDeps) {
    this.deps = deps;
    this.config = deps.config ?? LEVEL_1_CONFIG;
    this.audioSources = deps.audioSources ?? ['teclado-pc'];
    this.snapshot = {
      phase: 'inactiva',
      pauseReason: null,
      notation: deps.notation ?? 'latina',
      help: true,
      exercise: null,
      feedback: null,
      pressed: [],
      hits: 0,
      errors: 0,
      summary: null,
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
    this.update({
      phase: 'en-curso',
      pauseReason: null,
      exercise,
      feedback: null,
      pressed: [],
      hits: 0,
      errors: 0,
      summary: null,
    });
  }

  pause(): void {
    if (this.snapshot.phase === 'en-curso')
      this.update({ phase: 'pausada', pauseReason: 'manual' });
  }

  resume(): void {
    if (this.snapshot.phase !== 'pausada') return;
    this.resumeRound();
  }

  setNotation(notation: NotationMode): void {
    if (notation !== this.snapshot.notation) this.update({ notation });
  }

  setHelp(help: boolean): void {
    if (help !== this.snapshot.help) this.update({ help });
  }

  dispose(): void {
    this.subscriptions.splice(0).forEach((unsubscribe) => unsubscribe());
    this.listeners.clear();
  }

  /** Al reanudar, la nota se "muestra" de nuevo: el tiempo en pausa no cuenta como reacción. */
  private resumeRound(): void {
    const { exercise } = this.snapshot;
    this.update({
      phase: 'en-curso',
      pauseReason: null,
      exercise: exercise ? { ...exercise, shownAt: this.deps.clock.now() } : exercise,
    });
  }

  private handleStatus(input: NoteInput, status: InputStatus): void {
    if (input.source !== this.lastSource) return;
    if (this.snapshot.phase === 'en-curso' && status.kind === 'desconectado') {
      this.update({ phase: 'pausada', pauseReason: 'desconexion' });
    } else if (
      this.snapshot.phase === 'pausada' &&
      this.snapshot.pauseReason === 'desconexion' &&
      status.kind === 'conectado'
    ) {
      this.resumeRound();
    }
  }

  private handleEvent(event: NoteEvent): void {
    // Durante una pausa por desconexión una tecla suelta de otra fuente no debe
    // cambiar qué entrada vigilamos para reanudar.
    if (this.snapshot.phase !== 'pausada') this.lastSource = event.source;
    const isOn = event.type === 'on' && event.velocity > 0;
    this.playSound(event, isOn);

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
      help: this.snapshot.help,
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
      summary: result.outcome.kind === 'ronda-completa' ? result.outcome.summary : null,
    });
  }

  /** Un fallo del audio nunca debe romper la evaluación de la nota. */
  private playSound(event: NoteEvent, isOn: boolean): void {
    if (!this.audioSources.includes(event.source)) return;
    try {
      if (isOn) this.deps.audio.noteOn(event.note, event.velocity);
      else this.deps.audio.noteOff(event.note);
    } catch {
      // Sin sonido seguimos practicando.
    }
  }

  private update(changes: Partial<SessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...changes };
    this.listeners.forEach((listener) => listener());
  }
}
