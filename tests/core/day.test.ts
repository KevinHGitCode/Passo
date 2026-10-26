import { addDays, dayOf, daysBetween, isValidDay, weekStart } from '@/core/domain/day';

describe('días del calendario', () => {
  it('reconoce fechas reales y rechaza el resto', () => {
    expect(isValidDay('2026-10-26')).toBe(true);
    expect(isValidDay('2028-02-29')).toBe(true);
    expect(isValidDay('2027-02-29')).toBe(false);
    expect(isValidDay('2026-13-01')).toBe(false);
    expect(isValidDay('2026-10-32')).toBe(false);
    expect(isValidDay('2026-1-5')).toBe(false);
    expect(isValidDay('hoy')).toBe(false);
    expect(isValidDay(20261026)).toBe(false);
    expect(isValidDay(null)).toBe(false);
  });

  it('cuenta los días entre dos fechas, con signo', () => {
    expect(daysBetween('2026-10-26', '2026-10-26')).toBe(0);
    expect(daysBetween('2026-10-26', '2026-10-27')).toBe(1);
    expect(daysBetween('2026-10-27', '2026-10-26')).toBe(-1);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
  });

  it('el cambio de horario no altera la cuenta (se calcula sobre fechas, no sobre horas)', () => {
    // 28 de marzo → 30 de marzo de 2026 (cambio a horario de verano en Europa): siempre 2 días.
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    // 24 → 26 de octubre de 2026 (vuelta al horario de invierno).
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
  });

  it('suma días cruzando meses y años', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('el lunes de la semana de cualquier día', () => {
    // 26 de octubre de 2026 es lunes.
    expect(weekStart('2026-10-26')).toBe('2026-10-26');
    expect(weekStart('2026-10-28')).toBe('2026-10-26');
    expect(weekStart('2026-11-01')).toBe('2026-10-26');
    expect(weekStart('2026-11-02')).toBe('2026-11-02');
  });

  it('formatea con ceros a la izquierda', () => {
    expect(dayOf(2026, 3, 5)).toBe('2026-03-05');
    expect(dayOf(987, 12, 31)).toBe('0987-12-31');
  });

  it('las fechas no válidas lanzan (los datos de fuera se validan antes)', () => {
    expect(() => daysBetween('mal', '2026-10-26')).toThrow(RangeError);
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError);
    expect(() => weekStart('x')).toThrow(RangeError);
  });
});
