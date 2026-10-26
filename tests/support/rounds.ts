import type { Attempt } from '@/core/domain/exercise';
import type { InputSource } from '@/core/domain/note-event';

export interface Spec {
  readonly notes?: readonly number[];
  readonly ms: number;
  readonly firstTry?: boolean;
  readonly source?: InputSource;
  readonly help?: boolean;
}

/**
 * Una ronda de `specs.length` objetivos. Cada uno se acierta a la primera por defecto; con
 * `firstTry: false` hay antes un error (y el acierto es el segundo intento).
 */
export function round(specs: readonly Spec[]): Attempt[] {
  const attempts: Attempt[] = [];
  specs.forEach((spec, index) => {
    const notes = spec.notes ?? [60];
    const base = {
      targetMidi: notes[0] as number,
      targetNotes: notes as Attempt['targetNotes'],
      shownAt: 0,
      inputSource: spec.source ?? 'teclado-pc',
      noteNameMode: 'latina' as const,
      mode: 'notas' as const,
      level: 0,
      velocity: 90,
      helpOn: spec.help ?? true,
      targetIndex: index,
      detectionConfidence: null,
    };
    let attemptIndex = 1;
    if (spec.firstTry === false) {
      attempts.push({
        ...base,
        playedMidi: 61,
        isCorrect: false,
        playedAt: 100,
        reactionMs: 100,
        attemptIndexForTarget: 1,
        firstTryCorrect: false,
      });
      attemptIndex = 2;
    }
    attempts.push({
      ...base,
      playedMidi: notes[0] as number,
      isCorrect: true,
      playedAt: spec.ms,
      reactionMs: spec.ms,
      attemptIndexForTarget: attemptIndex,
      firstTryCorrect: attemptIndex === 1,
    });
  });
  return attempts;
}

export const steady = (count: number, ms: number, extra: Partial<Spec> = {}): Spec[] =>
  Array.from({ length: count }, () => ({ ms, ...extra }));
