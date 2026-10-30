import { Fretboard } from '../fretboard/Fretboard';
import type { BoardModel } from './board-model';

/** El diapasón con lo que muestran las lecciones de guitarra: la nota de ahora, las siguientes y cómo salió lo último. */
export function GuitarBoard({ board }: { readonly board: BoardModel }) {
  const { snapshot, playing, recent } = board;
  const { exercise, notation, help } = snapshot;
  const target = playing && exercise ? (exercise.target.positions[0] ?? null) : null;
  const upcoming =
    playing && exercise
      ? exercise.upcoming.flatMap((item) => (item.positions[0] ? [item.positions[0]] : []))
      : [];
  const kind = recent?.outcome.kind;
  const result =
    kind === 'acierto' || kind === 'ronda-completa' ? 'ok' : kind === 'error' ? 'error' : null;
  return (
    <div className="keyboard-wrap guitar-wrap" data-testid="guitar-board">
      <Fretboard
        target={target}
        upcoming={upcoming}
        result={result}
        notation={notation}
        help={help}
        ariaLabel="Mástil de guitarra: cuerdas 1 a 6 de arriba abajo, con los trastes 1 a 3"
      />
    </div>
  );
}
