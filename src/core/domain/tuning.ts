import { GUITAR_OPEN } from './instrument';
import type { GuitarString } from './instrument';
import type { Midi } from './note';

/**
 * Una afinación de la guitarra: la nota (MIDI **sonoro**) de cada cuerda al aire. Aparte de `GUITAR_OPEN`,
 * que es la afinación estándar sobre la que están escritas las lecciones: aquí viven las que solo usa el
 * afinador.
 */
export interface Tuning {
  readonly id: string;
  readonly label: string;
  /** Índice 0 = cuerda 1 (la más aguda), como `GUITAR_OPEN`. */
  readonly open: readonly Midi[];
}

export const STANDARD_TUNING: Tuning = { id: 'estandar', label: 'Estándar', open: GUITAR_OPEN };

export const TUNINGS: readonly Tuning[] = [STANDARD_TUNING];

/** La nota de una cuerda al aire en esa afinación. */
export function tuningNote(tuning: Tuning, string: GuitarString): Midi {
  return tuning.open[string - 1] as Midi;
}
