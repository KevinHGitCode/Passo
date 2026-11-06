import type { GuitarString } from './instrument';

/**
 * La nota de referencia del afinador («Escuchar la nota»): un tono sintético con la forma de una cuerda de
 * guitarra, descrito sin tocar el audio. Los altavoces de un portátil casi no dan nada por debajo de
 * 150–200 Hz (el Mi grave son 82 Hz), así que la fundamental pesa menos en las cuerdas graves y los
 * armónicos exactos hacen que el oído la reconstruya.
 */
export interface ToneSpec {
  /** La frecuencia de la cuerda (la fundamental). */
  readonly frequency: number;
  /** Cuánto suena en total, con el final suave incluido. */
  readonly durationMs: number;
  readonly attackMs: number;
  readonly releaseMs: number;
  /** Amplitud relativa de cada armónico, del 1.º en adelante. */
  readonly harmonics: readonly number[];
}

export const REFERENCE_TONE_MS = 2500;
/** Tras acabar el tono, la medición sigue en pausa este tiempo (cola de la sala, latencia de salida…). */
export const REFERENCE_GUARD_MS = 500;

const BASS_HARMONICS = [0.6, 1, 0.8, 0.5, 0.35, 0.25] as const;
const TREBLE_HARMONICS = [1, 0.5, 0.3, 0.2] as const;

export function referenceTone(string: GuitarString, frequency: number): ToneSpec {
  return {
    frequency,
    durationMs: REFERENCE_TONE_MS,
    attackMs: 7,
    releaseMs: 150,
    harmonics: string >= 5 ? BASS_HARMONICS : TREBLE_HARMONICS,
  };
}
