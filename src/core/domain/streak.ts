import { addDays, daysBetween, isValidDay, weekStart } from './day';

/**
 * La racha: días seguidos con al menos una lección completada. Un solo día sin practicar **por
 * semana** se perdona (el descanso); con dos seguidos, o un segundo hueco en la misma semana, se rompe.
 */
export interface Streak {
  /** Días seguidos hasta el último día con práctica. */
  readonly count: number;
  /** Último día con una lección completada. */
  readonly last: string | null;
  /** Lunes de la semana en la que ya se gastó el día de descanso. */
  readonly restWeek: string | null;
}

export const EMPTY_STREAK: Streak = { count: 0, last: null, restWeek: null };

/** ¿Se puede perdonar el hueco que dejó `missedDay`? Sí, si esa semana aún no se usó el descanso. */
function restAvailable(streak: Streak, missedDay: string): boolean {
  return streak.restWeek !== weekStart(missedDay);
}

/** La racha después de completar una lección el día `today`. */
export function advanceStreak(streak: Streak, today: string): Streak {
  if (streak.last === null || streak.count <= 0) {
    return { count: 1, last: today, restWeek: streak.restWeek };
  }
  const gap = daysBetween(streak.last, today);
  // El mismo día, o el reloj retrocedió: no suma ni rompe nada.
  if (gap <= 0) return streak;
  if (gap === 1) return { ...streak, count: streak.count + 1, last: today };
  if (gap === 2) {
    const missed = addDays(streak.last, 1);
    if (restAvailable(streak, missed)) {
      return { count: streak.count + 1, last: today, restWeek: weekStart(missed) };
    }
  }
  return { count: 1, last: today, restWeek: streak.restWeek };
}

/** La racha que se muestra hoy, sin escribir nada: 0 si ya se rompió. */
export function streakAt(streak: Streak, today: string): number {
  if (streak.last === null || streak.count <= 0 || !isValidDay(today)) return 0;
  const gap = daysBetween(streak.last, today);
  if (gap <= 1) return streak.count;
  if (gap === 2 && restAvailable(streak, addDays(streak.last, 1))) return streak.count;
  return 0;
}

/** ¿Ya se practicó hoy? (para decir «Empieza hoy» o «Hoy ya está»). */
export function practicedToday(streak: Streak, today: string): boolean {
  return streak.last === today;
}
