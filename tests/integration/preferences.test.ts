import { PracticeSession } from '@/core/application/practice-session';
import { PreferencesService } from '@/core/application/preferences-service';
import { bindSessionToPreferences } from '@/core/application/preferences-sync';
import { roundConfigFor } from '@/core/domain/exercise';
import type { RoundConfig } from '@/core/domain/exercise';
import { DEFAULT_PREFERENCES } from '@/core/domain/preferences';
import { createSeededRng } from '@/core/domain/rng';
import type { PreferencesStore } from '@/core/ports/preferences-store';
import { FakeClock } from '../fakes/fake-clock';
import { FakeNoteInput } from '../fakes/fake-note-input';
import { FakePreferencesStore } from '../fakes/fake-preferences-store';

function makeSession(config?: RoundConfig) {
  return new PracticeSession({
    inputs: [new FakeNoteInput()],
    audio: { noteOn: () => undefined, noteOff: () => undefined },
    clock: new FakeClock(0),
    rng: createSeededRng(1),
    ...(config ? { config } : {}),
  });
}

describe('PreferencesService', () => {
  it('carga lo guardado, validándolo', () => {
    const store = new FakePreferencesStore({ version: 1, notation: 'americana', theme: 'rosa' });
    const service = new PreferencesService(store);
    expect(service.getSnapshot()).toEqual({
      ...DEFAULT_PREFERENCES,
      notation: 'americana',
    });
  });

  it('sin nada guardado usa los valores de fábrica; no escribe hasta que algo cambia', () => {
    const store = new FakePreferencesStore();
    const service = new PreferencesService(store);
    expect(service.getSnapshot()).toBe(service.getSnapshot());
    expect(service.getSnapshot()).toEqual(DEFAULT_PREFERENCES);
    expect(store.saves).toHaveLength(0);
  });

  it('cada cambio se guarda y avisa; repetir el mismo valor no hace nada', () => {
    const store = new FakePreferencesStore();
    const service = new PreferencesService(store);
    const listener = vi.fn();
    service.subscribe(listener);
    const before = service.getSnapshot();

    service.update({ notation: 'americana' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.saves).toHaveLength(1);
    expect(service.getSnapshot()).not.toBe(before);

    const after = service.getSnapshot();
    service.update({ notation: 'americana' });
    service.update({ theme: 'rosa' as never });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.saves).toHaveLength(1);
    expect(service.getSnapshot()).toBe(after);
  });

  it('lo guardado se recupera en la visita siguiente', () => {
    const store = new FakePreferencesStore();
    new PreferencesService(store).update({
      input: 'teclado-pc',
      mode: 'terceras',
      levels: { terceras: 2 },
    });
    const next = new PreferencesService(store).getSnapshot();
    expect(next).toMatchObject({ input: 'teclado-pc', mode: 'terceras' });
    expect(next.levels.terceras).toBe(2);
  });

  it('restablecer vuelve a los valores de fábrica y se guarda', () => {
    const store = new FakePreferencesStore();
    const service = new PreferencesService(store);
    service.update({ help: false });
    service.reset();
    expect(service.getSnapshot()).toEqual(DEFAULT_PREFERENCES);
    expect(new PreferencesService(store).getSnapshot()).toEqual(DEFAULT_PREFERENCES);
  });

  it('un almacenamiento que falla no rompe nada: se sigue con lo de esta visita', () => {
    const broken: PreferencesStore = {
      load: () => {
        throw new Error('bloqueado');
      },
      save: () => {
        throw new Error('lleno');
      },
    };
    const service = new PreferencesService(broken);
    expect(service.getSnapshot()).toEqual(DEFAULT_PREFERENCES);
    expect(() => service.update({ help: false })).not.toThrow();
    expect(service.getSnapshot().help).toBe(false);
  });

  it('quien deja de escuchar no recibe más avisos', () => {
    const service = new PreferencesService(new FakePreferencesStore());
    const listener = vi.fn();
    const stop = service.subscribe(listener);
    stop();
    service.update({ help: false });
    expect(listener).not.toHaveBeenCalled();
  });
});

// Con el micrófono solo hay ejercicio de notas: para probar terceras y acordes, otra entrada.
const WITH_KEYBOARD = { version: 1, input: 'teclado-pc' };

describe('bindSessionToPreferences', () => {
  it('al empezar aplica las preferencias a la sesión (notación, ayuda y ejercicio)', () => {
    const store = new FakePreferencesStore({
      version: 1,
      input: 'teclado-pc',
      notation: 'americana',
      help: false,
      mode: 'acordes',
      levels: { notas: 1, terceras: 1, acordes: 3 },
    });
    const session = makeSession();
    bindSessionToPreferences(session, new PreferencesService(store), { exercise: true });
    expect(session.getSnapshot()).toMatchObject({
      notation: 'americana',
      help: false,
      mode: 'acordes',
      level: 3,
      phase: 'inactiva',
    });
  });

  it('lo que cambia en las preferencias se aplica a la sesión, también con una ronda en curso', () => {
    const preferences = new PreferencesService(new FakePreferencesStore(WITH_KEYBOARD));
    const session = makeSession();
    bindSessionToPreferences(session, preferences, { exercise: true });
    session.start();

    preferences.update({ notation: 'americana', mode: 'terceras', levels: { terceras: 3 } });
    const snapshot = session.getSnapshot();
    expect(snapshot.notation).toBe('americana');
    expect(snapshot).toMatchObject({ mode: 'terceras', level: 3, phase: 'en-curso', hits: 0 });
    expect(snapshot.exercise?.target.notes).toHaveLength(2);
  });

  it('con `exercise: false` el ejercicio lo fija la sesión y las preferencias no lo cambian', () => {
    const preferences = new PreferencesService(new FakePreferencesStore(WITH_KEYBOARD));
    const session = makeSession(roundConfigFor('acordes', 5) as RoundConfig);
    bindSessionToPreferences(session, preferences, { exercise: false });

    expect(session.getSnapshot()).toMatchObject({ mode: 'acordes', level: 5 });
    preferences.update({ mode: 'terceras', notation: 'americana' });
    expect(session.getSnapshot()).toMatchObject({
      mode: 'acordes',
      level: 5,
      notation: 'americana',
    });
  });

  it('el flujo es de un solo sentido: aplicar una preferencia no la vuelve a guardar', () => {
    const store = new FakePreferencesStore(WITH_KEYBOARD);
    const preferences = new PreferencesService(store);
    const session = makeSession();
    bindSessionToPreferences(session, preferences, { exercise: true });
    preferences.update({ notation: 'americana' });
    expect(store.saves).toHaveLength(1);
    preferences.update({ help: false });
    expect(store.saves).toHaveLength(2);
  });

  it('restablecer con el puente conectado deja todo de fábrica (sin valores viejos que vuelvan)', () => {
    const store = new FakePreferencesStore(WITH_KEYBOARD);
    const preferences = new PreferencesService(store);
    const session = makeSession();
    bindSessionToPreferences(session, preferences, { exercise: true });
    preferences.update({
      notation: 'americana',
      help: false,
      mode: 'terceras',
      levels: { terceras: 2 },
    });
    expect(session.getSnapshot()).toMatchObject({ mode: 'terceras', level: 2 });

    preferences.reset();
    expect(preferences.getSnapshot()).toEqual(DEFAULT_PREFERENCES);
    expect(preferences.getSnapshot().levels.terceras).toBe(1);
    expect(session.getSnapshot()).toMatchObject({
      notation: 'latina',
      help: true,
      mode: 'notas',
      level: 1,
    });
    expect(new PreferencesService(store).getSnapshot()).toEqual(DEFAULT_PREFERENCES);
  });

  it('al soltar el puente dejan de sincronizarse', () => {
    const preferences = new PreferencesService(new FakePreferencesStore(WITH_KEYBOARD));
    const session = makeSession();
    const unbind = bindSessionToPreferences(session, preferences, { exercise: true });
    unbind();
    preferences.update({ notation: 'americana' });
    expect(session.getSnapshot().notation).toBe('latina');
  });
});
