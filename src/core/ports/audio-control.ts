import type { Unsubscribe } from './note-input';

/**
 * 'bloqueado': el navegador aún no permite sonar (hace falta un gesto del usuario).
 * 'listo': suena. 'sin-soporte': no hay Web Audio.
 */
export type AudioStatus = 'bloqueado' | 'listo' | 'sin-soporte';

/** Control del estado del audio, para que la interfaz pueda ofrecer "Activar sonido". */
export interface AudioControl {
  getStatus(): AudioStatus;
  subscribeStatus(handler: (status: AudioStatus) => void): Unsubscribe;
  /** Debe llamarse desde un gesto del usuario (clic, tecla). */
  unlock(): Promise<void>;
  /** Latencia de salida estimada en ms, si se conoce (para el panel de depuración). */
  estimatedLatencyMs?(): number | null;
}
