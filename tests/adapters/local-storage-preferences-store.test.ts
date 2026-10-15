import {
  LEGACY_THEME_KEY,
  LocalStoragePreferencesStore,
  PREFERENCES_KEY,
} from '@/adapters/storage/local-storage-preferences-store';
import type { StorageLike } from '@/adapters/storage/local-storage-preferences-store';
import { PreferencesService } from '@/core/application/preferences-service';
import { DEFAULT_PREFERENCES } from '@/core/domain/preferences';

class MemoryStorage implements StorageLike {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe('LocalStoragePreferencesStore', () => {
  it('guarda y recupera las preferencias como JSON', () => {
    const storage = new MemoryStorage();
    const store = new LocalStoragePreferencesStore(storage);
    expect(store.load()).toBeNull();
    store.save({ ...DEFAULT_PREFERENCES, notation: 'americana' });
    expect(JSON.parse(storage.data.get(PREFERENCES_KEY) ?? '')).toMatchObject({
      version: 1,
      notation: 'americana',
    });
    expect(store.load()).toMatchObject({ notation: 'americana' });
  });

  it('migra el tema que se guardaba antes de que existieran las preferencias', () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_THEME_KEY, 'claro');
    const service = new PreferencesService(new LocalStoragePreferencesStore(storage));
    expect(service.getSnapshot()).toEqual({ ...DEFAULT_PREFERENCES, theme: 'claro' });
  });

  it('las preferencias nuevas mandan sobre el tema antiguo', () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_THEME_KEY, 'claro');
    const store = new LocalStoragePreferencesStore(storage);
    store.save({ ...DEFAULT_PREFERENCES, theme: 'oscuro' });
    expect(new PreferencesService(store).getSnapshot().theme).toBe('oscuro');
  });

  it('JSON roto o un valor raro no lanzan: se usan los valores de fábrica', () => {
    const storage = new MemoryStorage();
    storage.setItem(PREFERENCES_KEY, '{no es json');
    expect(new LocalStoragePreferencesStore(storage).load()).toBeNull();
    storage.setItem(PREFERENCES_KEY, '42');
    expect(new PreferencesService(new LocalStoragePreferencesStore(storage)).getSnapshot()).toEqual(
      DEFAULT_PREFERENCES,
    );
  });

  it('sin almacenamiento (ventana privada, permisos) no hace nada y no falla', () => {
    const store = new LocalStoragePreferencesStore(undefined);
    expect(store.load()).toBeNull();
    expect(() => store.save(DEFAULT_PREFERENCES)).not.toThrow();
  });

  it('un almacenamiento que lanza al leer o escribir no rompe la app', () => {
    const hostile: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const store = new LocalStoragePreferencesStore(hostile);
    expect(store.load()).toBeNull();
    expect(() => store.save(DEFAULT_PREFERENCES)).not.toThrow();
  });
});
