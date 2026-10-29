import { historyOf, slowestKeys, targetKey, weakKeys } from './key-stats';
import type { KeyHistory, KeyStat } from './key-stats';
import type { Instrument } from './instrument';
import { lessonsFor } from './lessons';
import type { Lesson } from './lessons';
import type { Target } from './target';

/**
 * «Practicar tus puntos débiles»: una lección que se arma al momento con lo que más te cuesta. No es
 * parte del camino (no tiene estrellas) pero sí da experiencia y alimenta las estadísticas por tecla.
 */

/** El repaso de piano conserva el id de siempre; el de guitarra tiene el suyo. */
export const REVIEW_LESSON_ID = 'repaso-debiles';
export const GUITAR_REVIEW_LESSON_ID = 'repaso-debiles-guitarra';

export function reviewLessonId(instrument: Instrument): string {
  return instrument === 'guitarra' ? GUITAR_REVIEW_LESSON_ID : REVIEW_LESSON_ID;
}

/** De qué instrumento es un id de repaso, o `null` si no lo es. */
export function reviewInstrumentOf(id: string): Instrument | null {
  if (id === REVIEW_LESSON_ID) return 'piano';
  return id === GUITAR_REVIEW_LESSON_ID ? 'guitarra' : null;
}
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
export function selectReview(
  allKeys: KeyHistory,
  instrument: Instrument = 'piano',
): ReviewSelection | null {
  // Cada instrumento se juzga con lo suyo: ni las medianas ni los repasos se mezclan.
  const history = historyOf(allKeys, instrument);
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
function locate(
  key: string,
  instrument: Instrument,
): { target: Target; pool: readonly Target[] } | null {
  for (const lesson of lessonsFor(instrument)) {
    if (lesson.mode !== 'notas') continue;
    const target = lesson.pool.find((item) => targetKey(item.notes, instrument) === key);
    if (target) return { target, pool: lesson.pool };
  }
  return null;
}

/** La lección de repaso con las teclas débiles repetidas y sus vecinas de posición una vez. */
export function reviewLesson(history: KeyHistory, instrument: Instrument = 'piano'): Lesson | null {
  const selection = selectReview(history, instrument);
  if (selection === null) return null;
  const pool: Target[] = [];
  const neighbours: Target[] = [];
  for (const stat of selection.keys) {
    const found = locate(stat.key, instrument);
    if (found === null) continue;
    for (let i = 0; i < COPIES; i++) pool.push(found.target);
    neighbours.push(...found.pool);
  }
  const distinct = () => new Set(pool.map((target) => targetKey(target.notes, instrument))).size;
  for (const target of neighbours) {
    if (distinct() >= MIN_DISTINCT) break;
    if (!pool.includes(target)) pool.push(target);
  }
  if (pool.length === 0 || distinct() < MIN_DISTINCT) return null;
  return {
    id: reviewLessonId(instrument),
    unitId: 'repaso',
    instrument,
    kind: 'repaso',
    title: 'Tus puntos débiles',
    mode: 'notas',
    pool,
    roundSize: REVIEW_ROUND_SIZE,
    rhythmGoal: null,
    dynamic: true,
  };
}
