/**
 * Notas musicales como números MIDI (0–127).
 * Convención de octava: notación científica, Do central = C4 = MIDI 60.
 * Ortografía: siempre con sostenidos ("Do#4"); la ortografía por tonalidad llega con las partituras.
 */

export type Midi = number;

export type NotationMode = 'latina' | 'americana';

export const MIDI_MIN = 0;
export const MIDI_MAX = 127;
export const MIDI_C4 = 60;

const LATINA = [
  'Do',
  'Do#',
  'Re',
  'Re#',
  'Mi',
  'Fa',
  'Fa#',
  'Sol',
  'Sol#',
  'La',
  'La#',
  'Si',
] as const;
const AMERICANA = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);

export function isValidMidi(midi: number): midi is Midi {
  return Number.isInteger(midi) && midi >= MIDI_MIN && midi <= MIDI_MAX;
}

function assertMidi(midi: number): void {
  if (!isValidMidi(midi)) throw new RangeError(`Número MIDI fuera de rango (0–127): ${midi}`);
}

/** Clase de altura: 0 = Do, 1 = Do#, … 11 = Si. */
export function pitchClass(midi: Midi): number {
  assertMidi(midi);
  return midi % 12;
}

/** Octava en notación científica (MIDI 60 → 4). */
export function octaveOf(midi: Midi): number {
  assertMidi(midi);
  return Math.floor(midi / 12) - 1;
}

export function isBlackKey(midi: Midi): boolean {
  return BLACK_PITCH_CLASSES.has(pitchClass(midi));
}

/** Nombre sin octava: "Do#" / "C#". */
export function pitchName(midi: Midi, notation: NotationMode): string {
  const names = notation === 'latina' ? LATINA : AMERICANA;
  return names[pitchClass(midi)] as string;
}

/** Nombre con octava: "Do4" / "C4". */
export function noteName(midi: Midi, notation: NotationMode): string {
  return `${pitchName(midi, notation)}${octaveOf(midi)}`;
}

/** Distancia en semitonos con signo (positiva si `played` está más arriba que `target`). */
export function semitoneDistance(target: Midi, played: Midi): number {
  assertMidi(target);
  assertMidi(played);
  return played - target;
}
