import { applyPreferencesPatch, parsePreferences, samePreferences } from '../domain/preferences';
import type { Preferences, PreferencesPatch } from '../domain/preferences';
import { DEFAULT_PREFERENCES } from '../domain/preferences';
import type { PreferencesStore } from '../ports/preferences-store';
import type { Unsubscribe } from '../ports/note-input';

/** Preferencias de la persona: se cargan al empezar, se validan y se guardan con cada cambio. */
export class PreferencesService {
  private readonly store: PreferencesStore;
  private current: Preferences;
  private readonly listeners = new Set<() => void>();

  /**
   * `initial` (opcional, para el modo de desarrollo: `?instrumento=guitarra`) manda sobre lo guardado
   * en esta visita pero **no se guarda** hasta que la persona cambie algo.
   */
  constructor(store: PreferencesStore, initial?: PreferencesPatch) {
    this.store = store;
    const loaded = parsePreferences(this.read());
    this.current = initial === undefined ? loaded : applyPreferencesPatch(loaded, initial);
  }

  /** Foto inmutable: cambia de identidad solo cuando algo cambia (apta para useSyncExternalStore). */
  getSnapshot = (): Preferences => this.current;

  subscribe = (listener: () => void): Unsubscribe => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  update(patch: PreferencesPatch): void {
    this.replace(applyPreferencesPatch(this.current, patch));
  }

  /** Vuelve a los valores de fábrica. */
  reset(): void {
    this.replace(DEFAULT_PREFERENCES);
  }

  private replace(next: Preferences): void {
    if (samePreferences(next, this.current)) return;
    this.current = next;
    try {
      this.store.save(next);
    } catch {
      // Sin almacenamiento seguimos con las preferencias de esta visita.
    }
    this.listeners.forEach((listener) => listener());
  }

  private read(): unknown {
    try {
      return this.store.load();
    } catch {
      return null;
    }
  }
}
