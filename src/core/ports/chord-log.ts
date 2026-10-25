import type { ChordMeasurement } from '../domain/chord-listener';

/** Quien guarda las mediciones recientes de acordes, para validar con un piano real (solo depuración). */
export interface ChordLogSource {
  getChordLog(): readonly ChordMeasurement[];
}
