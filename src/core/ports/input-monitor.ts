import type { Midi } from '../domain/note';
import type { TrackerHint } from '../domain/note-tracker';
import type { Unsubscribe } from './note-input';

/**
 * 'apagado': sin escuchar. 'calibrando': midiendo el ruido ambiente. 'escuchando': lista.
 * 'suspendido': la pestaña quedó oculta o el audio se detuvo; no se oye nada hasta volver.
 */
export type ListenPhase = 'apagado' | 'calibrando' | 'escuchando' | 'suspendido';

export interface MonitorSnapshot {
  readonly phase: ListenPhase;
  /** Avance de la calibración (0–1). */
  readonly calibration: number;
  /** Nivel de entrada de 0 a 1 (escala dBFS de −60 a 0), cuantizado para no repintar en exceso. */
  readonly level: number;
  /** Nivel mínimo para que se oiga una nota, en la misma escala (0–1). */
  readonly gateLevel: number;
  /** El pico llegó al máximo: el sonido se distorsiona. */
  readonly clipping: boolean;
  /** El navegador no pudo desactivar los efectos de audio (cancelación de eco, etc.). */
  readonly degraded: boolean;
  /** Nota que se oye ahora mismo, confirmada por el seguimiento. */
  readonly heard: { readonly midi: Midi; readonly cents: number } | null;
  /** Afinación estimada del teclado en cents, o `null` si aún no hay datos. */
  readonly tuningOffsetCents: number | null;
  readonly hint: TrackerHint | null;
}

/** Lo que la interfaz necesita saber de una entrada que escucha (hoy, el micrófono). */
export interface InputMonitor {
  getMonitor(): MonitorSnapshot;
  subscribeMonitor(handler: (snapshot: MonitorSnapshot) => void): Unsubscribe;
}

export const SILENT_MONITOR: MonitorSnapshot = {
  phase: 'apagado',
  calibration: 0,
  level: 0,
  gateLevel: 0,
  clipping: false,
  degraded: false,
  heard: null,
  tuningOffsetCents: null,
  hint: null,
};
