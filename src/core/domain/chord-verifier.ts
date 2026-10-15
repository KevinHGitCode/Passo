import type { Midi } from './note';
import { goertzelMagnitude, midiToFrequency } from './pitch';

/**
 * Verificación **dirigida** de un acorde por micrófono: no se pregunta «¿qué notas suenan?» (difícil con
 * varias voces) sino «¿suenan estas?». Para cada nota esperada se mide la energía en su frecuencia (con
 * ±30 cents de tolerancia) y se exige que sea clara frente al ruido, que sobresalga de su entorno
 * (un pico, no ruido de banda ancha), que haya subido respecto al instante anterior al ataque y que no
 * sea simplemente el 2.º armónico de la nota una octava más grave.
 */

export interface ChordVerifierConfig {
  /** La energía debe superar este múltiplo del ruido (amplitud de un tono frente al ruido de la sala). */
  readonly minSnr: number;
  /** Debe ser al menos este múltiplo de la mediana de las semitonos vecinos (±2 y ±3). */
  readonly minPeak: number;
  /** Si ya sonaba algo en esa frecuencia antes del ataque, la energía debe subir por lo menos esto. */
  readonly minRise: number;
  /** La energía una octava por debajo no puede superar esta fracción de la de la nota (sería su 2.º armónico). */
  readonly maxSubharmonic: number;
  /** Una nota de más debe tener al menos esta fracción de la energía de la más débil de las esperadas. */
  readonly extraRelative: number;
  /** …y esta relación con el ruido. */
  readonly extraMinSnr: number;
  /** Tolerancia en cents para considerar que un parcial coincide con una nota. */
  readonly harmonicToleranceCents: number;
  /** Por debajo de esta frecuencia (Hz) el altavoz de un teclado portátil apenas da fundamental: solo se mide presencia
   *  (de la fundamental o, si falta, del 2.º y 3.er parcial). No distingue la octava: límite conocido. */
  readonly lenientBelowHz: number;
}

export const DEFAULT_CHORD_CONFIG: ChordVerifierConfig = {
  minSnr: 10,
  minPeak: 3,
  minRise: 1.8,
  maxSubharmonic: 0.6,
  extraRelative: 0.5,
  extraMinSnr: 12,
  harmonicToleranceCents: 45,
  lenientBelowHz: 190,
};

export interface VerifyInput {
  /** Muestras tras el ataque (la ventana de análisis). */
  readonly post: Float32Array;
  /** Muestras justo antes del ataque, de la misma longitud; `null` si no se tienen. */
  readonly pre: Float32Array | null;
  readonly sampleRate: number;
  readonly expected: readonly Midi[];
  /** Afinación estimada del teclado (cents; 0 si no se sabe). */
  readonly tuningCents?: number;
  /** RMS del ruido de la sala (de la calibración); 0 si no se sabe. */
  readonly noiseRms?: number;
}

export interface NoteEvidence {
  readonly midi: Midi;
  readonly present: boolean;
  /** Amplitud estimada del tono (en las unidades de la señal). */
  readonly amplitude: number;
  readonly snr: number;
  readonly peak: number;
  readonly rise: number;
}

export interface ChordVerdict {
  readonly notes: readonly NoteEvidence[];
  /** Notas que suenan y no estaban esperadas (solo se miran las que no son armónicos de las esperadas). */
  readonly extras: readonly Midi[];
}

/** Amplitud estimada del tono con la ventana de Hann: 4·|X| / N. */
function amplitudeOf(
  samples: Float32Array,
  sampleRate: number,
  frequency: number,
  cents: number,
): number {
  let best = 0;
  for (const offset of [-30, 0, 30]) {
    const magnitude = goertzelMagnitude(
      samples,
      sampleRate,
      frequency * 2 ** ((cents + offset) / 1200),
    );
    if (magnitude > best) best = magnitude;
  }
  return (4 * best) / samples.length;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

/** ¿`frequency` coincide (con tolerancia) con un armónico 2.º–6.º de alguna nota esperada? */
function isHarmonicOf(
  frequency: number,
  expected: readonly Midi[],
  toleranceCents: number,
  tuningCents: number,
): boolean {
  for (const note of expected) {
    const base = midiToFrequency(note) * 2 ** (tuningCents / 1200);
    for (let harmonic = 2; harmonic <= 6; harmonic++) {
      const cents = Math.abs(1200 * Math.log2(frequency / (harmonic * base)));
      if (cents <= toleranceCents) return true;
    }
  }
  return false;
}

export function verifyChord(
  input: VerifyInput,
  config: ChordVerifierConfig = DEFAULT_CHORD_CONFIG,
): ChordVerdict {
  const { post, pre, sampleRate, expected } = input;
  const tuning = input.tuningCents ?? 0;
  const noiseAmp = Math.max((input.noiseRms ?? 0) * Math.sqrt(6 / post.length), 1e-7);
  const lowest = Math.min(...expected);
  const highest = Math.max(...expected);
  const nyquist = sampleRate / 2;

  // Energía de cada semitono del rango (más octava por debajo y margen), antes y después del ataque.
  const from = Math.max(0, lowest - 12 - 1);
  const to = Math.min(127, highest + 12);
  const after = new Map<Midi, number>();
  const before = new Map<Midi, number>();
  for (let midi = from; midi <= to; midi++) {
    const frequency = midiToFrequency(midi);
    if (frequency >= nyquist * 0.9) continue;
    after.set(midi, amplitudeOf(post, sampleRate, frequency, tuning));
    if (pre) before.set(midi, amplitudeOf(pre, sampleRate, frequency, tuning));
  }
  const level = (midi: Midi): number => after.get(midi) ?? 0;

  const peakness = (midi: Midi, ignore: readonly Midi[]): number => {
    const around = [-3, -2, 2, 3]
      .map((delta) => midi + delta)
      .filter((neighbour) => !ignore.includes(neighbour) && after.has(neighbour))
      .map(level);
    const reference = Math.max(median(around), noiseAmp);
    return level(midi) / reference;
  };

  const riseOf = (midi: Midi): number => {
    const previous = before.get(midi);
    if (previous === undefined || previous <= 2 * noiseAmp) return Number.POSITIVE_INFINITY;
    return level(midi) / previous;
  };

  /** Ruido de la banda alrededor de `frequency`: la mediana de lo que sonaba antes del ataque a ±2 y ±3 semitonos. */
  const bandNoise = (frequency: number): number => {
    if (!pre) return noiseAmp;
    const around = [-3, -2, 2, 3].map((delta) =>
      amplitudeOf(pre, sampleRate, frequency * 2 ** (delta / 12), tuning),
    );
    return Math.max(noiseAmp, median(around));
  };

  const notes: NoteEvidence[] = expected.map((midi) => {
    const amplitude = level(midi);
    const snr = amplitude / noiseAmp;
    const peak = peakness(midi, expected);
    const rise = riseOf(midi);
    const fundamental = midiToFrequency(midi);
    const lenient = fundamental < config.lenientBelowHz;
    // Graves: el altavoz de un teclado portátil apenas da la fundamental, pero sí el 2.º y 3.er parcial.
    // El ruido de la sala (ventilador, zumbido) se concentra en graves: se compara con el ruido que ya
    // había en esa banda antes del ataque, no con el ruido blanco equivalente.
    const heard = (harmonic: number): number => {
      const frequency = fundamental * harmonic;
      return frequency < nyquist * 0.9
        ? amplitudeOf(post, sampleRate, frequency, tuning) / bandNoise(frequency)
        : 0;
    };
    const present = lenient
      ? rise >= config.minRise &&
        (heard(1) >= config.minSnr ||
          (heard(2) >= config.minSnr && heard(3) >= 0.7 * config.minSnr))
      : snr >= config.minSnr &&
        peak >= config.minPeak &&
        rise >= config.minRise &&
        level(midi - 12) <= config.maxSubharmonic * amplitude;
    return { midi, present, amplitude, snr, peak, rise };
  });

  // Notas de más: picos claros que no son un armónico de las esperadas ni están pegados a una de ellas.
  const presentAmplitudes = notes.filter((note) => note.present).map((note) => note.amplitude);
  const weakest =
    presentAmplitudes.length > 0 ? Math.min(...presentAmplitudes) : Number.POSITIVE_INFINITY;
  const extras: Midi[] = [];
  for (let midi = Math.max(from, lowest - 5); midi <= to; midi++) {
    if (expected.some((note) => Math.abs(note - midi) <= 1)) continue;
    const frequency = midiToFrequency(midi);
    if (frequency >= nyquist * 0.9 || frequency < config.lenientBelowHz) continue;
    if (isHarmonicOf(frequency, expected, config.harmonicToleranceCents, tuning)) continue;
    const amplitude = level(midi);
    if (amplitude / noiseAmp < config.extraMinSnr) continue;
    if (amplitude < config.extraRelative * weakest) continue;
    if (peakness(midi, [...expected, midi - 1, midi + 1]) < config.minPeak) continue;
    if (riseOf(midi) < config.minRise) continue;
    extras.push(midi);
  }
  return { notes, extras };
}

/** `true` si todas las notas esperadas están presentes. */
export function chordComplete(verdict: ChordVerdict): boolean {
  return verdict.notes.every((note) => note.present);
}
