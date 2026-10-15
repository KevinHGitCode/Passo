import type { InputSource } from '../domain/note-event';
import type { Unsubscribe } from '../ports/note-input';
import type { InputManager } from './input-manager';
import type { PracticeSession } from './practice-session';
import type { PreferencesService } from './preferences-service';

/**
 * La entrada elegida en las preferencias manda: se enciende (y las demás se apagan) y pasa a ser la
 * que la sesión vigila para pausar si se pierde. La sesión se avisa antes, así si estaba en pausa
 * por perder la entrada anterior, la nueva al conectarse la reanuda. Pasar al micrófono vuelve a la
 * bienvenida (hay que activarlo); pasar a otra entrada deja la ronda como estaba.
 */
export function bindInputsToPreferences(
  manager: InputManager,
  session: PracticeSession,
  preferences: PreferencesService,
): Unsubscribe {
  let current: InputSource | null = null;
  const pull = (): void => {
    const { input } = preferences.getSnapshot();
    if (input === current) return;
    const changed = current !== null;
    current = input;
    session.setPrimarySource(input);
    // El micrófono hay que activarlo y calibrarlo: una ronda a medias no puede seguir sin oír nada.
    if (changed && input === 'microfono') session.reset();
    manager.select(input);
  };
  pull();
  return preferences.subscribe(pull);
}
