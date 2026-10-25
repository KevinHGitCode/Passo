import type { Midi } from '@/core/domain/note';
import type { Finger } from '@/core/domain/target';
import { BLOCK_GAP, BLOCK_HEIGHT, slotTop } from './geometry';
import type { KeyboardLayout, KeyLayout } from './geometry';

/** Un objetivo que espera su turno: sus notas (una o varias) en una fila de la cascada. */
export interface CascadeBlock {
  /** Número de orden del objetivo en la ronda: no cambia al avanzar, así el bloque «cae» en vez de reaparecer. */
  readonly id: number;
  /** 0 = el objetivo actual (sobre las teclas); 1 y 2 = los siguientes. */
  readonly slot: number;
  readonly notes: readonly Midi[];
  /** Dedo de cada nota, en el mismo orden (vacío si no hay). */
  readonly fingers: readonly Finger[];
}

export interface CascadeProps {
  readonly layout: KeyboardLayout;
  readonly blocks: readonly CascadeBlock[];
  readonly labelFor: (midi: Midi) => string;
  /** Qué teclas se ven (en pantallas estrechas solo una parte del teclado); las demás notas no se dibujan. */
  readonly isVisible?: ((midi: Midi) => boolean) | undefined;
}

/**
 * Cola de notas sobre el teclado: la actual, sólida, justo encima de su tecla; las siguientes,
 * punteadas, más arriba. Avanzar desplaza los bloques una fila con una transición CSS (sin
 * `requestAnimationFrame` ni redibujar por fotograma). Es decorativa: lo importante lo dice el texto.
 */
export function Cascade({ layout, blocks, labelFor, isVisible }: CascadeProps) {
  return (
    <g className="cascade" aria-hidden="true" pointerEvents="none" data-testid="cascade">
      {blocks.map((block) => {
        const keys = block.notes
          .map((midi) => layout.keys.find((key) => key.midi === midi))
          .filter((key): key is KeyLayout => key !== undefined && (isVisible?.(key.midi) ?? true));
        if (keys.length === 0) return null;
        const top = slotTop(0);
        const first = keys[0];
        const last = keys[keys.length - 1];
        return (
          <g
            key={block.id}
            className={`cascade__block cascade__block--${block.slot === 0 ? 'now' : 'next'}`}
            style={{ transform: `translateY(${-block.slot * (BLOCK_HEIGHT + BLOCK_GAP)}px)` }}
            data-id={block.id}
            data-slot={block.slot}
          >
            {/* El peine: una barra por detrás que une las notas que se tocan a la vez. */}
            {first && last && keys.length > 1 && (
              <path
                className="cascade__comb"
                d={`M${first.x + first.width / 2} ${top + BLOCK_HEIGHT / 2} H${last.x + last.width / 2}`}
              />
            )}
            {keys.map((key, i) => {
              const finger = block.fingers[i];
              return (
                <g key={key.midi} className="cascade__note" data-midi={key.midi}>
                  <rect
                    x={key.x + 1}
                    y={top}
                    width={key.width - 2}
                    height={BLOCK_HEIGHT}
                    rx={3}
                    className="cascade__rect"
                  />
                  <text
                    x={key.x + key.width / 2 - 2}
                    y={top + BLOCK_HEIGHT / 2 + 3}
                    textAnchor="middle"
                    className="cascade__name"
                  >
                    {labelFor(key.midi)}
                  </text>
                  {finger !== undefined && (
                    <g className="cascade__finger">
                      <circle cx={key.x + key.width - 2} cy={top + 2} r={5} />
                      <text x={key.x + key.width - 2} y={top + 4.6} textAnchor="middle">
                        {finger}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}
