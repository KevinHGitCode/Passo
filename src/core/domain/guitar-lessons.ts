import { firstPosition, midiAt } from './instrument';
import type { FretPosition, GuitarString } from './instrument';
import { lessonsOf } from './lesson-model';
import type { Midi } from './note';
import type { LessonKind, LessonSpec, Unit } from './lesson-model';
import { targetOf } from './target';
import type { Target } from './target';

/**
 * El camino de guitarra, etapa 1: notas sueltas, solo naturales y hasta el traste 3 (17 notas, de Mi2 a
 * Sol4). Cada objetivo trae su posición en el mástil (cuerda, traste y dedo), pero lo que se juzga es el
 * nombre de la nota (ver `RoundConfig.octaveFree`).
 */

/** Una nota en el mástil: cuerda y traste, con el dedo que corresponde en primera posición. */
function fret(string: GuitarString, position: number): Target {
  return targetOf([midiAt(string, position)], { positions: [firstPosition(string, position)] });
}

const opens = (strings: readonly GuitarString[]): Target[] =>
  strings.map((string) => fret(string, 0));

/** Las notas naturales de una cuerda, en los trastes dados. */
const onString = (string: GuitarString, frets: readonly number[]): Target[] =>
  frets.map((position) => fret(string, position));

const STRING_1 = onString(1, [0, 1, 3]); // Mi Fa Sol
const STRING_2 = onString(2, [0, 1, 3]); // Si Do Re
const STRING_3 = onString(3, [0, 2]); // Sol La
const STRING_4 = onString(4, [0, 2, 3]); // Re Mi Fa
const STRING_5 = onString(5, [0, 2, 3]); // La Si Do
const STRING_6 = onString(6, [0, 1, 3]); // Mi Fa Sol

const ALL_OPEN = opens([1, 2, 3, 4, 5, 6]);
const FIRST_TWO_STRINGS = [...STRING_1, ...STRING_2];
const ALL_NOTES = [...STRING_1, ...STRING_2, ...STRING_3, ...STRING_4, ...STRING_5, ...STRING_6];

/** Dónde se toca una de las 17 notas del camino (la misma nota no se repite entre cuerdas). */
const POSITIONS = new Map<Midi, FretPosition>(
  ALL_NOTES.flatMap((target) => {
    const position = target.positions[0];
    return position ? [[target.notes[0], position] as const] : [];
  }),
);

export function guitarPositionOf(midi: Midi): FretPosition | null {
  return POSITIONS.get(midi) ?? null;
}

// ─── Ritmo objetivo (notas/min) ─────────────────────────────────────────────────────────────────

const RHYTHM_FRETTED: Readonly<Record<LessonKind, number>> = { nueva: 8, repaso: 10, prueba: 12 };
const RHYTHM_ALL_STRINGS: Readonly<Record<LessonKind, number>> = {
  nueva: 9,
  repaso: 11,
  prueba: 13,
};

const fretted = (kind: LessonKind): number => RHYTHM_FRETTED[kind];
const allStrings = (kind: LessonKind): number => RHYTHM_ALL_STRINGS[kind];

const U1_SPECS: readonly LessonSpec[] = [
  { kind: 'nueva', title: 'Mi · Si · Sol', pool: opens([1, 2, 3]) },
  { kind: 'nueva', title: 'Si · Sol · Re', pool: opens([2, 3, 4]) },
  { kind: 'nueva', title: 'Sol · Re · La', pool: opens([3, 4, 5]) },
  { kind: 'nueva', title: 'Re · La · Mi', pool: opens([4, 5, 6]) },
  { kind: 'repaso', title: 'Repaso: las 6 cuerdas', pool: ALL_OPEN },
  { kind: 'prueba', title: 'Prueba: las 6 cuerdas', pool: ALL_OPEN },
];

export const GUITAR_UNITS: readonly Unit[] = [
  {
    id: 'g1',
    requires: [],
    number: 1,
    title: 'Cuerdas al aire',
    summary: 'Las seis cuerdas sin pisar: Mi, Si, Sol, Re, La y Mi grave.',
    optional: false,
    // En la unidad 1 el ritmo se muestra pero no se exige para la 3.ª estrella.
    lessons: lessonsOf('g1', U1_SPECS, () => null, 'guitarra'),
  },
  {
    id: 'g2',
    requires: ['g1'],
    number: 2,
    title: 'Primeras notas',
    summary: 'Cuerdas 1 y 2 con el índice y el anular: Fa, Sol, Do y Re.',
    optional: false,
    lessons: lessonsOf(
      'g2',
      [
        { kind: 'nueva', title: 'Mi · Fa · Sol', pool: STRING_1 },
        { kind: 'nueva', title: 'Si · Do · Re', pool: STRING_2 },
        { kind: 'repaso', title: 'Repaso: cuerdas 1 y 2', pool: FIRST_TWO_STRINGS },
        { kind: 'prueba', title: 'Prueba: cuerdas 1 y 2', pool: FIRST_TWO_STRINGS },
      ],
      fretted,
      'guitarra',
    ),
  },
  {
    id: 'g3',
    requires: ['g1'],
    number: 3,
    title: 'Todas las cuerdas',
    summary: 'Primera posición: de la cuerda 6 a la 1, hasta el traste 3.',
    optional: false,
    lessons: lessonsOf(
      'g3',
      [
        { kind: 'nueva', title: 'Cuerdas 3 y 4', pool: [...STRING_3, ...STRING_4] },
        { kind: 'nueva', title: 'Cuerdas 5 y 6', pool: [...STRING_5, ...STRING_6] },
        { kind: 'repaso', title: 'Repaso: las 17 notas', pool: ALL_NOTES },
        { kind: 'prueba', title: 'Prueba: las 17 notas', pool: ALL_NOTES },
      ],
      allStrings,
      'guitarra',
    ),
  },
];
