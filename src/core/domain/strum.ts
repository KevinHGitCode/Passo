/**
 * Un rasgueo: hacia dónde va. Hacia abajo la púa llega primero a las cuerdas graves y acaba en las agudas;
 * hacia arriba, al revés. Se separan los graves (< ~260 Hz) de los agudos (> ~500 Hz) y se mira **cuándo
 * llega la energía de cada banda** durante los ~70 ms del golpe: si los agudos llegan más tarde que los
 * graves, va hacia abajo; si llegan antes, hacia arriba.
 *
 * Es una medida delicada (el golpe dura 30–80 ms): con la guitarra sintética separa bien, con una real y un
 * micrófono de portátil hay que confirmarlo.
 */

export type StrumDirection = 'abajo' | 'arriba';

export interface StrumVerdict {
  /** `null` si no se distingue (golpe muy flojo o muy corto). */
  readonly direction: StrumDirection | null;
  /** Qué tan clara es la diferencia (0–1). */
  readonly confidence: number;
  /** Lo que más tarde llegan los agudos que los graves, en ms (negativo: llegan antes → hacia arriba). */
  readonly lagMs: number;
}

/** Cuánto dura el golpe que se mira, en ms. */
const SPAN_MS = 70;
/**
 * La frontera entre «abajo» y «arriba»: en la guitarra sintética los golpes hacia arriba dan de −7 a −14 ms y
 * los de abajo de −4 a +8; los agudos nunca llegan del todo a la vez (la púa suena en toda la banda).
 */
const BOUNDARY_MS = -5.2;
/** Dentro de esta franja alrededor de la frontera no se decide. */
const UNSURE_MS = 0.6;

/** Un filtro de dos polos (Butterworth) de paso bajo o alto. */
function biquad(
  kind: 'lp' | 'hp',
  cutoff: number,
  sampleRate: number,
  input: Float32Array,
): Float32Array {
  const w0 = (2 * Math.PI * cutoff) / sampleRate;
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
  const cos = Math.cos(w0);
  // Paso bajo: b = [(1−cos)/2, 1−cos, (1−cos)/2]; paso alto: b = [(1+cos)/2, −(1+cos), (1+cos)/2].
  const b0 = (kind === 'lp' ? 1 - cos : 1 + cos) / 2;
  const c1 = kind === 'lp' ? 1 - cos : -(1 + cos);
  const b2 = b0;
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  const out = new Float32Array(input.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i] as number;
    const y = (b0 / a0) * x + (c1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
  return out;
}

/**
 * El instante medio (ms desde `onset`) en que llega la energía **nueva** de `signal`: a cada trozo de 64
 * muestras se le resta lo que sonaba justo antes del ataque (la cuerda anterior que aún suena no cuenta).
 */
function energyCentroidMs(
  signal: Float32Array,
  onset: number,
  to: number,
  sampleRate: number,
): number {
  const step = 64;
  const lead = Math.min(onset, Math.round(0.012 * sampleRate));
  let before = 0;
  let count = 0;
  for (let i = onset - lead; i + step <= onset; i += step) {
    let sum = 0;
    for (let k = i; k < i + step; k++) sum += (signal[k] as number) ** 2;
    before += sum;
    count++;
  }
  const floor = count === 0 ? 0 : before / count;
  let total = 0;
  let weighted = 0;
  for (let i = onset; i + step <= to; i += step) {
    let sum = 0;
    for (let k = i; k < i + step; k++) sum += (signal[k] as number) ** 2;
    const excess = Math.max(0, sum - floor);
    total += excess;
    weighted += excess * (i - onset + step / 2);
  }
  return total === 0 ? 0 : (weighted / total / sampleRate) * 1000;
}

/**
 * Hacia dónde va un rasgueo. `samples` empieza un poco antes del ataque y `onset` es el índice donde
 * empieza; hacen falta al menos 70 ms detrás.
 */
export function strumDirection(
  samples: Float32Array,
  sampleRate: number,
  onset: number,
): StrumVerdict {
  const span = Math.round((SPAN_MS / 1000) * sampleRate);
  const to = Math.min(samples.length, onset + span);
  if (to - onset < 0.6 * span) return { direction: null, confidence: 0, lagMs: 0 };
  const low = biquad('lp', 260, sampleRate, biquad('lp', 260, sampleRate, samples));
  const high = biquad('hp', 500, sampleRate, biquad('hp', 500, sampleRate, samples));
  let energy = 0;
  for (let i = onset; i < to; i++) energy += (samples[i] as number) ** 2;
  if (energy < 1e-9) return { direction: null, confidence: 0, lagMs: 0 };
  const lagMs =
    energyCentroidMs(high, onset, to, sampleRate) - energyCentroidMs(low, onset, to, sampleRate);
  const distance = lagMs - BOUNDARY_MS;
  const confidence = Math.min(1, Math.abs(distance) / 8);
  if (Math.abs(distance) < UNSURE_MS) return { direction: null, confidence, lagMs };
  return { direction: distance > 0 ? 'abajo' : 'arriba', confidence, lagMs };
}
