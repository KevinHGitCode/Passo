import { roundConfigFor } from '../domain/exercise';
import type { ExerciseMode } from '../domain/curriculum';
import type { Unsubscribe } from '../ports/note-input';
import type { PracticeSession } from './practice-session';
import type { PreferencesService } from './preferences-service';

/** Quien puede quitarle al binder el control del ejercicio (una lección en curso). */
export interface ExerciseOverride {
  readonly isActive: () => boolean;
  readonly subscribe: (listener: () => void) => Unsubscribe;
}

export interface SyncOptions {
  /**
   * Las preferencias mandan sobre el modo y el nivel del ejercicio. Con `false` (p. ej. `?modo=` en la
   * dirección) el ejercicio lo fija quien arrancó la sesión y las preferencias no lo cambian.
   */
  readonly exercise: boolean;
  /**
   * Mientras esté activo (una lección manda sobre el ejercicio) las preferencias no tocan la sesión.
   * Al dejar de estarlo se vuelve a aplicar el ejercicio de las preferencias.
   */
  readonly override?: ExerciseOverride;
}

/**
 * Aplica las preferencias a la sesión: al empezar y cada vez que cambian. El flujo es de **un solo
 * sentido** (la pantalla cambia las preferencias y estas a la sesión): una sola fuente de verdad, sin
 * bucles ni valores viejos que vuelvan.
 *
 * Se compara con **lo último que aplicó este enlace**, no con el modo y nivel de la sesión: una lección
 * es un subconjunto del mismo modo y nivel, y al salir de ella habría que restaurar el conjunto completo.
 */
export function bindSessionToPreferences(
  session: PracticeSession,
  preferences: PreferencesService,
  options: SyncOptions,
): Unsubscribe {
  const start = session.getSnapshot();
  let applied: { mode: ExerciseMode; level: number } | null = {
    mode: start.mode,
    level: start.level,
  };
  let overridden = false;

  const pull = (): void => {
    const prefs = preferences.getSnapshot();
    session.setNotation(prefs.notation);
    session.setHelp(prefs.help);
    session.setPolyphonicMic(prefs.polyphonicMic);
    if (!options.exercise) return;
    if (options.override?.isActive()) {
      overridden = true;
      return;
    }
    if (overridden) {
      // La lección terminó: el ejercicio de las preferencias se aplica aunque sea el mismo de antes.
      overridden = false;
      applied = null;
    }
    const config = roundConfigFor(prefs.mode, prefs.levels[prefs.mode]);
    if (
      config &&
      (applied === null || applied.mode !== config.mode || applied.level !== config.level)
    ) {
      session.configure(config);
      applied = { mode: config.mode, level: config.level };
    }
  };
  pull();
  const unsubscribePreferences = preferences.subscribe(pull);
  const unsubscribeOverride = options.override?.subscribe(pull);
  return () => {
    unsubscribePreferences();
    unsubscribeOverride?.();
  };
}
