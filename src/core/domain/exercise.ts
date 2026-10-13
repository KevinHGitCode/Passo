import type { Midi, NotationMode } from './note';
import { semitoneDistance } from './note';
import type { InputSource, NoteEvent } from './note-event';
import type { Rng } from './rng';

/** Nivel 1: teclas blancas Do4–Sol4 (posición de cinco dedos, mano derecha). */
export const LEVEL_1_POOL: readonly Midi[] = [60, 62, 64, 65, 67];

export const DEFAULT_ROUND_SIZE = 20;

export interface RoundConfig {
  readonly level: number;
  readonly pool: readonly Midi[];
  readonly roundSize: number;
}

export const LEVEL_1_CONFIG: RoundConfig = {
  level: 1,
  pool: LEVEL_1_POOL,
  roundSize: DEFAULT_ROUND_SIZE,
};

/** Registro de una pulsación evaluada. Son los datos que usará el motor adaptativo (Fase 5). */
export interface Attempt {
  readonly targetMidi: Midi;
  readonly playedMidi: Midi;
  readonly isCorrect: boolean;
  readonly shownAt: number;
  readonly playedAt: number;
  /** Milisegundos desde que se mostró la nota hasta esta pulsación. */
  readonly reactionMs: number;
  /** 1 para la primera pulsación sobre esta nota, 2 para la segunda, etc. */
  readonly attemptIndexForTarget: number;
  /** Verdadero solo si fue la primera pulsación sobre la nota y fue correcta. */
  readonly firstTryCorrect: boolean;
  readonly inputSource: InputSource;
  readonly noteNameMode: NotationMode;
  readonly level: number;
  readonly velocity: number;
  /** La ayuda (tecla iluminada) estaba activada: con ayuda se empareja color, sin ella se lee la nota. */
  readonly helpOn: boolean;
  /** Posición de la nota objetivo dentro de la ronda, desde 0. */
  readonly targetIndex: number;
}

export interface ExerciseState {
  readonly config: RoundConfig;
  readonly target: Midi;
  readonly shownAt: number;
  readonly attemptsOnTarget: number;
  readonly completedTargets: number;
  readonly attempts: readonly Attempt[];
  readonly finished: boolean;
}

export interface EvaluateContext {
  readonly rng: Rng;
  readonly notation: NotationMode;
  readonly help: boolean;
}

export interface RoundSummary {
  readonly totalTargets: number;
  readonly firstTryCorrect: number;
  readonly errors: number;
  /** Aciertos a la primera sobre el total de notas, de 0 a 1. */
  readonly accuracy: number;
  readonly slowest: { readonly midi: Midi; readonly reactionMs: number } | null;
  readonly mostMissed: { readonly midi: Midi; readonly errors: number } | null;
}

export type Outcome =
  | { readonly kind: 'ignorado' }
  | { readonly kind: 'acierto'; readonly attempt: Attempt }
  | { readonly kind: 'error'; readonly attempt: Attempt; readonly semitones: number }
  | {
      readonly kind: 'ronda-completa';
      readonly attempt: Attempt;
      readonly summary: RoundSummary;
    };

/** Elige una nota del conjunto distinta de la anterior (si el conjunto tiene más de una). */
export function pickNote(pool: readonly Midi[], previous: Midi | null, rng: Rng): Midi {
  if (pool.length === 0) throw new RangeError('El conjunto de notas está vacío');
  const candidates = pool.length > 1 ? pool.filter((note) => note !== previous) : pool;
  const index = Math.min(Math.floor(rng() * candidates.length), candidates.length - 1);
  return candidates[index] as Midi;
}

export function startRound(config: RoundConfig, rng: Rng, now: number): ExerciseState {
  return {
    config,
    target: pickNote(config.pool, null, rng),
    shownAt: now,
    attemptsOnTarget: 0,
    completedTargets: 0,
    attempts: [],
    finished: false,
  };
}

/** Un `on` con velocidad 0 es un `off` en MIDI; los `off` nunca cuentan como intento. */
function isNoteOn(event: NoteEvent): boolean {
  return event.type === 'on' && event.velocity > 0;
}

/**
 * Evalúa una pulsación. Función pura: no lee reloj ni usa azar propio.
 * Cada `note-on` es un intento independiente, aunque haya varias teclas a la vez.
 */
export function evaluate(
  state: ExerciseState,
  event: NoteEvent,
  context: EvaluateContext,
): { state: ExerciseState; outcome: Outcome } {
  if (state.finished || !isNoteOn(event)) return { state, outcome: { kind: 'ignorado' } };

  const isCorrect = event.note === state.target;
  const attemptIndexForTarget = state.attemptsOnTarget + 1;
  const attempt: Attempt = {
    targetMidi: state.target,
    playedMidi: event.note,
    isCorrect,
    shownAt: state.shownAt,
    playedAt: event.at,
    reactionMs: event.at - state.shownAt,
    attemptIndexForTarget,
    firstTryCorrect: isCorrect && attemptIndexForTarget === 1,
    inputSource: event.source,
    noteNameMode: context.notation,
    level: state.config.level,
    velocity: event.velocity,
    helpOn: context.help,
    targetIndex: state.completedTargets,
  };
  const attempts = [...state.attempts, attempt];

  if (!isCorrect) {
    return {
      state: { ...state, attemptsOnTarget: attemptIndexForTarget, attempts },
      outcome: { kind: 'error', attempt, semitones: semitoneDistance(state.target, event.note) },
    };
  }

  const completedTargets = state.completedTargets + 1;
  if (completedTargets >= state.config.roundSize) {
    return {
      state: {
        ...state,
        attemptsOnTarget: attemptIndexForTarget,
        completedTargets,
        attempts,
        finished: true,
      },
      outcome: { kind: 'ronda-completa', attempt, summary: summarizeRound(attempts) },
    };
  }

  return {
    state: {
      ...state,
      target: pickNote(state.config.pool, state.target, context.rng),
      shownAt: event.at,
      attemptsOnTarget: 0,
      completedTargets,
      attempts,
    },
    outcome: { kind: 'acierto', attempt },
  };
}

export function summarizeRound(attempts: readonly Attempt[]): RoundSummary {
  const firstAttempts = attempts.filter((attempt) => attempt.attemptIndexForTarget === 1);
  const errorsByNote = new Map<Midi, number>();
  for (const attempt of attempts) {
    if (!attempt.isCorrect) {
      errorsByNote.set(attempt.targetMidi, (errorsByNote.get(attempt.targetMidi) ?? 0) + 1);
    }
  }

  let slowest: RoundSummary['slowest'] = null;
  for (const attempt of firstAttempts) {
    if (slowest === null || attempt.reactionMs > slowest.reactionMs) {
      slowest = { midi: attempt.targetMidi, reactionMs: attempt.reactionMs };
    }
  }

  let mostMissed: RoundSummary['mostMissed'] = null;
  for (const [midi, errors] of errorsByNote) {
    if (mostMissed === null || errors > mostMissed.errors) mostMissed = { midi, errors };
  }

  const totalTargets = firstAttempts.length;
  const firstTryCorrect = firstAttempts.filter((attempt) => attempt.firstTryCorrect).length;
  return {
    totalTargets,
    firstTryCorrect,
    errors: attempts.filter((attempt) => !attempt.isCorrect).length,
    accuracy: totalTargets === 0 ? 0 : firstTryCorrect / totalTargets,
    slowest,
    mostMissed,
  };
}
