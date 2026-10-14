/**
 * Generador de señales sintéticas para probar la detección de notas.
 * Todas devuelven `Float32Array` en [-1, 1] a la frecuencia de muestreo indicada.
 */
import { midiToFrequency } from '@/core/domain/pitch';
import { createSeededRng } from '@/core/domain/rng';

export const SAMPLE_RATE = 48000;

export function samplesFor(ms: number, sampleRate = SAMPLE_RATE): number {
  return Math.round((ms / 1000) * sampleRate);
}

export function silence(ms: number, sampleRate = SAMPLE_RATE): Float32Array {
  return new Float32Array(samplesFor(ms, sampleRate));
}

export function concat(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Suma señales (la más corta se rellena con ceros). `offsetMs` retrasa cada una. */
export function mix(
  parts: readonly { signal: Float32Array; offsetMs?: number; gain?: number }[],
  sampleRate = SAMPLE_RATE,
): Float32Array {
  const ends = parts.map((part) => samplesFor(part.offsetMs ?? 0, sampleRate) + part.signal.length);
  const out = new Float32Array(Math.max(0, ...ends));
  for (const part of parts) {
    const start = samplesFor(part.offsetMs ?? 0, sampleRate);
    const gain = part.gain ?? 1;
    for (let i = 0; i < part.signal.length; i++) {
      out[start + i] = (out[start + i] as number) + (part.signal[i] as number) * gain;
    }
  }
  return out;
}

export function scale(signal: Float32Array, gain: number): Float32Array {
  return signal.map((value) => value * gain);
}

export function rmsOf(signal: Float32Array): number {
  let sum = 0;
  for (const value of signal) sum += value * value;
  return Math.sqrt(sum / Math.max(1, signal.length));
}

export function sine(
  frequency: number,
  ms: number,
  amplitude = 0.3,
  sampleRate = SAMPLE_RATE,
): Float32Array {
  const out = new Float32Array(samplesFor(ms, sampleRate));
  for (let i = 0; i < out.length; i++) {
    out[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }
  return out;
}

export interface PianoOptions {
  /** Duración total en ms (la nota se sostiene y decae sola). */
  readonly ms?: number;
  /** Amplitud de pico aproximada (0–1). */
  readonly amplitude?: number;
  /** Desafinación en cents. */
  readonly cents?: number;
  /** Coeficiente de inarmonicidad B (cuerda real ≈ 0,0002–0,0008). 0 = armónicos exactos. */
  readonly inharmonicity?: number;
  /** Número de parciales. */
  readonly partials?: number;
  /** Duración del ataque en ms (toque suave = más largo). */
  readonly attackMs?: number;
  /** Tiempo de caída de 60 dB de la fundamental, en segundos. */
  readonly t60?: number;
  /** Fuerza relativa de la fundamental (0–1): bajarla imita altavoces pequeños. */
  readonly fundamentalGain?: number;
  readonly sampleRate?: number;
  readonly seed?: number;
}

/** Nota tipo piano por síntesis aditiva: ataque corto, ráfaga de ruido de martillo y decaimiento. */
export function pianoNote(midi: number, options: PianoOptions = {}): Float32Array {
  const {
    ms = 900,
    amplitude = 0.3,
    cents = 0,
    inharmonicity = 0.0004,
    partials = 12,
    t60 = 4,
    attackMs = 5,
    fundamentalGain = 1,
    sampleRate = SAMPLE_RATE,
    seed = 1,
  } = options;
  const f0 = midiToFrequency(midi) * 2 ** (cents / 1200);
  const count = samplesFor(ms, sampleRate);
  const out = new Float32Array(count);
  const attack = samplesFor(attackMs, sampleRate);
  const nyquist = sampleRate / 2;
  for (let n = 1; n <= partials; n++) {
    const frequency = n * f0 * Math.sqrt(1 + inharmonicity * n * n);
    if (frequency >= nyquist * 0.9) break;
    const partialAmplitude = (n === 1 ? fundamentalGain : 1) / n;
    const decay = Math.log(1000) / (t60 / Math.max(1, n * 0.6)); // 60 dB = ×1000
    for (let i = 0; i < count; i++) {
      const t = i / sampleRate;
      const envelope = Math.min(1, i / attack) * Math.exp(-decay * t);
      out[i] =
        (out[i] as number) + partialAmplitude * envelope * Math.sin(2 * Math.PI * frequency * t);
    }
  }
  // Ráfaga de ruido del martillo (20 ms).
  const rng = createSeededRng(seed);
  const hammer = samplesFor(20, sampleRate);
  for (let i = 0; i < Math.min(hammer, count); i++) {
    out[i] = (out[i] as number) + (rng() * 2 - 1) * 0.15 * Math.exp((-i / hammer) * 5);
  }
  // Normaliza el pico a `amplitude`.
  let peak = 0;
  for (const value of out) peak = Math.max(peak, Math.abs(value));
  const gain = peak === 0 ? 0 : amplitude / peak;
  return out.map((value) => value * gain);
}

export type NoiseKind = 'blanco' | 'rosa' | 'ventilador';

/** Ruido de amplitud eficaz `level`. */
export function noise(
  kind: NoiseKind,
  ms: number,
  level: number,
  seed = 7,
  sampleRate = SAMPLE_RATE,
): Float32Array {
  const rng = createSeededRng(seed);
  const count = samplesFor(ms, sampleRate);
  const out = new Float32Array(count);
  if (kind === 'blanco') {
    for (let i = 0; i < count; i++) out[i] = rng() * 2 - 1;
  } else if (kind === 'rosa') {
    // Voss-McCartney con 8 filas.
    const rows = new Array<number>(8).fill(0).map(() => rng() * 2 - 1);
    for (let i = 0; i < count; i++) {
      for (let r = 0; r < rows.length; r++) {
        if ((i & ((1 << r) - 1)) === 0) rows[r] = rng() * 2 - 1;
      }
      out[i] = rows.reduce((total, value) => total + value, 0) / rows.length;
    }
  } else {
    // Ventilador: ruido paso bajo (< ~300 Hz) más un zumbido a 120 Hz.
    let state = 0;
    const alpha = 1 - Math.exp((-2 * Math.PI * 300) / sampleRate);
    for (let i = 0; i < count; i++) {
      state += alpha * (rng() * 2 - 1 - state);
      out[i] = state * 4 + 0.3 * Math.sin((2 * Math.PI * 120 * i) / sampleRate);
    }
  }
  const current = rmsOf(out);
  return current === 0 ? out : out.map((value) => (value * level) / current);
}

/** Mezcla `signal` con `noiseSignal` para una relación señal/ruido en dB (sobre el RMS de la señal). */
export function withSnr(
  signal: Float32Array,
  noiseSignal: Float32Array,
  snrDb: number,
): Float32Array {
  const target = rmsOf(signal) / 10 ** (snrDb / 20);
  const current = rmsOf(noiseSignal) || 1;
  const out = new Float32Array(signal.length);
  for (let i = 0; i < signal.length; i++) {
    out[i] =
      (signal[i] as number) + ((noiseSignal[i % noiseSignal.length] as number) * target) / current;
  }
  return out;
}

/** Voz sostenida o con glissando: armónicos 1/n con vibrato; sin ataque marcado. */
export function voice(
  startHz: number,
  ms: number,
  options: { endHz?: number; amplitude?: number; fadeInMs?: number; sampleRate?: number } = {},
): Float32Array {
  const { endHz = startHz, amplitude = 0.2, fadeInMs = 120, sampleRate = SAMPLE_RATE } = options;
  const count = samplesFor(ms, sampleRate);
  const out = new Float32Array(count);
  const fade = samplesFor(fadeInMs, sampleRate);
  let phase = 0;
  for (let i = 0; i < count; i++) {
    const t = i / sampleRate;
    const base = startHz + ((endHz - startHz) * i) / count;
    const frequency = base * (1 + 0.012 * Math.sin(2 * Math.PI * 5.5 * t));
    phase += (2 * Math.PI * frequency) / sampleRate;
    let sample = 0;
    for (let n = 1; n <= 8; n++) sample += Math.sin(n * phase) / n;
    out[i] = amplitude * Math.min(1, i / fade) * sample * 0.6;
  }
  return out;
}

/** Saturación suave (distorsión del altavoz o del micrófono). */
export function saturate(signal: Float32Array, drive: number): Float32Array {
  return signal.map((value) => Math.tanh(value * drive) / Math.tanh(drive));
}

/** Pasa-altos de segundo orden (el altavoz de un teclado portátil apenas emite los graves). */
export function highpass(
  signal: Float32Array,
  cutoffHz: number,
  sampleRate = SAMPLE_RATE,
): Float32Array {
  const omega = (2 * Math.PI * cutoffHz) / sampleRate;
  const alpha = Math.sin(omega) / (2 * Math.SQRT1_2);
  const cosw = Math.cos(omega);
  const b0 = (1 + cosw) / 2;
  const b1 = -(1 + cosw);
  const b2 = (1 + cosw) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cosw;
  const a2 = 1 - alpha;
  const out = new Float32Array(signal.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < signal.length; i++) {
    const x0 = signal[i] as number;
    const y0 = (b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return out;
}

/** Reverberación sencilla de Schroeder (4 combs + 2 pasa-todo). `t60` en segundos. */
export function reverb(signal: Float32Array, t60: number, sampleRate = SAMPLE_RATE): Float32Array {
  const combDelays = [0.0297, 0.0371, 0.0411, 0.0437].map((s) => Math.round(s * sampleRate));
  const tail = Math.round(t60 * sampleRate);
  const out = new Float32Array(signal.length + tail);
  const input = new Float32Array(out.length);
  input.set(signal);
  for (const delay of combDelays) {
    const feedback = 10 ** ((-3 * delay) / (t60 * sampleRate));
    const buffer = new Float32Array(out.length);
    for (let i = 0; i < out.length; i++) {
      const delayed = i >= delay ? (buffer[i - delay] as number) : 0;
      buffer[i] = (input[i] as number) + feedback * delayed;
      out[i] = (out[i] as number) + (buffer[i] as number) * 0.25;
    }
  }
  const mixed = new Float32Array(out.length);
  for (let i = 0; i < out.length; i++) {
    mixed[i] = 0.7 * (out[i] as number) + 0.3 * (input[i] as number);
  }
  return mixed;
}

/** Recorre una señal en fotogramas y entrega cada ventana al consumidor (como el micrófono real). */
export function streamFrames(
  signal: Float32Array,
  consumer: (window: Float32Array, newSamples: number, endAtMs: number) => void,
  options: { windowSize?: number; hop?: number; sampleRate?: number; startAtMs?: number } = {},
): void {
  const { windowSize = 2048, hop = 1024, sampleRate = SAMPLE_RATE, startAtMs = 0 } = options;
  for (let end = hop; end <= signal.length; end += hop) {
    const window = new Float32Array(windowSize);
    const from = end - windowSize;
    for (let i = 0; i < windowSize; i++) {
      window[i] = from + i >= 0 ? (signal[from + i] as number) : 0;
    }
    consumer(window, hop, startAtMs + (end / sampleRate) * 1000);
  }
}
