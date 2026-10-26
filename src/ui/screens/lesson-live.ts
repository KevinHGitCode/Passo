import type { Attempt } from '@/core/domain/exercise';
import type { Lesson } from '@/core/domain/lessons';
import type { InputSource } from '@/core/domain/note-event';
import { STAR_3_ACCURACY, effectiveRhythmGoal, measureRhythm } from '@/core/domain/scoring';

/** Con menos de tres objetivos resueltos la precisión y el ritmo aún no dicen nada. */
export const MIN_TARGETS_FOR_LIVE_STATS = 3;

export interface LiveStats {
  /** Aciertos a la primera sobre los objetivos resueltos, de 0 a 1; `null` al principio de la ronda. */
  readonly accuracy: number | null;
  /** Notas por minuto (sin la primera nota); `null` al principio de la ronda. */
  readonly notesPerMinute: number | null;
}

/**
 * Las marcas en vivo de una ronda: la precisión se muestra desde el 4.º objetivo y el ritmo desde la
 * 3.ª nota, para que un primer fallo no asuste con un porcentaje bajo.
 */
export function liveStats(attempts: readonly Attempt[], hits: number): LiveStats {
  if (hits < MIN_TARGETS_FOR_LIVE_STATS) return { accuracy: null, notesPerMinute: null };
  const solved = attempts.filter((attempt) => attempt.isCorrect);
  const firstTry = solved.filter((attempt) => attempt.firstTryCorrect).length;
  return {
    accuracy: solved.length === 0 ? null : firstTry / solved.length,
    notesPerMinute: measureRhythm(attempts).notesPerMinute,
  };
}

/** La meta de la 3.ª estrella, en una frase: «95 % y 14 notas/min», y en las pruebas «sin ayuda». */
export function thirdStarGoalText(lesson: Lesson, source: InputSource | null): string {
  const parts = [`${Math.round(STAR_3_ACCURACY[lesson.kind] * 100)} %`];
  const rhythm = effectiveRhythmGoal(lesson, source);
  if (rhythm !== null) parts.push(`${Math.round(rhythm)} notas/min`);
  const text = parts.join(' y ');
  return lesson.kind === 'prueba' ? `${text}, sin ayuda` : text;
}

const KIND_TEXT = { nueva: 'Lección nueva', repaso: 'Repaso', prueba: 'Prueba' } as const;
export function lessonKindText(lesson: Lesson): string {
  return KIND_TEXT[lesson.kind];
}

const INPUT_NAMES: Readonly<Record<InputSource, string>> = {
  microfono: 'Micrófono',
  midi: 'Piano MIDI',
  'teclado-pc': 'Teclado del PC',
};
export function inputName(source: InputSource | null): string {
  return source === null ? 'Varias entradas' : INPUT_NAMES[source];
}
