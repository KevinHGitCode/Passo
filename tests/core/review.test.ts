import { addSamples } from '@/core/domain/key-stats';
import type { KeyHistory, KeySample } from '@/core/domain/key-stats';
import { LESSONS, findLesson } from '@/core/domain/lessons';
import { applyResult, EMPTY_PROGRESS } from '@/core/domain/progress';
import {
  REVIEW_LESSON_ID,
  REVIEW_ROUND_SIZE,
  reviewLesson,
  selectReview,
} from '@/core/domain/review';
import { scoreLesson } from '@/core/domain/scoring';
import { round, steady } from '../support/rounds';

const ok = (ms = 1000): KeySample => ({ ok: true, ms });
const miss = (ms = 1000): KeySample => ({ ok: false, ms });
const many = (count: number, sample: KeySample): KeySample[] =>
  Array.from({ length: count }, () => sample);

/** Teclas con 8 muestras: `fails` fallos antiguos y el resto aciertos. */
const keyWith = (fails: number, ms = 1000): KeySample[] => [
  ...many(fails, miss(ms)),
  ...many(8 - fails, ok(ms)),
];

describe('qué repasar', () => {
  it('sin datos no hay nada que repasar', () => {
    expect(selectReview({})).toBeNull();
    expect(reviewLesson({})).toBeNull();
  });

  it('con menos de 3 muestras por tecla tampoco (aún no hay de qué fiarse)', () => {
    expect(selectReview({ '60': many(2, miss()) })).toBeNull();
  });

  it('con 3 o 4 muestras no se juzga débil, pero puede ofrecerse como lenta', () => {
    expect(selectReview({ '60': many(4, miss()) })?.reason).toBe('lentas');
  });

  it('con dos o más débiles, repasa las débiles (como máximo cuatro)', () => {
    const history: KeyHistory = {
      '60': [...many(5, miss()), ok(), ok()],
      '62': [...many(4, miss()), ok(), ok(), miss(), ok()],
      '64': [...many(6, miss()), ok()],
      '65': [...many(5, miss()), ok(), miss()],
      '67': [...many(5, miss()), ok(), ok(), miss()],
      '72': many(8, ok()),
    };
    const selection = selectReview(history);
    expect(selection?.reason).toBe('debiles');
    expect(selection?.keys).toHaveLength(4);
    expect(selection?.keys.map((stat) => stat.key)).not.toContain('72');
  });

  it('con una sola débil se completa con las más lentas', () => {
    const history: KeyHistory = {
      '60': [...many(5, miss()), ok(), miss(), miss()],
      '62': many(6, ok(900)),
      '64': many(6, ok(2400)),
      '65': many(6, ok(1000)),
    };
    const selection = selectReview(history);
    expect(selection?.reason).toBe('debiles');
    expect(selection?.keys[0]?.key).toBe('60');
    expect(selection?.keys.length).toBeGreaterThanOrEqual(2);
    expect(selection?.keys.map((stat) => stat.key)).toContain('64');
  });

  it('si ninguna es débil, ofrece las más lentas', () => {
    const history: KeyHistory = {
      '60': many(6, ok(800)),
      '62': many(6, ok(1100)),
      '64': many(6, ok(900)),
    };
    const selection = selectReview(history);
    expect(selection?.reason).toBe('lentas');
    expect(selection?.keys[0]?.key).toBe('62');
  });

  it('solo cuentan las notas sueltas (el micrófono no juzga grupos)', () => {
    const history: KeyHistory = {
      '60-64': keyWith(6),
      '60-64-67': keyWith(6),
    };
    expect(selectReview(history)).toBeNull();
  });
});

describe('la lección de repaso', () => {
  const history: KeyHistory = {
    '62': [...many(5, miss()), ok(), ok(), miss()],
    '65': [...many(5, miss()), ok(), miss(), miss()],
    '67': many(8, ok()),
  };

  it('es una lección de notas armada al momento, de 14 objetivos y sin ritmo', () => {
    const lesson = reviewLesson(history);
    expect(lesson).toMatchObject({
      id: REVIEW_LESSON_ID,
      kind: 'repaso',
      mode: 'notas',
      roundSize: REVIEW_ROUND_SIZE,
      rhythmGoal: null,
      dynamic: true,
    });
    expect(REVIEW_ROUND_SIZE).toBe(14);
  });

  it('repite tres veces cada tecla débil y añade vecinas hasta tener tres notas distintas', () => {
    const lesson = reviewLesson(history);
    const notes = lesson?.pool.map((target) => target.notes[0]) ?? [];
    expect(notes.filter((note) => note === 62)).toHaveLength(3);
    expect(notes.filter((note) => note === 65)).toHaveLength(3);
    expect(new Set(notes).size).toBeGreaterThanOrEqual(3);
  });

  it('los objetivos son los mismos de las lecciones (mano y dedos incluidos)', () => {
    const lesson = reviewLesson(history);
    const known = new Set(LESSONS.flatMap((item) => item.pool));
    for (const target of lesson?.pool ?? []) expect(known.has(target)).toBe(true);
  });

  it('no existe en el camino (no se puede abrir como una lección normal)', () => {
    expect(findLesson(REVIEW_LESSON_ID)).toBeNull();
  });

  it('con una tecla que no existe en ninguna lección no se arma', () => {
    expect(reviewLesson({ '1': many(8, miss()), '3': many(8, miss()) })).toBeNull();
  });
});

describe('guardar el resultado de un repaso', () => {
  const lesson = reviewLesson({
    '62': [...many(5, miss()), ok(), ok(), miss()],
    '65': [...many(5, miss()), ok(), miss(), miss()],
  });

  function playReview() {
    if (!lesson) throw new Error('No se pudo armar el repaso');
    const attempts = round(steady(14, 1000, { notes: [62] }));
    const score = scoreLesson(attempts, lesson);
    return applyResult(EMPTY_PROGRESS, { lesson, score, attempts }, '2026-10-26');
  }

  it('da la mitad de experiencia y no crea una lección ni un historial', () => {
    const { state, gains } = playReview();
    expect(gains.xp).toBe(70);
    expect(gains.newStars).toBe(0);
    expect(state.lessons).toEqual({});
    expect(state.history).toEqual([]);
  });

  it('pero sí cuenta para las estadísticas por tecla, el tiempo y la racha', () => {
    const { state, gains } = playReview();
    expect(state.keys['62']).toHaveLength(10);
    expect(state.daily['2026-10-26']).toMatchObject({ lessons: 1 });
    expect(gains.streak).toBe(1);
  });

  it('repetirlo no baja la experiencia por vez (siempre la mitad)', () => {
    const first = playReview();
    if (!lesson) return;
    const attempts = round(steady(14, 1000, { notes: [62] }));
    const again = applyResult(
      first.state,
      { lesson, score: scoreLesson(attempts, lesson), attempts },
      '2026-10-26',
    );
    expect(again.gains.xp).toBe(70);
  });

  it('las muestras se recortan a diez por tecla', () => {
    const history = addSamples(
      {},
      Array.from({ length: 12 }, () => ({ key: '62', sample: ok() })),
    );
    expect(history['62']).toHaveLength(10);
  });
});
