import { setOctaveLabelShift } from '../domain/note';
import { namingShift } from '../domain/piano-setup';
import type { Unsubscribe } from '../ports/note-input';
import type { PreferencesService } from './preferences-service';

/**
 * El nombre del Do central que se muestra (Do4 o Do3) sigue a las preferencias: al empezar y cada vez que
 * cambian. Solo es el número de octava que se escribe; el sonido y las lecciones no cambian.
 */
export function bindNoteLabelsToPreferences(preferences: PreferencesService): Unsubscribe {
  const apply = () => setOctaveLabelShift(namingShift(preferences.getSnapshot().pianoNaming));
  apply();
  return preferences.subscribe(apply);
}
