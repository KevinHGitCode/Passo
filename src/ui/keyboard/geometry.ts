import { isBlackKey } from '@/core/domain/note';
import type { Midi } from '@/core/domain/note';

/** Medidas en unidades del `viewBox` SVG (proporciones cercanas a un piano real). */
export const WHITE_WIDTH = 24;
export const WHITE_HEIGHT = 140;
export const BLACK_WIDTH = 14; // ≈ 58 % de la tecla blanca
export const BLACK_HEIGHT = 88; // ≈ 63 % de la altura

/** Desplazamiento de cada tecla negra respecto a la unión de sus blancas (fracción del ancho). */
const BLACK_OFFSET_BY_PITCH_CLASS: Readonly<Record<number, number>> = {
  1: -0.12, // Do#
  3: 0.12, // Re#
  6: -0.14, // Fa#
  8: 0, // Sol#
  10: 0.14, // La#
};

/**
 * El teclado, la cascada de notas que esperan encima y la mano debajo comparten **un solo sistema de
 * coordenadas** (el mismo `viewBox` SVG): así cada bloque cae justo sobre su tecla y cada dedo queda
 * justo bajo ella, a cualquier tamaño de pantalla.
 */
export const BLOCK_HEIGHT = 16;
export const BLOCK_GAP = 4;
/** Filas de la cascada: la nota actual y las que esperan (la 0 es la de abajo, sobre las teclas). */
export const CASCADE_SLOTS = 3;
export const CASCADE_MARGIN = 2;
export const CASCADE_HEIGHT =
  CASCADE_SLOTS * BLOCK_HEIGHT + (CASCADE_SLOTS - 1) * BLOCK_GAP + 2 * CASCADE_MARGIN;
export const FINGER_HEIGHT = 22;
export const FINGER_WIDTH = 18;
export const HAND_MARGIN = 3;
export const HAND_HEIGHT = FINGER_HEIGHT + 2 * HAND_MARGIN;
/** Margen por encima y por debajo de las teclas (sombras y bordes). */
const KEY_MARGIN = 2;

/** Arriba de una fila de la cascada (y de las teclas = 0): la fila 0 es la más cercana a las teclas. */
export function slotTop(slot: number): number {
  return -CASCADE_MARGIN - BLOCK_HEIGHT - slot * (BLOCK_HEIGHT + BLOCK_GAP);
}

export interface ViewBoxOptions {
  /** Reserva las filas de la cascada por encima de las teclas. */
  readonly cascade?: boolean | undefined;
  /** Reserva la fila de la mano por debajo de las teclas. */
  readonly hand?: boolean | undefined;
}

/** El `viewBox` del teclado con las filas reservadas: una sola escala para teclas, bloques y dedos. */
export function viewBoxOf(
  x: number,
  width: number,
  { cascade = false, hand = false }: ViewBoxOptions = {},
): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  const above = cascade ? CASCADE_HEIGHT : KEY_MARGIN;
  const below = hand ? HAND_HEIGHT : 0;
  return { x, y: -above, width, height: above + WHITE_HEIGHT + 4 + below };
}

export interface KeyLayout {
  readonly midi: Midi;
  readonly isBlack: boolean;
  readonly x: number;
  readonly width: number;
  readonly height: number;
}

export interface KeyboardLayout {
  readonly keys: readonly KeyLayout[];
  readonly whiteCount: number;
  readonly width: number;
  readonly height: number;
}

/** Calcula la posición de cada tecla entre `from` y `to` (ambas deben ser teclas blancas). */
export function layoutKeys(from: Midi, to: Midi): KeyboardLayout {
  if (from > to) throw new RangeError('El rango del teclado está invertido');
  if (isBlackKey(from) || isBlackKey(to)) {
    throw new RangeError('El teclado debe empezar y terminar en una tecla blanca');
  }

  const keys: KeyLayout[] = [];
  let whiteIndex = 0;
  for (let midi = from; midi <= to; midi++) {
    if (isBlackKey(midi)) {
      const offset = BLACK_OFFSET_BY_PITCH_CLASS[midi % 12] ?? 0;
      keys.push({
        midi,
        isBlack: true,
        x: whiteIndex * WHITE_WIDTH - BLACK_WIDTH / 2 + offset * WHITE_WIDTH,
        width: BLACK_WIDTH,
        height: BLACK_HEIGHT,
      });
    } else {
      keys.push({
        midi,
        isBlack: false,
        x: whiteIndex * WHITE_WIDTH,
        width: WHITE_WIDTH,
        height: WHITE_HEIGHT,
      });
      whiteIndex++;
    }
  }
  return {
    keys,
    whiteCount: whiteIndex,
    width: whiteIndex * WHITE_WIDTH,
    height: WHITE_HEIGHT,
  };
}

/**
 * Ventana de `span` semitonos que contiene la nota `focus` (empieza en el Do de su octava), dentro de [from, to].
 * Se usa en pantallas estrechas para mostrar solo una parte del teclado.
 * Si se indica `reach` (la nota más aguda que debe verse), la ventana se alarga hasta ella.
 */
export function windowAround(
  focus: Midi,
  from: Midi,
  to: Midi,
  span: number,
  reach: Midi = focus,
): { from: Midi; to: Midi } {
  const octaveStart = Math.floor(focus / 12) * 12;
  const start = Math.min(Math.max(octaveStart, from), Math.max(from, to - span));
  return { from: start, to: Math.min(Math.max(start + span, reach), to) };
}
