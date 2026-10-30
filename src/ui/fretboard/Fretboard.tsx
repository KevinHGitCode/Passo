import { openStringName } from '@/core/domain/instrument';
import type { FretPosition, GuitarString } from '@/core/domain/instrument';
import type { NotationMode } from '@/core/domain/note';
import './fretboard.css';

/**
 * El mástil de la guitarra visto de frente, con la cuerda aguda arriba (igual que la tablatura). Solo
 * dibuja: qué nota es la de ahora, cuáles vienen después y cómo salió lo último lo decide quien lo usa.
 * Cada marca lleva el número del dedo (1 índice … 4 meñique); la cuerda al aire, un anillo antes de la
 * cejuela. «Ahora» es sólido y «Después» discontinuo (no depende del color).
 */

const LEFT = 80;
const FRET_WIDTH = 100;
const STRING_GAP = 30;
const TOP = 20;
const STRING_WIDTHS = [1.2, 1.6, 2.1, 2.8, 3.5, 4.2] as const;
const STRINGS: readonly GuitarString[] = [1, 2, 3, 4, 5, 6];
/** Trastes con punto de referencia en el mástil. */
const INLAYS = new Set([3, 5, 7, 9, 15, 17, 19]);

const stringY = (string: GuitarString): number => TOP + (string - 1) * STRING_GAP;
const fretCenterX = (fret: number): number => LEFT + (fret - 0.5) * FRET_WIDTH;
const markX = (fret: number): number => (fret === 0 ? LEFT - 12 : fretCenterX(fret));

export interface FretboardProps {
  /** La nota de ahora. */
  readonly target: FretPosition | null;
  /** Las que vienen después, en orden. */
  readonly upcoming: readonly FretPosition[];
  /** Cómo salió lo último que se tocó (el mástil lo marca con el borde; el texto lo dice la barra de respuesta). */
  readonly result?: 'ok' | 'error' | null;
  readonly notation: NotationMode;
  /** Cuántos trastes se dibujan desde la cejuela. */
  readonly frets?: number;
  /** Con la ayuda apagada solo se ve el mástil, sin marcar nada (se lee la nota). */
  readonly help?: boolean;
  readonly ariaLabel: string;
}

function Mark({
  position,
  kind,
}: {
  readonly position: FretPosition;
  readonly kind: 'now' | 'later';
}) {
  const x = markX(position.fret);
  const y = stringY(position.string);
  const open = position.fret === 0;
  return (
    <g className={`fretboard__mark fretboard__mark--${kind}`} data-kind={kind}>
      <circle cx={x} cy={y} r={open ? 9 : 14} />
      {open ? null : (
        <text x={x} y={y + 5.5} textAnchor="middle">
          {position.finger}
        </text>
      )}
    </g>
  );
}

export function Fretboard({
  target,
  upcoming,
  result = null,
  notation,
  frets = 3,
  help = true,
  ariaLabel,
}: FretboardProps) {
  const width = LEFT + frets * FRET_WIDTH + 16;
  const boardBottom = stringY(6) + STRING_GAP / 2;
  const height = boardBottom + 34;
  const end = LEFT + frets * FRET_WIDTH;
  const inlayY = (stringY(3) + stringY(4)) / 2;
  return (
    <svg
      className="fretboard"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      data-testid="fretboard"
      data-result={result ?? undefined}
    >
      <rect
        className="fretboard__wood"
        x={LEFT}
        y={TOP - STRING_GAP / 2}
        width={frets * FRET_WIDTH}
        height={boardBottom - (TOP - STRING_GAP / 2)}
        rx={5}
      />
      {Array.from({ length: frets }, (_, i) => i + 1)
        .filter((fret) => INLAYS.has(fret))
        .map((fret) => (
          <circle
            key={`inlay-${fret}`}
            className="fretboard__inlay"
            cx={fretCenterX(fret)}
            cy={inlayY}
            r={8}
          />
        ))}
      {help && target && target.fret > 0 ? (
        <rect
          className="fretboard__band"
          x={LEFT + (target.fret - 1) * FRET_WIDTH}
          y={TOP - STRING_GAP / 2}
          width={FRET_WIDTH}
          height={boardBottom - (TOP - STRING_GAP / 2)}
        />
      ) : null}
      {help && target ? (
        <rect
          className="fretboard__band"
          x={LEFT}
          y={stringY(target.string) - STRING_GAP / 2}
          width={frets * FRET_WIDTH}
          height={STRING_GAP}
        />
      ) : null}
      <line className="fretboard__nut" x1={LEFT} x2={LEFT} y1={TOP - 14} y2={boardBottom + 2} />
      {Array.from({ length: frets }, (_, i) => LEFT + (i + 1) * FRET_WIDTH).map((x) => (
        <line
          key={x}
          className="fretboard__wire"
          x1={x}
          x2={x}
          y1={TOP - STRING_GAP / 2}
          y2={boardBottom}
        />
      ))}
      {STRINGS.map((string) => (
        <line
          key={string}
          className={`fretboard__string${string >= 4 ? ' fretboard__string--wound' : ''}`}
          x1={LEFT}
          x2={end}
          y1={stringY(string)}
          y2={stringY(string)}
          strokeWidth={STRING_WIDTHS[string - 1]}
        />
      ))}
      {STRINGS.map((string) => (
        <text
          key={`name-${string}`}
          className="fretboard__label"
          x={LEFT - 26}
          y={stringY(string) + 5}
          textAnchor="end"
        >
          {string} · {openStringName(string, notation)}
        </text>
      ))}
      <text
        className="fretboard__label fretboard__label--hint"
        x={0}
        y={height - 6}
        textAnchor="start"
      >
        aguda ↑ grave ↓
      </text>
      {Array.from({ length: frets }, (_, i) => i + 1).map((fret) => (
        <text
          key={`fret-${fret}`}
          className="fretboard__label"
          x={fretCenterX(fret)}
          y={boardBottom + 22}
          textAnchor="middle"
        >
          {fret}
        </text>
      ))}
      {help
        ? upcoming.map((position, i) => (
            <Mark
              key={`${position.string}-${position.fret}-${i}`}
              position={position}
              kind="later"
            />
          ))
        : null}
      {help && target ? <Mark position={target} kind="now" /> : null}
    </svg>
  );
}
