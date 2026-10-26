import { serializeProgress } from '@/core/domain/progress';
import type { Progress } from '@/core/domain/progress';
import type { ProgressStore } from '@/core/ports/progress-store';
import type { StorageLike } from './local-storage-preferences-store';

export const PROGRESS_KEY = 'passo.progreso';
/** Copia de lo que no se pudo leer: así un fallo nunca destruye en silencio lo que había. */
export const PROGRESS_CORRUPT_KEY = 'passo.progreso.corrupto';

/** Guarda el progreso en el navegador de la persona; nada sale del equipo. */
export class LocalStorageProgressStore implements ProgressStore {
  private readonly storage: StorageLike | undefined;

  constructor(storage: StorageLike | undefined) {
    this.storage = storage;
  }

  load(): unknown {
    if (!this.storage) return null;
    let text: string | null = null;
    try {
      text = this.storage.getItem(PROGRESS_KEY);
      return text === null ? null : (JSON.parse(text) as unknown);
    } catch {
      this.keepCorruptCopy(text);
      return null;
    }
  }

  save(progress: Progress): boolean {
    if (!this.storage) return false;
    try {
      this.storage.setItem(PROGRESS_KEY, JSON.stringify(serializeProgress(progress)));
      return true;
    } catch {
      // Cuota llena o almacenamiento bloqueado: el progreso solo dura esta visita.
      return false;
    }
  }

  /** Conserva la primera copia dañada (no se pisa con otras más nuevas). */
  private keepCorruptCopy(text: string | null): void {
    if (text === null || !this.storage) return;
    try {
      if (this.storage.getItem(PROGRESS_CORRUPT_KEY) === null) {
        this.storage.setItem(PROGRESS_CORRUPT_KEY, text);
      }
    } catch {
      // Sin espacio para la copia: se sigue sin ella.
    }
  }
}
