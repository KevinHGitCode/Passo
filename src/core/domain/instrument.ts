import type { Midi, NotationMode } from './note';
import { noteName, pitchName } from './note';

/**
 * Los instrumentos que Passo enseña. Es un concepto del dominio: el catálogo de lecciones, el progreso y
 * lo que se muestra dependen de él, pero **lo que se juzga siempre es la nota** (el tono que suena).
 */
export type Instrument = 'piano' | 'guitarra';

export const INSTRUMENTS: readonly Instrument[] = ['piano', 'guitarra'];
export const DEFAULT_INSTRUMENT: Instrument = 'piano';

export const INSTRUMENT_LABELS: Readonly<Record<Instrument, string>> = {
  piano: 'Piano',
  guitarra: 'Guitarra',
};

export function isInstrument(value: unknown): value is Instrument {
  return INSTRUMENTS.some((instrument) => instrument === value);
}

// ─── Guitarra ───────────────────────────────────────────────────────────────────────────────────

/** Cuerda de la guitarra: la 1 es la más aguda (la de abajo en la mano, la de arriba en la tablatura). */
export type GuitarString = 1 | 2 | 3 | 4 | 5 | 6;
export const GUITAR_STRINGS: readonly GuitarString[] = [1, 2, 3, 4, 5, 6];

/** Dedo de la mano que pisa: 1 índice, 2 medio, 3 anular, 4 meñique (en piano el 1 es el pulgar). */
export type GuitarFinger = 1 | 2 | 3 | 4;

/**
 * Notas al aire de la afinación estándar, en MIDI **sonoro** (Mi4 Si3 Sol3 Re3 La2 Mi2). La guitarra se
 * escribe una octava más aguda de como suena; aquí siempre se usa lo que suena. Índice 0 = cuerda 1.
 */
export const GUITAR_OPEN: readonly Midi[] = [64, 59, 55, 50, 45, 40];

/** El traste más alto que se admite (la guitarra de la mayoría tiene entre 19 y 24). */
export const GUITAR_MAX_FRET = 19;

/** Dónde se toca una nota en el mástil. `fret` 0 = cuerda al aire (sin dedo). */
export interface FretPosition {
  readonly string: GuitarString;
  readonly fret: number;
  /** `null` si es una cuerda al aire. */
  readonly finger: GuitarFinger | null;
}

export function isGuitarString(value: number): value is GuitarString {
  return Number.isInteger(value) && value >= 1 && value <= 6;
}

/** La nota que suena al pisar `fret` en la cuerda `string`. */
export function midiAt(string: number, fret: number): Midi {
  if (!isGuitarString(string)) throw new RangeError(`Cuerda fuera de rango (1–6): ${string}`);
  if (!Number.isInteger(fret) || fret < 0 || fret > GUITAR_MAX_FRET) {
    throw new RangeError(`Traste fuera de rango (0–${GUITAR_MAX_FRET}): ${fret}`);
  }
  return (GUITAR_OPEN[string - 1] as Midi) + fret;
}

/** Posición con el dedo que corresponde en primera posición (índice en el traste 1, y así hasta el 4). */
export function firstPosition(string: GuitarString, fret: number): FretPosition {
  midiAt(string, fret);
  const finger = fret >= 1 && fret <= 4 ? (fret as GuitarFinger) : null;
  if (fret > 4) throw new RangeError(`La primera posición llega hasta el traste 4: ${fret}`);
  return { string, fret, finger };
}

/** Nombre de la cuerda al aire («Mi», «Si»…), sin octava. */
export function openStringName(string: GuitarString, notation: NotationMode): string {
  return pitchName(midiAt(string, 0), notation);
}

// ─── Cómo se nombra una nota ────────────────────────────────────────────────────────────────────

/**
 * Cómo se muestra una nota. En piano, con octava («Do4»). En guitarra, sin ella («Do»): se escribe una
 * octava arriba de como suena y mostrar la octava confundiría más que ayudar.
 */
export function noteLabel(midi: Midi, notation: NotationMode, instrument: Instrument): string {
  return instrument === 'guitarra' ? pitchName(midi, notation) : noteName(midi, notation);
}
