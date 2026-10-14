import type { Midi } from './note';

/** De dónde llega la nota: micrófono (escucha activa), piano MIDI o teclado del PC (desarrollo). */
export type InputSource = 'midi' | 'teclado-pc' | 'microfono';

/** Seguridad de una nota detectada por micrófono: `media` = posible, `alta` = periodicidad muy clara. */
export type NoteConfidence = 'alta' | 'media';

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
  /** Solo con micrófono. Las demás fuentes son exactas y no la informan. */
  readonly confidence?: NoteConfidence | undefined;
}
