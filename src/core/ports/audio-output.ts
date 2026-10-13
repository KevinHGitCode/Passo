import type { Midi } from '../domain/note';

/** Salida de sonido. Debe ser segura de llamar aunque el audio aún esté bloqueado. */
export interface AudioOutput {
  noteOn(note: Midi, velocity: number): void;
  noteOff(note: Midi): void;
}
