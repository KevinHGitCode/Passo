import { roundConfigFor } from '../domain/exercise';
import type { Unsubscribe } from '../ports/note-input';
import type { PracticeSession } from './practice-session';
import type { PreferencesService } from './preferences-service';

export interface SyncOptions {
  /**
   * Las preferencias mandan sobre el modo y el nivel del ejercicio. Con `false` (p. ej. `?modo=` en la
   * dirección) el ejercicio lo fija quien arrancó la sesión y las preferencias no lo cambian.
   */
  readonly exercise: boolean;
}

/**
 * Aplica las preferencias a la sesión: al empezar y cada vez que cambian. El flujo es de **un solo
 * sentido** (la pantalla cambia las preferencias y estas a la sesión): una sola fuente de verdad, sin
 * bucles ni valores viejos que vuelvan.
 */
export function bindSessionToPreferences(
  session: PracticeSession,
  preferences: PreferencesService,
  options: SyncOptions,
): Unsubscribe {
  const pull = (): void => {
    const prefs = preferences.getSnapshot();
    session.setNotation(prefs.notation);
    session.setHelp(prefs.help);
    session.setPolyphonicMic(prefs.polyphonicMic);
    if (!options.exercise) return;
    const config = roundConfigFor(prefs.mode, prefs.levels[prefs.mode]);
    const { mode, level } = session.getSnapshot();
    if (config && (mode !== config.mode || level !== config.level)) session.configure(config);
  };
  pull();
  return preferences.subscribe(pull);
}
