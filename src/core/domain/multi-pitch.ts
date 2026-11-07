import type { Midi } from './note';

/**
 * Qué notas suenan a la vez (un acorde rasgueado): se calcula el espectro con una ventana larga (para que
 * las cuerdas graves, a pocos hercios unas de otras, se separen), se buscan sus **picos** y cada pico se
 * convierte en una nota con los cents que se desvía. Los armónicos de una cuerda caen casi siempre en notas
 * del mismo acorde (octavas y quintas), así que no estorban al reconocerlo. Heurística: con un micrófono de
 * portátil las cuerdas graves pueden llegar flojas.
 */

export interface SpectralPeak {
  readonly frequency: number;
  readonly amplitude: number;
}

export interface HeardNote {
  /** La nota más cercana (MIDI). */
  readonly midi: Midi;
  /** Cuánto se desvía de ella (−50 a +50). */
  readonly cents: number;
  /** Lo fuerte que suena frente al pico más fuerte (0–1). */
  readonly strength: number;
}

/** FFT en sitio de longitud potencia de 2. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j] as number, re[i] as number];
      [im[i], im[j]] = [im[j] as number, im[i] as number];
    }
  }
  for (let length = 2; length <= n; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let start = 0; start < n; start += length) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < length / 2; k++) {
        const a = start + k;
        const b = a + length / 2;
        const tRe = (re[b] as number) * curRe - (im[b] as number) * curIm;
        const tIm = (re[b] as number) * curIm + (im[b] as number) * curRe;
        re[b] = (re[a] as number) - tRe;
        im[b] = (im[a] as number) - tIm;
        re[a] = (re[a] as number) + tRe;
        im[a] = (im[a] as number) + tIm;
        const next = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = next;
      }
    }
  }
}

export interface PeakOptions {
  readonly minHz?: number;
  readonly maxHz?: number;
  /** Un pico debe tener al menos esta fracción del más fuerte. */
  readonly relativeFloor?: number;
  /** Amplitud mínima absoluta (ruido de la sala); 0 si no se sabe. */
  readonly absoluteFloor?: number;
}

/** Los picos del espectro de `samples` (ventana de Hann, relleno con ceros hasta 32 768 puntos). */
export function spectralPeaks(
  samples: Float32Array,
  sampleRate: number,
  options: PeakOptions = {},
): SpectralPeak[] {
  const { minHz = 70, maxHz = 1400, relativeFloor = 0.08, absoluteFloor = 0 } = options;
  const size = 32768;
  const length = Math.min(samples.length, size);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const offset = samples.length - length;
  for (let i = 0; i < length; i++) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (length - 1));
    re[i] = (samples[offset + i] as number) * hann;
  }
  fft(re, im);
  const binHz = sampleRate / size;
  const from = Math.max(2, Math.floor(minHz / binHz));
  const to = Math.min(size / 2 - 2, Math.ceil(maxHz / binHz));
  const magnitude = new Float64Array(to + 2);
  let strongest = 0;
  for (let bin = from - 1; bin <= to + 1; bin++) {
    magnitude[bin] = Math.hypot(re[bin] as number, im[bin] as number);
  }
  for (let bin = from; bin <= to; bin++) strongest = Math.max(strongest, magnitude[bin] as number);
  const floor = Math.max(relativeFloor * strongest, absoluteFloor);
  const peaks: SpectralPeak[] = [];
  for (let bin = from; bin <= to; bin++) {
    const value = magnitude[bin] as number;
    if (
      value < floor ||
      value < (magnitude[bin - 1] as number) ||
      value <= (magnitude[bin + 1] as number)
    ) {
      continue;
    }
    // Interpolación parabólica sobre el logaritmo: da la frecuencia con una fracción de bin.
    const a = Math.log((magnitude[bin - 1] as number) + 1e-12);
    const b = Math.log(value + 1e-12);
    const c = Math.log((magnitude[bin + 1] as number) + 1e-12);
    const denominator = a - 2 * b + c;
    const shift = denominator === 0 ? 0 : (0.5 * (a - c)) / denominator;
    peaks.push({ frequency: (bin + shift) * binHz, amplitude: value });
  }
  return peaks;
}

/** De un pico de frecuencia a la nota más cercana y su desviación en cents. */
export function noteOfFrequency(frequency: number): { midi: Midi; cents: number } {
  const exact = 69 + 12 * Math.log2(frequency / 440);
  const midi = Math.round(exact);
  return { midi, cents: (exact - midi) * 100 };
}

/**
 * Las notas de un fragmento con varias cuerdas: cada pico del espectro es una nota; dos picos en la misma
 * nota se juntan (queda el más fuerte).
 */
export function detectNotes(
  samples: Float32Array,
  sampleRate: number,
  options: PeakOptions = {},
): HeardNote[] {
  const peaks = spectralPeaks(samples, sampleRate, options);
  const strongest = Math.max(0, ...peaks.map((peak) => peak.amplitude));
  if (strongest === 0) return [];
  const byNote = new Map<number, HeardNote>();
  for (const peak of peaks) {
    const { midi, cents } = noteOfFrequency(peak.frequency);
    const strength = peak.amplitude / strongest;
    const existing = byNote.get(midi);
    if (!existing || existing.strength < strength) byNote.set(midi, { midi, cents, strength });
  }
  return [...byNote.values()].sort((a, b) => a.midi - b.midi);
}
