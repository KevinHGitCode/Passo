import type {
  MidiAccessLike,
  MidiConnectionEventLike,
  MidiMessageEventLike,
  MidiPortLike,
} from '@/adapters/midi/midi-types';

export class FakeMidiPort implements MidiPortLike {
  readonly type = 'input';
  state: string = 'connected';
  private readonly listeners = new Set<(event: MidiMessageEventLike) => void>();

  constructor(
    readonly id: string,
    readonly name: string | null = 'Yamaha PSR-E263',
  ) {}

  addEventListener(_type: 'midimessage', listener: (event: MidiMessageEventLike) => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'midimessage', listener: (event: MidiMessageEventLike) => void): void {
    this.listeners.delete(listener);
  }

  listenerCount(): number {
    return this.listeners.size;
  }

  send(bytes: number[], timeStamp: number): void {
    const event: MidiMessageEventLike = { data: Uint8Array.from(bytes), timeStamp };
    this.listeners.forEach((listener) => listener(event));
  }
}

export class FakeMidiAccess implements MidiAccessLike {
  private readonly ports = new Map<string, FakeMidiPort>();
  private readonly listeners = new Set<(event: MidiConnectionEventLike) => void>();

  readonly inputs = { values: (): Iterable<MidiPortLike> => this.ports.values() };

  constructor(initial: readonly FakeMidiPort[] = []) {
    initial.forEach((port) => this.ports.set(port.id, port));
  }

  addEventListener(_type: 'statechange', listener: (event: MidiConnectionEventLike) => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(
    _type: 'statechange',
    listener: (event: MidiConnectionEventLike) => void,
  ): void {
    this.listeners.delete(listener);
  }

  listenerCount(): number {
    return this.listeners.size;
  }

  plug(port: FakeMidiPort): void {
    port.state = 'connected';
    this.ports.set(port.id, port);
    this.listeners.forEach((listener) => listener({ port }));
  }

  unplug(port: FakeMidiPort): void {
    port.state = 'disconnected';
    this.listeners.forEach((listener) => listener({ port }));
  }
}
