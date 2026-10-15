import type { Preferences } from '../domain/preferences';

/** Dónde se guardan las preferencias entre visitas. Nunca debe lanzar: sin almacenamiento, no se guarda. */
export interface PreferencesStore {
  /** Lo guardado tal cual (sin validar), o `null` si no hay nada. La validación es del dominio. */
  load(): unknown;
  save(preferences: Preferences): void;
}
