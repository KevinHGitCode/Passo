import type { ExerciseMode } from './curriculum';
import type { Instrument } from './instrument';
import type { Target } from './target';

/**
 * El modelo de las lecciones y las unidades (los tipos y cómo se arman). El catálogo de cada
 * instrumento vive aparte (`lessons.ts` para piano, `guitar-lessons.ts` para guitarra) y solo depende de
 * este archivo.
 */

export type LessonKind = 'nueva' | 'repaso' | 'prueba';

/** Objetivos de cada tipo de lección: nueva 10 · repaso 14 · prueba 20 (en notas sueltas). */
export const LESSON_ROUND_SIZE: Readonly<Record<LessonKind, number>> = {
  nueva: 10,
  repaso: 14,
  prueba: 20,
};

/** El nivel de una lección no es de práctica libre: marca los intentos como «de lección». */
export const LESSON_LEVEL = 0;

export interface Lesson {
  /** Estable: se guarda en el progreso. `u<unidad>-<n>` en piano, `g<unidad>-<n>` en guitarra. */
  readonly id: string;
  readonly unitId: string;
  readonly instrument: Instrument;
  readonly kind: LessonKind;
  /** Qué se toca, en pocas palabras («Do · Re · Mi»). */
  readonly title: string;
  readonly mode: ExerciseMode;
  readonly pool: readonly Target[];
  readonly roundSize: number;
  /** Notas por minuto para la 3.ª estrella (con piano MIDI o teclado del PC); `null`: no se exige. */
  readonly rhythmGoal: number | null;
  /**
   * Lección armada al momento (el repaso de tus puntos débiles): no está en el camino, no tiene
   * estrellas ni se guarda como lección; sí da experiencia y alimenta las estadísticas por tecla.
   */
  readonly dynamic?: boolean;
}

export interface Unit {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  /** Una línea que explica la unidad. */
  readonly summary: string;
  /** No frena el camino: se puede dejar para más tarde (terceras y acordes con micrófono). */
  readonly optional: boolean;
  /**
   * Unidades que hay que terminar antes de abrir esta (por avance). No es una fila única: la 3 solo pide
   * la 1, para que una nota que el micrófono no oye bien (las graves de la 2) no frene el camino.
   */
  readonly requires: readonly string[];
  readonly lessons: readonly Lesson[];
}

export interface LessonSpec {
  readonly kind: LessonKind;
  readonly title: string;
  readonly pool: readonly Target[];
  readonly mode?: ExerciseMode;
  readonly roundSize?: number;
  readonly rhythmGoal?: number | null;
}

/** Arma las lecciones de una unidad: ids `<unidad>-<n>`, tamaño de ronda por tipo y meta de ritmo. */
export function lessonsOf(
  unitId: string,
  specs: readonly LessonSpec[],
  rhythm: (kind: LessonKind) => number | null,
  instrument: Instrument = 'piano',
): Lesson[] {
  return specs.map((spec, index) => ({
    id: `${unitId}-${index + 1}`,
    unitId,
    instrument,
    kind: spec.kind,
    title: spec.title,
    mode: spec.mode ?? 'notas',
    pool: spec.pool,
    roundSize: spec.roundSize ?? LESSON_ROUND_SIZE[spec.kind],
    rhythmGoal: spec.rhythmGoal === undefined ? rhythm(spec.kind) : spec.rhythmGoal,
  }));
}
