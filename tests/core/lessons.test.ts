import { findLevel } from '@/core/domain/curriculum';
import {
  LESSONS,
  LESSON_LEVEL,
  LESSON_ROUND_SIZE,
  SKIP_STARS,
  UNITS,
  currentLesson,
  findLesson,
  findUnit,
  lessonAccessMap,
  lessonConfig,
  lessonNoteCount,
  playBlock,
} from '@/core/domain/lessons';
import { isBlackKey } from '@/core/domain/note';

const stars = (done: Record<string, number>) => (id: string) => done[id] ?? 0;

const lessonById = (id: string) => {
  const found = findLesson(id);
  if (!found) throw new Error(`Falta la lección ${id}`);
  return found;
};

describe('el camino de lecciones', () => {
  it('hay seis unidades numeradas y solo la última es opcional', () => {
    expect(UNITS.map((unit) => unit.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(UNITS.filter((unit) => unit.optional).map((unit) => unit.id)).toEqual(['u6']);
  });

  it('los identificadores son únicos y siguen el patrón u<unidad>-<n>', () => {
    expect(new Set(LESSONS.map((lesson) => lesson.id)).size).toBe(LESSONS.length);
    for (const unit of UNITS) {
      unit.lessons.forEach((lesson, index) => {
        expect(lesson.id).toBe(`${unit.id}-${index + 1}`);
        expect(lesson.unitId).toBe(unit.id);
      });
    }
  });

  it('las unidades de notas terminan en repaso y prueba', () => {
    for (const unit of UNITS.filter((item) => !item.optional)) {
      const kinds = unit.lessons.map((lesson) => lesson.kind);
      expect(kinds.slice(-2), unit.id).toEqual(['repaso', 'prueba']);
    }
  });

  it('las lecciones de notas tienen al menos tres notas distintas y rondas de 10, 14 o 20', () => {
    for (const lesson of LESSONS.filter((item) => item.mode === 'notas')) {
      expect(lessonNoteCount(lesson), lesson.id).toBeGreaterThanOrEqual(3);
      expect(lesson.roundSize, lesson.id).toBe(LESSON_ROUND_SIZE[lesson.kind]);
    }
  });

  it('todo objetivo es válido: una nota blanca de Fa3 a Mi5 y de una sola mano', () => {
    for (const lesson of LESSONS.filter((item) => item.mode === 'notas')) {
      for (const target of lesson.pool) {
        const where = `${lesson.id} ${target.notes.join('-')}`;
        expect(target.notes, where).toHaveLength(1);
        expect(isBlackKey(target.notes[0]), where).toBe(false);
        expect(target.notes[0], where).toBeGreaterThanOrEqual(53);
        expect(target.notes[0], where).toBeLessThanOrEqual(76);
        expect(target.hand, where).not.toBeNull();
        // Con dedos, uno por nota y entre 1 y 5.
        if (target.fingers.length > 0) {
          expect(target.fingers, where).toHaveLength(1);
          expect([1, 2, 3, 4, 5], where).toContain(target.fingers[0]);
        }
      }
    }
  });

  it('la mano derecha sube con los dedos 1 a 5 y la izquierda baja con 5 a 1', () => {
    const fingersByNote = (id: string) =>
      Object.fromEntries(
        (findLesson(id)?.pool ?? []).map((target) => [target.notes[0], target.fingers[0]]),
      );
    expect(fingersByNote('u1-3')).toEqual({ 60: 1, 62: 2, 64: 3, 65: 4, 67: 5 });
    expect(fingersByNote('u2-3')).toEqual({ 53: 5, 55: 4, 57: 3, 59: 2, 60: 1 });
    expect(fingersByNote('u3-1')).toEqual({ 62: 1, 64: 2, 65: 3, 67: 4, 69: 5 });
    expect(fingersByNote('u3-3')).toEqual({ 67: 1, 69: 2, 71: 3, 72: 4, 74: 5 });
  });

  it('las lecciones que mezclan posiciones no muestran dedos (la mano se mueve)', () => {
    for (const id of ['u3-5', 'u3-6', 'u4-5', 'u4-6']) {
      const lesson = findLesson(id);
      expect(
        lesson?.pool.every((target) => target.fingers.length === 0),
        id,
      ).toBe(true);
    }
  });

  it('la unidad 5 mezcla las dos manos entre Fa3 y Sol4', () => {
    const pool = findLesson('u5-4')?.pool ?? [];
    expect(pool.map((target) => target.notes[0])).toEqual([53, 55, 57, 59, 60, 62, 64, 65, 67]);
    expect(pool.filter((target) => target.hand === 'izquierda')).toHaveLength(4);
    expect(pool.filter((target) => target.hand === 'derecha')).toHaveLength(5);
  });

  it('la unidad 6 reutiliza los conjuntos de terceras y acordes de la práctica libre', () => {
    const u6 = findUnit('u6');
    expect(u6?.lessons).toHaveLength(8);
    expect(u6?.lessons[1]?.pool).toBe(findLevel('terceras', 2)?.pool);
    expect(u6?.lessons[7]?.pool).toBe(findLevel('acordes', 5)?.pool);
    for (const lesson of u6?.lessons ?? []) expect(lesson.mode).not.toBe('notas');
  });

  it('el ritmo objetivo: ninguno en la unidad 1, creciente por tipo en las demás', () => {
    for (const lesson of findUnit('u1')?.lessons ?? []) expect(lesson.rhythmGoal).toBeNull();
    expect(findUnit('u2')?.lessons.map((lesson) => lesson.rhythmGoal)).toEqual([12, 12, 15, 18]);
    expect(findUnit('u3')?.lessons.map((lesson) => lesson.rhythmGoal)).toEqual([
      14, 14, 14, 14, 18, 20,
    ]);
    expect(findUnit('u6')?.lessons[0]?.rhythmGoal).toBe(16);
    expect(findUnit('u6')?.lessons[3]?.rhythmGoal).toBe(18);
  });

  it('busca lecciones y unidades por su identificador', () => {
    expect(findLesson('u1-1')?.title).toBe('Do · Re · Mi');
    expect(findLesson('nada')).toBeNull();
    expect(findUnit('u2')?.title).toContain('izquierda');
    expect(findUnit('u9')).toBeNull();
  });

  it('la configuración de ronda lleva el conjunto de la lección y nivel de lección', () => {
    const lesson = findLesson('u3-6');
    expect(lesson).not.toBeNull();
    if (!lesson) return;
    expect(lessonConfig(lesson)).toEqual({
      mode: 'notas',
      level: LESSON_LEVEL,
      pool: lesson.pool,
      roundSize: 20,
      coverage: true,
    });
  });
});

describe('qué se puede tocar según la entrada', () => {
  const notes = lessonById('u1-1');
  const thirds = lessonById('u6-1');
  const chords = lessonById('u6-5');

  it('las notas sueltas se tocan con cualquier entrada', () => {
    for (const sources of [['microfono'], ['midi'], ['teclado-pc']] as const) {
      expect(playBlock(notes, { sources, polyphonicMic: false })).toBeNull();
    }
  });

  it('terceras y acordes con micrófono piden la beta de varias notas', () => {
    expect(playBlock(thirds, { sources: ['microfono'], polyphonicMic: false })).toBe(
      'necesita-varias-notas',
    );
    expect(playBlock(chords, { sources: ['microfono'], polyphonicMic: false })).toBe(
      'necesita-varias-notas',
    );
    expect(playBlock(chords, { sources: ['microfono'], polyphonicMic: true })).toBeNull();
  });

  it('con piano MIDI o teclado del PC no hace falta la beta', () => {
    expect(playBlock(chords, { sources: ['midi'], polyphonicMic: false })).toBeNull();
    expect(playBlock(thirds, { sources: ['teclado-pc'], polyphonicMic: false })).toBeNull();
  });

  it('en modo de desarrollo (varias entradas) basta con que una no sea el micrófono', () => {
    expect(
      playBlock(chords, { sources: ['microfono', 'teclado-pc'], polyphonicMic: false }),
    ).toBeNull();
  });
});

describe('estado de cada lección en el camino', () => {
  it('al empezar está abierta la primera lección y la prueba de la unidad (saltar con prueba)', () => {
    const access = lessonAccessMap(stars({}));
    expect(access.get('u1-1')).toBe('abierta');
    expect(access.get('u1-2')).toBe('bloqueada');
    expect(access.get('u1-3')).toBe('bloqueada');
    expect(access.get('u1-4')).toBe('abierta');
    expect(access.get('u2-1')).toBe('bloqueada');
    expect(access.get('u2-4')).toBe('bloqueada');
    expect(currentLesson(access, stars({}))?.id).toBe('u1-1');
  });

  it('completar una lección (1 estrella) abre la siguiente', () => {
    const access = lessonAccessMap(stars({ 'u1-1': 1 }));
    expect(access.get('u1-1')).toBe('hecha');
    expect(access.get('u1-2')).toBe('abierta');
    expect(access.get('u1-3')).toBe('bloqueada');
    expect(currentLesson(access, stars({ 'u1-1': 1 }))?.id).toBe('u1-2');
  });

  it('completar todas las lecciones de una unidad abre la siguiente', () => {
    const access = lessonAccessMap(stars({ 'u1-1': 3, 'u1-2': 2, 'u1-3': 1, 'u1-4': 1 }));
    expect(access.get('u2-1')).toBe('abierta');
    expect(access.get('u2-2')).toBe('bloqueada');
    expect(access.get('u2-4')).toBe('abierta');
  });

  it('«saltar con prueba»: 2 estrellas en la prueba abren la unidad entera y la siguiente', () => {
    expect(SKIP_STARS).toBe(2);
    const access = lessonAccessMap(stars({ 'u1-4': 2 }));
    expect(access.get('u1-4')).toBe('hecha');
    expect(access.get('u1-2')).toBe('abierta');
    expect(access.get('u1-3')).toBe('abierta');
    expect(access.get('u2-1')).toBe('abierta');
    expect(access.get('u2-2')).toBe('bloqueada');
    // La unidad saltada con la prueba queda abierta pero ya no es «la siguiente»: sigue la unidad 2.
    expect(currentLesson(access, stars({ 'u1-4': 2 }))?.id).toBe('u2-1');
  });

  it('con 1 sola estrella en la prueba, sin hacer las demás, la unidad siguiente sigue cerrada', () => {
    const access = lessonAccessMap(stars({ 'u1-4': 1 }));
    expect(access.get('u1-4')).toBe('hecha');
    expect(access.get('u1-2')).toBe('bloqueada');
    expect(access.get('u2-1')).toBe('bloqueada');
  });

  it('la unidad opcional (6) se abre como las demás al terminar la 5', () => {
    const upToFive = Object.fromEntries(
      LESSONS.filter((lesson) => lesson.unitId !== 'u6').map((lesson) => [lesson.id, 1]),
    );
    const access = lessonAccessMap(stars(upToFive));
    expect(access.get('u6-1')).toBe('abierta');
    expect(access.get('u6-2')).toBe('bloqueada');
  });

  it('las unidades 2 y 3 se abren al terminar la 1: lo que el micrófono no oye en la 2 no frena la 3', () => {
    const doneUnitOne = { 'u1-1': 1, 'u1-2': 1, 'u1-3': 1, 'u1-4': 1 };
    const access = lessonAccessMap(stars(doneUnitOne));
    expect(access.get('u2-1')).toBe('abierta');
    expect(access.get('u3-1')).toBe('abierta');
    expect(access.get('u4-1')).toBe('bloqueada');
    expect(access.get('u5-1')).toBe('bloqueada');
  });

  it('la unidad 4 pide la 3, y la 5 pide la 2 y la 4', () => {
    const unit = (id: string, count: number) =>
      Object.fromEntries(Array.from({ length: count }, (_, i) => [`${id}-${i + 1}`, 1]));
    const base = { ...unit('u1', 4), ...unit('u3', 6) };
    expect(lessonAccessMap(stars(base)).get('u4-1')).toBe('abierta');
    // Con la 3 y la 4 hechas pero no la 2, la 5 sigue cerrada.
    const withoutTwo = { ...base, ...unit('u4', 6) };
    expect(lessonAccessMap(stars(withoutTwo)).get('u5-1')).toBe('bloqueada');
    expect(lessonAccessMap(stars({ ...withoutTwo, ...unit('u2', 4) })).get('u5-1')).toBe('abierta');
  });

  it('cada unidad solo pide unidades anteriores (no hay ciclos)', () => {
    const seen = new Set<string>();
    for (const unit of UNITS) {
      for (const id of unit.requires) expect(seen.has(id), `${unit.id} pide ${id}`).toBe(true);
      seen.add(unit.id);
    }
  });

  it('los identificadores guardados no cambian (si se reordena una lección, las estrellas de otra se confundirían)', () => {
    expect(LESSONS.map((lesson) => lesson.id)).toEqual([
      'u1-1',
      'u1-2',
      'u1-3',
      'u1-4',
      'u2-1',
      'u2-2',
      'u2-3',
      'u2-4',
      'u3-1',
      'u3-2',
      'u3-3',
      'u3-4',
      'u3-5',
      'u3-6',
      'u4-1',
      'u4-2',
      'u4-3',
      'u4-4',
      'u4-5',
      'u4-6',
      'u5-1',
      'u5-2',
      'u5-3',
      'u5-4',
      'u6-1',
      'u6-2',
      'u6-3',
      'u6-4',
      'u6-5',
      'u6-6',
      'u6-7',
      'u6-8',
    ]);
    // Y el contenido de cada identificador tampoco: títulos de las lecciones de notas nuevas.
    expect(
      LESSONS.filter((lesson) => lesson.unitId === 'u3').map((lesson) => lesson.title),
    ).toEqual([
      'Posición de Re',
      'Posición de Mi',
      'Posición de Sol',
      'Posición de La',
      'Repaso: las cuatro posiciones',
      'Prueba: Do4 a Re5',
    ]);
  });

  it('con todo hecho no queda lección actual', () => {
    const all = Object.fromEntries(LESSONS.map((lesson) => [lesson.id, 3]));
    expect(currentLesson(lessonAccessMap(stars(all)), stars(all))).toBeNull();
  });
});
