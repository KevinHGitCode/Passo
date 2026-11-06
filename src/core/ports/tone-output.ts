import type { ToneSpec } from '../domain/reference-tone';

/** Salida de un tono sostenido de referencia (el afinador). Debe ser segura de llamar sin audio. */
export interface ToneOutput {
  /**
   * Hace sonar el tono. `onEnd` se llama **una sola vez**: cuando termina, cuando se corta o enseguida si
   * no hay audio.
   */
  playTone(tone: ToneSpec, onEnd: () => void): void;
  /** Corta el tono que suene (con un final breve y suave). */
  stopTone(): void;
}
