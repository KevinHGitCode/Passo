import type { RefObject } from 'react';
import type { TunerSnapshot } from '@/core/application/tuner-service';
import { GUITAR_STRINGS, openStringName } from '@/core/domain/instrument';
import type { GuitarString } from '@/core/domain/instrument';
import type { NotationMode } from '@/core/domain/note';
import { pegVisual, stringRole } from './tuner-messages';

/**
 * El clavijero: un esquema de la cabeza de la guitarra vista de frente, con las seis clavijas 3 + 3
 * (izquierda 4 · 5 · 6 y derecha 3 · 2 · 1 de arriba abajo: la 6 y la 1 quedan junto a la cejuela). Es un
 * dibujo decorativo con seis botones de opción encima, en el orden 6→1: Tab entra una vez y las flechas
 * cambian de cuerda. Cada clavija dice su estado con una marca **y** con texto, nunca solo con color.
 */

/** Dónde cae cada cuerda en la cejuela y de qué clavija sale (x, y en % del dibujo). */
const LINES: Readonly<Record<GuitarString, { from: readonly [number, number]; to: number }>> = {
  6: { from: [0, 83.3], to: 30 },
  5: { from: [0, 50], to: 38 },
  4: { from: [0, 16.7], to: 46 },
  3: { from: [100, 16.7], to: 54 },
  2: { from: [100, 50], to: 62 },
  1: { from: [100, 83.3], to: 70 },
};

/** El orden del teclado y del lector de pantalla: de la cuerda grave a la aguda. */
const ORDER: readonly GuitarString[] = [...GUITAR_STRINGS].reverse();

export interface HeadstockProps {
  readonly snapshot: Pick<TunerSnapshot, 'status' | 'string' | 'strings'>;
  readonly notation: NotationMode;
  readonly onSelect: (string: GuitarString) => void;
  readonly groupRef?: RefObject<HTMLDivElement | null>;
}

export function Headstock({ snapshot, notation, onSelect, groupRef }: HeadstockProps) {
  return (
    <div
      className="headstock"
      role="radiogroup"
      aria-label="Cuerda que afinas"
      ref={groupRef}
      data-testid="headstock"
    >
      <div className="headstock__body" aria-hidden="true">
        <svg
          className="headstock__strings"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          focusable="false"
        >
          {GUITAR_STRINGS.map((string) => {
            const line = LINES[string];
            return (
              <line
                key={string}
                x1={line.from[0]}
                y1={line.from[1]}
                x2={line.to}
                y2={100}
                strokeWidth={[1.2, 1.6, 2.1, 2.8, 3.5, 4.2][string - 1]}
                data-wound={string >= 4 ? '' : undefined}
                data-active={snapshot.string === string}
              />
            );
          })}
        </svg>
      </div>
      {ORDER.map((string) => {
        const visual = pegVisual(snapshot, string);
        const selected = snapshot.string === string;
        const name = openStringName(string, notation);
        const role = stringRole(string);
        return (
          <label
            key={string}
            className={`peg peg--s${string} peg--${visual.key}${selected ? ' peg--active' : ''}`}
            data-testid={`tuner-string-${string}`}
            data-mark={visual.key}
          >
            <input
              type="radio"
              name="tuner-cuerda"
              className="peg__input"
              value={string}
              checked={selected}
              aria-keyshortcuts={String(string)}
              onChange={() => onSelect(string)}
            />
            <span className="peg__n" aria-hidden="true">
              {string}
            </span>
            <span className="peg__note" aria-hidden="true">
              {name}
            </span>
            {visual.badge ? (
              <span className="peg__badge" aria-hidden="true">
                {visual.badge}
              </span>
            ) : null}
            <span className="sr-only">
              Cuerda {string}, {name}
              {role ? ` (${role})` : ''}, {visual.word}
            </span>
          </label>
        );
      })}
    </div>
  );
}
