import { correctNote } from '../domain/piano-setup';
import type { MicFix } from '../domain/piano-setup';
import type { Midi } from '../domain/note';
import type { NoteEvent } from '../domain/note-event';
import type { ExpectationSink } from '../ports/expectation-sink';
import type { InputStatus, NoteInput, Unsubscribe } from '../ports/note-input';

/**
 * Corrige lo que lee el micrófono cuando, al probar el piano, se vio que lee alguna nota una octava lejos
 * (el Mi3 como Mi4). Envuelve a la entrada de notas y cambia el número de las notas sueltas; no toca el estado
 * ni el resto. Si hay un acorde esperado, las notas las pone el verificador de acordes (ya con su octava) y no
 * se corrigen.
 */
export class CorrectedNoteInput implements NoteInput, ExpectationSink {
  readonly source;
  private readonly input: NoteInput & Partial<ExpectationSink>;
  private readonly fixes: () => readonly MicFix[];
  private readonly enabled: () => boolean;
  private chordExpected = false;

  constructor(deps: {
    readonly input: NoteInput & Partial<ExpectationSink>;
    readonly fixes: () => readonly MicFix[];
    /** Solo se corrige con el piano (las correcciones son de su teclado). */
    readonly enabled: () => boolean;
  }) {
    this.input = deps.input;
    this.fixes = deps.fixes;
    this.enabled = deps.enabled;
    this.source = deps.input.source;
  }

  getStatus(): InputStatus {
    return this.input.getStatus();
  }

  start(): Promise<void> {
    return this.input.start();
  }

  stop(): void {
    this.input.stop();
  }

  subscribeStatus(handler: (status: InputStatus) => void): Unsubscribe {
    return this.input.subscribeStatus(handler);
  }

  subscribe(handler: (event: NoteEvent) => void): Unsubscribe {
    return this.input.subscribe((event) => handler(this.fix(event)));
  }

  setExpectation(notes: readonly Midi[] | null): void {
    this.chordExpected = notes !== null && notes.length > 1;
    this.input.setExpectation?.(notes);
  }

  private fix(event: NoteEvent): NoteEvent {
    if (this.chordExpected || !this.enabled()) return event;
    const fixes = this.fixes();
    if (fixes.length === 0) return event;
    const note = correctNote(fixes, event.note);
    return note === event.note ? event : { ...event, note };
  }
}
