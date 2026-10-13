import { isValidMidi } from '@/core/domain/note';
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
  if (!isValidMidi(note) || velocity > 127) return null;
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

interface Attachment {
  readonly port: MidiPortLike;
  readonly listener: (message: MidiMessageEventLike) => void;
  /** Notas pulsadas en este puerto: si se desconecta, hay que soltarlas. */
  readonly held: Set<number>;
}

/** Piano o teclado MIDI por Web MIDI. `requestAccess` es `undefined` si el navegador no la tiene. */
export class MidiNoteInput implements NoteInput {
  readonly source = 'midi';
  private readonly requestAccess: RequestMidiAccess | undefined;
  private readonly handlers = new Set<(event: NoteEvent) => void>();
  private readonly statusHandlers = new Set<(status: InputStatus) => void>();
  private readonly attached = new Map<string, Attachment>();
  private access: MidiAccessLike | null = null;
  private status: InputStatus = { kind: 'iniciando' };
  private lastDeviceName: string | null = null;
  private startToken = 0;

  constructor(requestAccess: RequestMidiAccess | undefined) {
    this.requestAccess = requestAccess;
  }

  getStatus(): InputStatus {
    return this.status;
  }

  async start(): Promise<void> {
    const token = ++this.startToken;
    this.detachAll();
    if (!this.requestAccess) {
      this.setStatus({ kind: 'sin-soporte' });
      return;
    }
    this.setStatus({ kind: 'iniciando' });
    let access: MidiAccessLike;
    try {
      access = await this.requestAccess();
    } catch (error) {
      if (token === this.startToken) {
        this.setStatus({ kind: isDeniedError(error) ? 'permiso-denegado' : 'sin-soporte' });
      }
      return;
    }
    // Si mientras esperábamos se llamó a stop() o a otro start(), esta respuesta ya no vale.
    if (token !== this.startToken) return;
    this.access = access;
    access.addEventListener('statechange', this.onStateChange);
    for (const port of access.inputs.values()) {
      if (port.state === 'connected') this.attach(port);
    }
    this.refreshStatus();
  }

  stop(): void {
    this.startToken += 1;
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

  private readonly onStateChange = (event: MidiConnectionEventLike): void => {
    const port = event.port;
    if (!port || port.type !== 'input') return;
    if (port.state === 'connected') this.attach(port);
    else this.detach(port);
    this.refreshStatus(port);
  };

  private attach(port: MidiPortLike): void {
    if (this.attached.has(port.id)) return;
    const held = new Set<number>();
    const listener = (message: MidiMessageEventLike): void => {
      const event = parseMidiMessage(message);
      if (!event) return;
      if (event.type === 'on') held.add(event.note);
      else held.delete(event.note);
      this.emit(event);
    };
    port.addEventListener('midimessage', listener);
    this.attached.set(port.id, { port, listener, held });
    this.lastDeviceName = deviceName(port);
  }

  private detach(port: MidiPortLike): void {
    const attachment = this.attached.get(port.id);
    if (!attachment) return;
    attachment.port.removeEventListener('midimessage', attachment.listener);
    this.attached.delete(port.id);
    // Sin esto, las teclas que estaban pulsadas quedarían "pegadas" en pantalla y en el audio.
    const at = performance.now();
    for (const note of attachment.held) {
      this.emit({ type: 'off', note, velocity: 0, at, source: 'midi' });
    }
  }

  private detachAll(): void {
    this.access?.removeEventListener('statechange', this.onStateChange);
    this.access = null;
    for (const attachment of [...this.attached.values()]) this.detach(attachment.port);
  }

  private emit(event: NoteEvent): void {
    this.handlers.forEach((handler) => handler(event));
  }

  private refreshStatus(changed?: MidiPortLike): void {
    const first = this.attached.values().next();
    if (!first.done) {
      this.setStatus({ kind: 'conectado', deviceName: deviceName(first.value.port) });
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
