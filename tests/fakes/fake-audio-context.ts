import type {
  AudioContextLike,
  AudioParamLike,
  GainLike,
  OscillatorLike,
} from '@/adapters/audio/web-audio-output';

class FakeParam implements AudioParamLike {
  value = 0;
  readonly calls: string[] = [];
  setValueAtTime(value: number, time: number): void {
    this.calls.push(`set:${value.toFixed(4)}@${time}`);
  }
  linearRampToValueAtTime(value: number, time: number): void {
    this.calls.push(`lin:${value.toFixed(4)}@${time}`);
  }
  exponentialRampToValueAtTime(value: number, time: number): void {
    this.calls.push(`exp:${value.toFixed(4)}@${time}`);
  }
  cancelScheduledValues(time: number): void {
    this.calls.push(`cancel@${time}`);
  }
}

export class FakeOscillator implements OscillatorLike {
  type = 'sine';
  readonly frequency = new FakeParam();
  onended: (() => void) | null = null;
  started: number | null = null;
  stopped: number | null = null;
  connected = false;
  connect(): void {
    this.connected = true;
  }
  disconnect(): void {
    this.connected = false;
  }
  start(when = 0): void {
    this.started = when;
  }
  stop(when = 0): void {
    this.stopped = when;
  }
}

export class FakeGain implements GainLike {
  readonly gain = new FakeParam();
  connect(): void {}
  disconnect(): void {}
}

export class FakeAudioContext implements AudioContextLike {
  state = 'suspended';
  currentTime = 0;
  readonly destination = {};
  readonly oscillators: FakeOscillator[] = [];
  readonly gains: FakeGain[] = [];
  resumeCalls = 0;
  private readonly listeners = new Set<() => void>();

  resume(): Promise<void> {
    this.resumeCalls += 1;
    this.state = 'running';
    this.listeners.forEach((listener) => listener());
    return Promise.resolve();
  }

  createOscillator(): FakeOscillator {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }

  createGain(): FakeGain {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }

  addEventListener(_type: 'statechange', listener: () => void): void {
    this.listeners.add(listener);
  }
}
