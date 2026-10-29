import { findLevel } from './curriculum';
import type { ExerciseMode } from './curriculum';
import type { Instrument } from './instrument';
import type { Midi, NotationMode } from './note';
import { pitchClass, semitoneDistance } from './note';
import type { InputSource, NoteConfidence, NoteEvent } from './note-event';
import type { Rng } from './rng';
import { closestTargetNote, sameTarget } from './target';
import type { Target } from './target';

/**
 * Tope del tiempo de reacción que cuenta para puntuar (ritmo, tiempo del día, lentitud por tecla): un
 * móvil bloqueado a media ronda no debe contar minutos como si fueran lo que tardaste en una nota.
 */
export const MAX_REACTION_MS = 10_000;

export const DEFAULT_ROUND_SIZE = 20;
/** Una tercera o un acorde cuesta más que una nota: rondas más cortas. */
export const GROUP_ROUND_SIZE = 12;
/** Cuántos objetivos siguientes se conocen de antemano (los que se ven esperar en la cascada). */
export const UPCOMING_COUNT = 2;

/**
 * Por micrófono, la nota que acaba de acertarse puede «reaparecer» (eco, hueco de audio, cola de la
 * propia nota). Si se oye de nuevo dentro de este tiempo no se cuenta como error.
 */
export const ECHO_WINDOW_MS = 900;

/**
 * Varias notas equivocadas seguidas (≤ 120 ms entre sí, ≤ 300 ms desde la primera) al tocar un acorde
 * son un solo error: no se castiga tres veces un acorde mal armado.
 */
export const WRONG_GROUP_GAP_MS = 120;
export const WRONG_GROUP_MAX_MS = 300;

export interface RoundConfig {
  readonly mode: ExerciseMode;
  readonly level: number;
  readonly pool: readonly Target[];
  readonly roundSize: number;
  /**
   * Cobertura: antes de repetir una nota salen todas las del conjunto (una «bolsa» barajada), así
   * una ronda corta no se deja notas sin tocar. Solo en lecciones (no en la práctica libre).
   */
  readonly coverage?: boolean;
  /** De qué instrumento es la ronda; sin indicar, piano. Marca los intentos para no mezclar las estadísticas. */
  readonly instrument?: Instrument;
}

/** Configuración de una ronda para un modo y nivel, o `null` si ese nivel no existe. */
export function roundConfigFor(mode: ExerciseMode, level: number): RoundConfig | null {
  const def = findLevel(mode, level);
  if (def === null) return null;
  return {
    mode,
    level,
    pool: def.pool,
    roundSize: mode === 'notas' ? DEFAULT_ROUND_SIZE : GROUP_ROUND_SIZE,
  };
}

const LEVEL_1 = roundConfigFor('notas', 1);
if (LEVEL_1 === null) throw new Error('Falta el nivel 1 del modo notas');
/** Nivel 1: teclas blancas Do4–Sol4 (posición de cinco dedos, mano derecha). */
export const LEVEL_1_CONFIG: RoundConfig = LEVEL_1;
export const LEVEL_1_POOL: readonly Target[] = LEVEL_1.pool;

/** Registro de una pulsación evaluada. Son los datos que usará el motor adaptativo (Fase 5). */
export interface Attempt {
  /** Nota del objetivo con la que se compara la pulsación: la más cercana a la tocada. */
  readonly targetMidi: Midi;
  /** Todas las notas del objetivo (una sola en el modo notas). */
  readonly targetNotes: Target['notes'];
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
  readonly mode: ExerciseMode;
  readonly level: number;
  /** Instrumento de la ronda (piano si no se indicó). */
  readonly instrument: Instrument;
  readonly velocity: number;
  /** La ayuda (tecla iluminada) estaba activada: con ayuda se empareja color, sin ella se lee la nota. */
  readonly helpOn: boolean;
  /** Posición de la nota objetivo dentro de la ronda, desde 0. */
  readonly targetIndex: number;
  /** Seguridad de la detección (solo micrófono); `null` con MIDI o teclado, que son exactos. */
  readonly detectionConfidence: NoteConfidence | null;
}

export interface ExerciseState {
  readonly config: RoundConfig;
  readonly target: Target;
  /** Los siguientes objetivos, ya elegidos: los que quedan por jugar, hasta `UPCOMING_COUNT`. */
  readonly upcoming: readonly Target[];
  /** Notas del objetivo que están pulsadas ahora mismo (pulsadas después de mostrarse el objetivo). */
  readonly held: readonly Midi[];
  /** Grupo de notas equivocadas en curso (acordes); evita contar un error por cada nota de más. */
  readonly wrongGroup: { readonly startedAt: number; readonly lastAt: number } | null;
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
  /** Instante (reloj del `Clock`) en que se entrega el evento: cuándo aparece la siguiente nota. Por defecto, la hora del evento. */
  readonly now?: number | undefined;
}

export interface RoundSummary {
  readonly totalTargets: number;
  readonly firstTryCorrect: number;
  readonly errors: number;
  /** Aciertos a la primera sobre el total de notas, de 0 a 1. */
  readonly accuracy: number;
  readonly slowest: { readonly notes: Target['notes']; readonly reactionMs: number } | null;
  readonly mostMissed: { readonly notes: Target['notes']; readonly errors: number } | null;
}

export type Outcome =
  | { readonly kind: 'ignorado' }
  /** Nota distinta de la pedida oída con poca seguridad: no cuenta como error ni como intento. */
  | {
      readonly kind: 'dudoso';
      readonly heardMidi: Midi;
      readonly targetMidi: Midi;
      /** Todas las notas del objetivo (varias en terceras y acordes). */
      readonly targetNotes: Target['notes'];
      /** poca-confianza: la detección dudó · octava: misma nota en otra octava · lejana: demasiado lejos para ser un fallo creíble. */
      readonly reason: 'poca-confianza' | 'octava' | 'lejana';
    }
  /** Una nota del objetivo sonó, pero faltan otras: ni acierto ni error. */
  | {
      readonly kind: 'parcial';
      readonly held: readonly Midi[];
      readonly missing: readonly Midi[];
      readonly at: number;
    }
  | { readonly kind: 'acierto'; readonly attempt: Attempt }
  | { readonly kind: 'error'; readonly attempt: Attempt; readonly semitones: number }
  | {
      readonly kind: 'ronda-completa';
      readonly attempt: Attempt;
      readonly summary: RoundSummary;
    };

const keyOf = (target: Target): string => target.notes.join('-');

/**
 * Las notas ya vistas en el ciclo actual de una ronda con cobertura: cuando han salido todas las
 * distintas del conjunto, el ciclo vuelve a empezar. `order` es la sucesión de objetivos hasta ahora.
 */
function coverageSeen(
  config: RoundConfig,
  order: readonly string[],
): ReadonlySet<string> | undefined {
  if (!config.coverage) return undefined;
  const distinct = new Set(config.pool.map(keyOf)).size;
  const seen = new Set<string>();
  for (const key of order) {
    seen.add(key);
    if (seen.size >= distinct) seen.clear();
  }
  return seen;
}

/**
 * Elige un objetivo del conjunto distinto del anterior (si el conjunto tiene más de uno). Con `seen`
 * prefiere los que aún no han salido en el ciclo.
 */
export function pickTarget(
  pool: readonly Target[],
  previous: Target | null,
  rng: Rng,
  seen?: ReadonlySet<string>,
): Target {
  if (pool.length === 0) throw new RangeError('El conjunto de objetivos está vacío');
  let candidates =
    pool.length > 1
      ? pool.filter((target) => previous === null || !sameTarget(target, previous))
      : pool;
  if (seen !== undefined && seen.size > 0) {
    const fresh = candidates.filter((target) => !seen.has(keyOf(target)));
    if (fresh.length > 0) candidates = fresh;
  }
  const index = Math.min(Math.floor(rng() * candidates.length), candidates.length - 1);
  return candidates[index] as Target;
}

/**
 * Completa la cola de objetivos siguientes con los que quedan por jugar. Se elige en el mismo orden
 * en que se elegiría uno a uno, así que la sucesión de objetivos de una semilla no cambia.
 */
function fillUpcoming(
  current: Target,
  queue: readonly Target[],
  config: RoundConfig,
  completedTargets: number,
  rng: Rng,
  solved: readonly string[] = [],
): readonly Target[] {
  const wanted = Math.max(0, Math.min(UPCOMING_COUNT, config.roundSize - completedTargets - 1));
  const upcoming = queue.slice(0, wanted);
  let previous = upcoming[upcoming.length - 1] ?? current;
  while (upcoming.length < wanted) {
    const order = [...solved, keyOf(current), ...upcoming.map(keyOf)];
    previous = pickTarget(config.pool, previous, rng, coverageSeen(config, order));
    upcoming.push(previous);
  }
  return upcoming;
}

export function startRound(config: RoundConfig, rng: Rng, now: number): ExerciseState {
  const target = pickTarget(config.pool, null, rng);
  return {
    config,
    target,
    upcoming: fillUpcoming(target, [], config, 0, rng),
    held: [],
    wrongGroup: null,
    shownAt: now,
    attemptsOnTarget: 0,
    completedTargets: 0,
    attempts: [],
    finished: false,
  };
}

/**
 * Por micrófono la app infiere la nota, así que una nota distinta de la pedida solo es un error
 * cuando está clara y es una equivocación creíble. Devuelve por qué se duda, o `null` si es un error.
 * - eco: la misma nota del intento anterior reaparece (cola, hueco de audio, fluctuación);
 * - octava: misma nota en otra octava (la detección favorece el periodo más corto);
 * - lejana: más de una octava de distancia (ruido o voz, no un fallo de tecla);
 * - poca-confianza: la detección dudó.
 */
function microphoneDoubt(
  state: ExerciseState,
  event: NoteEvent,
  targetNote: Midi,
): 'eco' | 'octava' | 'lejana' | 'poca-confianza' | null {
  const previous = state.attempts[state.attempts.length - 1];
  if (
    previous &&
    previous.playedMidi === event.note &&
    event.at - previous.playedAt < ECHO_WINDOW_MS &&
    (previous.isCorrect ? state.attemptsOnTarget === 0 : previous.targetMidi === targetNote)
  ) {
    return 'eco';
  }
  if (pitchClass(event.note) === pitchClass(targetNote)) return 'octava';
  if (Math.abs(event.note - targetNote) > 12) return 'lejana';
  if (event.confidence === 'media') return 'poca-confianza';
  return null;
}

/** Un `on` con velocidad 0 es un `off` en MIDI. */
function isNoteOn(event: NoteEvent): boolean {
  return event.type === 'on' && event.velocity > 0;
}

function ignored(state: ExerciseState): { state: ExerciseState; outcome: Outcome } {
  return { state, outcome: { kind: 'ignorado' } };
}

function buildAttempt(
  state: ExerciseState,
  event: NoteEvent,
  context: EvaluateContext,
  targetMidi: Midi,
  isCorrect: boolean,
): Attempt {
  const attemptIndexForTarget = state.attemptsOnTarget + 1;
  return {
    targetMidi,
    targetNotes: state.target.notes,
    playedMidi: event.note,
    isCorrect,
    shownAt: state.shownAt,
    playedAt: event.at,
    reactionMs: event.at - state.shownAt,
    attemptIndexForTarget,
    firstTryCorrect: isCorrect && attemptIndexForTarget === 1,
    inputSource: event.source,
    noteNameMode: context.notation,
    mode: state.config.mode,
    level: state.config.level,
    instrument: state.config.instrument ?? 'piano',
    velocity: event.velocity,
    helpOn: context.help,
    targetIndex: state.completedTargets,
    detectionConfidence: event.confidence ?? null,
  };
}

/**
 * Evalúa una pulsación. Función pura: no lee reloj ni usa azar propio.
 *
 * - Objetivo de una nota: cada `note-on` es un intento independiente, aunque haya varias teclas a la vez.
 * - Objetivo de varias notas (tercera, acorde): cada nota del conjunto que suena es un avance
 *   (`parcial`) y se acierta cuando **todas están pulsadas a la vez**. Una nota de más es un error al
 *   instante (varias seguidas cuentan una sola vez); que falten notas no lo es. Soltar una nota la quita.
 */
export function evaluate(
  state: ExerciseState,
  event: NoteEvent,
  context: EvaluateContext,
): { state: ExerciseState; outcome: Outcome } {
  if (state.finished) return ignored(state);
  if (!isNoteOn(event)) {
    if (!state.held.includes(event.note)) return ignored(state);
    return ignored({ ...state, held: state.held.filter((note) => note !== event.note) });
  }

  const notes = state.target.notes;
  const isGroup = notes.length > 1;
  const closest = closestTargetNote(state.target, event.note);

  if (!notes.includes(event.note)) {
    if (event.source === 'microfono') {
      // Un micrófono de una sola voz no puede juzgar un acorde: una nota ajena es siempre dudosa.
      const doubt = microphoneDoubt(state, event, closest) ?? (isGroup ? 'poca-confianza' : null);
      if (doubt === 'eco') return ignored(state);
      if (doubt !== null) {
        return {
          state,
          outcome: {
            kind: 'dudoso',
            heardMidi: event.note,
            targetMidi: closest,
            targetNotes: notes,
            reason: doubt,
          },
        };
      }
    }
    const group = state.wrongGroup;
    if (
      isGroup &&
      group !== null &&
      event.at - group.lastAt <= WRONG_GROUP_GAP_MS &&
      event.at - group.startedAt <= WRONG_GROUP_MAX_MS
    ) {
      return ignored({ ...state, wrongGroup: { ...group, lastAt: event.at } });
    }
    const attempt = buildAttempt(state, event, context, closest, false);
    return {
      state: {
        ...state,
        attemptsOnTarget: attempt.attemptIndexForTarget,
        attempts: [...state.attempts, attempt],
        wrongGroup: isGroup ? { startedAt: event.at, lastAt: event.at } : null,
      },
      outcome: { kind: 'error', attempt, semitones: semitoneDistance(closest, event.note) },
    };
  }

  if (state.held.includes(event.note)) return ignored(state);
  const held = [...state.held, event.note];
  const missing = notes.filter((note) => !held.includes(note));
  if (missing.length > 0) {
    return {
      state: { ...state, held },
      outcome: { kind: 'parcial', held, missing, at: event.at },
    };
  }

  const attempt = buildAttempt(state, event, context, event.note, true);
  const attempts = [...state.attempts, attempt];
  const completedTargets = state.completedTargets + 1;
  if (completedTargets >= state.config.roundSize) {
    return {
      state: {
        ...state,
        held,
        attemptsOnTarget: attempt.attemptIndexForTarget,
        completedTargets,
        attempts,
        finished: true,
      },
      outcome: { kind: 'ronda-completa', attempt, summary: summarizeRound(attempts) },
    };
  }

  const [queued, ...rest] = state.upcoming;
  const solved = attempts
    .filter((item) => item.isCorrect)
    .map((item) => item.targetNotes.join('-'));
  const target =
    queued ??
    pickTarget(state.config.pool, state.target, context.rng, coverageSeen(state.config, solved));
  return {
    state: {
      ...state,
      target,
      upcoming: fillUpcoming(target, rest, state.config, completedTargets, context.rng, solved),
      held: [],
      wrongGroup: null,
      shownAt: context.now ?? event.at,
      attemptsOnTarget: 0,
      completedTargets,
      attempts,
    },
    outcome: { kind: 'acierto', attempt },
  };
}

export function summarizeRound(attempts: readonly Attempt[]): RoundSummary {
  const firstAttempts = attempts.filter((attempt) => attempt.attemptIndexForTarget === 1);
  const errorsByTarget = new Map<string, { notes: Target['notes']; errors: number }>();
  for (const attempt of attempts) {
    if (attempt.isCorrect) continue;
    const key = attempt.targetNotes.join('-');
    const entry = errorsByTarget.get(key) ?? { notes: attempt.targetNotes, errors: 0 };
    errorsByTarget.set(key, { notes: entry.notes, errors: entry.errors + 1 });
  }

  let slowest: RoundSummary['slowest'] = null;
  for (const attempt of firstAttempts) {
    if (slowest === null || attempt.reactionMs > slowest.reactionMs) {
      slowest = { notes: attempt.targetNotes, reactionMs: attempt.reactionMs };
    }
  }

  let mostMissed: RoundSummary['mostMissed'] = null;
  for (const entry of errorsByTarget.values()) {
    if (mostMissed === null || entry.errors > mostMissed.errors) mostMissed = entry;
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

/**
 * Si entre los 6 últimos intentos hay al menos 3 errores con la misma diferencia en semitonos
 * (≠ 0, hasta una octava) sobre al menos 2 notas pedidas distintas, el teclado puede estar
 * transpuesto. Devuelve esa diferencia (positiva = suena más agudo) o `null`.
 * Exigir notas pedidas distintas evita avisar a quien insiste en la tecla vecina.
 */
export function detectTransposition(attempts: readonly Attempt[]): number | null {
  const errors = attempts
    .slice(-6)
    .filter((attempt) => !attempt.isCorrect && attempt.targetNotes.length === 1);
  const groups = new Map<number, Set<number>>();
  const counts = new Map<number, number>();
  for (const attempt of errors) {
    const delta = attempt.playedMidi - attempt.targetMidi;
    if (delta === 0 || Math.abs(delta) > 12) continue;
    counts.set(delta, (counts.get(delta) ?? 0) + 1);
    const targets = groups.get(delta) ?? new Set<number>();
    targets.add(attempt.targetMidi);
    groups.set(delta, targets);
  }
  for (const [delta, count] of counts) {
    if (count >= 3 && (groups.get(delta)?.size ?? 0) >= 2) return delta;
  }
  return null;
}
