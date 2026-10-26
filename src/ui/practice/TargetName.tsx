import { octaveOf, pitchName } from '@/core/domain/note';
import type { Midi, NotationMode } from '@/core/domain/note';
import type { Target } from '@/core/domain/target';

/**
 * El nombre del objetivo en grande: una nota («Do4») o varias en fichas («Do4 · Mi4 · Sol4») con
 * las ya pulsadas marcadas. Lo comparten la práctica libre y las lecciones.
 */
export function TargetName({
  notes,
  held,
  notation,
}: {
  readonly notes: Target['notes'];
  readonly held: readonly Midi[];
  readonly notation: NotationMode;
}) {
  if (notes.length === 1) {
    return (
      <span
        className="target__name"
        data-testid="target-note"
        data-midi={notes[0]}
        data-midis={notes[0]}
      >
        {pitchName(notes[0], notation)}
        <span className="target__octave">{octaveOf(notes[0])}</span>
      </span>
    );
  }
  return (
    <span
      className="target__name target__name--group"
      data-testid="target-note"
      data-midi={notes[0]}
      data-midis={notes.join(',')}
    >
      {notes.map((note) => (
        <span key={note} className="target__chip" data-held={held.includes(note)}>
          {pitchName(note, notation)}
          <span className="target__octave">{octaveOf(note)}</span>
          {held.includes(note) && <span className="sr-only"> (tocada)</span>}
        </span>
      ))}
    </span>
  );
}
