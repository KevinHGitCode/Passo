import type { Midi } from './note';
import { isValidMidi } from './note';

/**
 * Lo que hay que tocar a la vez: una nota (el caso particular), una tercera, un acorde…
 * Las notas van de grave a agudo y sin repetir; siempre hay al menos una.
 */
export interface Target {
  readonly notes: readonly [Midi, ...Midi[]];
}

export function targetOf(notes: readonly Midi[]): Target {
  const sorted = [...new Set(notes)].sort((a, b) => a - b);
  const [first, ...rest] = sorted;
  if (first === undefined) throw new RangeError('Un objetivo necesita al menos una nota');
  for (const note of sorted) {
    if (!isValidMidi(note)) throw new RangeError(`Número MIDI fuera de rango (0–127): ${note}`);
  }
  return { notes: [first, ...rest] };
}

export function single(note: Midi): Target {
  return targetOf([note]);
}

export function sameTarget(a: Target, b: Target): boolean {
  return a.notes.length === b.notes.length && a.notes.every((note, i) => note === b.notes[i]);
}
