import type { Progress } from '../domain/progress';

/** Dónde se guarda el progreso entre visitas. Nunca debe lanzar: sin almacenamiento, no se guarda. */
export interface ProgressStore {
  /** Lo guardado tal cual (sin validar), o `null` si no hay nada o no se puede leer. */
  load(): unknown;
  /** Guarda el progreso. Devuelve `false` si no se pudo (cuota llena, almacenamiento bloqueado). */
  save(progress: Progress): boolean;
}
