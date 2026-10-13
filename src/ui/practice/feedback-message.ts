import type { Outcome } from '@/core/domain/exercise';
import { noteName } from '@/core/domain/note';
import type { Midi, NotationMode } from '@/core/domain/note';

export type FeedbackTone = 'ok' | 'error' | 'done';

export interface FeedbackMessage {
  readonly tone: FeedbackTone;
  readonly title: string;
  readonly detail: string;
}

export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

/** "2 semitonos más agudo": positivo = se tocó más agudo que la nota pedida. */
export function describeSemitones(semitones: number): string {
  const count = Math.abs(semitones);
  const unit = count === 1 ? 'semitono' : 'semitonos';
  return `${count} ${unit} más ${semitones > 0 ? 'agudo' : 'grave'}`;
}

export function feedbackMessage(
  outcome: Exclude<Outcome, { kind: 'ignorado' }>,
  notation: NotationMode,
): FeedbackMessage {
  const name = (midi: Midi) => noteName(midi, notation);
  switch (outcome.kind) {
    case 'acierto':
      return {
        tone: 'ok',
        title: '¡Correcto!',
        detail: `${name(outcome.attempt.targetMidi)} · ${formatSeconds(outcome.attempt.reactionMs)}`,
      };
    case 'error':
      return {
        tone: 'error',
        title: 'Incorrecto',
        detail: `Era ${name(outcome.attempt.targetMidi)}, tocaste ${name(outcome.attempt.playedMidi)} · ${describeSemitones(outcome.semitones)}`,
      };
    case 'ronda-completa':
      return {
        tone: 'done',
        title: '¡Ronda completa!',
        detail: `${outcome.summary.firstTryCorrect} de ${outcome.summary.totalTargets} a la primera`,
      };
  }
}
