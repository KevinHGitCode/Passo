import { midiAt } from './instrument';
import type { GuitarString } from './instrument';
import type { Midi } from './note';

/**
 * Las canciones de guitarra: una lista de pasos (una nota o un acorde con su rasgueo) con lo que dura cada
 * uno en pulsos. La app espera a que toques cada paso y mide **cuánto tardaste en llegar a él** frente a lo
 * que tocaba a ese tempo: así dice «va bien», «vas lento» o «el cambio de acorde tardó demasiado».
 */
export type SongStyle = 'melodia' | 'rasgueo';

export const STYLE_LABELS: Readonly<Record<SongStyle, string>> = {
  melodia: 'Melodía',
  rasgueo: 'Rasgueo',
};

/** Una nota suelta, con dónde se toca en el mástil (el MIDI es el sonoro). */
export interface NoteStep {
  readonly kind: 'nota';
  readonly midi: Midi;
  readonly string: GuitarString;
  readonly fret: number;
  readonly beats: number;
  /** Lo que se canta (o se dice) en este paso. */
  readonly lyric: string;
}

/** Un acorde con su rasgueo. */
export interface ChordStep {
  readonly kind: 'acorde';
  readonly chord: string;
  /** Cómo se hace, en una línea (qué dedos y qué cuerdas). */
  readonly shape: string;
  /** El patrón de la mano derecha, p. ej. «↓ ↓↑ ↑↓↑». */
  readonly strum: string;
  /** Las notas que suenan (MIDI sonoro, de la cuerda grave a la aguda): para escuchar la canción. */
  readonly notes: readonly Midi[];
  readonly beats: number;
  readonly lyric: string;
}

export type SongStep = NoteStep | ChordStep;

export interface Song {
  readonly id: string;
  readonly title: string;
  readonly style: SongStyle;
  /** Pulsos por minuto a velocidad normal. */
  readonly bpm: number;
  readonly summary: string;
  readonly steps: readonly SongStep[];
}

const note = (string: GuitarString, fret: number, beats: number, lyric: string): NoteStep => ({
  kind: 'nota',
  midi: midiAt(string, fret),
  string,
  fret,
  beats,
  lyric,
});

const chord = (
  name: string,
  shape: string,
  notes: readonly Midi[],
  strum: string,
  beats: number,
  lyric: string,
): ChordStep => ({ kind: 'acorde', chord: name, shape, strum, notes, beats, lyric });

/**
 * Una melodía escrita como tablatura (seis líneas, de la cuerda 1 a la 6, sin las letras de las cuerdas).
 * Cada columna es el mismo tiempo: una nota dura lo que hay hasta la siguiente (cuatro columnas = un pulso;
 * la última, un pulso). Se leen solo los números; los guiones son silencio entre notas.
 */
const DIGIT = /[0-9]/;

export function stepsFromTab(blocks: readonly (readonly string[])[]): SongStep[] {
  const steps: SongStep[] = [];
  for (const block of blocks) {
    if (block.length !== 6) throw new RangeError('Un bloque de tablatura lleva seis líneas');
    const found: { column: number; string: GuitarString; fret: number }[] = [];
    const width = Math.max(...block.map((line) => line.length));
    for (let column = 0; column < width; column++) {
      for (let index = 0; index < 6; index++) {
        const line = block[index] ?? '';
        const char = line[column] ?? '-';
        if (!DIGIT.test(char) || DIGIT.test(line[column - 1] ?? '-')) continue;
        const fret = Number(/^[0-9]+/.exec(line.slice(column))?.[0]);
        found.push({ column, string: (index + 1) as GuitarString, fret });
        break;
      }
    }
    found.forEach((item, position) => {
      const next = found[position + 1];
      const beats = next ? Math.min(2, Math.max(0.25, (next.column - item.column) / 4)) : 1;
      steps.push(note(item.string, item.fret, beats, ''));
    });
  }
  return steps;
}

const HAPPY_BIRTHDAY: readonly SongStep[] = [
  note(3, 0, 0.75, 'Cum'),
  note(3, 0, 0.25, 'ple'),
  note(3, 2, 1, 'a'),
  note(3, 0, 1, 'ños'),
  note(2, 1, 1, 'fe'),
  note(2, 0, 2, 'liz'),
  note(3, 0, 0.75, 'Te'),
  note(3, 0, 0.25, 'de'),
  note(3, 2, 1, 'se'),
  note(3, 0, 1, 'a'),
  note(2, 3, 1, 'mos a'),
  note(2, 1, 2, 'ti'),
  note(3, 0, 0.75, 'Cum'),
  note(3, 0, 0.25, 'ple'),
  note(1, 3, 1, 'a'),
  note(1, 0, 1, 'ños'),
  note(2, 1, 1, 'que'),
  note(2, 0, 1, 'ri'),
  note(3, 2, 2, 'do'),
  note(1, 1, 0.75, 'Cum'),
  note(1, 1, 0.25, 'ple'),
  note(1, 0, 1, 'a'),
  note(2, 1, 1, 'ños'),
  note(2, 3, 1, 'fe'),
  note(2, 1, 2, 'liz'),
];

const TWINKLE: readonly SongStep[] = (() => {
  const line = (
    notes: readonly (readonly [GuitarString, number])[],
    words: readonly string[],
  ): SongStep[] =>
    notes.map(([string, fret], index) =>
      note(string, fret, index === notes.length - 1 ? 2 : 1, words[index] ?? ''),
    );
  const a = line(
    [
      [2, 1],
      [2, 1],
      [1, 3],
      [1, 3],
      [1, 5],
      [1, 5],
      [1, 3],
    ],
    ['Es', 'tre', 'lli', 'ta', 'dón', 'de', 'es-tás'],
  );
  const b = line(
    [
      [1, 1],
      [1, 1],
      [1, 0],
      [1, 0],
      [2, 3],
      [2, 3],
      [2, 1],
    ],
    ['me', 'pre', 'gun', 'to', 'quién', 'se', 'rás'],
  );
  const c = line(
    [
      [1, 3],
      [1, 3],
      [1, 1],
      [1, 1],
      [1, 0],
      [1, 0],
      [2, 3],
    ],
    ['En', 'el', 'cie', 'lo', 'y', 'en', 'el mar'],
  );
  const d = line(
    [
      [1, 3],
      [1, 3],
      [1, 1],
      [1, 1],
      [1, 0],
      [1, 0],
      [2, 3],
    ],
    ['un', 'dia', 'man', 'te', 'de', 'ver', 'dad'],
  );
  return [...a, ...b, ...c, ...d, ...a, ...b];
})();

/** Introducción y primera frase de la melodía de «Mi corazón encantado» (tablatura de la comunidad). */
const MI_CORAZON: readonly SongStep[] = stepsFromTab([
  [
    '---3-3-----3-5-3---------------------------------',
    '-------5-6-------6-5-3----5-5-----5-6-5----------',
    '------------------------------5-7-------7-5-4-2--',
    '-------------------------------------------------',
    '-------------------------------------------------',
    '-------------------------------------------------',
  ],
  [
    '--------5-3---------------------------',
    '--------------3-5-6-5-3---3----1-0-1--',
    '--2-2-5-----5-----------5-------------',
    '--------------------------------------',
    '--------------------------------------',
    '--------------------------------------',
  ],
  [
    '----------------------------------',
    '----------------------------------',
    '----------------------------------',
    '-----6-5-3---------8-6-5----------',
    '---3-------6-5-6-5-------8-6-8-7--',
    '----------------------------------',
  ],
]);

const G_SHAPE =
  'Dedo 2 en la cuerda 6 (traste 3), dedo 1 en la 5 (traste 2), dedo 3 en la 1 (traste 3). Las seis cuerdas.';
const C_SHAPE =
  'Dedo 3 en la cuerda 5 (traste 3), dedo 2 en la 4 (traste 2), dedo 1 en la 2 (traste 1). De la 5 a la 1.';
const D7_SHAPE =
  'Dedo 2 en la cuerda 3 (traste 2), dedo 1 en la 2 (traste 1), dedo 3 en la 1 (traste 2). De la 4 a la 1.';
const STRUM = '↓ ↓↑ ↑↓↑';
/** G: 3 2 0 0 0 3 · C: x 3 2 0 1 0 · D7: x x 0 2 1 2 (MIDI sonoro, de grave a agudo). */
const G_NOTES: readonly Midi[] = [43, 47, 50, 55, 59, 67];
const C_NOTES: readonly Midi[] = [48, 52, 55, 60, 64];
const D7_NOTES: readonly Midi[] = [50, 57, 60, 66];

const DE_COLORES: readonly SongStep[] = [
  chord('G', G_SHAPE, G_NOTES, STRUM, 4, 'De colores, de colores'),
  chord('C', C_SHAPE, C_NOTES, STRUM, 4, 'se visten los campos'),
  chord('G', G_SHAPE, G_NOTES, STRUM, 4, 'en la primavera'),
  chord('D7', D7_SHAPE, D7_NOTES, STRUM, 4, 'De colores, de colores'),
  chord('G', G_SHAPE, G_NOTES, STRUM, 4, 'son los pajaritos'),
  chord('C', C_SHAPE, C_NOTES, STRUM, 4, 'que vienen de afuera'),
  chord('G', G_SHAPE, G_NOTES, STRUM, 4, 'De colores, de colores'),
  chord('D7', D7_SHAPE, D7_NOTES, STRUM, 4, 'es el arco iris'),
  chord('G', G_SHAPE, G_NOTES, STRUM, 4, 'que vemos lucir'),
];

export const SONGS: readonly Song[] = [
  {
    id: 'cumpleanos-feliz',
    title: 'Cumpleaños feliz',
    style: 'melodia',
    bpm: 90,
    summary: 'La melodía de siempre, en primera posición (cuerdas 1 a 3).',
    steps: HAPPY_BIRTHDAY,
  },
  {
    id: 'mi-corazon-encantado',
    title: 'Mi corazón encantado',
    style: 'melodia',
    bpm: 80,
    summary:
      'El opening de Dragon Ball GT: la introducción y la primera frase. Tablatura de la comunidad (LaCuerda); si algo no suena como la canción, fíate de tu oído.',
    steps: MI_CORAZON,
  },
  {
    id: 'estrellita',
    title: 'Estrellita, ¿dónde estás?',
    style: 'melodia',
    bpm: 80,
    summary: 'Melodía de la canción popular; pasa por el traste 5 de la cuerda 1.',
    steps: TWINKLE,
  },
  {
    id: 'de-colores',
    title: 'De colores (acordes sencillos)',
    style: 'rasgueo',
    bpm: 70,
    summary: 'G, C y D7 con rasgueo: practica el cambio de acorde.',
    steps: DE_COLORES,
  },
];

export function findSong(id: string): Song | null {
  return SONGS.find((song) => song.id === id) ?? null;
}

// ─── La velocidad ──────────────────────────────────────────────────────────────────────────────────

export type SpeedId = 'lento' | 'medio' | 'normal';

export const SPEEDS: readonly {
  readonly id: SpeedId;
  readonly factor: number;
  readonly label: string;
}[] = [
  { id: 'lento', factor: 0.5, label: 'Lento' },
  { id: 'medio', factor: 0.75, label: 'Medio' },
  { id: 'normal', factor: 1, label: 'Normal' },
];

export function speedFactor(speed: SpeedId): number {
  return SPEEDS.find((item) => item.id === speed)?.factor ?? 1;
}

/** Cuánto dura un paso (en ms) a esa velocidad. */
export function stepMs(song: Song, step: SongStep, speed: SpeedId): number {
  return (step.beats * 60_000) / (song.bpm * speedFactor(speed));
}

// ─── El ritmo ──────────────────────────────────────────────────────────────────────────────────────

export type Pace = 'adelantado' | 'a-tiempo' | 'lento' | 'muy-lento';

/** Cuánto se compara lo tardado con lo esperado: dentro del 25 % (o 250 ms) es «a tiempo». */
export function judgePace(expectedMs: number, actualMs: number): { pace: Pace; deltaMs: number } {
  const deltaMs = actualMs - expectedMs;
  const tolerance = Math.max(0.25 * expectedMs, 250);
  const slow = Math.max(0.75 * expectedMs, 700);
  const pace: Pace =
    deltaMs < -tolerance
      ? 'adelantado'
      : deltaMs <= tolerance
        ? 'a-tiempo'
        : deltaMs <= slow
          ? 'lento'
          : 'muy-lento';
  return { pace, deltaMs };
}

/** «0,6 s» (coma decimal, como se escribe en español). */
export function formatSeconds(ms: number): string {
  return `${(Math.abs(ms) / 1000).toFixed(1).replace('.', ',')} s`;
}

const PACE_TEXT: Readonly<Record<SongStep['kind'], Readonly<Record<Pace, string>>>> = {
  nota: {
    adelantado: 'Te adelantaste',
    'a-tiempo': 'Va bien: a tiempo',
    lento: 'Un poco lento en esta nota',
    'muy-lento': 'Muy lento en esta nota',
  },
  acorde: {
    adelantado: 'Cambiaste antes de tiempo',
    'a-tiempo': 'Buen cambio de acorde',
    lento: 'El cambio de acorde fue lento',
    'muy-lento': 'El cambio de acorde tardó demasiado',
  },
};

/** La frase de cada paso: «El cambio de acorde fue lento (+0,8 s)». */
export function paceText(kind: SongStep['kind'], pace: Pace, deltaMs: number): string {
  const base = PACE_TEXT[kind][pace];
  if (pace === 'a-tiempo') return base;
  return `${base} (${deltaMs < 0 ? '−' : '+'}${formatSeconds(deltaMs)})`;
}

export const PACE_MARK: Readonly<Record<Pace, string>> = {
  adelantado: '↑ rápido',
  'a-tiempo': '✓ a tiempo',
  lento: '↓ lento',
  'muy-lento': '↓↓ muy lento',
};

/** Cómo salió un paso: `null` en el primero (no hay con qué compararlo, es donde empieza el tiempo). */
export interface StepResult {
  readonly pace: Pace;
  readonly deltaMs: number;
}

export interface SongSummary {
  readonly total: number;
  readonly onTime: number;
  readonly slow: number;
  readonly fast: number;
  /** Los pasos que más tardaron, de más a menos (como máximo tres). */
  readonly slowest: readonly { readonly index: number; readonly deltaMs: number }[];
  /** Conviene bajar la velocidad: una de cada tres notas o más fue lenta. */
  readonly suggestSlower: boolean;
}

export function summarize(results: readonly (StepResult | null)[]): SongSummary {
  const judged = results.flatMap((result, index) => (result ? [{ index, ...result }] : []));
  const slowSteps = judged.filter((item) => item.pace === 'lento' || item.pace === 'muy-lento');
  return {
    total: judged.length,
    onTime: judged.filter((item) => item.pace === 'a-tiempo').length,
    slow: slowSteps.length,
    fast: judged.filter((item) => item.pace === 'adelantado').length,
    slowest: [...slowSteps]
      .sort((a, b) => b.deltaMs - a.deltaMs)
      .slice(0, 3)
      .map(({ index, deltaMs }) => ({ index, deltaMs })),
    suggestSlower: judged.length > 0 && slowSteps.length * 3 >= judged.length,
  };
}

// ─── Escuchar la canción ───────────────────────────────────────────────────────────────────────────

/** Un instante de la canción sonando: una nota que empieza o acaba, o el paso que va por su turno. */
export type PreviewEvent =
  | { readonly at: number; readonly type: 'paso'; readonly index: number }
  | { readonly at: number; readonly type: 'on'; readonly midi: Midi; readonly velocity: number }
  | { readonly at: number; readonly type: 'off'; readonly midi: Midi };

/** Los golpes del rasgueo «↓ ↓↑ ↑↓↑» dentro de un compás de cuatro pulsos (en pulsos). */
const STRUM_BEATS = [0, 1, 1.5, 2.5, 3, 3.5];
const STRUM_SPREAD_MS = 22;

/** La canción como una lista de instantes (en ms desde el inicio), a la velocidad elegida. */
export function previewEvents(song: Song, speed: SpeedId): PreviewEvent[] {
  const events: PreviewEvent[] = [];
  let start = 0;
  song.steps.forEach((step, index) => {
    const duration = stepMs(song, step, speed);
    events.push({ at: start, type: 'paso', index });
    if (step.kind === 'nota') {
      events.push({ at: start, type: 'on', midi: step.midi, velocity: 90 });
      events.push({ at: start + duration * 0.92, type: 'off', midi: step.midi });
    } else {
      const strokes =
        (step.strum.match(/[↓↑]/g) ?? []).length === STRUM_BEATS.length
          ? (step.strum.match(/[↓↑]/g) ?? [])
          : ['↓'];
      strokes.forEach((stroke, position) => {
        const beat = strokes.length === STRUM_BEATS.length ? (STRUM_BEATS[position] ?? 0) : 0;
        const at = start + (beat / 4) * duration;
        // Hacia abajo, de la cuerda grave a la aguda; hacia arriba, solo las agudas y al revés.
        const notes = stroke === '↓' ? step.notes : [...step.notes].slice(-4).reverse();
        notes.forEach((midi, order) => {
          const when = at + order * STRUM_SPREAD_MS;
          events.push({ at: when, type: 'on', midi, velocity: stroke === '↓' ? 90 : 65 });
          events.push({ at: Math.min(start + duration * 0.95, when + 700), type: 'off', midi });
        });
      });
    }
    start += duration;
  });
  return events.sort((a, b) => a.at - b.at);
}

/** Lo que dura la canción entera a esa velocidad (ms). */
export function songDurationMs(song: Song, speed: SpeedId): number {
  return song.steps.reduce((sum, step) => sum + stepMs(song, step, speed), 0);
}

/** ¿Este sonido cuenta para el paso? Una nota se juzga por su nombre (no la octava); un acorde, por oírse algo. */
export function stepMatches(step: SongStep, midi: Midi): boolean {
  return step.kind === 'acorde' || ((midi % 12) + 12) % 12 === ((step.midi % 12) + 12) % 12;
}
