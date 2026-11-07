import { BLOCK_SIZE } from '../domain/frame-analysis';
import { detectNotes } from '../domain/multi-pitch';
import type { HeardNote } from '../domain/multi-pitch';
import { detectPitch } from '../domain/pitch';
import { strumDirection } from '../domain/strum';
import type { StrumDirection } from '../domain/strum';
import type { AudioFrame, FrameSource } from '../ports/audio-frames';
import type { Unsubscribe } from '../ports/note-input';

/**
 * Oye rasgueos y notas sueltas del micrófono. Cada **ataque** (la energía sube de golpe) se analiza un momento
 * después, cuando ya suena entero: hacia dónde fue el golpe (a los ~75 ms), y según el modo, qué notas suenan
 * a la vez (un acorde) o qué nota y cuántos cents (una cuerda sola).
 */

export type StrumEvent =
  | {
      readonly kind: 'golpe';
      readonly at: number;
      readonly direction: StrumDirection | null;
      readonly confidence: number;
      readonly lagMs: number;
    }
  | {
      readonly kind: 'acorde';
      /** El instante del ataque al que corresponde. */
      readonly at: number;
      readonly notes: readonly HeardNote[];
      /** No hubo otro ataque mientras se medía (si lo hubo, el espectro mezcla dos golpes). */
      readonly clean: boolean;
    }
  | {
      readonly kind: 'nota';
      readonly at: number;
      readonly midi: number;
      readonly cents: number;
      readonly frequency: number;
    };

/** Qué se mide además de la dirección de cada golpe. */
export type ListenMode = 'acorde' | 'nota' | 'golpes';

const RING = 16384;
/** Cuánto debe subir la energía (suavizada) respecto a hace ~43 ms: una cuerda que se apaga no sube. */
const ATTACK_RATIO = 1.5;
/** Se compara con la energía de hace tantos bloques (~43 ms). */
const RISE_BLOCKS = 8;
/** Cuántos bloques hacia atrás (~130 ms) se mira lo más fuerte que sonó. */
const HISTORY_BLOCKS = 25;
const MIN_GATE = 0.004;
const GATE_FACTOR = 4;
const REFRACTORY_MS = 130;
/** Cuánto antes del ataque empieza el fragmento de dirección y cuánto después acaba (ms). */
const LEAD_MS = 20;
const DIRECTION_AFTER_MS = 80;
/** Cuándo se mide el acorde (la ventana de 8192 muestras acaba aquí) y la nota sola. */
const CHORD_AFTER_MS = 215;
const NOTE_AFTER_MS = 140;
const CHORD_WINDOW = 8192;
const NOTE_WINDOW = 4096;

interface Pending {
  readonly sample: number;
  readonly at: number;
  directionDone: boolean;
}

export class StrumListener {
  private readonly frames: FrameSource;
  private readonly handlers = new Set<(event: StrumEvent) => void>();
  private unsubscribe: Unsubscribe | null = null;
  private mode: ListenMode = 'golpes';
  private ring = new Float32Array(RING);
  private total = 0;
  private sampleRate = 48000;
  private lastOnsetSample = -Infinity;
  private pending: Pending[] = [];
  private onsets: number[] = [];
  /** La energía de los últimos bloques, y el número del primero. */
  private history: number[] = [];
  private historyBase = 0;
  private blocksSeen = 0;

  constructor(deps: { readonly frames: FrameSource }) {
    this.frames = deps.frames;
  }

  subscribe(handler: (event: StrumEvent) => void): Unsubscribe {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** Empieza a oír (con el modo dado); si ya oía, solo cambia el modo. */
  start(mode: ListenMode): void {
    this.mode = mode;
    if (this.unsubscribe) return;
    this.reset();
    this.unsubscribe = this.frames.subscribeFrames((frame) => this.onFrame(frame));
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.reset();
  }

  private reset(): void {
    this.ring = new Float32Array(RING);
    this.total = 0;
    this.lastOnsetSample = -Infinity;
    this.pending = [];
    this.onsets = [];
    this.history = [];
    this.historyBase = 0;
    this.blocksSeen = 0;
  }

  private emit(event: StrumEvent): void {
    for (const handler of this.handlers) handler(event);
  }

  private onFrame(frame: AudioFrame): void {
    if (!frame.listening) return;
    this.sampleRate = frame.sampleRate;
    const fresh = Math.min(frame.newSamples, frame.samples.length);
    this.append(frame.samples.subarray(frame.samples.length - fresh));
    const gate = Math.max(MIN_GATE, GATE_FACTOR * frame.noiseRms);
    this.detectAttacks(frame, gate);
    this.advance(frame.at);
  }

  private append(samples: Float32Array): void {
    for (let i = 0; i < samples.length; i++) {
      this.ring[(this.total + i) % RING] = samples[i] as number;
    }
    this.total += samples.length;
  }

  /** Las muestras `[from, to)` (índices globales) copiadas en orden. */
  private slice(from: number, to: number): Float32Array {
    const out = new Float32Array(Math.max(0, to - from));
    for (let i = 0; i < out.length; i++) {
      const index = from + i;
      out[i] = index < 0 || index >= this.total ? 0 : (this.ring[index % RING] as number);
    }
    return out;
  }

  private timeOf(sample: number, now: number): number {
    return now - ((this.total - sample) / this.sampleRate) * 1000;
  }

  /**
   * Un ataque es un momento en que la energía (suavizada) sube a 1,5 veces la de hace ~43 ms: así un rasgueo
   * seguido se distingue de la cuerda anterior que se apaga, y las oscilaciones de un acorde sostenido no
   * cuentan. El ataque empieza donde empezó a subir la energía (el pie de la subida).
   */
  private detectAttacks(frame: AudioFrame, gate: number): void {
    const blocksNow = Math.floor(this.total / BLOCK_SIZE);
    const refractory = (REFRACTORY_MS / 1000) * frame.sampleRate;
    for (let n = this.blocksSeen; n < blocksNow; n++) {
      const from = n * BLOCK_SIZE;
      let sum = 0;
      for (let i = from; i < from + BLOCK_SIZE; i++) {
        const value = this.ring[i % RING] as number;
        sum += value * value;
      }
      const rms = Math.sqrt(sum / BLOCK_SIZE);
      this.history.push(rms);
      if (this.history.length > HISTORY_BLOCKS * 2) {
        this.history.splice(0, this.history.length - HISTORY_BLOCKS * 2);
        this.historyBase = n + 1 - this.history.length;
      }
      const at = (index: number): number => this.history[index - this.historyBase] ?? 0;
      /** La energía suavizada (4 bloques, ~20 ms): las cuerdas «baten» y un bloque suelto engaña. */
      const smooth = (index: number): number =>
        (at(index) + at(index - 1) + at(index - 2) + at(index - 3)) / 4;
      if (n - RISE_BLOCKS - 3 < this.historyBase) continue;
      const now = smooth(n);
      if (now < gate || now < ATTACK_RATIO * Math.max(smooth(n - RISE_BLOCKS), 0.9 * gate))
        continue;
      // El pie de la subida: hacia atrás mientras la energía vaya creciendo.
      let foot = n;
      while (foot - 1 >= this.historyBase && at(foot - 1) < at(foot) && n - foot < 10) foot--;
      const start = foot * BLOCK_SIZE;
      if (start - this.lastOnsetSample < refractory) continue;
      this.lastOnsetSample = start;
      this.onsets.push(start);
      this.pending.push({ sample: start, at: this.timeOf(start, frame.at), directionDone: false });
    }
    this.blocksSeen = blocksNow;
  }

  /** Mide lo que ya tiene sonido suficiente detrás de su ataque. */
  private advance(now: number): void {
    const rate = this.sampleRate;
    const remaining: Pending[] = [];
    for (const item of this.pending) {
      const age = this.total - item.sample;
      if (!item.directionDone && age >= (DIRECTION_AFTER_MS / 1000) * rate) {
        item.directionDone = true;
        const lead = Math.round((LEAD_MS / 1000) * rate);
        const segment = this.slice(item.sample - lead, item.sample + Math.round(0.09 * rate));
        const verdict = strumDirection(segment, rate, lead);
        this.emit({
          kind: 'golpe',
          at: item.at,
          direction: verdict.direction,
          confidence: verdict.confidence,
          lagMs: verdict.lagMs,
        });
      }
      const wait = this.mode === 'acorde' ? CHORD_AFTER_MS : NOTE_AFTER_MS;
      if (this.mode !== 'golpes' && age >= (wait / 1000) * rate) {
        this.measure(item, now);
        continue;
      }
      if (this.mode === 'golpes' && item.directionDone) continue;
      remaining.push(item);
    }
    this.pending = remaining;
    // Los ataques viejos ya no sirven para saber si un golpe estuvo «limpio».
    this.onsets = this.onsets.filter((sample) => this.total - sample < rate);
  }

  private measure(item: Pending, now: number): void {
    const rate = this.sampleRate;
    if (this.mode === 'acorde') {
      const end = item.sample + Math.round((CHORD_AFTER_MS / 1000) * rate);
      const window = this.slice(end - CHORD_WINDOW, end);
      const clean = !this.onsets.some((sample) => sample > item.sample && sample < end);
      this.emit({ kind: 'acorde', at: item.at, notes: detectNotes(window, rate), clean });
      return;
    }
    const end = item.sample + Math.round((NOTE_AFTER_MS / 1000) * rate);
    const window = this.slice(end - NOTE_WINDOW, end);
    const estimate = detectPitch(window, rate, { minHz: 70, maxHz: 700 });
    if (estimate === null || estimate.clarity < 0.6) return;
    const exact = 69 + 12 * Math.log2(estimate.frequency / 440);
    const midi = Math.round(exact);
    void now;
    this.emit({
      kind: 'nota',
      at: item.at,
      midi,
      cents: (exact - midi) * 100,
      frequency: estimate.frequency,
    });
  }
}
