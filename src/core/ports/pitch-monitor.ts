import type { Unsubscribe } from './note-input';

/** Una lectura continua del tono (no una nota confirmada): lo que necesita un afinador. */
export interface PitchReading {
  readonly frequency: number;
  /** Claridad de la periodicidad (0–1). */
  readonly clarity: number;
  /** Instante (reloj de la app) de la lectura. */
  readonly at: number;
}

/** Quien puede dar el tono que suena ahora mismo, fotograma a fotograma (el micrófono). */
export interface PitchMonitor {
  /** La última lectura, o `null` si no suena nada claro dentro del intervalo buscado. */
  getPitch(): PitchReading | null;
  /** Avisa con cada lectura y, mientras se mide, con `null` en cada fotograma sin sonido. */
  subscribePitch(handler: (reading: PitchReading | null) => void): Unsubscribe;
}

/**
 * Dónde buscar el tono. Con `null` no se mide (no cuesta nada); con un intervalo, solo se busca dentro de
 * él, así una cuerda muy floja no se confunde con otra nota ni con su octava.
 */
export interface PitchTarget {
  setPitchSearch(range: { readonly minHz: number; readonly maxHz: number } | null): void;
}
