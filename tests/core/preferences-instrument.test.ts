import { PreferencesService } from '@/core/application/preferences-service';
import {
  DEFAULT_PREFERENCES,
  PREFERENCES_VERSION,
  applyPreferencesPatch,
  parsePreferences,
  samePreferences,
} from '@/core/domain/preferences';
import { FakePreferencesStore } from '../fakes/fake-preferences-store';

describe('el instrumento en las preferencias', () => {
  it('por defecto es piano', () => {
    expect(DEFAULT_PREFERENCES.instrument).toBe('piano');
  });

  it('unas preferencias guardadas antes de la guitarra siguen valiendo y dan piano', () => {
    const before = {
      version: PREFERENCES_VERSION,
      input: 'midi',
      notation: 'americana',
      help: false,
      theme: 'oscuro',
      mode: 'terceras',
      levels: { notas: 2, terceras: 3, acordes: 1 },
      polyphonicMic: false,
    };
    const parsed = parsePreferences(before);
    expect(parsed.instrument).toBe('piano');
    expect(parsed).toMatchObject({ input: 'midi', notation: 'americana', theme: 'oscuro' });
  });

  it('un instrumento inválido vuelve a piano y el resto se conserva', () => {
    const parsed = parsePreferences({ version: 1, instrument: 'ukelele', notation: 'americana' });
    expect(parsed.instrument).toBe('piano');
    expect(parsed.notation).toBe('americana');
  });

  it('elegir guitarra no cambia la entrada ni el ejercicio', () => {
    const next = applyPreferencesPatch(DEFAULT_PREFERENCES, { instrument: 'guitarra' });
    expect(next.instrument).toBe('guitarra');
    expect(next.input).toBe(DEFAULT_PREFERENCES.input);
    expect(next.mode).toBe(DEFAULT_PREFERENCES.mode);
  });

  it('con el piano MIDI elegido, pasar a guitarra no reescribe la entrada', () => {
    const midi = applyPreferencesPatch(DEFAULT_PREFERENCES, { input: 'midi' });
    const guitar = applyPreferencesPatch(midi, { instrument: 'guitarra' });
    expect(guitar.input).toBe('midi');
    expect(applyPreferencesPatch(guitar, { instrument: 'piano' }).input).toBe('midi');
  });

  it('samePreferences distingue el instrumento', () => {
    const guitar = applyPreferencesPatch(DEFAULT_PREFERENCES, { instrument: 'guitarra' });
    expect(samePreferences(DEFAULT_PREFERENCES, guitar)).toBe(false);
    expect(samePreferences(guitar, { ...guitar })).toBe(true);
  });
});

describe('PreferencesService con el instrumento', () => {
  it('guarda y avisa al cambiar de instrumento', () => {
    const store = new FakePreferencesStore();
    const service = new PreferencesService(store);
    const seen: string[] = [];
    service.subscribe(() => seen.push(service.getSnapshot().instrument));
    service.update({ instrument: 'guitarra' });
    expect(service.getSnapshot().instrument).toBe('guitarra');
    expect(seen).toEqual(['guitarra']);
    expect(store.saves).toHaveLength(1);
    expect(store.saves[0]?.instrument).toBe('guitarra');
  });

  it('repetir el mismo instrumento no guarda ni avisa', () => {
    const store = new FakePreferencesStore();
    const service = new PreferencesService(store);
    service.update({ instrument: 'piano' });
    expect(store.saves).toHaveLength(0);
  });

  it('lo guardado se recupera en la visita siguiente', () => {
    const store = new FakePreferencesStore();
    new PreferencesService(store).update({ instrument: 'guitarra' });
    expect(new PreferencesService(store).getSnapshot().instrument).toBe('guitarra');
  });

  it('un valor inicial de desarrollo manda en esta visita pero no se guarda', () => {
    const store = new FakePreferencesStore({ version: 1, instrument: 'piano' });
    const service = new PreferencesService(store, { instrument: 'guitarra' });
    expect(service.getSnapshot().instrument).toBe('guitarra');
    expect(store.saves).toHaveLength(0);
    expect(new PreferencesService(store).getSnapshot().instrument).toBe('piano');
  });
});
