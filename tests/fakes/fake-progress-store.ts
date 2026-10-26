import type { Progress } from '@/core/domain/progress';
import { serializeProgress } from '@/core/domain/progress';
import type { ProgressStore } from '@/core/ports/progress-store';

/** Almacén en memoria. `stored` guarda lo mismo que guardaría el navegador (ya serializado). */
export class FakeProgressStore implements ProgressStore {
  stored: unknown;
  readonly saves: Progress[] = [];
  /** Con `true`, `save` falla como una cuota llena. */
  failSaves = false;

  constructor(stored: unknown = null) {
    this.stored = stored;
  }

  load(): unknown {
    return this.stored;
  }

  save(progress: Progress): boolean {
    if (this.failSaves) return false;
    this.stored = JSON.parse(JSON.stringify(serializeProgress(progress)));
    this.saves.push(progress);
    return true;
  }
}
