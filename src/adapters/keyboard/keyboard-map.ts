import type { Midi } from '@/core/domain/note';

/**
 * Teclado del PC como piano (solo para desarrollo y pruebas, no para practicar).
 * Usa `event.code` (posición física), así funciona igual con cualquier distribución de teclado.
 *
 *   negras:   W E   T Y U   O P
 *   blancas: A S D F G H J K L ; '
 *   notas:   C D E F G A B C D E F   (Do4 = MIDI 60 en la tecla A)
 */
export const KEYBOARD_NOTE_MAP: Readonly<Record<string, Midi>> = {
  KeyA: 60,
  KeyW: 61,
  KeyS: 62,
  KeyE: 63,
  KeyD: 64,
  KeyF: 65,
  KeyT: 66,
  KeyG: 67,
  KeyY: 68,
  KeyH: 69,
  KeyU: 70,
  KeyJ: 71,
  KeyK: 72,
  KeyO: 73,
  KeyL: 74,
  KeyP: 75,
  Semicolon: 76,
  Quote: 77,
};

export function noteForKeyCode(code: string): Midi | undefined {
  return KEYBOARD_NOTE_MAP[code];
}
