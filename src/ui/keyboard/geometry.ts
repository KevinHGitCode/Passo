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
 */
export function windowAround(
  focus: Midi,
  from: Midi,
  to: Midi,
  span: number,
): { from: Midi; to: Midi } {
  const octaveStart = Math.floor(focus / 12) * 12;
  const start = Math.min(Math.max(octaveStart, from), Math.max(from, to - span));
  return { from: start, to: Math.min(start + span, to) };
}
