import { guitarNote, mix } from './synth';

/** Un acorde rasgueado en el orden dado (cada cuerda unos ms después de la anterior). */
export function strum(
  notes: readonly number[],
  options: {
    spacingMs?: number;
    ms?: number;
    amplitude?: number;
    cents?: readonly number[];
    t60?: number;
  } = {},
): Float32Array {
  const { spacingMs = 9, ms = 1200, amplitude = 0.18, cents = [], t60 = 4 } = options;
  return mix(
    notes.map((midi, index) => ({
      signal: guitarNote(midi, { ms, amplitude, seed: 3 + index, cents: cents[index] ?? 0, t60 }),
      offsetMs: index * spacingMs,
    })),
  );
}
