import { PreferencesService } from '@/core/application/preferences-service';
import { TunerService } from '@/core/application/tuner-service';
import { bindTunerToPreferences } from '@/core/application/tuner-sync';
import { FakeClock } from '../fakes/fake-clock';
import { FakePitch } from '../fakes/fake-pitch';
import { FakePreferencesStore } from '../fakes/fake-preferences-store';

function setup(stored: unknown = null) {
  const store = new FakePreferencesStore(stored);
  const preferences = new PreferencesService(store);
  const tuner = new TunerService({ pitch: new FakePitch(), clock: new FakeClock(0) });
  const unbind = bindTunerToPreferences(tuner, preferences);
  return { store, preferences, tuner, unbind };
}

describe('el La₄ del afinador se recuerda', () => {
  it('al empezar toma el de las preferencias', () => {
    const { tuner } = setup({ version: 1, tunerReferenceHz: 442 });
    expect(tuner.getSnapshot().referenceHz).toBe(442);
  });

  it('sin nada guardado es 440 y no escribe nada', () => {
    const { tuner, store } = setup();
    expect(tuner.getSnapshot().referenceHz).toBe(440);
    expect(store.saves).toHaveLength(0);
  });

  it('lo que se cambia en el afinador se guarda', () => {
    const { tuner, store, preferences } = setup();
    tuner.setReferenceHz(432);
    expect(preferences.getSnapshot().tunerReferenceHz).toBe(432);
    expect(store.saves).toHaveLength(1);
    expect(store.saves[0]?.tunerReferenceHz).toBe(432);
  });

  it('si las preferencias vuelven a los valores de fábrica, el afinador las sigue', () => {
    const { tuner, preferences } = setup({ version: 1, tunerReferenceHz: 442 });
    preferences.reset();
    expect(tuner.getSnapshot().referenceHz).toBe(440);
  });

  it('un valor guardado inválido da 440', () => {
    const { tuner } = setup({ version: 1, tunerReferenceHz: 9000 });
    expect(tuner.getSnapshot().referenceHz).toBe(440);
  });

  it('al desenlazar deja de seguirse en los dos sentidos', () => {
    const { tuner, preferences, unbind } = setup();
    unbind();
    tuner.setReferenceHz(435);
    expect(preferences.getSnapshot().tunerReferenceHz).toBe(440);
    preferences.update({ tunerReferenceHz: 445 });
    expect(tuner.getSnapshot().referenceHz).toBe(435);
  });
});
