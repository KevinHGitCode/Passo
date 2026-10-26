import type { Progress } from '../domain/progress';

/** Dónde se guarda el progreso entre visitas. Nunca debe lanzar: sin almacenamiento, no se guarda. */
export interface ProgressStore {
  /** Lo guardado tal cual (sin validar), o `null` si no hay nada o no se puede leer. */
  load(): unknown;
  /** Guarda el progreso. Devuelve `false` si no se pudo (cuota llena, almacenamiento bloqueado). */
  save(progress: Progress): boolean;
  /** ¿Se puede guardar aquí? (una sonda: ventana privada o almacenamiento bloqueado dicen que no). */
  canSave?(): boolean;
  /** Conserva aparte lo guardado que no se reconoce, para no perderlo al guardar encima. */
  keepCopy?(raw: unknown): void;
  /** Borra todo lo guardado (el progreso y la copia de lo no reconocido). */
  clear?(): boolean;
}
