import type { NoteEvent } from '@/core/domain/note-event';
import type { InputStatus, NoteInput, Unsubscribe } from '@/core/ports/note-input';
import { noteForKeyCode } from './keyboard-map';

/** Lo mínimo que necesitamos de un `KeyboardEvent` (facilita las pruebas). */
export interface KeyEventLike {
  readonly code: string;
  readonly repeat: boolean;
  readonly timeStamp: number;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
}

/** Lo mínimo que necesitamos de `window`. */
export interface KeyEventTarget {
  addEventListener(type: string, listener: (event: never) => void): void;
  removeEventListener(type: string, listener: (event: never) => void): void;
}

const KEY_VELOCITY = 96;

export class ComputerKeyboardInput implements NoteInput {
  readonly source = 'teclado-pc';
  private readonly target: KeyEventTarget;
  private readonly handlers = new Set<(event: NoteEvent) => void>();
  private readonly statusHandlers = new Set<(status: InputStatus) => void>();
  private readonly down = new Map<string, number>();
  private status: InputStatus = { kind: 'iniciando' };
  private listening = false;

  constructor(target: KeyEventTarget) {
    this.target = target;
  }

  getStatus(): InputStatus {
    return this.status;
  }

  start(): Promise<void> {
    if (!this.listening) {
      this.listening = true;
      this.target.addEventListener('keydown', this.onKeyDown);
      this.target.addEventListener('keyup', this.onKeyUp);
      this.target.addEventListener('blur', this.onBlur);
    }
    this.setStatus({ kind: 'conectado', deviceName: 'Teclado del PC' });
    return Promise.resolve();
  }

  stop(): void {
    if (!this.listening) return;
    this.listening = false;
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.releaseAll(0);
  }

  subscribe(handler: (event: NoteEvent) => void): Unsubscribe {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  subscribeStatus(handler: (status: InputStatus) => void): Unsubscribe {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  private readonly onKeyDown = (event: KeyEventLike): void => {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    const note = noteForKeyCode(event.code);
    if (note === undefined || this.down.has(event.code)) return;
    this.down.set(event.code, note);
    this.emit({
      type: 'on',
      note,
      velocity: KEY_VELOCITY,
      at: event.timeStamp,
      source: 'teclado-pc',
    });
  };

  private readonly onKeyUp = (event: KeyEventLike): void => {
    const note = this.down.get(event.code);
    if (note === undefined) return;
    this.down.delete(event.code);
    this.emit({ type: 'off', note, velocity: 0, at: event.timeStamp, source: 'teclado-pc' });
  };

  /** Si la ventana pierde el foco no llegará el `keyup`: soltamos todo para no dejar notas pegadas. */
  private readonly onBlur = (event: { timeStamp: number }): void => {
    this.releaseAll(event.timeStamp);
  };

  private releaseAll(at: number): void {
    for (const note of this.down.values()) {
      this.emit({ type: 'off', note, velocity: 0, at, source: 'teclado-pc' });
    }
    this.down.clear();
  }

  private emit(event: NoteEvent): void {
    this.handlers.forEach((handler) => handler(event));
  }

  private setStatus(status: InputStatus): void {
    this.status = status;
    this.statusHandlers.forEach((handler) => handler(status));
  }
}
