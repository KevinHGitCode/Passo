import type { Midi } from '@/core/domain/note';
import type { AudioControl, AudioStatus } from '@/core/ports/audio-control';
import type { AudioOutput } from '@/core/ports/audio-output';
import type { Unsubscribe } from '@/core/ports/note-input';

/** Lo mínimo que usamos de Web Audio (facilita las pruebas con un falso). */
export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
  cancelScheduledValues(time: number): unknown;
}
export interface AudioNodeLike {
  connect(destination: unknown): unknown;
  disconnect(): void;
}
export interface OscillatorLike extends AudioNodeLike {
  type: string;
  readonly frequency: AudioParamLike;
  start(when?: number): void;
  stop(when?: number): void;
  onended: (() => void) | null;
}
export interface GainLike extends AudioNodeLike {
  readonly gain: AudioParamLike;
}
export interface AudioContextLike {
  readonly state: string;
  readonly currentTime: number;
  readonly destination: unknown;
  /** Latencia de salida estimada (segundos), si el navegador la informa. */
  readonly baseLatency?: number;
  readonly outputLatency?: number;
  resume(): Promise<void>;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
  addEventListener(type: 'statechange', listener: () => void): void;
}

export type CreateAudioContext = () => AudioContextLike | undefined;

/** Frecuencia en Hz de una nota MIDI (69 = La4 = 440 Hz). */
export function midiToFrequency(note: Midi): number {
  return 440 * 2 ** ((note - 69) / 12);
}

const MASTER_GAIN = 0.35;
const ATTACK_S = 0.006;
const RELEASE_S = 0.18;
const DECAY_S = 2.2;
const MAX_VOICES = 10;

interface Voice {
  readonly oscillators: readonly OscillatorLike[];
  readonly gain: GainLike;
}

/** Sonido de piano sencillo con osciladores (sin muestras). Seguro de llamar aunque el audio esté bloqueado. */
export class WebAudioOutput implements AudioOutput, AudioControl {
  private readonly createContext: CreateAudioContext;
  private readonly listeners = new Set<(status: AudioStatus) => void>();
  private readonly voices = new Map<Midi, Voice>();
  private context: AudioContextLike | undefined;
  private master: GainLike | undefined;
  private status: AudioStatus = 'bloqueado';

  constructor(createContext: CreateAudioContext) {
    this.createContext = createContext;
  }

  getStatus(): AudioStatus {
    return this.status;
  }

  subscribeStatus(handler: (status: AudioStatus) => void): Unsubscribe {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  async unlock(): Promise<void> {
    const context = this.ensureContext();
    if (!context) return;
    try {
      await context.resume();
    } catch {
      // Si el navegador lo rechaza seguimos "bloqueado"; se reintentará con el siguiente gesto.
    }
    this.syncStatus();
  }

  /** Latencia de salida estimada en milisegundos (para el panel de depuración). */
  estimatedLatencyMs(): number | null {
    const context = this.context;
    if (!context) return null;
    if (context.baseLatency === undefined && context.outputLatency === undefined) return null;
    return ((context.baseLatency ?? 0) + (context.outputLatency ?? 0)) * 1000;
  }

  noteOn(note: Midi, velocity: number): void {
    const context = this.ensureContext();
    if (!context || !this.master) return;
    if (context.state !== 'running')
      void context.resume().then(
        () => this.syncStatus(),
        () => undefined,
      );

    this.stopVoice(note, 0.02);
    this.limitVoices();
    const now = context.currentTime;
    const peak = 0.12 + (0.28 * Math.min(Math.max(velocity, 1), 127)) / 127;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + ATTACK_S);
    gain.gain.exponentialRampToValueAtTime(peak * 0.0008, now + DECAY_S);
    gain.connect(this.master);

    const frequency = midiToFrequency(note);
    const oscillators = [
      this.oscillator(context, 'triangle', frequency, gain),
      this.oscillator(context, 'sine', frequency * 2, gain),
    ];
    oscillators.forEach((oscillator) => oscillator.start(now));
    this.voices.set(note, { oscillators, gain });
  }

  noteOff(note: Midi): void {
    this.stopVoice(note, RELEASE_S);
  }

  private oscillator(
    context: AudioContextLike,
    type: string,
    frequency: number,
    destination: GainLike,
  ): OscillatorLike {
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    oscillator.connect(destination);
    return oscillator;
  }

  /** Con muchas teclas a la vez se corta la voz más antigua (evita saturar y acumular nodos). */
  private limitVoices(): void {
    while (this.voices.size >= MAX_VOICES) {
      const oldest = this.voices.keys().next();
      if (oldest.done) return;
      this.stopVoice(oldest.value, 0.05);
    }
  }

  private stopVoice(note: Midi, release: number): void {
    const voice = this.voices.get(note);
    const context = this.context;
    if (!voice || !context) return;
    this.voices.delete(note);
    const now = context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(Math.max(voice.gain.gain.value, 0.0001), now);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + release);
    voice.oscillators.forEach((oscillator) => {
      oscillator.stop(now + release + 0.02);
      oscillator.onended = () => {
        oscillator.disconnect();
        voice.gain.disconnect();
      };
    });
  }

  private ensureContext(): AudioContextLike | undefined {
    if (this.context) return this.context;
    try {
      const context = this.createContext();
      if (!context) {
        this.setStatus('sin-soporte');
        return undefined;
      }
      const master = context.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(context.destination);
      context.addEventListener('statechange', () => this.syncStatus());
      this.context = context;
      this.master = master;
      this.syncStatus();
      return context;
    } catch {
      // Cualquier fallo al crear el audio deja la app funcionando sin sonido.
      this.setStatus('sin-soporte');
      return undefined;
    }
  }

  private syncStatus(): void {
    if (!this.context) return;
    this.setStatus(this.context.state === 'running' ? 'listo' : 'bloqueado');
  }

  private setStatus(status: AudioStatus): void {
    if (status === this.status) return;
    this.status = status;
    this.listeners.forEach((listener) => listener(status));
  }
}
