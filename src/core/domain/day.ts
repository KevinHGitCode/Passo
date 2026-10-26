/**
 * Días del calendario local como texto `AAAA-MM-DD`. Las cuentas se hacen en UTC sobre la fecha ya
 * convertida, así el cambio de horario (días de 23 o 25 horas) no desplaza nada.
 */

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

function utcOf(day: string): number | null {
  const match = DAY_PATTERN.exec(day);
  if (match === null) return null;
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const time = Date.UTC(year, month - 1, date);
  const check = new Date(time);
  // Date.UTC corrige fechas imposibles (31 de febrero); aquí se rechazan.
  const real =
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === date;
  return real ? time : null;
}

export function isValidDay(value: unknown): value is string {
  return typeof value === 'string' && utcOf(value) !== null;
}

/** Días de `from` a `to` (positivo si `to` es posterior). Las fechas deben ser válidas. */
export function daysBetween(from: string, to: string): number {
  const a = utcOf(from);
  const b = utcOf(to);
  if (a === null || b === null) throw new RangeError(`Día no válido: ${from} / ${to}`);
  return Math.round((b - a) / MS_PER_DAY);
}

export function addDays(day: string, count: number): string {
  const time = utcOf(day);
  if (time === null) throw new RangeError(`Día no válido: ${day}`);
  return new Date(time + count * MS_PER_DAY).toISOString().slice(0, 10);
}

/** El lunes de la semana de `day`: clave de «una semana» (el descanso de la racha es por semana). */
export function weekStart(day: string): string {
  const time = utcOf(day);
  if (time === null) throw new RangeError(`Día no válido: ${day}`);
  const weekday = new Date(time).getUTCDay(); // 0 = domingo
  return addDays(day, -((weekday + 6) % 7));
}

/** Formatea una fecha local (año, mes y día del reloj de pared de la persona). */
export function dayOf(year: number, month: number, date: number): string {
  const pad = (value: number, width: number) => String(value).padStart(width, '0');
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(date, 2)}`;
}
