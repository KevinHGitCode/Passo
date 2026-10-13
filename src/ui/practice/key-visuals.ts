import type { SessionFeedback } from '@/core/application/practice-session';
import type { Midi } from '@/core/domain/note';
import type { KeyVisual } from '../keyboard/piano-keyboard';

export interface KeyVisualInput {
  readonly target: Midi | null;
  /** Con la ayuda activada la tecla objetivo está siempre iluminada. */
  readonly help: boolean;
  readonly pressed: readonly Midi[];
  /** Resultado reciente que todavía debe verse en el teclado. */
  readonly feedback: SessionFeedback | null;
}

/** Traduce el estado de la sesión a un mapa nota → estado visual del teclado. */
export function buildKeyVisuals(input: KeyVisualInput): Map<Midi, KeyVisual> {
  const visuals = new Map<Midi, KeyVisual>();
  const add = (midi: Midi, patch: KeyVisual) =>
    visuals.set(midi, { ...visuals.get(midi), ...patch });

  if (input.help && input.target !== null) add(input.target, { target: true });

  const outcome = input.feedback?.outcome;
  if (outcome) {
    if (outcome.kind === 'error') {
      add(outcome.attempt.targetMidi, { feedback: 'expected' });
      add(outcome.attempt.playedMidi, { feedback: 'wrong' });
    } else {
      add(outcome.attempt.playedMidi, { feedback: 'correct' });
    }
  }

  for (const midi of input.pressed) add(midi, { pressed: true });
  return visuals;
}
