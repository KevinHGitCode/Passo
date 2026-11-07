import { fixesFrom, testNotes } from '../domain/piano-setup';
import type { KeyboardSize, MicFix, ProbeResult } from '../domain/piano-setup';
import type { Midi } from '../domain/note';
import type { NoteInput, Unsubscribe } from '../ports/note-input';

export type ProbePhase = 'inactiva' | 'probando' | 'terminada';

export interface ProbeSnapshot {
  readonly phase: ProbePhase;
  /** Las notas que se piden, en orden. */
  readonly notes: readonly Midi[];
  /** Lo que salió de cada una hasta ahora (`null` = saltada o sin oír). */
  readonly results: readonly ProbeResult[];
  /** La nota que se pide ahora. */
  readonly index: number;
  /** Lo último que se oyó, aunque no fuera la pedida (para que se vea qué lee el micrófono). */
  readonly lastHeard: Midi | null;
}

const IDLE: ProbeSnapshot = {
  phase: 'inactiva',
  notes: [],
  results: [],
  index: 0,
  lastHeard: null,
};

/** Un sonido a menos de esto del anterior es el mismo (la tecla aún suena). */
const MIN_GAP_MS = 400;

/**
 * La prueba del piano: pide tocar varias teclas y compara lo que lee el micrófono con lo que se pidió, para
 * ver si alguna sale una octava más arriba o abajo. Escucha la entrada **sin corregir** (la corrección sale de
 * esta prueba, no puede aplicarse mientras se hace).
 */
export class PianoSetupService {
  private readonly input: NoteInput;
  private readonly listening: { enter(): void; leave(): void } | undefined;
  private active = false;
  private readonly listeners = new Set<() => void>();
  private unsubscribe: Unsubscribe | null = null;
  private snapshot: ProbeSnapshot = IDLE;
  private lastAt = -Infinity;

  constructor(deps: {
    readonly input: NoteInput;
    /** Cómo escucha el micrófono durante la prueba (el de piano) y cómo vuelve al acabar. */
    readonly listening?: { enter(): void; leave(): void } | undefined;
  }) {
    this.input = deps.input;
    this.listening = deps.listening;
  }

  getSnapshot = (): ProbeSnapshot => this.snapshot;

  subscribe = (listener: () => void): Unsubscribe => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start(keys: KeyboardSize): void {
    this.unsubscribe?.();
    this.lastAt = -Infinity;
    if (!this.active) this.listening?.enter();
    this.active = true;
    this.unsubscribe = this.input.subscribe((event) => {
      if (event.type !== 'on') return;
      this.onNote(event.note, event.at);
    });
    this.set({ ...IDLE, phase: 'probando', notes: testNotes(keys) });
  }

  /** Salta la nota que se pide (no se pudo o no se oyó). */
  skip(): void {
    if (this.snapshot.phase !== 'probando') return;
    this.record(null);
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.release();
    this.set(IDLE);
  }

  private release(): void {
    if (this.active) this.listening?.leave();
    this.active = false;
  }

  /** Las correcciones de octava que salen de la prueba terminada. */
  fixes(): MicFix[] {
    return fixesFrom(this.snapshot.results);
  }

  private onNote(note: Midi, at: number): void {
    const current = this.snapshot;
    if (current.phase !== 'probando' || at - this.lastAt < MIN_GAP_MS) return;
    this.lastAt = at;
    this.record(note);
  }

  private record(detected: Midi | null): void {
    const current = this.snapshot;
    const expected = current.notes[current.index];
    if (expected === undefined) return;
    const results = [...current.results, { expected, detected }];
    const next = current.index + 1;
    const finished = next >= current.notes.length;
    if (finished) {
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.release();
    }
    this.set({
      ...current,
      phase: finished ? 'terminada' : 'probando',
      results,
      index: finished ? current.index : next,
      lastHeard: detected ?? current.lastHeard,
    });
  }

  private set(next: ProbeSnapshot): void {
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
}
