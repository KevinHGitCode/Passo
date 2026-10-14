import type {
  AnalyserLike,
  MediaDevicesLike,
  MicAudioContextLike,
  MicSourceLike,
  MicStreamLike,
  MicTrackLike,
  TimersLike,
  VisibilityLike,
} from '@/adapters/microphone/microphone-types';
import { FakeClock } from './fake-clock';

export class FakeTrack implements MicTrackLike {
  label = 'Micrófono de prueba';
  onended: (() => void) | null = null;
  stopped = false;
  settings: ReturnType<NonNullable<MicTrackLike['getSettings']>> = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };

  stop(): void {
    this.stopped = true;
  }

  getSettings() {
    return this.settings;
  }

  /** Simula que el sistema retira el micrófono. */
  end(): void {
    this.onended?.();
  }
}

export class FakeStream implements MicStreamLike {
  readonly track = new FakeTrack();
  getAudioTracks(): MicTrackLike[] {
    return [this.track];
  }
}

export class FakeMediaDevices implements MediaDevicesLike {
  readonly calls: unknown[] = [];
  readonly stream = new FakeStream();
  /** Errores que se lanzarán, uno por llamada, antes de devolver el flujo. */
  errors: { name: string }[] = [];
  /** Si se define, la respuesta no llega hasta llamar a `release()`. */
  private gate: (() => void) | null = null;
  holdResponse = false;

  async getUserMedia(constraints: unknown): Promise<MicStreamLike> {
    this.calls.push(constraints);
    const error = this.errors.shift();
    if (error) throw Object.assign(new Error(error.name), { name: error.name });
    if (this.holdResponse) {
      await new Promise<void>((resolve) => {
        this.gate = resolve;
      });
    }
    return this.stream;
  }

  release(): void {
    this.gate?.();
  }
}

export class FakeAnalyser implements AnalyserLike {
  fftSize = 2048;
  disconnected = false;
  reads = 0;
  signal: Float32Array = new Float32Array(0);
  constructor(private readonly context: FakeMicContext) {}

  getFloatTimeDomainData(buffer: Float32Array<ArrayBuffer>): void {
    this.reads += 1;
    const end = Math.round(this.context.currentTime * this.context.sampleRate);
    const start = end - buffer.length;
    for (let i = 0; i < buffer.length; i++) {
      const index = start + i;
      buffer[i] = index >= 0 && index < this.signal.length ? (this.signal[index] as number) : 0;
    }
  }

  disconnect(): void {
    this.disconnected = true;
  }
}

export class FakeMicContext implements MicAudioContextLike {
  sampleRate = 48000;
  currentTime = 0;
  state = 'suspended';
  closed = false;
  resumeCalls = 0;
  readonly analyser = new FakeAnalyser(this);
  sourceDisconnected = false;
  private readonly listeners = new Set<() => void>();

  resume(): Promise<void> {
    this.resumeCalls += 1;
    this.setState('running');
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closed = true;
    this.state = 'closed';
    return Promise.resolve();
  }

  createMediaStreamSource(): MicSourceLike {
    return {
      connect: () => undefined,
      disconnect: () => {
        this.sourceDisconnected = true;
      },
    };
  }

  createAnalyser: () => AnalyserLike = () => {
    return this.analyser;
  };

  addEventListener(_type: 'statechange', listener: () => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'statechange', listener: () => void): void {
    this.listeners.delete(listener);
  }

  listenerCount(): number {
    return this.listeners.size;
  }

  setState(state: string): void {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
}

export class FakeTimers implements TimersLike {
  private readonly callbacks = new Map<number, () => void>();
  private next = 1;

  setInterval(callback: () => void): number {
    const id = this.next++;
    this.callbacks.set(id, callback);
    return id;
  }

  clearInterval(id: number): void {
    this.callbacks.delete(id);
  }

  get active(): number {
    return this.callbacks.size;
  }

  tick(): void {
    [...this.callbacks.values()].forEach((callback) => callback());
  }
}

export class FakeVisibility implements VisibilityLike {
  hidden = false;
  private readonly listeners = new Set<() => void>();

  addEventListener(_type: 'visibilitychange', listener: () => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'visibilitychange', listener: () => void): void {
    this.listeners.delete(listener);
  }

  listenerCount(): number {
    return this.listeners.size;
  }

  set(hidden: boolean): void {
    this.hidden = hidden;
    this.listeners.forEach((listener) => listener());
  }
}

/** Reúne los falsos y avanza el reloj y el audio a la vez, como en un navegador real. */
export class MicHarness {
  readonly clock = new FakeClock(1000);
  readonly devices = new FakeMediaDevices();
  readonly timers = new FakeTimers();
  readonly visibility = new FakeVisibility();
  readonly contexts: FakeMicContext[] = [];

  createContext: () => FakeMicContext = () => {
    const context = new FakeMicContext();
    this.contexts.push(context);
    return context;
  };

  get context(): FakeMicContext {
    const context = this.contexts[this.contexts.length - 1];
    if (!context) throw new Error('Todavía no se creó el contexto de audio');
    return context;
  }

  /** Avanza `ms` de tiempo real en pasos de 10 ms, entregando el audio y disparando el temporizador. */
  advance(ms: number): void {
    for (let elapsed = 0; elapsed < ms; elapsed += 10) {
      this.clock.advance(10);
      this.context.currentTime += 0.01;
      this.timers.tick();
    }
  }
}
