import { serializeProgress } from '@/core/domain/progress';
import type { Progress } from '@/core/domain/progress';
import type { ProgressStore } from '@/core/ports/progress-store';
import type { StorageLike } from './local-storage-preferences-store';

export const PROGRESS_KEY = 'passo.progreso';
/** Copia de lo que no se pudo leer: así un fallo nunca destruye en silencio lo que había. */
export const PROGRESS_CORRUPT_KEY = 'passo.progreso.corrupto';
/** Clave de prueba para saber si el navegador deja guardar. */
export const PROGRESS_PROBE_KEY = 'passo.progreso.sonda';

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

  canSave(): boolean {
    if (!this.storage) return false;
    try {
      this.storage.setItem(PROGRESS_PROBE_KEY, '1');
      this.storage.removeItem?.(PROGRESS_PROBE_KEY);
      return true;
    } catch {
      return false;
    }
  }

  /** Lo guardado que no tiene la forma esperada (no es un JSON dañado, pero tampoco un progreso). */
  keepCopy(raw: unknown): void {
    try {
      this.keepCorruptCopy(JSON.stringify(raw));
    } catch {
      // Un valor que no se puede escribir no se conserva.
    }
  }

  clear(): boolean {
    if (!this.storage?.removeItem) return false;
    try {
      this.storage.removeItem(PROGRESS_KEY);
      this.storage.removeItem(PROGRESS_CORRUPT_KEY);
      return true;
    } catch {
      return false;
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
