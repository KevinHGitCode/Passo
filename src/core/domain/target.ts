import type { Midi } from './note';
import { isValidMidi } from './note';

export type Finger = 1 | 2 | 3 | 4 | 5;
export type Hand = 'derecha' | 'izquierda';

/** Un acorde de tres notas en estado fundamental, para nombrarlo («Do mayor»). */
export interface ChordInfo {
  readonly root: Midi;
  readonly quality: 'mayor' | 'menor';
}

/**
 * Lo que hay que tocar a la vez: una nota (el caso particular), una tercera, un acorde…
 * Las notas van de grave a agudo y sin repetir; siempre hay al menos una.
 */
export interface Target {
  readonly notes: readonly [Midi, ...Midi[]];
  /** Dedo de cada nota (mismo orden que `notes`); vacío si no se indica. */
  readonly fingers: readonly Finger[];
  readonly hand: Hand | null;
  readonly chord: ChordInfo | null;
}

export interface TargetExtras {
  readonly fingers?: readonly Finger[];
  readonly hand?: Hand;
  readonly chord?: ChordInfo;
}

/** `extras.fingers` va en el mismo orden que las notas ya ordenadas de grave a agudo. */
export function targetOf(notes: readonly Midi[], extras: TargetExtras = {}): Target {
  const sorted = [...new Set(notes)].sort((a, b) => a - b);
  const [first, ...rest] = sorted;
  if (first === undefined) throw new RangeError('Un objetivo necesita al menos una nota');
  for (const note of sorted) {
    if (!isValidMidi(note)) throw new RangeError(`Número MIDI fuera de rango (0–127): ${note}`);
  }
  const fingers = extras.fingers ?? [];
  if (fingers.length !== 0 && fingers.length !== sorted.length) {
    throw new RangeError('Hace falta un dedo por cada nota del objetivo');
  }
  return {
    notes: [first, ...rest],
    fingers,
    hand: extras.hand ?? null,
    chord: extras.chord ?? null,
  };
}

export function single(note: Midi): Target {
  return targetOf([note]);
}

export function sameTarget(a: Target, b: Target): boolean {
  return a.notes.length === b.notes.length && a.notes.every((note, i) => note === b.notes[i]);
}

/** La nota del objetivo más cercana a `note` (a igual distancia, la más grave). */
export function closestTargetNote(target: Target, note: Midi): Midi {
  let closest = target.notes[0];
  for (const candidate of target.notes) {
    if (Math.abs(candidate - note) < Math.abs(closest - note)) closest = candidate;
  }
  return closest;
}
