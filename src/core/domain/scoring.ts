import { summarizeRound } from './exercise';
import type { Attempt, RoundSummary } from './exercise';
import type { Lesson, LessonKind } from './lessons';

/**
 * Puntuación de una lección (estilo typing.com): precisión a la primera, ritmo en notas por minuto,
 * estrellas, experiencia y nivel de pianista. Todo puro: se calcula con los intentos de la ronda.
 */

export type Stars = 0 | 1 | 2 | 3;

/** Precisión mínima para completar la lección (1.ª estrella). Por debajo: «Repite» y no desbloquea. */
export const MIN_ACCURACY = 0.7;
/** Precisión para la 2.ª estrella: más suave en lecciones nuevas. */
export const STAR_2_ACCURACY: Readonly<Record<LessonKind, number>> = {
  nueva: 0.8,
  repaso: 0.9,
  prueba: 0.9,
};
/** Precisión para la 3.ª estrella (junto con el ritmo). */
export const STAR_3_ACCURACY = 0.95;

/** Con el micrófono la detección añade latencia por nota: la meta de ritmo se relaja. */
export const MIC_RHYTHM_FACTOR = 0.9;
/** Con la beta de varias notas la detección tarda aún más. */
export const MIC_GROUP_RHYTHM_FACTOR = 0.75;

export const XP_FIRST_TRY = 10;
export const XP_SECOND_TRY = 5;
/** Experiencia extra por cada estrella que se gana por primera vez. */
export const XP_PER_NEW_STAR = 10;

export interface LessonScore {
  readonly summary: RoundSummary;
  /** Aciertos a la primera sobre el total de objetivos, de 0 a 1. */
  readonly accuracy: number;
  /** Notas por minuto de tiempo activo (sin pausas ni la primera nota de la ronda). */
  readonly notesPerMinute: number;
  /** Tiempo activo en milisegundos (suma de lo que se tardó en cada objetivo). */
  readonly activeMs: number;
  /** Meta de ritmo ya ajustada a la entrada, o `null` si la lección no la exige. */
  readonly rhythmGoal: number | null;
  readonly rhythmMet: boolean;
  /** La ayuda estuvo apagada en toda la ronda. */
  readonly withoutHelp: boolean;
  readonly stars: Stars;
  /** Experiencia de la ronda (antes del factor por repetir y del extra por estrellas nuevas). */
  readonly baseXp: number;
}

/** Factor de la meta de ritmo según la entrada con la que se tocó. */
export function rhythmFactor(attempts: readonly Attempt[], lesson: Lesson): number {
  const last = attempts[attempts.length - 1];
  if (last === undefined || last.inputSource !== 'microfono') return 1;
  return lesson.mode === 'notas' ? MIC_RHYTHM_FACTOR : MIC_GROUP_RHYTHM_FACTOR;
}

/**
 * Notas por minuto con el tiempo **activo**: lo que se tardó en cada objetivo hasta acertarlo (las
 * pausas no cuentan, porque al reanudar la nota se «muestra» de nuevo). No cuenta el primer objetivo
 * de la ronda, que sirve para orientarse.
 */
export function measureRhythm(attempts: readonly Attempt[]): {
  readonly notesPerMinute: number;
  readonly activeMs: number;
} {
  const solved = attempts.filter((attempt) => attempt.isCorrect && attempt.targetIndex > 0);
  const activeMs = solved.reduce((sum, attempt) => sum + Math.max(0, attempt.reactionMs), 0);
  if (solved.length === 0 || activeMs <= 0) return { notesPerMinute: 0, activeMs };
  const notes = solved.reduce((sum, attempt) => sum + attempt.targetNotes.length, 0);
  return { notesPerMinute: (notes / activeMs) * 60_000, activeMs };
}

/** Estrellas de una lección. Función pura para poder probar los bordes. */
export function starsFor(input: {
  readonly kind: LessonKind;
  readonly accuracy: number;
  readonly rhythmMet: boolean;
  readonly withoutHelp: boolean;
}): Stars {
  const { kind, accuracy } = input;
  if (accuracy < MIN_ACCURACY) return 0;
  if (accuracy < STAR_2_ACCURACY[kind]) return 1;
  // En las pruebas la 3.ª estrella exige leer la nota (sin ayuda), no emparejar el color.
  const exam = kind !== 'prueba' || input.withoutHelp;
  if (accuracy >= STAR_3_ACCURACY && input.rhythmMet && exam) return 3;
  return 2;
}

/** Experiencia base: 10 por objetivo a la primera, 5 por objetivo a la segunda. */
export function baseXpOf(attempts: readonly Attempt[]): number {
  let xp = 0;
  for (const attempt of attempts) {
    if (!attempt.isCorrect) continue;
    xp += attempt.attemptIndexForTarget === 1 ? XP_FIRST_TRY : 0;
    xp += attempt.attemptIndexForTarget === 2 ? XP_SECOND_TRY : 0;
  }
  return xp;
}

/** Puntúa la ronda terminada de una lección. */
export function scoreLesson(attempts: readonly Attempt[], lesson: Lesson): LessonScore {
  const summary = summarizeRound(attempts);
  const { notesPerMinute, activeMs } = measureRhythm(attempts);
  const goal =
    lesson.rhythmGoal === null ? null : lesson.rhythmGoal * rhythmFactor(attempts, lesson);
  const rhythmMet = goal === null || notesPerMinute >= goal;
  const withoutHelp = attempts.every((attempt) => !attempt.helpOn);
  return {
    summary,
    accuracy: summary.accuracy,
    notesPerMinute,
    activeMs,
    rhythmGoal: goal,
    rhythmMet,
    withoutHelp,
    stars: starsFor({ kind: lesson.kind, accuracy: summary.accuracy, rhythmMet, withoutHelp }),
    baseXp: baseXpOf(attempts),
  };
}

/** Qué fracción de la experiencia se da al repetir una lección: 100 % → 50 % → 25 %. */
export function repeatFactor(previousPlays: number): number {
  if (previousPlays <= 0) return 1;
  return previousPlays === 1 ? 0.5 : 0.25;
}

// ─── Nivel de pianista ──────────────────────────────────────────────────────────────────────────

export const MAX_LEVEL = 50;

/** Experiencia total necesaria para llegar a un nivel (el 1 es el punto de partida). */
export function xpToReach(level: number): number {
  return 50 * level * (level - 1);
}

export interface PianistLevel {
  readonly level: number;
  readonly name: string;
  /** Experiencia acumulada dentro del nivel actual. */
  readonly xpIntoLevel: number;
  /** Experiencia que pide pasar al siguiente nivel (`null` en el máximo). */
  readonly xpForNext: number | null;
}

function levelName(level: number): string {
  if (level <= 2) return 'Principiante';
  if (level <= 6) return 'Aprendiz';
  if (level <= 10) return 'Intérprete';
  if (level <= 15) return 'Pianista';
  return 'Maestro';
}

export function pianistLevel(xp: number): PianistLevel {
  const total = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  let level = 1;
  while (level < MAX_LEVEL && xpToReach(level + 1) <= total) level++;
  const floor = xpToReach(level);
  const next = level >= MAX_LEVEL ? null : xpToReach(level + 1) - floor;
  return { level, name: levelName(level), xpIntoLevel: total - floor, xpForNext: next };
}
