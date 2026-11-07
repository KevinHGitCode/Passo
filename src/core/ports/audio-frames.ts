import type { Unsubscribe } from './note-input';

/** Un fotograma del micrófono: las últimas muestras, para quien necesite analizar el sonido a su manera. */
export interface AudioFrame {
  /** Instante (reloj de la app) de la muestra más reciente. */
  readonly at: number;
  readonly sampleRate: number;
  /** Las últimas muestras (la más reciente al final). **Solo valen durante la llamada**: se copian si se guardan. */
  readonly samples: Float32Array;
  /** Cuántas de las últimas muestras son nuevas desde el fotograma anterior. */
  readonly newSamples: number;
  /** Ruido de la sala medido al calibrar (0 si aún no se sabe). */
  readonly noiseRms: number;
  /** El micrófono ya terminó de calibrarse: antes de eso no se mide nada. */
  readonly listening: boolean;
}

/** Quien da el sonido en bruto, fotograma a fotograma (el micrófono). */
export interface FrameSource {
  subscribeFrames(handler: (frame: AudioFrame) => void): Unsubscribe;
}
