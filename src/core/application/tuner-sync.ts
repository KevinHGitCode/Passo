import type { Unsubscribe } from '../ports/note-input';
import type { PreferencesService } from './preferences-service';
import type { TunerService } from './tuner-service';

/**
 * El La4 del afinador se recuerda: al empezar toma el de las preferencias, y lo que se cambie en el
 * afinador se guarda. Si las preferencias cambian por otro lado (volver a los valores de fábrica), el
 * afinador las sigue. Cada lado solo actúa si el valor es distinto, así no hay vueltas.
 */
export function bindTunerToPreferences(
  tuner: TunerService,
  preferences: PreferencesService,
): Unsubscribe {
  tuner.setReferenceHz(preferences.getSnapshot().tunerReferenceHz);
  const fromTuner = tuner.subscribe(() => {
    const hz = tuner.getSnapshot().referenceHz;
    if (hz !== preferences.getSnapshot().tunerReferenceHz)
      preferences.update({ tunerReferenceHz: hz });
  });
  const fromPreferences = preferences.subscribe(() => {
    const hz = preferences.getSnapshot().tunerReferenceHz;
    if (hz !== tuner.getSnapshot().referenceHz) tuner.setReferenceHz(hz);
  });
  return () => {
    fromTuner();
    fromPreferences();
  };
}
