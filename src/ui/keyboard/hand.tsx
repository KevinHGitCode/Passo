import type { HandShape } from '@/core/domain/hand-shape';
import { FINGER_HEIGHT, FINGER_WIDTH, HAND_MARGIN, WHITE_HEIGHT } from './geometry';
import type { KeyboardLayout } from './geometry';

export interface HandProps {
  readonly layout: KeyboardLayout;
  readonly shape: HandShape;
  /** Qué teclas se ven (en pantallas estrechas solo una parte del teclado); los demás dedos no se dibujan. */
  readonly isVisible?: ((midi: number) => boolean) | undefined;
}

/**
 * La «mano fantasma» bajo el teclado: cinco dedos sobre teclas blancas contiguas; solo los que tocan
 * van rellenos. La mano derecha usa cápsulas y la izquierda cuadrados redondeados (además del color,
 * para distinguirlas sin depender de él). Es decorativa: los dedos también se dicen con texto.
 */
export function Hand({ layout, shape, isVisible }: HandProps) {
  const top = WHITE_HEIGHT + 4 + HAND_MARGIN;
  const radius = shape.hand === 'derecha' ? FINGER_WIDTH / 2 : 5;
  return (
    <g
      className={`hand hand--${shape.hand}`}
      aria-hidden="true"
      pointerEvents="none"
      data-testid="hand"
      data-hand={shape.hand}
    >
      {shape.fingers.map((placement) => {
        const key = layout.keys.find((item) => item.midi === placement.midi);
        if (!key || !(isVisible?.(key.midi) ?? true)) return null;
        const centerX = key.x + key.width / 2;
        return (
          <g
            key={placement.finger}
            className={`hand__finger hand__finger--${placement.used ? 'used' : 'ghost'}`}
            data-finger={placement.finger}
            data-midi={placement.midi}
          >
            <rect
              x={centerX - FINGER_WIDTH / 2}
              y={top}
              width={FINGER_WIDTH}
              height={FINGER_HEIGHT}
              rx={radius}
            />
            <text x={centerX} y={top + FINGER_HEIGHT / 2 + 3.2} textAnchor="middle">
              {placement.finger}
            </text>
          </g>
        );
      })}
    </g>
  );
}
