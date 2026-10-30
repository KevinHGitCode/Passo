import type { PitchMonitor, PitchReading, PitchTarget } from '@/core/ports/pitch-monitor';

/** Un micrófono falso que solo da el tono continuo: se emite a mano y se ve qué intervalo se pidió. */
export class FakePitch implements PitchMonitor, PitchTarget {
  readonly searches: ({ minHz: number; maxHz: number } | null)[] = [];
  private readonly handlers = new Set<(reading: PitchReading | null) => void>();
  private current: PitchReading | null = null;

  getPitch(): PitchReading | null {
    return this.current;
  }

  subscribePitch(handler: (reading: PitchReading | null) => void) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  setPitchSearch(range: { minHz: number; maxHz: number } | null): void {
    this.searches.push(range);
  }

  get listeners(): number {
    return this.handlers.size;
  }

  emit(reading: PitchReading | null): void {
    this.current = reading;
    this.handlers.forEach((handler) => handler(reading));
  }
}
