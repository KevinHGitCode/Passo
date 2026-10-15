import type { Midi } from '../domain/note';

/**
 * Quien oye las notas (el micrófono) y puede verificar un acorde si sabe cuál se espera. La sesión
 * le dice qué notas hay que oír ahora; con `null` no hay nada que verificar por varias notas.
 */
export interface ExpectationSink {
  setExpectation(notes: readonly Midi[] | null): void;
}
