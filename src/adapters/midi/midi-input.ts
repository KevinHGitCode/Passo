import type { NoteEvent } from '@/core/domain/note-event';
import type { InputStatus, NoteInput, Unsubscribe } from '@/core/ports/note-input';
import type {
  MidiAccessLike,
  MidiConnectionEventLike,
  MidiMessageEventLike,
  MidiPortLike,
  RequestMidiAccess,
} from './midi-types';

const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;

/** Traduce un mensaje MIDI crudo a un evento de nota; ignora todo lo demás (reloj, pedales, CC…). */
export function parseMidiMessage(message: MidiMessageEventLike): NoteEvent | null {
  const data = message.data;
  if (!data || data.length < 3) return null;
  const status = (data[0] ?? 0) & 0xf0;
  const note = data[1] ?? 0;
  const velocity = data[2] ?? 0;
  if (status === NOTE_ON && velocity > 0) {
    return { type: 'on', note, velocity, at: message.timeStamp, source: 'midi' };
  }
  if (status === NOTE_OFF || status === NOTE_ON) {
    return { type: 'off', note, velocity: 0, at: message.timeStamp, source: 'midi' };
  }
  return null;
}

function isDeniedError(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'NotAllowedError' || name === 'SecurityError';
}

function deviceName(port: MidiPortLike): string {
  return port.name?.trim() || 'Piano MIDI';
}

/** Piano o teclado MIDI por Web MIDI. `requestAccess` es `undefined` si el navegador no la tiene. */
export class MidiNoteInput implements NoteInput {
  readonly source = 'midi';
  private readonly requestAccess: RequestMidiAccess | undefined;
  private readonly handlers = new Set<(event: NoteEvent) => void>();
  private readonly statusHandlers = new Set<(status: InputStatus) => void>();
  private readonly attached = new Map<string, MidiPortLike>();
  private access: MidiAccessLike | null = null;
  private status: InputStatus = { kind: 'iniciando' };
  private lastDeviceName: string | null = null;

  constructor(requestAccess: RequestMidiAccess | undefined) {
    this.requestAccess = requestAccess;
  }

  getStatus(): InputStatus {
    return this.status;
  }

  async start(): Promise<void> {
    this.detachAll();
    if (!this.requestAccess) {
      this.setStatus({ kind: 'sin-soporte' });
      return;
    }
    this.setStatus({ kind: 'iniciando' });
    try {
      this.access = await this.requestAccess();
    } catch (error) {
      this.setStatus({ kind: isDeniedError(error) ? 'permiso-denegado' : 'sin-soporte' });
      return;
    }
    this.access.addEventListener('statechange', this.onStateChange);
    for (const port of this.access.inputs.values()) {
      if (port.state === 'connected') this.attach(port);
    }
    this.refreshStatus();
  }

  stop(): void {
    this.detachAll();
  }

  subscribe(handler: (event: NoteEvent) => void): Unsubscribe {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  subscribeStatus(handler: (status: InputStatus) => void): Unsubscribe {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  private readonly onMessage = (message: MidiMessageEventLike): void => {
    const event = parseMidiMessage(message);
    if (event) this.handlers.forEach((handler) => handler(event));
  };

  private readonly onStateChange = (event: MidiConnectionEventLike): void => {
    const port = event.port;
    if (!port || port.type !== 'input') return;
    if (port.state === 'connected') this.attach(port);
    else this.detach(port);
    this.refreshStatus(port);
  };

  private attach(port: MidiPortLike): void {
    if (this.attached.has(port.id)) return;
    port.addEventListener('midimessage', this.onMessage);
    this.attached.set(port.id, port);
    this.lastDeviceName = deviceName(port);
  }

  private detach(port: MidiPortLike): void {
    const known = this.attached.get(port.id);
    if (!known) return;
    known.removeEventListener('midimessage', this.onMessage);
    this.attached.delete(port.id);
  }

  private detachAll(): void {
    this.access?.removeEventListener('statechange', this.onStateChange);
    this.access = null;
    for (const port of this.attached.values()) {
      port.removeEventListener('midimessage', this.onMessage);
    }
    this.attached.clear();
  }

  private refreshStatus(changed?: MidiPortLike): void {
    const first = this.attached.values().next();
    if (!first.done) {
      this.setStatus({ kind: 'conectado', deviceName: deviceName(first.value) });
    } else if (changed) {
      this.setStatus({ kind: 'desconectado', deviceName: deviceName(changed) });
    } else if (this.lastDeviceName) {
      this.setStatus({ kind: 'desconectado', deviceName: this.lastDeviceName });
    } else {
      this.setStatus({ kind: 'sin-dispositivo' });
    }
  }

  private setStatus(status: InputStatus): void {
    this.status = status;
    this.statusHandlers.forEach((handler) => handler(status));
  }
}
