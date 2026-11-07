import type { HeardNote } from './multi-pitch';

/**
 * Los acordes que se reconocen y cómo se emparejan con lo que suena. Se compara por **clases de nota** (Do,
 * Do♯…, sin octava): da igual qué cuerda toque cada nota o en qué octava.
 */

export interface ChordQuality {
  readonly id: string;
  /** Lo que se añade al nombre de la raíz: «», «m», «7»… */
  readonly suffix: string;
  readonly spanish: string;
  /** Semitonos sobre la raíz. */
  readonly intervals: readonly number[];
  /** Cuánto cuesta no oír cada nota (la quinta se omite a menudo; la raíz y la tercera, nunca). */
  readonly weights: readonly number[];
  /** Penalización por ser menos común (a igualdad, gana el acorde más sencillo). */
  readonly complexity: number;
}

export const QUALITIES: readonly ChordQuality[] = [
  {
    id: 'mayor',
    suffix: '',
    spanish: 'mayor',
    intervals: [0, 4, 7],
    weights: [1, 1, 0.7],
    complexity: 0,
  },
  {
    id: 'menor',
    suffix: 'm',
    spanish: 'menor',
    intervals: [0, 3, 7],
    weights: [1, 1, 0.7],
    complexity: 0,
  },
  {
    id: 'septima',
    suffix: '7',
    spanish: 'séptima',
    intervals: [0, 4, 7, 10],
    weights: [1, 1, 0.5, 0.9],
    complexity: 0.04,
  },
  {
    id: 'mayor7',
    suffix: 'maj7',
    spanish: 'mayor séptima',
    intervals: [0, 4, 7, 11],
    weights: [1, 1, 0.5, 0.9],
    complexity: 0.05,
  },
  {
    id: 'menor7',
    suffix: 'm7',
    spanish: 'menor séptima',
    intervals: [0, 3, 7, 10],
    weights: [1, 1, 0.5, 0.9],
    complexity: 0.05,
  },
  {
    id: 'sus2',
    suffix: 'sus2',
    spanish: 'suspendido 2',
    intervals: [0, 2, 7],
    weights: [1, 1, 0.7],
    complexity: 0.06,
  },
  {
    id: 'sus4',
    suffix: 'sus4',
    spanish: 'suspendido 4',
    intervals: [0, 5, 7],
    weights: [1, 1, 0.7],
    complexity: 0.06,
  },
  {
    id: 'dim',
    suffix: 'dim',
    spanish: 'disminuido',
    intervals: [0, 3, 6],
    weights: [1, 1, 0.9],
    complexity: 0.08,
  },
];

const AMERICAN = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const;
const LATIN = [
  'Do',
  'Do♯',
  'Re',
  'Re♯',
  'Mi',
  'Fa',
  'Fa♯',
  'Sol',
  'Sol♯',
  'La',
  'La♯',
  'Si',
] as const;

export const pitchClassName = (pc: number, latin = true): string =>
  (latin ? LATIN : AMERICAN)[((pc % 12) + 12) % 12] as string;

export interface Chord {
  readonly root: number;
  readonly quality: ChordQuality;
}

/** «G», «Em», «D7»… */
export function chordSymbol(chord: Chord): string {
  return `${AMERICAN[chord.root]}${chord.quality.suffix}`;
}

/** «Sol mayor», «Mi menor», «Re séptima». */
export function chordSpanish(chord: Chord): string {
  return `${pitchClassName(chord.root)} ${chord.quality.spanish}`;
}

/** Las clases de nota del acorde. */
export function chordClasses(chord: Chord): number[] {
  return chord.quality.intervals.map((interval) => (chord.root + interval) % 12);
}

export interface ChordMatch {
  readonly chord: Chord;
  /** 0–1: cuánto se parece lo que suena al acorde. */
  readonly score: number;
  /** Clases del acorde que no se oyeron. */
  readonly missing: readonly number[];
  /** Clases oídas que no son del acorde. */
  readonly extra: readonly number[];
}

/** Cuánta energía debe tener una nota para darla por oída. */
const PRESENT = 0.12;

/** Los pesos por clase de nota: lo más fuerte de cada clase, y las notas agudas pesan menos (son armónicos). */
function classWeights(notes: readonly HeardNote[]): number[] {
  const weights = new Array<number>(12).fill(0);
  for (const note of notes) {
    const pc = ((note.midi % 12) + 12) % 12;
    const octaveFactor = note.midi > 84 ? 0.4 : 1;
    weights[pc] = Math.max(weights[pc] as number, note.strength * octaveFactor);
  }
  return weights;
}

/** Empareja lo que suena con los acordes conocidos: los mejores, de más a menos parecido. */
export function matchChords(notes: readonly HeardNote[], limit = 3): ChordMatch[] {
  const weights = classWeights(notes);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total === 0) return [];
  const lowest = notes.length > 0 ? Math.min(...notes.map((note) => note.midi)) : null;
  const bassClass = lowest === null ? null : ((lowest % 12) + 12) % 12;
  const matches: ChordMatch[] = [];
  for (let root = 0; root < 12; root++) {
    for (const quality of QUALITIES) {
      const classes = quality.intervals.map((interval) => (root + interval) % 12);
      let inside = 0;
      let need = 0;
      let got = 0;
      const missing: number[] = [];
      classes.forEach((pc, index) => {
        const weight = quality.weights[index] as number;
        need += weight;
        const heard = weights[pc] as number;
        inside += heard;
        if (heard >= PRESENT) got += weight;
        else missing.push(pc);
      });
      const extra: number[] = [];
      weights.forEach((weight, pc) => {
        if (weight >= PRESENT && !classes.includes(pc)) extra.push(pc);
      });
      const precision = inside / total;
      const recall = got / need;
      const bass = bassClass === root ? 0.06 : 0;
      const score = 0.55 * precision + 0.45 * recall + bass - quality.complexity;
      matches.push({
        chord: { root, quality },
        score: Math.max(0, Math.min(1, score)),
        missing,
        extra,
      });
    }
  }
  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ─── Cuerda por cuerda ─────────────────────────────────────────────────────────────────────────────

export interface PlayedNote {
  readonly midi: number;
  /** Cuánto se desvía de esa nota (−50 a +50). */
  readonly cents: number;
}

export type NoteStatus = 'bien' | 'desafinada' | 'de-mas';

export interface NoteDiagnosis {
  readonly note: PlayedNote;
  readonly status: NoteStatus;
  /** Si no es del acorde pero está cerca de una nota que sí lo es (y falta): esa clase de nota. */
  readonly maybe: number | null;
}

/** Más de esto, la cuerda se considera desafinada. */
export const DETUNED_CENTS = 20;
/** Hasta aquí una nota ajena se toma por una del acorde mal afinada. */
const NEAR_CENTS = 60;

/**
 * Qué pasa con cada nota tocada frente al acorde que mejor encaja: bien, desafinada (es del acorde pero se
 * desvía) o de más (no es del acorde); si está a menos de ~60 cents de una nota del acorde que falta, se
 * sugiere que era esa, desafinada.
 */
export function diagnoseNotes(
  played: readonly PlayedNote[],
  match: ChordMatch | null,
): NoteDiagnosis[] {
  if (!match) return played.map((note) => ({ note, status: 'bien' as const, maybe: null }));
  const classes = chordClasses(match.chord);
  return played.map((note) => {
    const pc = ((note.midi % 12) + 12) % 12;
    if (classes.includes(pc)) {
      return {
        note,
        status: Math.abs(note.cents) > DETUNED_CENTS ? ('desafinada' as const) : ('bien' as const),
        maybe: null,
      };
    }
    // Lo que falta del acorde y está a menos de ~60 cents de esta nota.
    const exact = note.midi + note.cents / 100;
    let best: { pc: number; distance: number } | null = null;
    for (const missing of match.missing) {
      for (let octave = -1; octave <= 10; octave++) {
        const distance = Math.abs(exact - (missing + 12 * octave)) * 100;
        if (distance <= NEAR_CENTS && (!best || distance < best.distance)) {
          best = { pc: missing, distance };
        }
      }
    }
    return { note, status: 'de-mas' as const, maybe: best?.pc ?? null };
  });
}
