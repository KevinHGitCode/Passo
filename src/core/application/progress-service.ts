import { applyResult, parseProgress } from '../domain/progress';
import type { LessonResult, Progress, ProgressStatus, ResultGains } from '../domain/progress';
import { EMPTY_PROGRESS } from '../domain/progress';
import type { Calendar } from '../ports/calendar';
import type { Unsubscribe } from '../ports/note-input';
import type { ProgressStore } from '../ports/progress-store';

export interface ProgressSnapshot {
  readonly state: Progress;
  /** Lo último se pudo guardar. Con `false` el progreso solo dura esta visita. */
  readonly saved: boolean;
  /** Lo guardado es de una versión más nueva: no se sobrescribe. */
  readonly readOnly: boolean;
}

/** Cuántos resultados recientes se recuerdan para no contar dos veces la misma ronda. */
const RECENT_ROUNDS = 20;

/** El progreso de la persona: se carga al empezar, se valida y se guarda al terminar cada lección. */
export class ProgressService {
  private readonly store: ProgressStore;
  private readonly calendar: Calendar;
  private snapshot: ProgressSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly recent = new Map<string, ResultGains>();

  constructor(store: ProgressStore, calendar: Calendar) {
    this.store = store;
    this.calendar = calendar;
    const parsed = parseProgress(this.read());
    this.snapshot = {
      state: parsed.state,
      saved: parsed.status !== 'version-mayor',
      readOnly: parsed.status === 'version-mayor',
    };
  }

  /** Foto inmutable: cambia de identidad solo cuando algo cambia (apta para useSyncExternalStore). */
  getSnapshot = (): ProgressSnapshot => this.snapshot;

  subscribe = (listener: () => void): Unsubscribe => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** El día de hoy, en la hora de la persona. */
  today(): string {
    return this.calendar.today();
  }

  /**
   * Anota el resultado de una lección terminada. `roundId` identifica la ronda: anotarla dos veces
   * (un doble aviso, StrictMode) no suma dos veces y devuelve lo mismo. Relee lo guardado antes de
   * aplicar, así dos pestañas abiertas no se pisan.
   */
  record(result: LessonResult, roundId: string): ResultGains {
    const known = this.recent.get(roundId);
    if (known !== undefined) return known;

    const base = this.freshState();
    const { state, gains } = applyResult(base, result, this.calendar.today());
    const saved = this.snapshot.readOnly ? false : this.save(state);
    this.snapshot = { state, saved, readOnly: this.snapshot.readOnly };

    this.recent.set(roundId, gains);
    if (this.recent.size > RECENT_ROUNDS) {
      const oldest = this.recent.keys().next().value;
      if (oldest !== undefined) this.recent.delete(oldest);
    }
    this.listeners.forEach((listener) => listener());
    return gains;
  }

  /** Borra todo el progreso (con confirmación en la interfaz). */
  reset(): void {
    const saved = this.snapshot.readOnly ? false : this.save(EMPTY_PROGRESS);
    this.snapshot = { state: EMPTY_PROGRESS, saved, readOnly: this.snapshot.readOnly };
    this.recent.clear();
    this.listeners.forEach((listener) => listener());
  }

  /** Lo último guardado (otra pestaña pudo cambiarlo); si no hay nada legible, lo que hay en memoria. */
  private freshState(): Progress {
    if (this.snapshot.readOnly) return this.snapshot.state;
    const parsed = parseProgress(this.read());
    return this.isUsable(parsed.status) ? parsed.state : this.snapshot.state;
  }

  private isUsable(status: ProgressStatus): boolean {
    return status === 'ok';
  }

  private read(): unknown {
    try {
      return this.store.load();
    } catch {
      return null;
    }
  }

  private save(state: Progress): boolean {
    try {
      return this.store.save(state);
    } catch {
      return false;
    }
  }
}
