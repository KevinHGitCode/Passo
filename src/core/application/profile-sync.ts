import type { Instrument } from '../domain/instrument';
import type { ListeningProfileSink } from '../ports/listening-profile-sink';
import type { Unsubscribe } from '../ports/note-input';
import type { PracticeSession } from './practice-session';

/**
 * El instrumento de la ronda en curso manda sobre cómo escucha el micrófono. Se sigue a la **sesión**
 * (no a las preferencias): una lección de guitarra la pone en guitarra y, al salir de ella, la práctica
 * libre de piano la devuelve a piano sin que nadie tenga que acordarse.
 */
export function bindProfileToSession(
  session: PracticeSession,
  sink: ListeningProfileSink,
): Unsubscribe {
  let current: Instrument | null = null;
  const pull = (): void => {
    const { instrument } = session.getSnapshot();
    if (instrument === current) return;
    current = instrument;
    sink.setProfile(instrument);
  };
  pull();
  return session.subscribe(pull);
}
