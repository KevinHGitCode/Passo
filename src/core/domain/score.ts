import type { Midi } from './note';
import type { Song, SongStep } from './songs';

/**
 * La partitura de una canción: cada paso con su figura (redonda, blanca, negra, corchea…), su sitio en el
 * pentagrama y su compás. Lógica pura: dibujarla es cosa de la pantalla.
 */

export type NoteHead = 'abierta' | 'llena';

export interface NoteValue {
  readonly name: string;
  /** Cuántos pulsos dura (la negra es 1). */
  readonly beats: number;
  /** La redonda y la blanca llevan la cabeza hueca. */
  readonly head: NoteHead;
  /** La redonda no lleva plica. */
  readonly stem: boolean;
  /** Corchea 1 corchete, semicorchea 2. */
  readonly flags: 0 | 1 | 2;
  /** Puntillo: dura la mitad más. */
  readonly dotted: boolean;
}

const VALUES: readonly NoteValue[] = [
  { name: 'Semicorchea', beats: 0.25, head: 'llena', stem: true, flags: 2, dotted: false },
  { name: 'Corchea', beats: 0.5, head: 'llena', stem: true, flags: 1, dotted: false },
  { name: 'Corchea con puntillo', beats: 0.75, head: 'llena', stem: true, flags: 1, dotted: true },
  { name: 'Negra', beats: 1, head: 'llena', stem: true, flags: 0, dotted: false },
  { name: 'Negra con puntillo', beats: 1.5, head: 'llena', stem: true, flags: 0, dotted: true },
  { name: 'Blanca', beats: 2, head: 'abierta', stem: true, flags: 0, dotted: false },
  { name: 'Blanca con puntillo', beats: 3, head: 'abierta', stem: true, flags: 0, dotted: true },
  { name: 'Redonda', beats: 4, head: 'abierta', stem: false, flags: 0, dotted: false },
];

/** La figura que más se parece a esa duración (si no es exacta, la más cercana). */
export function noteValueOf(beats: number): NoteValue {
  let best = VALUES[3] as NoteValue;
  for (const value of VALUES) {
    if (Math.abs(value.beats - beats) < Math.abs(best.beats - beats)) best = value;
  }
  return best;
}

/** «Negra · 1 pulso», «Corchea · ½ pulso»… */
export function noteValueText(value: NoteValue): string {
  const beats =
    value.beats === 0.25
      ? '¼ de pulso'
      : value.beats === 0.5
        ? '½ pulso'
        : value.beats === 0.75
          ? '¾ de pulso'
          : value.beats === 1
            ? '1 pulso'
            : `${String(value.beats).replace('.', ',')} pulsos`;
  return `${value.name} · ${beats}`;
}

// ─── Dónde va cada nota en el pentagrama ────────────────────────────────────────────────────────────

/** Letra de la nota (0 = Do … 6 = Si) y si lleva sostenido, por cada clase de nota. */
const LETTERS: readonly { readonly letter: number; readonly sharp: boolean }[] = [
  { letter: 0, sharp: false },
  { letter: 0, sharp: true },
  { letter: 1, sharp: false },
  { letter: 1, sharp: true },
  { letter: 2, sharp: false },
  { letter: 3, sharp: false },
  { letter: 3, sharp: true },
  { letter: 4, sharp: false },
  { letter: 4, sharp: true },
  { letter: 5, sharp: false },
  { letter: 5, sharp: true },
  { letter: 6, sharp: false },
];

export interface StaffPitch {
  /** Posición diatónica: octava × 7 + letra (el Mi4, la línea de abajo de la clave de Sol, es 30). */
  readonly diatonic: number;
  readonly sharp: boolean;
}

/** La guitarra se escribe una octava más aguda de como suena. */
export const GUITAR_WRITTEN_OFFSET = 12;

/** La posición en el pentagrama (clave de Sol) de una nota que **suena** en la guitarra. */
export function staffPitch(sounding: Midi): StaffPitch {
  const written = sounding + GUITAR_WRITTEN_OFFSET;
  const octave = Math.floor(written / 12) - 1;
  const entry = LETTERS[((written % 12) + 12) % 12] as (typeof LETTERS)[number];
  return { diatonic: octave * 7 + entry.letter, sharp: entry.sharp };
}

// ─── Los compases ───────────────────────────────────────────────────────────────────────────────────

export interface TabMark {
  readonly string: number;
  readonly fret: number;
}

export interface ScoreEvent {
  /** El paso de la canción al que corresponde. */
  readonly index: number;
  /** En qué pulso del compás empieza. */
  readonly beat: number;
  readonly value: NoteValue;
  readonly pitches: readonly StaffPitch[];
  readonly tab: readonly TabMark[];
  /** El nombre del acorde, si el paso es un acorde. */
  readonly chord: string | null;
  readonly strum: string | null;
}

export interface ScoreBar {
  readonly number: number;
  readonly events: readonly ScoreEvent[];
  /** Pulsos que ocupa (lo normal es los del compás). */
  readonly beats: number;
}

function eventOf(step: SongStep, index: number, beat: number): ScoreEvent {
  const value = noteValueOf(step.beats);
  if (step.kind === 'nota') {
    return {
      index,
      beat,
      value,
      pitches: [staffPitch(step.midi)],
      tab: [{ string: step.string, fret: step.fret }],
      chord: null,
      strum: null,
    };
  }
  return {
    index,
    beat,
    value,
    pitches: step.notes.map(staffPitch),
    tab: step.tab.flatMap((fret, position) =>
      fret === null ? [] : [{ string: position + 1, fret }],
    ),
    chord: step.chord,
    strum: step.strum,
  };
}

/** Reparte los pasos en compases: se cierra el compás al llenar los pulsos que lleva. */
export function layoutBars(song: Song): ScoreBar[] {
  const bars: ScoreBar[] = [];
  let events: ScoreEvent[] = [];
  let filled = 0;
  song.steps.forEach((step, index) => {
    const event = eventOf(step, index, filled);
    events.push(event);
    filled += event.value.beats;
    if (filled >= song.beatsPerBar - 1e-6) {
      bars.push({ number: bars.length + 1, events, beats: filled });
      events = [];
      filled = 0;
    }
  });
  if (events.length > 0) bars.push({ number: bars.length + 1, events, beats: filled });
  return bars;
}
