import type { InputSource, NoteEvent } from '../domain/note-event';

export type Unsubscribe = () => void;

export type InputStatus =
  | { readonly kind: 'iniciando' }
  | { readonly kind: 'conectado'; readonly deviceName: string }
  | { readonly kind: 'sin-dispositivo' }
  | { readonly kind: 'desconectado'; readonly deviceName: string }
  | { readonly kind: 'permiso-denegado' }
  | { readonly kind: 'sin-soporte' };

/** Fuente de notas tocadas (piano MIDI, teclado del PC…). */
export interface NoteInput {
  readonly source: InputSource;
  getStatus(): InputStatus;
  /** Empieza a escuchar. Puede pedir permisos al usuario. Nunca lanza: informa por el estado. */
  start(): Promise<void>;
  stop(): void;
  subscribe(handler: (event: NoteEvent) => void): Unsubscribe;
  subscribeStatus(handler: (status: InputStatus) => void): Unsubscribe;
}
