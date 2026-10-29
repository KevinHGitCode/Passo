import { startRound, evaluate } from '@/core/domain/exercise';
import type { RoundConfig } from '@/core/domain/exercise';
import {
  GUITAR_KEY_PREFIX,
  addSamples,
  globalMedianMs,
  historyOf,
  keyInstrument,
  keyNotes,
  samplesOf,
  targetKey,
} from '@/core/domain/key-stats';
import type { KeyHistory, KeySample } from '@/core/domain/key-stats';
import { findLesson, lessonConfig, lessonsFor, unitsOf } from '@/core/domain/lessons';
import { EMPTY_PROGRESS, parseProgress } from '@/core/domain/progress';
import {
  GUITAR_REVIEW_LESSON_ID,
  REVIEW_LESSON_ID,
  reviewInstrumentOf,
  reviewLessonId,
  selectReview,
} from '@/core/domain/review';
import { single } from '@/core/domain/target';
import { round } from '../support/rounds';

const ok = (ms = 1000): KeySample => ({ ok: true, ms });
const miss = (ms = 1000): KeySample => ({ ok: false, ms });
const many = (count: number, sample: KeySample): KeySample[] =>
  Array.from({ length: count }, () => sample);

describe('claves de tecla por instrumento', () => {
  it('en piano la clave es la de siempre; en guitarra lleva el prefijo', () => {
    expect(targetKey([60])).toBe('60');
    expect(targetKey([60, 64], 'piano')).toBe('60-64');
    expect(targetKey([64], 'guitarra')).toBe('g:64');
    expect(GUITAR_KEY_PREFIX).toBe('g:');
  });

  it('se sabe de qué instrumento es una clave y cuáles son sus notas', () => {
    expect(keyInstrument('64')).toBe('piano');
    expect(keyInstrument('g:64')).toBe('guitarra');
    expect(keyNotes('64')).toEqual([64]);
    expect(keyNotes('60-64-67')).toEqual([60, 64, 67]);
    expect(keyNotes('g:40')).toEqual([40]);
  });

  it('la misma nota en piano y en guitarra no comparte estadísticas', () => {
    const samples = [
      ...samplesOf(round([{ notes: [64], ms: 800 }])),
      ...samplesOf(round([{ notes: [64], ms: 900, instrument: 'guitarra' }])),
    ];
    expect(samples).toEqual([
      { key: '64', sample: { ok: true, ms: 800 } },
      { key: 'g:64', sample: { ok: true, ms: 900 } },
    ]);
  });

  it('historyOf separa los dos instrumentos', () => {
    const history: KeyHistory = {
      '60': many(6, ok()),
      '64': many(6, miss()),
      'g:64': many(6, ok()),
      'g:40': many(6, miss()),
    };
    expect(Object.keys(historyOf(history, 'piano')).sort()).toEqual(['60', '64']);
    expect(Object.keys(historyOf(history, 'guitarra')).sort()).toEqual(['g:40', 'g:64']);
  });

  it('la mediana de tiempos no mezcla los instrumentos', () => {
    const history: KeyHistory = { '60': many(6, ok(1000)), 'g:64': many(6, ok(9000)) };
    expect(globalMedianMs(historyOf(history, 'piano'))).toBe(1000);
    expect(globalMedianMs(historyOf(history, 'guitarra'))).toBe(9000);
  });

  it('addSamples acepta claves de guitarra', () => {
    expect(addSamples({}, [{ key: 'g:64', sample: ok() }])).toEqual({ 'g:64': [ok()] });
  });
});

describe('la ronda sabe de qué instrumento es', () => {
  const config: RoundConfig = {
    mode: 'notas',
    level: 0,
    pool: [single(64), single(59)],
    roundSize: 3,
  };

  it('sin indicar es piano y con la lección de piano también', () => {
    const state = startRound(config, () => 0, 0);
    const { state: next } = evaluate(
      state,
      { type: 'on', note: state.target.notes[0], velocity: 90, at: 500, source: 'teclado-pc' },
      { rng: () => 0, notation: 'latina', help: true },
    );
    expect(next.attempts[0]?.instrument).toBe('piano');
    const lesson = findLesson('u1-1');
    expect(lesson).not.toBeNull();
    if (lesson) expect(lessonConfig(lesson).instrument).toBe('piano');
  });

  it('con el instrumento en la configuración, los intentos lo llevan', () => {
    const state = startRound({ ...config, instrument: 'guitarra' }, () => 0, 0);
    const { state: next } = evaluate(
      state,
      { type: 'on', note: state.target.notes[0], velocity: 90, at: 500, source: 'microfono' },
      { rng: () => 0, notation: 'latina', help: true },
    );
    expect(next.attempts[0]?.instrument).toBe('guitarra');
  });
});

describe('el repaso es de un instrumento', () => {
  it('los ids de repaso: el de piano es el de siempre', () => {
    expect(REVIEW_LESSON_ID).toBe('repaso-debiles');
    expect(reviewLessonId('piano')).toBe(REVIEW_LESSON_ID);
    expect(reviewLessonId('guitarra')).toBe(GUITAR_REVIEW_LESSON_ID);
    expect(reviewInstrumentOf('repaso-debiles')).toBe('piano');
    expect(reviewInstrumentOf('repaso-debiles-guitarra')).toBe('guitarra');
    expect(reviewInstrumentOf('u1-1')).toBeNull();
  });

  it('las teclas flojas de guitarra no aparecen en el repaso de piano', () => {
    const history: KeyHistory = {
      'g:64': [...many(5, miss()), ...many(3, ok())],
      'g:59': [...many(5, miss()), ...many(3, ok())],
    };
    expect(selectReview(history)).toBeNull();
    expect(selectReview(history, 'piano')).toBeNull();
    expect(selectReview(history, 'guitarra')?.keys.map((stat) => stat.key)).toEqual(
      expect.arrayContaining(['g:64', 'g:59']),
    );
  });

  it('las de piano no aparecen en el repaso de guitarra', () => {
    const history: KeyHistory = {
      '60': [...many(5, miss()), ...many(3, ok())],
      '62': [...many(5, miss()), ...many(3, ok())],
    };
    expect(selectReview(history, 'guitarra')).toBeNull();
    expect(selectReview(history)?.keys).toHaveLength(2);
  });
});

describe('el catálogo por instrumento', () => {
  it('el piano conserva sus lecciones y la guitarra aún no tiene', () => {
    expect(unitsOf('piano').length).toBeGreaterThan(0);
    expect(lessonsFor('piano').every((lesson) => lesson.instrument === 'piano')).toBe(true);
    expect(unitsOf('guitarra')).toEqual([]);
  });
});

describe('leer progreso de piano ya guardado', () => {
  it('un progreso con claves de piano se lee igual que antes', () => {
    const saved = {
      version: 1,
      xp: 250,
      streak: { count: 3, last: '2026-10-20', restWeek: null },
      lessons: { 'u1-1': { stars: 3, accuracy: 950, rhythm: 140, plays: 2, day: '2026-10-20' } },
      keys: { '60': [[1, 800]], '62': [[0, 1200]] },
      daily: { '2026-10-20': { ms: 60000, lessons: 1 } },
      history: [{ day: '2026-10-20', lesson: 'u1-1', accuracy: 950, rhythm: 140 }],
    };
    const parsed = parseProgress(saved);
    expect(parsed.status).toBe('ok');
    expect(parsed.state.xp).toBe(250);
    expect(parsed.state.lessons['u1-1']?.stars).toBe(3);
    expect(Object.keys(parsed.state.keys).sort()).toEqual(['60', '62']);
    expect(parsed.state.history).toHaveLength(1);
  });

  it('un progreso vacío sigue siendo vacío', () => {
    expect(parseProgress({ version: 1 }).state).toEqual({ ...EMPTY_PROGRESS, version: 1 });
  });
});
