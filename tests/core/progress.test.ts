import { findLesson } from '@/core/domain/lessons';
import type { Lesson } from '@/core/domain/lessons';
import {
  EMPTY_PROGRESS,
  MAX_DAILY_DAYS,
  MAX_HISTORY,
  PROGRESS_VERSION,
  applyResult,
  currentStreak,
  minutesOn,
  parseProgress,
  serializeProgress,
  starsOf,
} from '@/core/domain/progress';
import type { Progress } from '@/core/domain/progress';
import { scoreLesson } from '@/core/domain/scoring';
import { addDays } from '@/core/domain/day';
import { round, steady } from '../support/rounds';
import type { Spec } from '../support/rounds';

const lesson = (id: string): Lesson => {
  const found = findLesson(id);
  if (!found) throw new Error(`Falta la lección ${id}`);
  return found;
};

const DAY = '2026-10-26';

/** Termina la lección `id` con los intentos de `specs`. */
function play(state: Progress, id: string, specs: readonly Spec[], day = DAY) {
  const attempts = round(specs);
  const score = scoreLesson(attempts, lesson(id));
  return applyResult(state, { lesson: lesson(id), score, attempts }, day);
}

/** Una ronda perfecta y rápida de 10 notas en la lección 2.1 (izquierda): 3 estrellas. */
const PERFECT: Spec[] = steady(10, 1000, { notes: [60] });

describe('leer el progreso guardado', () => {
  it('sin nada o con algo que no es un objeto, se empieza de cero', () => {
    for (const raw of [null, undefined, 'x', 3, [], true]) {
      expect(parseProgress(raw)).toEqual({ state: EMPTY_PROGRESS, status: 'vacio' });
    }
  });

  it('sin versión válida no se interpreta', () => {
    expect(parseProgress({ xp: 500 }).status).toBe('vacio');
    expect(parseProgress({ version: 'uno', xp: 500 }).status).toBe('vacio');
    expect(parseProgress({ version: 0, xp: 500 }).status).toBe('vacio');
    expect(parseProgress({ version: Number.NaN, xp: 500 }).status).toBe('vacio');
  });

  it('una versión mayor se marca para no pisarla y se muestra vacía', () => {
    expect(parseProgress({ version: PROGRESS_VERSION + 1, xp: 500 })).toEqual({
      state: EMPTY_PROGRESS,
      status: 'version-mayor',
    });
  });

  it('un objeto vacío con la versión actual es un progreso vacío válido', () => {
    const parsed = parseProgress({ version: PROGRESS_VERSION });
    expect(parsed.status).toBe('ok');
    expect(parsed.state).toEqual(EMPTY_PROGRESS);
  });

  it('cada campo inválido se descarta o se acota, sin lanzar', () => {
    const parsed = parseProgress({
      version: PROGRESS_VERSION,
      xp: -50.7,
      streak: { count: 'mucho', last: 'ayer', restWeek: 12 },
      lessons: {
        'u1-1': { stars: 9, accuracy: 5000, rhythm: -3, plays: 2.4, day: '2026-10-26' },
        'u1-2': { stars: 2, accuracy: 900, rhythm: 100, plays: 1, day: 'mal' },
        desconocida: { stars: 3, accuracy: 1000, rhythm: 1, plays: 1, day: '2026-10-26' },
        'u1-3': 'texto',
      },
      keys: { '60': [[1, 800], [0, -5], 'x', [1, 'lento']], '999': [[1, 1]], '62': 'no' },
      daily: {
        '2026-10-26': { ms: 90_000, lessons: 2 },
        '2026-13-40': { ms: 1, lessons: 1 },
        '2026-10-25': { ms: 'x', lessons: -4 },
      },
      history: [
        { day: '2026-10-26', lesson: 'u1-1', accuracy: 800, rhythm: 120 },
        { day: 'mal', lesson: 'u1-1', accuracy: 1, rhythm: 1 },
        { day: '2026-10-26', lesson: 'nada', accuracy: 1, rhythm: 1 },
        7,
      ],
    });
    expect(parsed.status).toBe('ok');
    const { state } = parsed;
    expect(state.xp).toBe(0);
    expect(state.streak).toEqual({ count: 0, last: null, restWeek: null });
    expect(Object.keys(state.lessons)).toEqual(['u1-1']);
    expect(state.lessons['u1-1']).toEqual({
      stars: 3,
      accuracy: 1000,
      rhythm: 0,
      plays: 2,
      day: '2026-10-26',
    });
    expect(state.keys).toEqual({
      '60': [
        { ok: true, ms: 800 },
        { ok: false, ms: 0 },
        { ok: true, ms: 0 },
      ],
    });
    expect(state.daily).toEqual({
      '2026-10-25': { ms: 0, lessons: 0 },
      '2026-10-26': { ms: 90_000, lessons: 2 },
    });
    expect(state.history).toEqual([
      { day: '2026-10-26', lesson: 'u1-1', accuracy: 800, rhythm: 120 },
    ]);
  });

  it('lo guardado y vuelto a leer es idéntico', () => {
    const { state } = play(EMPTY_PROGRESS, 'u1-1', steady(10, 1000, { notes: [60] }));
    const text = JSON.stringify(serializeProgress(state));
    expect(parseProgress(JSON.parse(text)).state).toEqual(state);
  });

  it('un progreso enorme se poda al leer: 90 días y 50 lecciones recientes', () => {
    const daily = Object.fromEntries(
      Array.from({ length: 200 }, (_, i) => [addDays('2026-01-01', i), { ms: 1000, lessons: 1 }]),
    );
    const history = Array.from({ length: 120 }, (_, i) => ({
      day: DAY,
      lesson: 'u1-1',
      accuracy: i,
      rhythm: 0,
    }));
    const { state } = parseProgress({ version: PROGRESS_VERSION, daily, history });
    expect(Object.keys(state.daily)).toHaveLength(MAX_DAILY_DAYS);
    expect(Object.keys(state.daily).at(-1)).toBe(addDays('2026-01-01', 199));
    expect(state.history).toHaveLength(MAX_HISTORY);
    expect(state.history.at(-1)?.accuracy).toBe(119);
  });
});

describe('aplicar el resultado de una lección', () => {
  it('la primera vez guarda estrellas, precisión y ritmo, y da la experiencia completa', () => {
    // Lección 2.1: 10 objetivos, todos a la primera, 1 s cada uno = 60 notas/min (meta 12).
    const { state, gains } = play(EMPTY_PROGRESS, 'u2-1', PERFECT);
    expect(state.lessons['u2-1']).toEqual({
      stars: 3,
      accuracy: 1000,
      rhythm: 600,
      plays: 1,
      day: DAY,
    });
    // 10 objetivos × 10 de experiencia + 3 estrellas nuevas × 10.
    expect(gains).toMatchObject({
      xp: 130,
      previousStars: 0,
      stars: 3,
      newStars: 3,
      previousPlays: 0,
      bestAccuracy: true,
      bestRhythm: true,
    });
    expect(state.xp).toBe(130);
  });

  it('repetir da menos experiencia: 50 % la segunda vez y 25 % después, sin estrellas nuevas', () => {
    let { state } = play(EMPTY_PROGRESS, 'u2-1', PERFECT);
    const second = play(state, 'u2-1', PERFECT);
    expect(second.gains.xp).toBe(50);
    expect(second.gains.newStars).toBe(0);
    expect(second.gains.bestAccuracy).toBe(false);
    state = second.state;
    const third = play(state, 'u2-1', PERFECT);
    expect(third.gains.xp).toBe(25);
    expect(third.state.lessons['u2-1']?.plays).toBe(3);
    expect(third.state.xp).toBe(130 + 50 + 25);
  });

  it('guarda siempre la mejor marca: una ronda peor no baja nada', () => {
    const { state } = play(EMPTY_PROGRESS, 'u2-1', PERFECT);
    const worse = play(
      state,
      'u2-1',
      steady(10, 1000, { notes: [60] }).map((spec, i) => ({ ...spec, firstTry: i >= 2 })),
    );
    expect(worse.state.lessons['u2-1']).toMatchObject({ stars: 3, accuracy: 1000, rhythm: 600 });
    expect(worse.gains).toMatchObject({ stars: 2, newStars: 0 });
  });

  it('mejorar de 1 a 3 estrellas da el extra solo por las 2 nuevas', () => {
    const first = play(
      EMPTY_PROGRESS,
      'u2-1',
      steady(10, 1000, { notes: [60] }).map((spec, i) => ({ ...spec, firstTry: i >= 3 })),
    );
    expect(first.state.lessons['u2-1']?.stars).toBe(1);
    const second = play(first.state, 'u2-1', PERFECT);
    expect(second.gains).toMatchObject({ previousStars: 1, stars: 3, newStars: 2 });
    // 100 de la ronda × 50 % + 2 estrellas × 10.
    expect(second.gains.xp).toBe(50 + 20);
  });

  it('una ronda sin llegar al 70 % no da estrellas ni racha, pero sí cuenta el tiempo', () => {
    const specs = steady(10, 1000, { notes: [60] }).map((spec, i) => ({
      ...spec,
      firstTry: i >= 5,
    }));
    const { state, gains } = play(EMPTY_PROGRESS, 'u2-1', specs);
    expect(gains.stars).toBe(0);
    expect(state.lessons['u2-1']?.stars).toBe(0);
    expect(state.streak.count).toBe(0);
    expect(gains.streak).toBe(0);
    expect(state.daily[DAY]?.lessons).toBe(1);
    expect(minutesOn(state, DAY)).toBeGreaterThan(0);
    expect(starsOf(state)('u2-1')).toBe(0);
  });

  it('la racha sube con la primera lección del día y no con las siguientes', () => {
    const first = play(EMPTY_PROGRESS, 'u2-1', PERFECT);
    expect(first.gains).toMatchObject({ streak: 1, streakIncreased: true });
    const again = play(first.state, 'u2-2', PERFECT);
    expect(again.gains).toMatchObject({ streak: 1, streakIncreased: false });
    const tomorrow = play(again.state, 'u2-3', PERFECT, addDays(DAY, 1));
    expect(tomorrow.gains).toMatchObject({ streak: 2, streakIncreased: true });
    expect(currentStreak(tomorrow.state, addDays(DAY, 1))).toBe(2);
    expect(currentStreak(tomorrow.state, addDays(DAY, 5))).toBe(0);
  });

  it('suma el tiempo activo y las lecciones de cada día', () => {
    let { state } = play(EMPTY_PROGRESS, 'u2-1', PERFECT);
    ({ state } = play(state, 'u2-2', PERFECT));
    expect(state.daily[DAY]).toEqual({ ms: 20_000, lessons: 2 });
    expect(minutesOn(state, DAY)).toBeCloseTo(20 / 60, 6);
    expect(minutesOn(state, '2030-01-01')).toBe(0);
  });

  it('anota las muestras de cada tecla y las lecciones recientes', () => {
    const { state } = play(EMPTY_PROGRESS, 'u2-1', PERFECT);
    expect(state.keys['60']).toHaveLength(10);
    expect(state.history).toEqual([{ day: DAY, lesson: 'u2-1', accuracy: 1000, rhythm: 600 }]);
  });

  it('las teclas que ya no existen en ninguna lección se podan', () => {
    const state: Progress = { ...EMPTY_PROGRESS, keys: { '1': [{ ok: true, ms: 1 }] } };
    const next = play(state, 'u2-1', PERFECT).state;
    expect(Object.keys(next.keys)).not.toContain('1');
  });

  it('el historial y los días se recortan al guardar', () => {
    let state: Progress = EMPTY_PROGRESS;
    for (let i = 0; i < MAX_HISTORY + 5; i++) {
      state = play(state, 'u2-1', PERFECT, addDays(DAY, i)).state;
    }
    expect(state.history).toHaveLength(MAX_HISTORY);
    expect(Object.keys(state.daily).length).toBeLessThanOrEqual(MAX_DAILY_DAYS);
  });

  it('avisa si se sube de nivel de pianista', () => {
    const state: Progress = { ...EMPTY_PROGRESS, xp: 90 };
    const { gains } = play(state, 'u2-1', PERFECT);
    expect(gains).toMatchObject({ levelBefore: 1, levelAfter: 2 });
  });

  it('no modifica el progreso anterior', () => {
    const before = EMPTY_PROGRESS;
    play(before, 'u2-1', PERFECT);
    expect(before).toEqual(EMPTY_PROGRESS);
    expect(Object.keys(before.lessons)).toHaveLength(0);
  });
});
