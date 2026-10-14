import type { SessionFeedback } from '@/core/application/practice-session';
import type { Midi } from '@/core/domain/note';
import type { KeyVisual } from '../keyboard/piano-keyboard';

export interface KeyVisualInput {
  /** Notas del objetivo (una, o varias en terceras y acordes). */
  readonly targets: readonly Midi[];
  /** Con la ayuda activada las teclas objetivo están siempre iluminadas. */
  readonly help: boolean;
  readonly pressed: readonly Midi[];
  /** Resultado reciente que todavía debe verse en el teclado. */
  readonly feedback: SessionFeedback | null;
  /** Nota que oye el micrófono ahora mismo. */
  readonly heard?: Midi | null | undefined;
}

/** Traduce el estado de la sesión a un mapa nota → estado visual del teclado. */
export function buildKeyVisuals(input: KeyVisualInput): Map<Midi, KeyVisual> {
  const visuals = new Map<Midi, KeyVisual>();
  const add = (midi: Midi, patch: KeyVisual) =>
    visuals.set(midi, { ...visuals.get(midi), ...patch });

  if (input.help) for (const target of input.targets) add(target, { target: true });

  const outcome = input.feedback?.outcome;
  if (outcome && outcome.kind !== 'dudoso' && outcome.kind !== 'parcial') {
    if (outcome.kind === 'error') {
      // En terceras y acordes todas las teclas del objetivo ya están iluminadas: no se señala una sola.
      if (outcome.attempt.targetNotes.length === 1) {
        add(outcome.attempt.targetMidi, { feedback: 'expected' });
      }
      add(outcome.attempt.playedMidi, { feedback: 'wrong' });
    } else {
      add(outcome.attempt.playedMidi, { feedback: 'correct' });
    }
  }

  if (input.heard !== null && input.heard !== undefined) add(input.heard, { heard: true });
  for (const midi of input.pressed) add(midi, { pressed: true });
  return visuals;
}
