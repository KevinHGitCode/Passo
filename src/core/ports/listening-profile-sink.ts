import type { ListeningProfile } from '../domain/listening-profile';

/**
 * Quien oye las notas (el micrófono) y puede ajustar cómo las oye según el instrumento. La sesión le
 * dice qué instrumento se está tocando; el cambio es en caliente, sin volver a calibrar el ruido.
 */
export interface ListeningProfileSink {
  setProfile(profile: ListeningProfile): void;
}
