import type { AudioControl, AudioStatus } from '@/core/ports/audio-control';

export class FakeAudioControl implements AudioControl {
  status: AudioStatus = 'bloqueado';
  unlocked = 0;
  private readonly handlers = new Set<(status: AudioStatus) => void>();

  getStatus(): AudioStatus {
    return this.status;
  }

  subscribeStatus(handler: (status: AudioStatus) => void) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  unlock(): Promise<void> {
    this.unlocked += 1;
    this.set('listo');
    return Promise.resolve();
  }

  set(status: AudioStatus): void {
    this.status = status;
    this.handlers.forEach((handler) => handler(status));
  }
}
