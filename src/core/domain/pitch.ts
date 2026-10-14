import type { Midi } from './note';

/** Afinación de referencia: La4 = 440 Hz. */
export const REFERENCE_A4_HZ = 440;

/** Frecuencia en Hz de una nota MIDI (69 = La4). */
export function midiToFrequency(note: Midi, referenceHz = REFERENCE_A4_HZ): number {
  return referenceHz * 2 ** ((note - 69) / 12);
}

/** Número de nota MIDI con decimales (69 = La4). */
export function frequencyToMidiFloat(frequency: number, referenceHz = REFERENCE_A4_HZ): number {
  return 69 + 12 * Math.log2(frequency / referenceHz);
}

export interface NearestNote {
  readonly midi: Midi;
  /** Desviación en cents respecto a la nota (de −50 a +50). Positiva = más agudo. */
  readonly cents: number;
}

/**
 * Nota más cercana a una frecuencia. `offsetCents` es la afinación estimada del teclado:
 * se resta antes de redondear para recentrar un instrumento afinado más arriba o más abajo.
 */
export function nearestNote(
  frequency: number,
  offsetCents = 0,
  referenceHz = REFERENCE_A4_HZ,
): NearestNote {
  const exact = frequencyToMidiFloat(frequency, referenceHz) - offsetCents / 100;
  const midi = Math.round(exact);
  return { midi, cents: (exact - midi) * 100 };
}

export interface PitchEstimate {
  readonly frequency: number;
  /** Claridad de la periodicidad (0–1): valor del pico de la NSDF. */
  readonly clarity: number;
  /**
   * Energía en la frecuencia fundamental respecto al armónico más fuerte entre f0, 2·f0 y 3·f0
   * (0–1). Un valor casi 0 indica una «fundamental virtual» (p. ej. dos teclas a la vez).
   */
  readonly fundamentalRatio: number;
}

export interface PitchOptions {
  readonly minHz?: number;
  readonly maxHz?: number;
  /** Fracción del pico máximo que debe alcanzar el primer pico elegido (McLeod: 0,88–0,93). */
  readonly peakThreshold?: number;
  /** Frecuencia de muestreo objetivo para el análisis grueso (Hz). */
  readonly coarseRate?: number;
}

const DEFAULTS = { minHz: 60, maxHz: 1400, peakThreshold: 0.9, coarseRate: 12000 };

/** Rango en el que la detección es fiable en un teclado portátil (Do3–Do6). */
export const RELIABLE_MIN_HZ = 130;
export const RELIABLE_MAX_HZ = 1050;

function removeDc(samples: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] as number;
  const mean = sum / samples.length;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = (samples[i] as number) - mean;
  return out;
}

/** Promedia bloques de `factor` muestras (submuestreo con filtro paso bajo sencillo). */
function decimate(samples: Float32Array, factor: number): Float32Array {
  if (factor <= 1) return samples;
  const length = Math.floor(samples.length / factor);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let j = 0; j < factor; j++) sum += samples[i * factor + j] as number;
    out[i] = sum / factor;
  }
  return out;
}

/** Función de diferencia cuadrática normalizada (McLeod) en un retardo `lag`. */
function nsdfAt(x: Float32Array, lag: number): number {
  const end = x.length - lag;
  if (end <= 0) return 0;
  let acf = 0;
  let energy = 0;
  for (let i = 0; i < end; i++) {
    const a = x[i] as number;
    const b = x[i + lag] as number;
    acf += a * b;
    energy += a * a + b * b;
  }
  return energy === 0 ? 0 : (2 * acf) / energy;
}

/** Interpolación parabólica del máximo entre tres puntos: devuelve el desplazamiento (−0,5…0,5). */
function parabolicOffset(left: number, center: number, right: number): number {
  const denominator = left - 2 * center + right;
  if (denominator === 0) return 0;
  return Math.max(-0.5, Math.min(0.5, (0.5 * (left - right)) / denominator));
}

/** Magnitud de Goertzel de `samples` (con ventana de Hann) en `frequency`. */
function goertzelMagnitude(samples: Float32Array, sampleRate: number, frequency: number): number {
  const n = samples.length;
  const omega = (2 * Math.PI * frequency) / sampleRate;
  const coefficient = 2 * Math.cos(omega);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    const s0 = (samples[i] as number) * window + coefficient * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coefficient * s1 * s2));
}

function fundamentalRatio(samples: Float32Array, sampleRate: number, f0: number): number {
  const nyquist = sampleRate / 2;
  const m1 = goertzelMagnitude(samples, sampleRate, f0);
  const m2 = 2 * f0 < nyquist ? goertzelMagnitude(samples, sampleRate, 2 * f0) : 0;
  const m3 = 3 * f0 < nyquist ? goertzelMagnitude(samples, sampleRate, 3 * f0) : 0;
  const strongest = Math.max(m1, m2, m3);
  return strongest === 0 ? 0 : m1 / strongest;
}

/**
 * Detecta la frecuencia fundamental de un fragmento de audio (método McLeod / NSDF).
 * Análisis grueso submuestreado + refinamiento a la frecuencia de muestreo original.
 * Devuelve `null` si no hay una periodicidad clara.
 */
export function detectPitch(
  samples: Float32Array,
  sampleRate: number,
  options: PitchOptions = {},
): PitchEstimate | null {
  const { minHz, maxHz, peakThreshold, coarseRate } = { ...DEFAULTS, ...options };
  if (samples.length < 256) return null;

  const clean = removeDc(samples);
  const factor = Math.max(1, Math.round(sampleRate / coarseRate));
  const coarse = decimate(clean, factor);
  const coarseSampleRate = sampleRate / factor;

  const lagMin = Math.max(2, Math.floor(coarseSampleRate / maxHz));
  const lagMax = Math.min(Math.ceil(coarseSampleRate / minHz), Math.floor(coarse.length / 2) - 1);
  if (lagMax <= lagMin + 2) return null;

  const nsdf = new Float32Array(lagMax + 2);
  for (let lag = lagMin - 1; lag <= lagMax + 1; lag++) nsdf[lag] = nsdfAt(coarse, lag);

  // Se salta el primer lóbulo positivo (cerca de lag 0) y se busca el máximo de cada lóbulo posterior.
  const peaks: { lag: number; value: number }[] = [];
  let lag = lagMin;
  while (lag <= lagMax && (nsdf[lag] as number) > 0) lag++;
  while (lag <= lagMax) {
    while (lag <= lagMax && (nsdf[lag] as number) <= 0) lag++;
    let best = -1;
    let bestValue = 0;
    while (lag <= lagMax && (nsdf[lag] as number) > 0) {
      if ((nsdf[lag] as number) > bestValue) {
        bestValue = nsdf[lag] as number;
        best = lag;
      }
      lag++;
    }
    if (best > 0) peaks.push({ lag: best, value: bestValue });
  }
  if (peaks.length === 0) return null;

  const highest = Math.max(...peaks.map((peak) => peak.value));
  const chosen = peaks.find((peak) => peak.value >= peakThreshold * highest);
  if (!chosen) return null;

  let refinedLag =
    chosen.lag +
    parabolicOffset(
      nsdf[chosen.lag - 1] as number,
      nsdf[chosen.lag] as number,
      nsdf[chosen.lag + 1] as number,
    );
  let clarity = chosen.value;

  if (factor > 1) {
    // Refinamiento a la frecuencia original alrededor del retardo grueso (±factor muestras).
    const center = Math.round(refinedLag * factor);
    const from = Math.max(2, center - factor);
    const to = center + factor;
    const values: number[] = [];
    for (let l = from - 1; l <= to + 1; l++) values.push(nsdfAt(clean, l));
    let bestIndex = 1;
    for (let i = 1; i < values.length - 1; i++) {
      if ((values[i] as number) > (values[bestIndex] as number)) bestIndex = i;
    }
    const offset = parabolicOffset(
      values[bestIndex - 1] as number,
      values[bestIndex] as number,
      values[bestIndex + 1] as number,
    );
    refinedLag = from - 1 + bestIndex + offset;
    clarity = Math.max(clarity, values[bestIndex] as number);
  }

  const frequency = sampleRate / refinedLag;
  if (!Number.isFinite(frequency) || frequency < minHz || frequency > maxHz) return null;
  return {
    frequency,
    clarity: Math.min(1, clarity),
    fundamentalRatio: fundamentalRatio(clean, sampleRate, frequency),
  };
}
