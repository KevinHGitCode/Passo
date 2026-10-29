import { slowestKeys, targetKey, weakKeys } from './key-stats';
import type { KeyHistory, KeyStat } from './key-stats';
import { LESSONS } from './lessons';
import type { Lesson } from './lessons';
import type { Target } from './target';

/**
 * «Practicar tus puntos débiles»: una lección que se arma al momento con lo que más te cuesta. No es
 * parte del camino (no tiene estrellas) pero sí da experiencia y alimenta las estadísticas por tecla.
 */

export const REVIEW_LESSON_ID = 'repaso-debiles';
/** Unas 14 notas: tres minutos escasos. */
export const REVIEW_ROUND_SIZE = 14;
/** Cuántas teclas débiles entran como máximo y cuántas veces se repite cada una en el conjunto. */
const MAX_KEYS = 4;
const COPIES = 3;
/** Con menos de tres notas distintas solo se alternarían (no se repite la misma nota seguida). */
const MIN_DISTINCT = 3;

export type ReviewReason = 'debiles' | 'lentas';

export interface ReviewSelection {
  readonly reason: ReviewReason;
  readonly keys: readonly KeyStat[];
}

const isSingleNote = (stat: KeyStat): boolean => !stat.key.includes('-');

/**
 * Qué teclas repasar. Solo notas sueltas (el micrófono puede juzgarlas). Primero las débiles; con menos
 * de dos, se completa con las más lentas; si no hay ninguna con datos, no hay nada que repasar.
 */
export function selectReview(history: KeyHistory): ReviewSelection | null {
  const weak = weakKeys(history).filter(isSingleNote).slice(0, MAX_KEYS);
  if (weak.length >= 2) return { reason: 'debiles', keys: weak };
  const known = new Set(weak.map((stat) => stat.key));
  const slow = slowestKeys(history)
    .filter((stat) => isSingleNote(stat) && !known.has(stat.key))
    .slice(0, 3 - weak.length);
  const keys = [...weak, ...slow];
  if (keys.length === 0) return null;
  return { reason: weak.length > 0 ? 'debiles' : 'lentas', keys };
}

/** El objetivo de una nota y el conjunto de la lección donde se aprende (sus vecinas). */
function locate(key: string): { target: Target; pool: readonly Target[] } | null {
  for (const lesson of LESSONS) {
    if (lesson.mode !== 'notas') continue;
    const target = lesson.pool.find((item) => targetKey(item.notes) === key);
    if (target) return { target, pool: lesson.pool };
  }
  return null;
}

/** La lección de repaso con las teclas débiles repetidas y sus vecinas de posición una vez. */
export function reviewLesson(history: KeyHistory): Lesson | null {
  const selection = selectReview(history);
  if (selection === null) return null;
  const pool: Target[] = [];
  const neighbours: Target[] = [];
  for (const stat of selection.keys) {
    const found = locate(stat.key);
    if (found === null) continue;
    for (let i = 0; i < COPIES; i++) pool.push(found.target);
    neighbours.push(...found.pool);
  }
  const distinct = () => new Set(pool.map((target) => targetKey(target.notes))).size;
  for (const target of neighbours) {
    if (distinct() >= MIN_DISTINCT) break;
    if (!pool.includes(target)) pool.push(target);
  }
  if (pool.length === 0 || distinct() < MIN_DISTINCT) return null;
  return {
    id: REVIEW_LESSON_ID,
    unitId: 'repaso',
    instrument: 'piano',
    kind: 'repaso',
    title: 'Tus puntos débiles',
    mode: 'notas',
    pool,
    roundSize: REVIEW_ROUND_SIZE,
    rhythmGoal: null,
    dynamic: true,
  };
}
