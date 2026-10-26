import { dayOf } from '@/core/domain/day';
import type { Calendar } from '@/core/ports/calendar';

/** El calendario del equipo: el día local (la fecha de pared de la persona, con su zona horaria). */
export class LocalCalendar implements Calendar {
  private readonly now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.now = now;
  }

  today(): string {
    const date = this.now();
    return dayOf(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }
}
