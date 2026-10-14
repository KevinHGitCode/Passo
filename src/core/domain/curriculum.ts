import type { Midi } from './note';
import { targetOf } from './target';
import type { Finger, Hand, Target } from './target';

/**
 * Contenido de los ejercicios: qué se toca en cada modo y nivel, con qué mano y con qué dedos.
 * Son datos puros; la interfaz no calcula teoría, solo muestra lo que recibe.
 */

export type ExerciseMode = 'notas' | 'terceras' | 'acordes';
export const EXERCISE_MODES: readonly ExerciseMode[] = ['notas', 'terceras', 'acordes'];

export interface LevelDef {
  readonly mode: ExerciseMode;
  readonly level: number;
  /** Qué se practica, en pocas palabras («Las 7 terceras»). */
  readonly title: string;
  readonly hand: Hand;
  readonly pool: readonly Target[];
}

/** Posición de cinco dedos: Do Re Mi Fa Sol con los dedos 1 a 5 de la mano derecha. */
const FIVE_FINGER_FINGERS: readonly Finger[] = [1, 2, 3, 4, 5];
const FIVE_FINGER_NOTES: readonly Midi[] = [60, 62, 64, 65, 67];

function fiveFingerPosition(): Target[] {
  return FIVE_FINGER_NOTES.map((note, i) =>
    targetOf([note], { fingers: [FIVE_FINGER_FINGERS[i] as Finger], hand: 'derecha' }),
  );
}

/** Desplazamientos de las siete teclas blancas desde un Do. */
const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11] as const;
/** Dedos de cada tercera (de grave a agudo), mano derecha; la izquierda es el espejo. */
const THIRD_FINGERS_RIGHT: readonly (readonly [Finger, Finger])[] = [
  [1, 3],
  [2, 4],
  [3, 5],
  [1, 3],
  [2, 4],
  [3, 5],
  [1, 3],
];
const THIRD_FINGERS_LEFT: readonly (readonly [Finger, Finger])[] = [
  [5, 3],
  [4, 2],
  [3, 1],
  [5, 3],
  [4, 2],
  [3, 1],
  [5, 3],
];

/** Las siete terceras de la escala de Do que empiezan en `base` (un Do): Do–Mi, Re–Fa… Si–Re. */
function thirdsFrom(base: Midi, hand: Hand, only?: readonly number[]): Target[] {
  const fingers = hand === 'derecha' ? THIRD_FINGERS_RIGHT : THIRD_FINGERS_LEFT;
  const thirds: Target[] = [];
  for (let i = 0; i < WHITE_OFFSETS.length; i++) {
    if (only && !only.includes(i)) continue;
    const upper = i + 2;
    const low = base + (WHITE_OFFSETS[i] as number);
    const high = base + (WHITE_OFFSETS[upper % 7] as number) + (upper >= 7 ? 12 : 0);
    thirds.push(targetOf([low, high], { fingers: fingers[i] as readonly Finger[], hand }));
  }
  return thirds;
}

function triad(root: Midi, quality: 'mayor' | 'menor', hand: Hand): Target {
  return targetOf([root, root + (quality === 'mayor' ? 4 : 3), root + 7], {
    fingers: hand === 'derecha' ? [1, 3, 5] : [5, 3, 1],
    hand,
    chord: { root, quality },
  });
}

/** Acordes del campo de Do (estado fundamental) en la octava que empieza en `base`. */
function chordsFrom(base: Midi, hand: Hand, names: readonly ChordName[]): Target[] {
  return names.map((name) =>
    triad(base + CHORD_ROOTS[name].offset, CHORD_ROOTS[name].quality, hand),
  );
}

type ChordName = 'Do' | 'Re m' | 'Mi m' | 'Fa' | 'Sol' | 'La m';
const CHORD_ROOTS: Readonly<Record<ChordName, { offset: number; quality: 'mayor' | 'menor' }>> = {
  Do: { offset: 0, quality: 'mayor' },
  'Re m': { offset: 2, quality: 'menor' },
  'Mi m': { offset: 4, quality: 'menor' },
  Fa: { offset: 5, quality: 'mayor' },
  Sol: { offset: 7, quality: 'mayor' },
  'La m': { offset: 9, quality: 'menor' },
};

export const LEVELS: readonly LevelDef[] = [
  {
    mode: 'notas',
    level: 1,
    title: 'Do a Sol · mano derecha',
    hand: 'derecha',
    pool: fiveFingerPosition(),
  },
  {
    mode: 'terceras',
    level: 1,
    title: 'Do–Mi, Re–Fa, Mi–Sol · mano derecha',
    hand: 'derecha',
    pool: thirdsFrom(60, 'derecha', [0, 1, 2]),
  },
  {
    mode: 'terceras',
    level: 2,
    title: 'Las siete terceras · mano derecha',
    hand: 'derecha',
    pool: thirdsFrom(60, 'derecha'),
  },
  {
    mode: 'terceras',
    level: 3,
    title: 'Las siete terceras · mano izquierda',
    hand: 'izquierda',
    pool: thirdsFrom(48, 'izquierda'),
  },
  {
    mode: 'acordes',
    level: 1,
    title: 'Do y Sol mayor · mano derecha',
    hand: 'derecha',
    pool: chordsFrom(60, 'derecha', ['Do', 'Sol']),
  },
  {
    mode: 'acordes',
    level: 2,
    title: 'Do, Fa y Sol mayor · mano derecha',
    hand: 'derecha',
    pool: chordsFrom(60, 'derecha', ['Do', 'Fa', 'Sol']),
  },
  {
    mode: 'acordes',
    level: 3,
    title: 'Con La menor · mano derecha',
    hand: 'derecha',
    pool: chordsFrom(60, 'derecha', ['Do', 'Fa', 'Sol', 'La m']),
  },
  {
    mode: 'acordes',
    level: 4,
    title: 'Con Re y Mi menor · mano derecha',
    hand: 'derecha',
    pool: chordsFrom(60, 'derecha', ['Do', 'Re m', 'Mi m', 'Fa', 'Sol', 'La m']),
  },
  {
    mode: 'acordes',
    level: 5,
    title: 'Los seis acordes · mano izquierda',
    hand: 'izquierda',
    pool: chordsFrom(48, 'izquierda', ['Do', 'Re m', 'Mi m', 'Fa', 'Sol', 'La m']),
  },
];

export function levelsOf(mode: ExerciseMode): readonly LevelDef[] {
  return LEVELS.filter((def) => def.mode === mode);
}

export function findLevel(mode: ExerciseMode, level: number): LevelDef | null {
  return LEVELS.find((def) => def.mode === mode && def.level === level) ?? null;
}

export function isExerciseMode(value: unknown): value is ExerciseMode {
  return typeof value === 'string' && (EXERCISE_MODES as readonly string[]).includes(value);
}
