import { addDays } from '@/core/domain/day';
import type { Calendar } from '@/core/ports/calendar';

export class FakeCalendar implements Calendar {
  private day: string;

  constructor(day = '2026-10-26') {
    this.day = day;
  }

  today(): string {
    return this.day;
  }

  set(day: string): void {
    this.day = day;
  }

  advance(days = 1): void {
    this.day = addDays(this.day, days);
  }
}
