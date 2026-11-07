import { diagnoseNotes, matchChords } from '../domain/chords';
import type { ChordMatch, NoteDiagnosis, PlayedNote } from '../domain/chords';
import type { HeardNote } from '../domain/multi-pitch';
import type { StrumDirection } from '../domain/strum';
import type { Unsubscribe } from '../ports/note-input';
import type { StrumEvent, StrumListener } from './strum-listener';

/** Cómo se toca el acorde: de un rasgueo, o cuerda por cuerda. */
export type ChordMode = 'rasgueo' | 'cuerda';

export interface StrokeView {
  readonly id: number;
  readonly at: number;
  readonly direction: StrumDirection | null;
}

export interface ChordsSnapshot {
  readonly open: boolean;
  readonly mode: ChordMode;
  /** Los últimos golpes (rasgueo), del más viejo al más nuevo. */
  readonly strokes: readonly StrokeView[];
  /** Las notas que se oyeron en el último rasgueo medido. */
  readonly heard: readonly HeardNote[];
  /** Los acordes que mejor encajan, de más a menos parecido (vacío si aún no hay nada). */
  readonly matches: readonly ChordMatch[];
  /** Cuerda por cuerda: las notas tocadas y qué pasa con cada una. */
  readonly played: readonly NoteDiagnosis[];
  /** El rasgueo de la última medición se mezcló con otro golpe: no vale para saber el acorde. */
  readonly muddy: boolean;
}

const EMPTY: ChordsSnapshot = {
  open: false,
  mode: 'rasgueo',
  strokes: [],
  heard: [],
  matches: [],
  played: [],
  muddy: false,
};

const MAX_STROKES = 10;
const MAX_NOTES = 8;
/** Una nota tocada de nuevo antes de esto sustituye a la anterior; tras un silencio más largo, se empieza otro acorde. */
const SAME_NOTE_MS = 2500;
const NEW_CHORD_MS = 6000;

/**
 * Caso de uso de la sección de acordes: dice qué acorde suena, de un rasgueo (todas las cuerdas a la vez) o
 * cuerda por cuerda (cada nota se mide y se empareja con el acorde que mejor encaja, para ver si falta una,
 * sobra otra o alguna cuerda está desafinada).
 */
export class ChordsService {
  private readonly listener: StrumListener;
  private readonly listeners = new Set<() => void>();
  private unsubscribe: Unsubscribe | null = null;
  private snapshot: ChordsSnapshot = EMPTY;
  private nextId = 1;
  private notes: (PlayedNote & { at: number })[] = [];

  constructor(deps: { readonly listener: StrumListener }) {
    this.listener = deps.listener;
  }

  getSnapshot = (): ChordsSnapshot => this.snapshot;

  subscribe = (listener: () => void): Unsubscribe => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  open(mode: ChordMode = 'rasgueo'): void {
    this.unsubscribe?.();
    this.unsubscribe = this.listener.subscribe((event) => this.onEvent(event));
    this.listener.start(mode === 'rasgueo' ? 'acorde' : 'nota');
    this.notes = [];
    this.set({ ...EMPTY, open: true, mode });
  }

  close(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.listener.stop();
    this.notes = [];
    this.set(EMPTY);
  }

  setMode(mode: ChordMode): void {
    if (!this.snapshot.open || mode === this.snapshot.mode) return;
    this.listener.start(mode === 'rasgueo' ? 'acorde' : 'nota');
    this.notes = [];
    this.set({ ...EMPTY, open: true, mode });
  }

  /** Borra lo medido hasta ahora (empezar otro acorde). */
  clear(): void {
    if (!this.snapshot.open) return;
    this.notes = [];
    this.set({ ...EMPTY, open: true, mode: this.snapshot.mode });
  }

  private onEvent(event: StrumEvent): void {
    const current = this.snapshot;
    if (!current.open) return;
    if (event.kind === 'golpe' && current.mode === 'rasgueo') {
      const stroke: StrokeView = { id: this.nextId++, at: event.at, direction: event.direction };
      this.set({ ...current, strokes: [...current.strokes, stroke].slice(-MAX_STROKES) });
    } else if (event.kind === 'acorde' && current.mode === 'rasgueo') {
      if (!event.clean) {
        this.set({ ...current, muddy: true });
        return;
      }
      this.set({
        ...current,
        heard: event.notes,
        matches: matchChords(event.notes),
        muddy: false,
      });
    } else if (event.kind === 'nota' && current.mode === 'cuerda') {
      this.addNote({ midi: event.midi, cents: event.cents, at: event.at });
    }
  }

  private addNote(note: PlayedNote & { at: number }): void {
    const last = this.notes[this.notes.length - 1];
    if (last && note.at - last.at > NEW_CHORD_MS) this.notes = [];
    this.notes = this.notes.filter(
      (item) => !(item.midi === note.midi && note.at - item.at < SAME_NOTE_MS),
    );
    this.notes.push(note);
    this.notes = this.notes.slice(-MAX_NOTES);
    const played = this.notes.map(({ midi, cents }) => ({ midi, cents }));
    const classes = new Set(played.map((item) => ((item.midi % 12) + 12) % 12));
    const matches =
      classes.size >= 2
        ? matchChords(played.map((item) => ({ midi: item.midi, cents: item.cents, strength: 1 })))
        : [];
    this.set({
      ...this.snapshot,
      matches,
      played: diagnoseNotes(played, matches[0] ?? null),
    });
  }

  private set(next: ChordsSnapshot): void {
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
}
