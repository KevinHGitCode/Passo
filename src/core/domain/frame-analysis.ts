import { detectPitch } from './pitch';
import type { PitchEstimate } from './pitch';

/** Tamaño del bloque de energía: ~5,3 ms a 48 kHz, suficiente para fechar un ataque. */
export const BLOCK_SIZE = 256;

/**
 * Cada bloque nuevo se compara con la energía de las 768 muestras que lo preceden (~16 ms):
 * así un ataque destaca aunque la nota anterior siga sonando, y un tono grave estable no
 * parece un ataque (un bloque de 256 muestras ocupa 0,7 periodos a 130 Hz).
 */
export const BASELINE_WINDOW = 768;

export interface FrameAnalysis {
  /** Instante (ms, reloj del `Clock`) de la muestra más reciente. */
  readonly endAt: number;
  /** Se perdieron muestras justo antes de este fotograma (el temporizador se retrasó más que la ventana). */
  readonly afterGap: boolean;
  /** Duración de la ventana completa analizada, en ms. */
  readonly windowMs: number;
  /** Duración de un bloque en ms. */
  readonly blockMs: number;
  /** RMS de cada bloque nuevo de 256 muestras, del más antiguo al más reciente. */
  readonly blockRms: readonly number[];
  /** RMS de las 768 muestras anteriores a cada bloque (para decidir si el bloque es un ataque); -1 si no hay. */
  readonly blockBaseline: readonly number[];
  /** RMS de todas las muestras nuevas. */
  readonly rms: number;
  /** Valor absoluto máximo de las muestras nuevas (para detectar saturación). */
  readonly peak: number;
  /** Altura del fragmento completo, o `null` si no hay periodicidad clara. */
  readonly pitch: PitchEstimate | null;
}

/** RMS de `samples[from, to)`. */
export function rms(samples: Float32Array, from = 0, to = samples.length): number {
  if (to <= from) return 0;
  let sum = 0;
  for (let i = from; i < to; i++) {
    const value = samples[i] as number;
    sum += value * value;
  }
  return Math.sqrt(sum / (to - from));
}

/**
 * Analiza un fotograma: `window` son las últimas muestras (la más reciente al final) y
 * `newSamples` cuántas de ellas no se habían procesado todavía.
 */
export function analyzeFrame(
  window: Float32Array,
  newSamples: number,
  sampleRate: number,
  endAt: number,
  afterGap = false,
): FrameAnalysis {
  const count = Math.min(Math.max(0, Math.floor(newSamples)), window.length);
  const start = window.length - count;
  const blockRms: number[] = [];
  const blockBaseline: number[] = [];
  let peak = 0;
  for (let i = start; i < window.length; i++) {
    const magnitude = Math.abs(window[i] as number);
    if (magnitude > peak) peak = magnitude;
  }
  const blocks = Math.floor(count / BLOCK_SIZE);
  for (let b = 0; b < blocks; b++) {
    const end = window.length - (blocks - 1 - b) * BLOCK_SIZE;
    blockRms.push(rms(window, end - BLOCK_SIZE, end));
    // Sin al menos un bloque de muestras detrás dentro de la ventana no hay línea base fiable (-1):
    // quien consume usa el nivel que había antes de este fotograma.
    const baselineFrom = Math.max(0, end - BLOCK_SIZE - BASELINE_WINDOW);
    const baselineTo = end - BLOCK_SIZE;
    blockBaseline.push(
      baselineTo - baselineFrom >= BLOCK_SIZE ? rms(window, baselineFrom, baselineTo) : -1,
    );
  }
  return {
    endAt,
    afterGap,
    windowMs: (window.length / sampleRate) * 1000,
    blockMs: (BLOCK_SIZE / sampleRate) * 1000,
    blockRms,
    blockBaseline,
    rms: rms(window, start, window.length),
    peak,
    pitch: detectPitch(window, sampleRate),
  };
}
