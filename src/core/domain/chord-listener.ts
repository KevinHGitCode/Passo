import { DEFAULT_CHORD_CONFIG, verifyChord } from './chord-verifier';
import type { ChordVerifierConfig } from './chord-verifier';
import type { Midi } from './note';
import type { NoteConfidence, NoteEvent } from './note-event';

/** Tamaño del bloque con el que se busca el ataque (como en `frame-analysis`). */
const BLOCK = 256;
/** Cada bloque se compara con las 768 muestras que lo preceden. */
const BASELINE = 768;

export interface ChordListenerConfig {
  readonly verifier: ChordVerifierConfig;
  /** Cuánto se espera tras el ataque antes de medir (se salta el golpe del martillo), en ms. */
  readonly skipMs: number;
  /** Duración de la ventana de análisis, en ms (resolución para separar semitonos). */
  readonly windowMs: number;
  /** El bloque del ataque debe superar tantas veces la energía que había justo antes. */
  readonly attackRatio: number;
  /** …y el umbral absoluto: este múltiplo del ruido de la sala (con un mínimo). */
  readonly gateFactor: number;
  readonly minGate: number;
  /** Tiempo muerto tras medir un ataque, en ms (no se mide dos veces el mismo). */
  readonly cooldownMs: number;
  /** La línea base («antes del ataque») termina este tiempo antes de él, en ms. */
  readonly preGapMs: number;
}

export const DEFAULT_LISTENER_CONFIG: ChordListenerConfig = {
  verifier: DEFAULT_CHORD_CONFIG,
  skipMs: 40,
  windowMs: 170,
  attackRatio: 2.2,
  gateFactor: 4,
  minGate: 0.003,
  cooldownMs: 150,
  preGapMs: 20,
};

export interface ListenContext {
  /** RMS del ruido de la sala (de la calibración); 0 si no se sabe. */
  readonly noiseRms: number;
  /** Afinación estimada del teclado en cents (0 si no se sabe). */
  readonly tuningCents: number;
}

interface Pending {
  readonly onsetAbs: number;
  readonly readyAbs: number;
}

const CAPACITY_SECONDS = 1;

/**
 * Oye un acorde esperado: busca un ataque en el audio y, un instante después, comprueba con el
 * verificador qué notas esperadas suenan. Emite un `on` por nota esperada que suena (y por cada nota
 * de más clara, con confianza «media», para que cuente como dudosa y no como error). Antes de cada
 * medida suelta con `off` lo que sonó en la anterior: cada ataque se juzga por sí solo.
 */
export class ChordListener {
  private readonly config: ChordListenerConfig;
  private expected: readonly Midi[] | null = null;
  private ring = new Float32Array(0);
  private sampleRate = 0;
  /** Muestras recibidas en total (índice absoluto de la siguiente). */
  private written = 0;
  /** Siguiente bloque por examinar (índice absoluto de su primera muestra). */
  private nextBlock = 0;
  private cooldownUntil = 0;
  private pending: Pending | null = null;
  private sounding: readonly Midi[] = [];

  constructor(config: ChordListenerConfig = DEFAULT_LISTENER_CONFIG) {
    this.config = config;
  }

  isActive(): boolean {
    return this.expected !== null;
  }

  /** Qué notas se esperan ahora; `null` (o menos de dos notas) apaga la verificación. */
  setExpectation(notes: readonly Midi[] | null): void {
    const next = notes !== null && notes.length >= 2 ? [...notes].sort((a, b) => a - b) : null;
    const same =
      next !== null &&
      this.expected !== null &&
      next.length === this.expected.length &&
      next.every((note, i) => note === this.expected?.[i]);
    if (same) return;
    this.expected = next;
    // Un cambio de objetivo descarta la medida pendiente y no hereda notas de la anterior.
    this.pending = null;
    this.nextBlock = this.written;
    this.cooldownUntil = this.written;
  }

  /** Olvida el audio y lo pendiente (tras un hueco o al apagar). Devuelve el `off` de lo que sonaba. */
  reset(at: number): NoteEvent[] {
    this.ring = new Float32Array(0);
    this.written = 0;
    this.nextBlock = 0;
    this.cooldownUntil = 0;
    this.pending = null;
    return this.releaseAll(at);
  }

  /**
   * Procesa las muestras nuevas (solo las nuevas). \`endAt\` es el instante (ms, reloj de la app) de la
   * más reciente. Devuelve los eventos de nota para entregar.
   */
  push(
    samples: Float32Array,
    sampleRate: number,
    endAt: number,
    context: ListenContext,
  ): NoteEvent[] {
    if (sampleRate !== this.sampleRate) {
      this.sampleRate = sampleRate;
      this.ring = new Float32Array(Math.round(CAPACITY_SECONDS * sampleRate));
      this.written = 0;
      this.nextBlock = 0;
      this.cooldownUntil = 0;
      this.pending = null;
    }
    this.append(samples);
    if (this.expected === null) {
      this.nextBlock = this.written;
      return [];
    }
    if (!this.pending && this.written >= this.cooldownUntil) this.findAttack(context);
    if (this.pending && this.written >= this.pending.readyAbs) {
      const pending = this.pending;
      this.pending = null;
      return this.measure(pending, endAt, context);
    }
    return [];
  }

  private append(samples: Float32Array): void {
    const capacity = this.ring.length;
    if (capacity === 0) return;
    const source =
      samples.length > capacity ? samples.subarray(samples.length - capacity) : samples;
    const first = this.written + samples.length - source.length;
    for (let i = 0; i < source.length; i++) {
      this.ring[(first + i) % capacity] = source[i] as number;
    }
    this.written += samples.length;
  }

  /** Muestras absolutas [from, from + length) como un arreglo nuevo, o `null` si ya no están. */
  private slice(from: number, length: number): Float32Array | null {
    const capacity = this.ring.length;
    if (from < 0 || from + length > this.written || this.written - from > capacity) return null;
    const out = new Float32Array(length);
    for (let i = 0; i < length; i++) out[i] = this.ring[(from + i) % capacity] as number;
    return out;
  }

  private rms(from: number, length: number): number {
    const block = this.slice(from, length);
    if (!block) return 0;
    let sum = 0;
    for (const value of block) sum += value * value;
    return Math.sqrt(sum / length);
  }

  private findAttack(context: ListenContext): void {
    const gate = Math.max(this.config.minGate, this.config.gateFactor * context.noiseRms);
    const msToSamples = (ms: number) => Math.round((ms / 1000) * this.sampleRate);
    // Se examinan solo bloques completos que tengan detrás la línea base (que aún esté en la memoria).
    let block = Math.max(this.nextBlock, this.written - this.ring.length + BASELINE);
    while (block + BLOCK <= this.written) {
      const level = this.rms(block, BLOCK);
      const before = block >= BASELINE ? this.rms(block - BASELINE, BASELINE) : 0;
      if (level >= gate && (before === 0 || level >= this.config.attackRatio * before)) {
        this.pending = {
          onsetAbs: block,
          readyAbs: block + msToSamples(this.config.skipMs) + msToSamples(this.config.windowMs),
        };
        this.nextBlock = block + BLOCK;
        return;
      }
      block += BLOCK;
    }
    this.nextBlock = block;
  }

  private measure(pending: Pending, endAt: number, context: ListenContext): NoteEvent[] {
    const expected = this.expected;
    if (expected === null) return [];
    const msToSamples = (ms: number) => Math.round((ms / 1000) * this.sampleRate);
    const length = msToSamples(this.config.windowMs);
    const post = this.slice(pending.onsetAbs + msToSamples(this.config.skipMs), length);
    this.cooldownUntil = this.written + msToSamples(this.config.cooldownMs);
    this.nextBlock = this.cooldownUntil;
    if (!post) return [];
    const preEnd = pending.onsetAbs - msToSamples(this.config.preGapMs);
    const pre = this.slice(preEnd - length, length);

    const verdict = verifyChord(
      {
        post,
        pre,
        sampleRate: this.sampleRate,
        expected,
        tuningCents: context.tuningCents,
        noiseRms: context.noiseRms,
      },
      this.config.verifier,
    );
    const onsetAt = endAt - ((this.written - pending.onsetAbs) / this.sampleRate) * 1000;
    const events: NoteEvent[] = this.releaseAll(onsetAt);
    const heard: Midi[] = [];
    for (const note of verdict.notes) {
      if (!note.present) continue;
      const strong = note.snr >= 2 * this.config.verifier.minSnr;
      events.push(this.on(note.midi, onsetAt, strong ? 'alta' : 'media'));
      heard.push(note.midi);
    }
    for (const extra of verdict.extras) {
      events.push(this.on(extra, onsetAt, 'media'));
      heard.push(extra);
    }
    this.sounding = heard;
    return events;
  }

  private on(note: Midi, at: number, confidence: NoteConfidence): NoteEvent {
    return { type: 'on', note, velocity: 80, at, source: 'microfono', confidence };
  }

  private releaseAll(at: number): NoteEvent[] {
    const events: NoteEvent[] = this.sounding.map((note) => ({
      type: 'off',
      note,
      velocity: 0,
      at,
      source: 'microfono',
    }));
    this.sounding = [];
    return events;
  }
}
