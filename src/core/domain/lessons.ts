import { LEVELS } from './curriculum';
import type { ExerciseMode } from './curriculum';
import type { RoundConfig } from './exercise';
import { INSTRUMENTS } from './instrument';
import type { Instrument } from './instrument';
import { LESSON_LEVEL, lessonsOf } from './lesson-model';
import type { Lesson, LessonKind, LessonSpec, Unit } from './lesson-model';
import type { Midi } from './note';
import type { InputSource } from './note-event';
import { targetOf } from './target';
import type { Finger, Hand, Target } from './target';

/**
 * El camino de aprendizaje del piano: unidades con lecciones cortas (2–4 minutos). Son datos puros; la
 * interfaz solo los muestra. Una lección es una ronda con **su propio conjunto de objetivos** (a
 * diferencia de un nivel de práctica libre, que usa todo el conjunto del nivel).
 */

export { LESSON_LEVEL, LESSON_ROUND_SIZE } from './lesson-model';
export type { Lesson, LessonKind, LessonSpec, Unit } from './lesson-model';

/** Una tercera o un acorde cuesta más que una nota: rondas de 12. */
const GROUP_LESSON_ROUND_SIZE = 12;

// ─── Constructores de objetivos ─────────────────────────────────────────────────────────────────

function note(midi: Midi, finger: Finger, hand: Hand): Target {
  return targetOf([midi], { fingers: [finger], hand });
}

/** Cinco teclas blancas con los dedos 1 a 5 de la mano derecha (grave → agudo). */
function rightPosition(notes: readonly [Midi, Midi, Midi, Midi, Midi]): Target[] {
  return notes.map((midi, i) => note(midi, (i + 1) as Finger, 'derecha'));
}

/** Notas sueltas sin dedos (conjuntos que mezclan posiciones: la mano se mueve). */
function loose(notes: readonly Midi[], hand: Hand): Target[] {
  return notes.map((midi) => targetOf([midi], { hand }));
}

const RIGHT_C = rightPosition([60, 62, 64, 65, 67]); // Do Re Mi Fa Sol
const RIGHT_G = rightPosition([67, 69, 71, 72, 74]); // Sol La Si Do Re
const RIGHT_D = rightPosition([62, 64, 65, 67, 69]); // Re Mi Fa Sol La
const RIGHT_A = rightPosition([69, 71, 72, 74, 76]); // La Si Do Re Mi
const RIGHT_E = rightPosition([64, 65, 67, 69, 71]); // Mi Fa Sol La Si

/** Mano izquierda sobre el Do central: el pulgar en Do4 y el meñique en Fa3. */
const LEFT_CENTRAL: readonly Target[] = [
  note(53, 5, 'izquierda'),
  note(55, 4, 'izquierda'),
  note(57, 3, 'izquierda'),
  note(59, 2, 'izquierda'),
  note(60, 1, 'izquierda'),
];

const pick = (pool: readonly Target[], notes: readonly Midi[]): Target[] =>
  pool.filter((target) => notes.includes(target.notes[0]));

/** Dedos 1-3-5 sobre las notas de un acorde (sueltas): puente hacia los acordes. */
function chordNotes(a: Midi, b: Midi, c: Midi): Target[] {
  return [note(a, 1, 'derecha'), note(b, 3, 'derecha'), note(c, 5, 'derecha')];
}

function levelPool(mode: ExerciseMode, level: number): readonly Target[] {
  const def = LEVELS.find((item) => item.mode === mode && item.level === level);
  if (!def) throw new Error(`Falta el nivel ${mode} ${level}`);
  return def.pool;
}

// ─── Ritmo objetivo (notas/min) ─────────────────────────────────────────────────────────────────

const RHYTHM_BASIC: Readonly<Record<LessonKind, number>> = { nueva: 12, repaso: 15, prueba: 18 };
const RHYTHM_MOVING: Readonly<Record<LessonKind, number>> = { nueva: 14, repaso: 18, prueba: 20 };
const RHYTHM_THIRDS = 16;
const RHYTHM_CHORDS = 18;

// ─── Lecciones ──────────────────────────────────────────────────────────────────────────────────

const basic = (kind: LessonKind): number => RHYTHM_BASIC[kind];
const moving = (kind: LessonKind): number => RHYTHM_MOVING[kind];

/** Repaso de la unidad 3: de Re4 a Mi5, sin dedos (la mano cambia de posición). */
const U3_REVIEW = loose([62, 64, 65, 67, 69, 71, 72, 74, 76], 'derecha');
/** Prueba de la unidad 3: de Do4 a Re5. */
const U3_EXAM = loose([60, 62, 64, 65, 67, 69, 71, 72, 74], 'derecha');
/** Notas de los acordes Do, Sol, Fa y La menor, sin dedos. */
const U4_ALL = loose([60, 64, 65, 67, 69, 71, 72, 74, 76], 'derecha');
/** Fa3 a Sol4: la izquierda hasta Si3 y la derecha desde Do4. */
const U5_ALL = [...pick(LEFT_CENTRAL, [53, 55, 57, 59]), ...RIGHT_C];

const U6_SPECS: readonly LessonSpec[] = [
  {
    mode: 'terceras',
    kind: 'nueva',
    title: 'Terceras: Do–Mi, Re–Fa, Mi–Sol',
    pool: levelPool('terceras', 1),
  },
  { mode: 'terceras', kind: 'nueva', title: 'Las siete terceras', pool: levelPool('terceras', 2) },
  {
    mode: 'terceras',
    kind: 'nueva',
    title: 'Terceras con la mano izquierda',
    pool: levelPool('terceras', 3),
  },
  { mode: 'acordes', kind: 'nueva', title: 'Acordes: Do y Sol', pool: levelPool('acordes', 1) },
  { mode: 'acordes', kind: 'nueva', title: 'Acordes: Do, Fa y Sol', pool: levelPool('acordes', 2) },
  { mode: 'acordes', kind: 'nueva', title: 'Con La menor', pool: levelPool('acordes', 3) },
  { mode: 'acordes', kind: 'nueva', title: 'Los seis acordes', pool: levelPool('acordes', 4) },
  {
    mode: 'acordes',
    kind: 'prueba',
    title: 'Acordes con la mano izquierda',
    pool: levelPool('acordes', 5),
  },
];

export const UNITS: readonly Unit[] = [
  {
    id: 'u1',
    requires: [],
    number: 1,
    title: 'Mano derecha: Do a Sol',
    summary: 'Cinco teclas, cinco dedos: la posición de Do.',
    optional: false,
    lessons: lessonsOf(
      'u1',
      [
        { kind: 'nueva', title: 'Do · Re · Mi', pool: pick(RIGHT_C, [60, 62, 64]) },
        { kind: 'nueva', title: 'Mi · Fa · Sol', pool: pick(RIGHT_C, [64, 65, 67]) },
        { kind: 'repaso', title: 'Repaso: Do a Sol', pool: RIGHT_C },
        { kind: 'prueba', title: 'Prueba: Do a Sol', pool: RIGHT_C },
      ],
      // En la unidad 1 el ritmo se muestra pero no se exige para la 3.ª estrella.
      () => null,
    ),
  },
  {
    id: 'u2',
    requires: ['u1'],
    number: 2,
    title: 'Mano izquierda: el Do central',
    summary: 'El pulgar en Do4 y el meñique en Fa3.',
    optional: false,
    lessons: lessonsOf(
      'u2',
      [
        { kind: 'nueva', title: 'Do · Si · La', pool: pick(LEFT_CENTRAL, [60, 59, 57]) },
        { kind: 'nueva', title: 'La · Sol · Fa', pool: pick(LEFT_CENTRAL, [57, 55, 53]) },
        { kind: 'repaso', title: 'Repaso: Fa3 a Do4', pool: LEFT_CENTRAL },
        { kind: 'prueba', title: 'Prueba: Fa3 a Do4', pool: LEFT_CENTRAL },
      ],
      basic,
    ),
  },
  {
    id: 'u3',
    requires: ['u1'],
    number: 3,
    title: 'Mover la mano',
    summary: 'Otras posiciones sobre las teclas blancas.',
    optional: false,
    lessons: lessonsOf(
      'u3',
      [
        { kind: 'nueva', title: 'Posición de Re', pool: RIGHT_D },
        { kind: 'nueva', title: 'Posición de Mi', pool: RIGHT_E },
        { kind: 'nueva', title: 'Posición de Sol', pool: RIGHT_G },
        { kind: 'nueva', title: 'Posición de La', pool: RIGHT_A },
        { kind: 'repaso', title: 'Repaso: las cuatro posiciones', pool: U3_REVIEW },
        { kind: 'prueba', title: 'Prueba: Do4 a Re5', pool: U3_EXAM },
      ],
      moving,
    ),
  },
  {
    id: 'u4',
    requires: ['u3'],
    number: 4,
    title: 'Notas de acorde',
    summary: 'Las notas de Do, Sol, Fa y La menor, de una en una (dedos 1-3-5).',
    optional: false,
    lessons: lessonsOf(
      'u4',
      [
        { kind: 'nueva', title: 'Do · Mi · Sol', pool: chordNotes(60, 64, 67) },
        { kind: 'nueva', title: 'Sol · Si · Re', pool: chordNotes(67, 71, 74) },
        { kind: 'nueva', title: 'Fa · La · Do', pool: chordNotes(65, 69, 72) },
        { kind: 'nueva', title: 'La · Do · Mi', pool: chordNotes(69, 72, 76) },
        {
          kind: 'repaso',
          title: 'Repaso: notas de acorde',
          pool: U4_ALL,
        },
        {
          kind: 'prueba',
          title: 'Prueba: notas de acorde',
          pool: U4_ALL,
        },
      ],
      moving,
    ),
  },
  {
    id: 'u5',
    requires: ['u2', 'u4'],
    number: 5,
    title: 'Las dos manos',
    summary: 'De Fa3 a Sol4: la izquierda abajo y la derecha arriba.',
    optional: false,
    lessons: lessonsOf(
      'u5',
      [
        {
          kind: 'nueva',
          title: 'Si · Do · Re',
          pool: [...pick(LEFT_CENTRAL, [59]), ...pick(RIGHT_C, [60, 62])],
        },
        { kind: 'nueva', title: 'Fa3 a Sol4, las dos manos', pool: U5_ALL },
        { kind: 'repaso', title: 'Repaso: Fa3 a Sol4', pool: U5_ALL },
        { kind: 'prueba', title: 'Prueba: Fa3 a Sol4', pool: U5_ALL },
      ],
      moving,
    ),
  },
  {
    id: 'u6',
    requires: ['u5'],
    number: 6,
    title: 'Terceras y acordes',
    summary: 'Dos y tres teclas a la vez. Con micrófono necesitas la beta de varias notas.',
    optional: true,
    lessons: lessonsOf(
      'u6',
      U6_SPECS.map((spec) => ({
        ...spec,
        roundSize: GROUP_LESSON_ROUND_SIZE,
        rhythmGoal: spec.mode === 'terceras' ? RHYTHM_THIRDS : RHYTHM_CHORDS,
      })),
      () => null,
    ),
  },
];

/** Las lecciones del piano (el catálogo de siempre). */
export const LESSONS: readonly Lesson[] = UNITS.flatMap((unit) => unit.lessons);

/** Las unidades de cada instrumento. */
const COURSES: Readonly<Record<Instrument, readonly Unit[]>> = {
  piano: UNITS,
  guitarra: [],
};

export function unitsOf(instrument: Instrument): readonly Unit[] {
  return COURSES[instrument];
}

export function lessonsFor(instrument: Instrument): readonly Lesson[] {
  return unitsOf(instrument).flatMap((unit) => unit.lessons);
}

/** Las lecciones de todos los instrumentos (los ids no se repiten entre ellos). */
export const ALL_LESSONS: readonly Lesson[] = INSTRUMENTS.flatMap(lessonsFor);
const ALL_UNITS: readonly Unit[] = INSTRUMENTS.flatMap(unitsOf);

export function findLesson(id: string): Lesson | null {
  return ALL_LESSONS.find((lesson) => lesson.id === id) ?? null;
}

export function findUnit(id: string): Unit | null {
  return ALL_UNITS.find((unit) => unit.id === id) ?? null;
}

/** La configuración de ronda de una lección. */
export function lessonConfig(lesson: Lesson): RoundConfig {
  return {
    mode: lesson.mode,
    level: LESSON_LEVEL,
    pool: lesson.pool,
    roundSize: lesson.roundSize,
    // Cobertura de notas, salvo en el repaso armado al momento (sus teclas débiles se repiten a propósito).
    coverage: lesson.dynamic !== true,
    instrument: lesson.instrument,
  };
}

/** Cuántos objetivos distintos tiene la lección (para decir «n notas»). */
export function lessonNoteCount(lesson: Lesson): number {
  return new Set(lesson.pool.map((target) => target.notes.join('-'))).size;
}

// ─── Disponibilidad según la entrada ────────────────────────────────────────────────────────────

export type PlayBlock = 'necesita-varias-notas';

export interface PlayContext {
  /** Entradas con las que se puede tocar ahora (la elegida; en modo de desarrollo, todas las pedidas). */
  readonly sources: readonly InputSource[];
  /** La beta «oír varias notas a la vez» del micrófono está activada. */
  readonly polyphonicMic: boolean;
}

/**
 * Con el micrófono solo se juzgan notas sueltas, salvo con la beta. Terceras y acordes piden piano
 * MIDI, teclado del PC o la beta. Devuelve `null` si se puede tocar.
 */
export function playBlock(lesson: Lesson, context: PlayContext): PlayBlock | null {
  if (lesson.mode === 'notas') return null;
  if (context.sources.some((source) => source !== 'microfono')) return null;
  return context.polyphonicMic ? null : 'necesita-varias-notas';
}

// ─── Estado en el camino ────────────────────────────────────────────────────────────────────────

export type LessonAccess = 'hecha' | 'abierta' | 'bloqueada';

/** Estrellas mínimas en la prueba de una unidad para saltar a la siguiente sin completar todo. */
export const SKIP_STARS = 2;

/**
 * Qué lecciones están hechas (≥ 1 estrella), abiertas o bloqueadas. Desbloqueo lineal: se abre la
 * siguiente al completar la anterior, y la unidad siguiente al completar todas las de la anterior.
 * «Saltar con prueba»: la prueba de cada unidad está abierta desde que se llega a ella, y con ≥ 2
 * estrellas en ella se abre todo lo de la unidad y la unidad siguiente. Se **deriva** de las
 * estrellas; no se guarda.
 */
export function lessonAccessMap(
  starsOf: (lessonId: string) => number,
  units: readonly Unit[] = UNITS,
): Map<string, LessonAccess> {
  const access = new Map<string, LessonAccess>();
  const cleared = new Set<string>();
  for (const unit of units) {
    const reached = unit.requires.every((id) => cleared.has(id));
    const exam = unit.lessons.find((lesson) => lesson.kind === 'prueba');
    const examPassed = exam !== undefined && starsOf(exam.id) >= SKIP_STARS;
    unit.lessons.forEach((lesson, index) => {
      if (starsOf(lesson.id) >= 1) {
        access.set(lesson.id, 'hecha');
        return;
      }
      const previous = unit.lessons[index - 1];
      const open =
        reached &&
        (index === 0 ||
          (previous !== undefined && starsOf(previous.id) >= 1) ||
          examPassed ||
          lesson.kind === 'prueba');
      access.set(lesson.id, open ? 'abierta' : 'bloqueada');
    });
    if (unit.lessons.every((lesson) => starsOf(lesson.id) >= 1) || examPassed) cleared.add(unit.id);
  }
  return access;
}

/**
 * La primera lección abierta sin hacer: dónde sigue el camino. Las lecciones de una unidad que ya se
 * saltó con la prueba (≥ 2 estrellas) quedan abiertas pero no son «la siguiente». `null` si todo está hecho.
 */
export function currentLesson(
  access: ReadonlyMap<string, LessonAccess>,
  starsOf: (lessonId: string) => number,
  units: readonly Unit[] = UNITS,
): Lesson | null {
  const skipped = new Set(
    units
      .filter((unit) => {
        const exam = unit.lessons.find((lesson) => lesson.kind === 'prueba');
        return exam !== undefined && starsOf(exam.id) >= SKIP_STARS;
      })
      .map((unit) => unit.id),
  );
  return (
    units
      .flatMap((unit) => unit.lessons)
      .find((lesson) => access.get(lesson.id) === 'abierta' && !skipped.has(lesson.unitId)) ?? null
  );
}
