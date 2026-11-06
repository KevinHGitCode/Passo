import type { ToneSpec } from '@/core/domain/reference-tone';
import type { ToneOutput } from '@/core/ports/tone-output';

/** Una salida de tono falsa: apunta lo que se pidió y termina cuando la prueba lo dice. */
export class FakeTone implements ToneOutput {
  readonly played: ToneSpec[] = [];
  stops = 0;
  private readonly ends: (() => void)[] = [];

  playTone(tone: ToneSpec, onEnd: () => void): void {
    this.played.push(tone);
    this.ends.push(onEnd);
  }

  stopTone(): void {
    this.stops += 1;
  }

  /** El tono más reciente acaba solo. */
  finish(): void {
    this.ends.pop()?.();
  }
}
