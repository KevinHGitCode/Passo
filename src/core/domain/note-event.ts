import type { Midi } from './note';

/** De dónde llega la nota: piano MIDI o el teclado del PC (solo desarrollo y pruebas). */
export type InputSource = 'midi' | 'teclado-pc';

/**
 * Evento de nota ya normalizado. `at` está en milisegundos del reloj monotónico del `Clock`
 * (mismo origen que `performance.now()` y que `event.timeStamp` del navegador).
 */
export interface NoteEvent {
  readonly type: 'on' | 'off';
  readonly note: Midi;
  /** 0–127. Un `on` con velocidad 0 se trata como `off` (convención MIDI). */
  readonly velocity: number;
  readonly at: number;
  readonly source: InputSource;
}
