import { isBlackKey } from './note';
import type { Midi } from './note';
import type { Finger, Hand, Target } from './target';

/** Posición de cada tecla blanca dentro de su octava (Do = 0 … Si = 6). */
const WHITE_POSITION: Readonly<Record<number, number>> = {
  0: 0,
  2: 1,
  4: 2,
  5: 3,
  7: 4,
  9: 5,
  11: 6,
};
const WHITE_PITCH_CLASS = [0, 2, 4, 5, 7, 9, 11] as const;

/** Índice de una tecla blanca contando solo teclas blancas (Do-1 = 0). */
function whiteIndex(midi: Midi): number {
  return Math.floor(midi / 12) * 7 + (WHITE_POSITION[midi % 12] as number);
}

function whiteMidi(index: number): Midi {
  return Math.floor(index / 7) * 12 + (WHITE_PITCH_CLASS[((index % 7) + 7) % 7] as number);
}

/** Dónde apoya un dedo de la mano: debajo de qué tecla blanca, y si toca en este objetivo. */
export interface FingerPlacement {
  readonly finger: Finger;
  readonly midi: Midi;
  /** Este dedo toca una tecla del objetivo (los demás solo acompañan la posición de la mano). */
  readonly used: boolean;
}

export interface HandShape {
  readonly hand: Hand;
  /** Los cinco dedos, del 1 al 5. */
  readonly fingers: readonly FingerPlacement[];
}

const ALL_FINGERS: readonly Finger[] = [1, 2, 3, 4, 5];

/**
 * La mano «fantasma» de un objetivo: cinco dedos sobre teclas blancas contiguas, con el dedo de la
 * nota más grave apoyado en ella (la posición normal de una mano sobre el piano). La mano derecha
 * crece hacia la derecha del dedo 1 al 5; la izquierda al revés (el 5 es el más grave).
 * Devuelve `null` si el objetivo no trae mano y dedos, o si su nota más grave es negra.
 */
export function handShape(target: Target): HandShape | null {
  const { hand, fingers, notes } = target;
  const lowest = notes[0];
  const lowestFinger = fingers[0];
  if (hand === null || lowestFinger === undefined || isBlackKey(lowest)) return null;

  const anchor = whiteIndex(lowest);
  const placements = ALL_FINGERS.map((finger) => {
    const steps = hand === 'derecha' ? finger - lowestFinger : lowestFinger - finger;
    return { finger, midi: whiteMidi(anchor + steps), used: fingers.includes(finger) };
  });
  return { hand, fingers: placements };
}
