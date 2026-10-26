import { noteName } from '@/core/domain/note';
import { PianoKeyboard } from '../keyboard/piano-keyboard';
import { KEYBOARD_FROM, KEYBOARD_TO } from './board-model';
import type { BoardModel } from './board-model';

/** El teclado con su cascada y su mano, tal como lo muestran la práctica libre y las lecciones. */
export function PracticeKeyboard({ board }: { readonly board: BoardModel }) {
  const { notation } = board.snapshot;
  return (
    <div className="keyboard-wrap">
      <PianoKeyboard
        from={KEYBOARD_FROM}
        to={KEYBOARD_TO}
        visuals={board.visuals}
        labelFor={board.labelFor}
        viewWindow={board.viewWindow}
        cascade={board.cascade}
        blockLabel={(midi) => noteName(midi, notation)}
        hand={board.hand}
        ariaLabel={board.keyboardLabel}
      />
    </div>
  );
}
