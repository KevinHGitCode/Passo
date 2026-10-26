import type { Preferences } from '@/core/domain/preferences';
import type { PreferencesStore } from '@/core/ports/preferences-store';

/** Lo mínimo que necesitamos de `localStorage` (facilita las pruebas). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export const PREFERENCES_KEY = 'passo.preferencias';
/** Antes de las preferencias solo se guardaba el tema; se aprovecha la primera vez. */
export const LEGACY_THEME_KEY = 'passo.tema';

/** El almacenamiento del navegador, o `undefined` si está bloqueado (ventana privada, permisos). */
export function browserStorage(): StorageLike | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** Guarda las preferencias en el navegador de la persona; nada sale del equipo. */
export class LocalStoragePreferencesStore implements PreferencesStore {
  private readonly storage: StorageLike | undefined;

  constructor(storage: StorageLike | undefined) {
    this.storage = storage;
  }

  load(): unknown {
    if (!this.storage) return null;
    try {
      const text = this.storage.getItem(PREFERENCES_KEY);
      if (text !== null) return JSON.parse(text) as unknown;
      const legacyTheme = this.storage.getItem(LEGACY_THEME_KEY);
      return legacyTheme === null ? null : { theme: legacyTheme };
    } catch {
      return null;
    }
  }

  save(preferences: Preferences): void {
    try {
      this.storage?.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    } catch {
      // Cuota llena o almacenamiento bloqueado: las preferencias solo duran esta visita.
    }
  }
}
