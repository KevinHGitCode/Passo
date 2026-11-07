import type { AudioFrame, FrameSource } from '@/core/ports/audio-frames';
import type { Unsubscribe } from '@/core/ports/note-input';

const SAMPLE_RATE = 48000;

/** Un micrófono falso que entrega una señal ya hecha, en fotogramas como el real (ventana de 4096, salto de 1024). */
export class FakeFrameSource implements FrameSource {
  private readonly handlers = new Set<(frame: AudioFrame) => void>();

  subscribeFrames(handler: (frame: AudioFrame) => void): Unsubscribe {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  get subscribers(): number {
    return this.handlers.size;
  }

  /** Entrega `signal` como si sonara desde `startAtMs`. */
  play(signal: Float32Array, startAtMs = 0, options: { noiseRms?: number } = {}): void {
    const windowSize = 4096;
    const hop = 1024;
    for (let end = hop; end <= signal.length; end += hop) {
      const samples = new Float32Array(windowSize);
      const from = end - windowSize;
      for (let i = 0; i < windowSize; i++) {
        samples[i] = from + i >= 0 ? (signal[from + i] as number) : 0;
      }
      const frame: AudioFrame = {
        at: startAtMs + (end / SAMPLE_RATE) * 1000,
        sampleRate: SAMPLE_RATE,
        samples,
        newSamples: hop,
        noiseRms: options.noiseRms ?? 0.0005,
        listening: true,
      };
      this.handlers.forEach((handler) => handler(frame));
    }
  }
}
