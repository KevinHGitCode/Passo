import { EMPTY_STREAK, advanceStreak, practicedToday, streakAt } from '@/core/domain/streak';
import type { Streak } from '@/core/domain/streak';

// Semana del 26 de octubre de 2026 (lunes) al 1 de noviembre (domingo).
const MON = '2026-10-26';
const TUE = '2026-10-27';
const WED = '2026-10-28';
const THU = '2026-10-29';
const FRI = '2026-10-30';
const SAT = '2026-10-31';
const SUN = '2026-11-01';
const NEXT_MON = '2026-11-02';

describe('racha', () => {
  it('la primera lección empieza la racha en 1', () => {
    expect(advanceStreak(EMPTY_STREAK, MON)).toEqual({ count: 1, last: MON, restWeek: null });
  });

  it('varias lecciones el mismo día no suman', () => {
    const once = advanceStreak(EMPTY_STREAK, MON);
    expect(advanceStreak(once, MON)).toBe(once);
  });

  it('un día tras otro suma de uno en uno', () => {
    let streak = advanceStreak(EMPTY_STREAK, MON);
    streak = advanceStreak(streak, TUE);
    streak = advanceStreak(streak, WED);
    expect(streak).toMatchObject({ count: 3, last: WED });
  });

  it('un día de descanso por semana se perdona: la racha sigue y se gasta el descanso', () => {
    const streak = advanceStreak({ count: 3, last: MON, restWeek: null }, WED);
    // El martes no se practicó: se gasta el descanso de esa semana y hoy suma 1.
    expect(streak).toEqual({ count: 4, last: WED, restWeek: MON });
  });

  it('un segundo hueco en la misma semana rompe la racha', () => {
    const afterRest = advanceStreak({ count: 3, last: MON, restWeek: null }, WED);
    // Salta el jueves.
    expect(advanceStreak(afterRest, FRI)).toEqual({ count: 1, last: FRI, restWeek: MON });
  });

  it('al empezar otra semana el descanso vuelve a estar disponible', () => {
    const afterRest = advanceStreak({ count: 3, last: MON, restWeek: null }, WED); // gasta la semana del lunes 26
    const sunday = advanceStreak({ ...afterRest, last: SAT }, SUN);
    // El lunes 2 no se practica; el martes 3 se practica: el hueco del lunes es de la semana nueva.
    expect(advanceStreak(sunday, '2026-11-03')).toMatchObject({
      count: sunday.count + 1,
      restWeek: NEXT_MON,
    });
  });

  it('dos días seguidos sin practicar rompen la racha', () => {
    expect(advanceStreak({ count: 9, last: MON, restWeek: null }, THU)).toEqual({
      count: 1,
      last: THU,
      restWeek: null,
    });
  });

  it('si el reloj retrocede no rompe ni suma', () => {
    const streak: Streak = { count: 5, last: WED, restWeek: null };
    expect(advanceStreak(streak, MON)).toEqual(streak);
  });

  it('la racha que se muestra hoy: viva el mismo día y el siguiente', () => {
    const streak: Streak = { count: 4, last: MON, restWeek: null };
    expect(streakAt(streak, MON)).toBe(4);
    expect(streakAt(streak, TUE)).toBe(4);
  });

  it('con un hueco perdonable se sigue mostrando; con dos o sin descanso, 0', () => {
    const streak: Streak = { count: 4, last: MON, restWeek: null };
    expect(streakAt(streak, WED)).toBe(4);
    expect(streakAt(streak, THU)).toBe(0);
    expect(streakAt({ ...streak, restWeek: MON }, WED)).toBe(0);
  });

  it('sin racha o con una fecha mala no se rompe', () => {
    expect(streakAt(EMPTY_STREAK, MON)).toBe(0);
    expect(streakAt({ count: 3, last: MON, restWeek: null }, 'mal')).toBe(0);
  });

  it('sabe si ya se practicó hoy', () => {
    expect(practicedToday({ count: 1, last: MON, restWeek: null }, MON)).toBe(true);
    expect(practicedToday({ count: 1, last: MON, restWeek: null }, TUE)).toBe(false);
    expect(practicedToday(EMPTY_STREAK, MON)).toBe(false);
  });
});
