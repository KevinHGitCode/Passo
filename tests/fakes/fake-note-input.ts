import type { InputSource, NoteEvent } from '@/core/domain/note-event';
import type { InputStatus, NoteInput, Unsubscribe } from '@/core/ports/note-input';

export class FakeNoteInput implements NoteInput {
  readonly source: InputSource;
  private status: InputStatus = { kind: 'iniciando' };
  private readonly handlers = new Set<(event: NoteEvent) => void>();
  private readonly statusHandlers = new Set<(status: InputStatus) => void>();

  constructor(source: InputSource = 'teclado-pc') {
    this.source = source;
  }

  getStatus(): InputStatus {
    return this.status;
  }

  start(): Promise<void> {
    this.setStatus({ kind: 'conectado', deviceName: 'Falso' });
    return Promise.resolve();
  }

  stop(): void {
    this.handlers.clear();
  }

  subscribe(handler: (event: NoteEvent) => void): Unsubscribe {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  subscribeStatus(handler: (status: InputStatus) => void): Unsubscribe {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  setStatus(status: InputStatus): void {
    this.status = status;
    this.statusHandlers.forEach((handler) => handler(status));
  }

  /** Simula que se pulsa una tecla. */
  press(note: number, at: number, velocity = 90): void {
    this.emit({ type: 'on', note, velocity, at, source: this.source });
  }

  release(note: number, at: number): void {
    this.emit({ type: 'off', note, velocity: 0, at, source: this.source });
  }

  private emit(event: NoteEvent): void {
    this.handlers.forEach((handler) => handler(event));
  }
}
