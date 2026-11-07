import type { Midi } from './note';

/**
 * Las canciones de piano: una lista de pasos (una nota o varias a la vez) con lo que dura cada uno en pulsos.
 * Se ven como notas que caen sobre el teclado y se tocan esperando o a tempo.
 */

export interface PianoStep {
  /** Las notas que suenan juntas en este paso (MIDI). */
  readonly notes: readonly Midi[];
  /** Cuándo empieza, en pulsos desde el principio de la canción. */
  readonly start: number;
  readonly beats: number;
}

export interface PianoSong {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  /** Pulsos por minuto a velocidad normal. */
  readonly bpm: number;
  readonly summary: string;
  readonly steps: readonly PianoStep[];
}

// ─── Leer una hoja del «Virtual Piano» ─────────────────────────────────────────────────────────────

const VIRTUAL_KEYS = '1234567890qwertyuiopasdfghjklzxcvbnm';
const WHITE_SEMITONES = [0, 2, 4, 5, 7, 9, 11] as const;
/** La primera tecla del teclado virtual (la «1») es el Do2. */
const VIRTUAL_START: Midi = 36;

/** La nota de una tecla del Virtual Piano (solo las teclas blancas; `null` si no es una tecla). */
export function virtualKeyToMidi(key: string): Midi | null {
  const index = VIRTUAL_KEYS.indexOf(key);
  if (index < 0) return null;
  return VIRTUAL_START + 12 * Math.floor(index / 7) + (WHITE_SEMITONES[index % 7] as number);
}

/**
 * Convierte una hoja del Virtual Piano en pasos: cada letra o cifra suelta es un paso; lo que va entre
 * corchetes suena a la vez (un acorde). Cada paso dura `beatsPerStep` pulsos.
 */
export function parseVirtualPiano(sheet: string, beatsPerStep = 0.5): PianoStep[] {
  const steps: PianoStep[] = [];
  let start = 0;
  const push = (notes: Midi[]): void => {
    if (notes.length === 0) return;
    steps.push({ notes: [...notes].sort((a, b) => a - b), start, beats: beatsPerStep });
    start += beatsPerStep;
  };
  let chord: Midi[] | null = null;
  for (const char of sheet) {
    if (char === '[') {
      chord = [];
    } else if (char === ']') {
      if (chord) push(chord);
      chord = null;
    } else {
      const midi = virtualKeyToMidi(char);
      if (midi === null) continue;
      if (chord) chord.push(midi);
      else push([midi]);
    }
  }
  return steps;
}

/**
 * «Golden Brown» (The Stranglers): el motivo del clavecín. Tablatura de la comunidad en teclas del Virtual
 * Piano (playpianosheets.com), en La menor; la hoja no trae el ritmo, así que cada paso dura media negra.
 */
const GOLDEN_BROWN_SHEET = [
  '6[etu]0[etu]63[wru]7[wru]34[eti]8[eti]40[wtu]9[wtu]8[wtu]7[wtu]',
  '6[etu]0[etu]63[wru]7[wru]34[eti]8[eti]40[wtu]9[wtu]8[wtu]7[wtu]',
  '6[etu]0[etu]63[wru]7[wru]35[wry]9[wry]54[eti]3[eti]2[eti]1[eti]',
  '2[eyi]4[eyi]65[3tuo][1tuo]2[eyi]4[eyi]65[3tuo][1tuo]',
].join('');

export const PIANO_SONGS: readonly PianoSong[] = [
  {
    id: 'golden-brown',
    title: 'Golden Brown',
    artist: 'The Stranglers',
    bpm: 94,
    summary:
      'El motivo del clavecín, en La menor. Tablatura de la comunidad: el ritmo es aproximado (todos los pasos duran lo mismo).',
    steps: parseVirtualPiano(GOLDEN_BROWN_SHEET),
  },
];

export function findPianoSong(id: string): PianoSong | null {
  return PIANO_SONGS.find((song) => song.id === id) ?? null;
}

/** La nota más grave y la más aguda de la canción. */
export function songRange(song: PianoSong): { low: Midi; high: Midi } {
  const all = song.steps.flatMap((step) => step.notes);
  return { low: Math.min(...all), high: Math.max(...all) };
}

/** Cuánto dura la canción a esa velocidad (1 = normal), en ms. */
export function pianoSongMs(song: PianoSong, factor = 1): number {
  const last = song.steps[song.steps.length - 1];
  if (!last) return 0;
  return ((last.start + last.beats) * 60_000) / (song.bpm * factor);
}

/** Cuándo empieza un paso (ms desde el principio de la canción). */
export function stepStartMs(song: PianoSong, step: PianoStep, factor = 1): number {
  return (step.start * 60_000) / (song.bpm * factor);
}

export function stepLengthMs(song: PianoSong, step: PianoStep, factor = 1): number {
  return (step.beats * 60_000) / (song.bpm * factor);
}

/**
 * ¿Esta nota tocada cuenta para la nota pedida? Por debajo del Do3 el micrófono se equivoca a menudo de
 * octava (el altavoz del teclado casi no da la fundamental): ahí se juzga el nombre, no la octava.
 */
export function pianoNoteMatches(wanted: Midi, played: Midi): boolean {
  if (wanted === played) return true;
  return wanted < 48 && (((wanted - played) % 12) + 12) % 12 === 0;
}
