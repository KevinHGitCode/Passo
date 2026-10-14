import { SILENT_MONITOR } from '@/core/ports/input-monitor';
import type { InputMonitor, MonitorSnapshot } from '@/core/ports/input-monitor';
import type { Unsubscribe } from '@/core/ports/note-input';
import { FakeNoteInput } from './fake-note-input';

/** Micrófono falso para las pruebas de interfaz: estado de entrada + monitor, sin audio real. */
export class FakeMicInput extends FakeNoteInput implements InputMonitor {
  starts = 0;
  stops = 0;
  private monitor: MonitorSnapshot = SILENT_MONITOR;
  private readonly monitorHandlers = new Set<(snapshot: MonitorSnapshot) => void>();

  constructor() {
    super('microfono');
    this.setStatus({ kind: 'inactivo' });
  }

  override start(): Promise<void> {
    this.starts += 1;
    return Promise.resolve();
  }

  override stop(): void {
    this.stops += 1;
  }

  getMonitor(): MonitorSnapshot {
    return this.monitor;
  }

  subscribeMonitor(handler: (snapshot: MonitorSnapshot) => void): Unsubscribe {
    this.monitorHandlers.add(handler);
    return () => this.monitorHandlers.delete(handler);
  }

  setMonitor(changes: Partial<MonitorSnapshot>): void {
    this.monitor = { ...this.monitor, ...changes };
    this.monitorHandlers.forEach((handler) => handler(this.monitor));
  }

  /** Deja el micrófono listo: conectado y escuchando. */
  makeReady(): void {
    this.setStatus({ kind: 'conectado', deviceName: 'Micrófono de prueba' });
    this.setMonitor({ phase: 'escuchando', calibration: 1, gateLevel: 0.2, level: 0.1 });
  }
}
