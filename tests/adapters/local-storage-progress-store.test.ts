import { LocalCalendar } from '@/adapters/calendar/local-calendar';
import {
  LocalStorageProgressStore,
  PROGRESS_CORRUPT_KEY,
  PROGRESS_KEY,
  PROGRESS_PROBE_KEY,
} from '@/adapters/storage/local-storage-progress-store';
import type { StorageLike } from '@/adapters/storage/local-storage-preferences-store';
import { EMPTY_PROGRESS, PROGRESS_VERSION, parseProgress } from '@/core/domain/progress';
import type { Progress } from '@/core/domain/progress';

class MemoryStorage implements StorageLike {
  readonly data = new Map<string, string>();
  failWrites = false;
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failWrites) throw new DOMException('cuota llena', 'QuotaExceededError');
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

const progress: Progress = {
  ...EMPTY_PROGRESS,
  xp: 120,
  keys: { '60': [{ ok: true, ms: 900 }] },
};

describe('LocalStorageProgressStore', () => {
  it('guarda como JSON compacto y recupera lo mismo', () => {
    const storage = new MemoryStorage();
    const store = new LocalStorageProgressStore(storage);
    expect(store.load()).toBeNull();
    expect(store.save(progress)).toBe(true);
    const text = storage.data.get(PROGRESS_KEY) ?? '';
    expect(JSON.parse(text)).toMatchObject({ version: PROGRESS_VERSION, xp: 120 });
    // Las muestras van como [1|0, ms].
    expect(JSON.parse(text).keys['60']).toEqual([[1, 900]]);
    expect(parseProgress(store.load()).state).toEqual(progress);
  });

  it('sin almacenamiento (bloqueado) no guarda ni lanza', () => {
    const store = new LocalStorageProgressStore(undefined);
    expect(store.load()).toBeNull();
    expect(store.save(progress)).toBe(false);
  });

  it('con la cuota llena, save devuelve false', () => {
    const storage = new MemoryStorage();
    storage.failWrites = true;
    expect(new LocalStorageProgressStore(storage).save(progress)).toBe(false);
  });

  it('un JSON dañado se lee como vacío y se guarda una copia aparte', () => {
    const storage = new MemoryStorage();
    storage.data.set(PROGRESS_KEY, '{"version":1,"xp":');
    const store = new LocalStorageProgressStore(storage);
    expect(store.load()).toBeNull();
    expect(storage.data.get(PROGRESS_CORRUPT_KEY)).toBe('{"version":1,"xp":');
  });

  it('la primera copia dañada no se pisa con otras', () => {
    const storage = new MemoryStorage();
    const store = new LocalStorageProgressStore(storage);
    storage.data.set(PROGRESS_KEY, 'primero {');
    store.load();
    storage.data.set(PROGRESS_KEY, 'segundo {');
    store.load();
    expect(storage.data.get(PROGRESS_CORRUPT_KEY)).toBe('primero {');
  });

  it('si ni la copia se puede guardar, se sigue sin ella', () => {
    const storage = new MemoryStorage();
    storage.data.set(PROGRESS_KEY, 'roto {');
    storage.failWrites = true;
    expect(new LocalStorageProgressStore(storage).load()).toBeNull();
  });
});

describe('LocalStorageProgressStore · sonda, copia y borrado', () => {
  it('la sonda dice que se puede guardar y no deja basura', () => {
    const storage = new MemoryStorage();
    expect(new LocalStorageProgressStore(storage).canSave()).toBe(true);
    expect(storage.data.has(PROGRESS_PROBE_KEY)).toBe(false);
  });

  it('la sonda dice que no con la cuota llena o sin almacenamiento', () => {
    const full = new MemoryStorage();
    full.failWrites = true;
    expect(new LocalStorageProgressStore(full).canSave()).toBe(false);
    expect(new LocalStorageProgressStore(undefined).canSave()).toBe(false);
  });

  it('conserva aparte lo que no tiene la forma de un progreso, sin pisar la primera copia', () => {
    const storage = new MemoryStorage();
    const store = new LocalStorageProgressStore(storage);
    store.keepCopy({ version: 'uno' });
    store.keepCopy({ otra: 'cosa' });
    expect(storage.data.get(PROGRESS_CORRUPT_KEY)).toBe('{"version":"uno"}');
  });

  it('un valor imposible de escribir no rompe la copia', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    expect(() =>
      new LocalStorageProgressStore(new MemoryStorage()).keepCopy(circular),
    ).not.toThrow();
  });

  it('borrar quita el progreso y la copia aparte', () => {
    const storage = new MemoryStorage();
    storage.data.set(PROGRESS_KEY, '{"version":1}');
    storage.data.set(PROGRESS_CORRUPT_KEY, 'roto {');
    expect(new LocalStorageProgressStore(storage).clear()).toBe(true);
    expect(storage.data.size).toBe(0);
  });

  it('sin almacenamiento, o sin removeItem, borrar dice que no pudo', () => {
    expect(new LocalStorageProgressStore(undefined).clear()).toBe(false);
    const noRemove: StorageLike = { getItem: () => null, setItem: () => undefined };
    expect(new LocalStorageProgressStore(noRemove).clear()).toBe(false);
  });
});

describe('LocalCalendar', () => {
  it('da el día local de la fecha del equipo', () => {
    // 3 de marzo de 2026, 23:59 hora local (constructor con año, mes y día locales).
    const calendar = new LocalCalendar(() => new Date(2026, 2, 3, 23, 59));
    expect(calendar.today()).toBe('2026-03-03');
  });

  it('pasada la medianoche es otro día', () => {
    expect(new LocalCalendar(() => new Date(2026, 2, 4, 0, 1)).today()).toBe('2026-03-04');
  });

  it('con relojes de otro año rellena con ceros', () => {
    expect(new LocalCalendar(() => new Date(2027, 0, 5, 12, 0)).today()).toBe('2027-01-05');
  });

  it('sin argumentos usa el reloj del equipo y da una fecha válida', () => {
    expect(new LocalCalendar().today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
