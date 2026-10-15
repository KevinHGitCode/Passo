import { roundConfigFor } from '../domain/exercise';
import type { Unsubscribe } from '../ports/note-input';
import type { PracticeSession } from './practice-session';
import type { PreferencesService } from './preferences-service';

export interface SyncOptions {
  /**
   * Las preferencias mandan sobre el modo y el nivel del ejercicio (y los recuerdan). Con `false`
   * (p. ej. `?modo=` en la dirección) el ejercicio lo fija quien arrancó la sesión y no se guarda.
   */
  readonly exercise: boolean;
}

/**
 * Une las preferencias con la sesión en los dos sentidos: al empezar y cuando cambian las
 * preferencias se aplican a la sesión; lo que se cambia en la sesión se guarda como preferencia.
 * Ninguno de los dos lados notifica si el valor no cambia, así que no hay bucles.
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
    if (!options.exercise) return;
    const config = roundConfigFor(prefs.mode, prefs.levels[prefs.mode]);
    const { mode, level } = session.getSnapshot();
    if (config && (mode !== config.mode || level !== config.level)) session.configure(config);
  };
  const push = (): void => {
    const { notation, help, mode, level } = session.getSnapshot();
    preferences.update({
      notation,
      help,
      ...(options.exercise ? { mode, levels: { [mode]: level } } : {}),
    });
  };

  pull();
  const stopPull = preferences.subscribe(pull);
  const stopPush = session.subscribe(push);
  return () => {
    stopPull();
    stopPush();
  };
}
