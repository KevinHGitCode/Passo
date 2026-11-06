import type { ToneSpec } from '@/core/domain/reference-tone';
import type { ToneOutput } from '@/core/ports/tone-output';

/** Una salida de tono falsa: apunta lo que se pidió y termina cuando la prueba lo dice. */
export class FakeTone implements ToneOutput {
  readonly played: ToneSpec[] = [];
  stops = 0;
  /** Si es `true`, `playTone` falla como lo haría un audio roto. */
  failing = false;
  private readonly ends: (() => void)[] = [];
  private readonly every: (() => void)[] = [];

  playTone(tone: ToneSpec, onEnd: () => void): void {
    if (this.failing) throw new Error('audio roto');
    this.played.push(tone);
    this.ends.push(onEnd);
    this.every.push(onEnd);
  }

  /** Como el adaptador real: cortar el tono avisa de que terminó. */
  stopTone(): void {
    this.stops += 1;
    this.ends.pop()?.();
  }

  /** El tono más reciente acaba solo. */
  finish(): void {
    this.ends.pop()?.();
  }

  /** El aviso de un tono que ya se había dado por terminado llega tarde (el nº de orden con que se pidió). */
  finishLate(order: number): void {
    this.every[order]?.();
  }
}
