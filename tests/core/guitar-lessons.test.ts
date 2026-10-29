import { evaluate, pickTarget, startRound } from '@/core/domain/exercise';
import type { RoundConfig } from '@/core/domain/exercise';
import { GUITAR_UNITS } from '@/core/domain/guitar-lessons';
import { midiAt } from '@/core/domain/instrument';
import { isBlackKey, pitchClass } from '@/core/domain/note';
import type { NoteEvent } from '@/core/domain/note-event';
import {
  ALL_LESSONS,
  LESSONS,
  SKIP_STARS,
  currentLesson,
  findLesson,
  findUnit,
  lessonAccessMap,
  lessonConfig,
  lessonsFor,
  playBlock,
  unitsOf,
} from '@/core/domain/lessons';
import type { Lesson, PlayContext } from '@/core/domain/lessons';
import { parseProgress } from '@/core/domain/progress';
import { single, targetOf } from '@/core/domain/target';

const lessons = lessonsFor('guitarra');
const byId = (id: string): Lesson => {
  const lesson = findLesson(id);
  if (!lesson) throw new Error(`Falta la lección ${id}`);
  return lesson;
};
const mic: PlayContext = { sources: ['microfono'], polyphonicMic: false };

describe('el camino de guitarra', () => {
  it('tiene tres unidades con los ids y títulos acordados (prueba dorada)', () => {
    expect(unitsOf('guitarra')).toBe(GUITAR_UNITS);
    expect(
      GUITAR_UNITS.map((unit) => [unit.id, unit.title, unit.lessons.map((l) => l.id)]),
    ).toEqual([
      ['g1', 'Cuerdas al aire', ['g1-1', 'g1-2', 'g1-3', 'g1-4', 'g1-5', 'g1-6']],
      ['g2', 'Primeras notas', ['g2-1', 'g2-2', 'g2-3', 'g2-4']],
      ['g3', 'Todas las cuerdas', ['g3-1', 'g3-2', 'g3-3', 'g3-4']],
    ]);
    expect(lessons.map((lesson) => lesson.title)).toEqual([
      'Mi · Si · Sol',
      'Si · Sol · Re',
      'Sol · Re · La',
      'Re · La · Mi',
      'Repaso: las 6 cuerdas',
      'Prueba: las 6 cuerdas',
      'Mi · Fa · Sol',
      'Si · Do · Re',
      'Repaso: cuerdas 1 y 2',
      'Prueba: cuerdas 1 y 2',
      'Cuerdas 3 y 4',
      'Cuerdas 5 y 6',
      'Repaso: las 17 notas',
      'Prueba: las 17 notas',
    ]);
  });

  it('los ids no chocan con los del piano y se encuentran desde cualquier instrumento', () => {
    const ids = ALL_LESSONS.map((lesson) => lesson.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(lessons.every((lesson) => lesson.id.startsWith('g'))).toBe(true);
    expect(LESSONS.every((lesson) => lesson.instrument === 'piano')).toBe(true);
    expect(lessons.every((lesson) => lesson.instrument === 'guitarra')).toBe(true);
    expect(findLesson('g2-3')?.title).toBe('Repaso: cuerdas 1 y 2');
    expect(findLesson('u1-1')?.instrument).toBe('piano');
    expect(findUnit('g3')?.title).toBe('Todas las cuerdas');
  });

  it('el catálogo de piano no cambia', () => {
    expect(LESSONS).toHaveLength(32);
  });

  it('cada unidad termina en su prueba y pide la 1', () => {
    for (const unit of GUITAR_UNITS) {
      expect(unit.lessons.at(-1)?.kind, unit.id).toBe('prueba');
      expect(unit.optional, unit.id).toBe(false);
    }
    expect(GUITAR_UNITS.map((unit) => unit.requires)).toEqual([[], ['g1'], ['g1']]);
  });

  it('son notas sueltas, con un objetivo de una nota, su posición y al menos tres distintos', () => {
    for (const lesson of lessons) {
      expect(lesson.mode, lesson.id).toBe('notas');
      expect(lesson.pool.length, lesson.id).toBeGreaterThanOrEqual(3);
      for (const target of lesson.pool) {
        expect(target.notes, lesson.id).toHaveLength(1);
        expect(target.positions, lesson.id).toHaveLength(1);
        expect(target.fingers, lesson.id).toEqual([]);
        expect(target.hand, lesson.id).toBeNull();
        const position = target.positions[0];
        expect(position && midiAt(position.string, position.fret), lesson.id).toBe(target.notes[0]);
      }
    }
  });

  it('solo hay notas naturales de Mi2 a Sol4, sin repetir dentro de una lección', () => {
    for (const lesson of lessons) {
      const midis = lesson.pool.map((target) => target.notes[0]);
      expect(new Set(midis).size, lesson.id).toBe(midis.length);
      for (const midi of midis) {
        expect(isBlackKey(midi), `${lesson.id} ${midi}`).toBe(false);
        expect(midi).toBeGreaterThanOrEqual(40);
        expect(midi).toBeLessThanOrEqual(67);
      }
    }
  });

  it('el repaso final tiene las 17 notas y no se repite ningún MIDI', () => {
    expect(byId('g1-5').pool).toHaveLength(6);
    expect(byId('g2-3').pool).toHaveLength(6);
    expect(byId('g3-3').pool).toHaveLength(17);
    expect(byId('g3-4').pool).toEqual(byId('g3-3').pool);
  });

  it('las cuerdas al aire empiezan por las agudas y las graves llegan al final', () => {
    const strings = (id: string) => byId(id).pool.map((t) => t.positions[0]?.string);
    expect(strings('g1-1')).toEqual([1, 2, 3]);
    expect(strings('g1-2')).toEqual([2, 3, 4]);
    expect(strings('g1-3')).toEqual([3, 4, 5]);
    expect(strings('g1-4')).toEqual([4, 5, 6]);
  });

  it('los dedos son el traste (1 a 4) y ninguno al aire', () => {
    for (const lesson of lessons) {
      for (const target of lesson.pool) {
        const position = target.positions[0];
        expect(position?.finger, lesson.id).toBe(
          position && position.fret > 0 ? position.fret : null,
        );
      }
    }
  });

  it('el tamaño de ronda es el de siempre y la unidad 1 no exige ritmo', () => {
    expect(lessons.map((lesson) => lesson.roundSize)).toEqual([
      10, 10, 10, 10, 14, 20, 10, 10, 14, 20, 10, 10, 14, 20,
    ]);
    expect(GUITAR_UNITS[0]?.lessons.every((lesson) => lesson.rhythmGoal === null)).toBe(true);
    expect(GUITAR_UNITS[1]?.lessons.map((lesson) => lesson.rhythmGoal)).toEqual([8, 8, 10, 12]);
    expect(GUITAR_UNITS[2]?.lessons.map((lesson) => lesson.rhythmGoal)).toEqual([9, 9, 11, 13]);
  });
});

describe('desbloqueo del camino de guitarra', () => {
  const starsOf =
    (done: Record<string, number>) =>
    (id: string): number =>
      done[id] ?? 0;

  it('al principio solo está abierta la primera lección y la prueba de la unidad', () => {
    const access = lessonAccessMap(starsOf({}), GUITAR_UNITS);
    expect(access.get('g1-1')).toBe('abierta');
    expect(access.get('g1-2')).toBe('bloqueada');
    expect(access.get('g1-6')).toBe('abierta');
    expect(access.get('g2-1')).toBe('bloqueada');
    expect(currentLesson(access, starsOf({}), GUITAR_UNITS)?.id).toBe('g1-1');
  });

  it('terminar la unidad 1 abre la 2 y la 3 a la vez', () => {
    const done = Object.fromEntries(lessons.slice(0, 6).map((lesson) => [lesson.id, 1]));
    const access = lessonAccessMap(starsOf(done), GUITAR_UNITS);
    expect(access.get('g2-1')).toBe('abierta');
    expect(access.get('g3-1')).toBe('abierta');
    expect(currentLesson(access, starsOf(done), GUITAR_UNITS)?.id).toBe('g2-1');
  });

  it('saltar con la prueba de la unidad 1 abre todo lo de la unidad', () => {
    const done = { 'g1-6': SKIP_STARS };
    const access = lessonAccessMap(starsOf(done), GUITAR_UNITS);
    expect(access.get('g1-3')).toBe('abierta');
    expect(access.get('g2-1')).toBe('abierta');
  });

  it('el camino de piano sigue igual con las unidades por omisión', () => {
    const access = lessonAccessMap(starsOf({}));
    expect(access.get('u1-1')).toBe('abierta');
    expect(access.has('g1-1')).toBe(false);
    expect(currentLesson(access, starsOf({}))?.id).toBe('u1-1');
  });
});

describe('qué se puede tocar según la entrada', () => {
  it('la guitarra solo se toca con el micrófono', () => {
    const lesson = byId('g1-1');
    expect(playBlock(lesson, mic)).toBeNull();
    expect(playBlock(lesson, { sources: ['midi'], polyphonicMic: false })).toBe(
      'necesita-microfono',
    );
    expect(playBlock(lesson, { sources: ['teclado-pc'], polyphonicMic: true })).toBe(
      'necesita-microfono',
    );
    expect(
      playBlock(lesson, { sources: ['microfono', 'teclado-pc'], polyphonicMic: false }),
    ).toBeNull();
  });

  it('el piano sigue como antes', () => {
    expect(playBlock(byId('u1-1'), mic)).toBeNull();
    expect(playBlock(byId('u6-1'), mic)).toBe('necesita-varias-notas');
  });
});

describe('la configuración de ronda de guitarra', () => {
  it('lleva el instrumento y el juicio por nombre de nota; la de piano no', () => {
    const guitar = lessonConfig(byId('g1-1'));
    expect(guitar).toMatchObject({ instrument: 'guitarra', octaveFree: true, coverage: true });
    const piano = lessonConfig(byId('u1-1'));
    expect(piano.instrument).toBe('piano');
    expect(piano.octaveFree).toBeUndefined();
  });
});

describe('juicio por nombre de nota (octaveFree)', () => {
  const config: RoundConfig = {
    mode: 'notas',
    level: 0,
    pool: [single(64), single(59), single(55)],
    roundSize: 5,
    octaveFree: true,
  };
  const ctx = { rng: () => 0, notation: 'latina' as const, help: true };
  const on = (note: number, at: number): NoteEvent => ({
    type: 'on',
    note,
    velocity: 90,
    at,
    source: 'microfono',
    confidence: 'alta',
  });
  const off = (note: number, at: number): NoteEvent => ({
    type: 'off',
    note,
    velocity: 0,
    at,
    source: 'microfono',
  });
  const start = (cfg: RoundConfig = config) => startRound(cfg, () => 0, 0);

  it('la misma nota una octava abajo o arriba cuenta como acierto', () => {
    const state = start();
    const target = state.target.notes[0];
    const { outcome, state: next } = evaluate(state, on(target - 12, 500), ctx);
    expect(outcome.kind).toBe('acierto');
    expect(next.completedTargets).toBe(1);
    expect(next.attempts[0]).toMatchObject({ isCorrect: true, playedMidi: target });

    const up = evaluate(start(), on(target + 12, 500), ctx);
    expect(up.outcome.kind).toBe('acierto');
  });

  it('otra nota con otro nombre sigue siendo un error', () => {
    const state = start();
    const target = state.target.notes[0];
    const { outcome } = evaluate(state, on(target + 1, 500), ctx);
    expect(outcome.kind).toBe('error');
  });

  it('sin la bandera, la octava distinta es dudosa por micrófono (como siempre)', () => {
    const plain: RoundConfig = { ...config, octaveFree: false };
    const state = start(plain);
    const target = state.target.notes[0];
    const { outcome } = evaluate(state, on(target - 12, 500), ctx);
    expect(outcome).toMatchObject({ kind: 'dudoso', reason: 'octava' });
  });

  it('soltar la nota también se entiende en otra octava', () => {
    const base: RoundConfig = { ...config, pool: [single(64), single(59)], roundSize: 1 };
    const state = start(base);
    const target = state.target.notes[0];
    const hit = evaluate(state, on(target - 12, 500), ctx);
    expect(hit.outcome.kind).toBe('ronda-completa');
    expect(evaluate(hit.state, off(target - 12, 900), ctx).outcome.kind).toBe('ignorado');
  });

  it('no se aplica a terceras ni acordes', () => {
    const chord: RoundConfig = {
      mode: 'acordes',
      level: 0,
      pool: [targetOf([60, 64, 67])],
      roundSize: 2,
      octaveFree: true,
    };
    const state = start(chord);
    const { outcome } = evaluate(state, on(48, 500), ctx);
    expect(outcome).toMatchObject({ kind: 'dudoso', reason: 'octava' });
  });

  it('no repite el mismo nombre de nota seguido aunque sea de otra octava', () => {
    const pool = [single(40), single(52), single(64), single(43)]; // Mi Mi Mi Sol
    let previous = single(40);
    let wrong = 0;
    for (let i = 0; i < 200; i++) {
      const seed = (i * 7919) % 1000;
      const next = pickTarget(pool, previous, () => seed / 1000, undefined, true);
      if (pitchClass(next.notes[0]) === pitchClass(previous.notes[0])) wrong++;
      previous = next;
    }
    expect(wrong).toBe(0);
  });
});

describe('guardar y leer progreso de guitarra', () => {
  it('las claves g:… de las notas de las lecciones se conservan al leer', () => {
    const saved = {
      version: 1,
      xp: 40,
      lessons: { 'g1-1': { stars: 2, accuracy: 900, rhythm: 0, plays: 1, day: '2026-10-29' } },
      keys: { 'g:64': [[1, 900]], 'g:40': [[0, 2000]], 'g:99': [[1, 100]], '64': [[1, 500]] },
      history: [{ day: '2026-10-29', lesson: 'g1-1', accuracy: 900, rhythm: 0 }],
    };
    const { state } = parseProgress(saved);
    expect(state.lessons['g1-1']?.stars).toBe(2);
    expect(Object.keys(state.keys).sort()).toEqual(['64', 'g:40', 'g:64']);
    expect(state.history).toHaveLength(1);
  });

  it('una lección de guitarra desconocida se descarta', () => {
    const { state } = parseProgress({
      version: 1,
      lessons: { 'g9-1': { stars: 3, accuracy: 1000, rhythm: 0, plays: 1, day: '2026-10-29' } },
    });
    expect(state.lessons).toEqual({});
  });
});
