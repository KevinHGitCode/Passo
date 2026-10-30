import { NO_SOUND, TunerTracker, centsFrom, searchRange, stringFrequency } from '../domain/tuner';
import type { TunerState } from '../domain/tuner';
import type { GuitarString } from '../domain/instrument';
import type { Clock } from '../ports/clock';
import type { Unsubscribe } from '../ports/note-input';
import type { PitchMonitor, PitchTarget } from '../ports/pitch-monitor';

/** Cuánto tiene que cambiar la desviación (cents) para que la pantalla se vuelva a pintar. */
const MIN_CENTS_STEP = 2;

export interface TunerSnapshot extends TunerState {
  /** La cuerda que se está afinando. */
  readonly string: GuitarString;
  /** El afinador está abierto y siguiendo el tono. */
  readonly open: boolean;
}

export interface TunerDeps {
  readonly pitch: PitchMonitor & PitchTarget;
  readonly clock: Clock;
}

/**
 * Caso de uso del afinador: sigue el tono que da el micrófono, lo mide contra la cuerda elegida y dice si
 * está floja, tirante o afinada. Solo mide mientras está abierto (el micrófono lo enciende quien lo abre).
 */
export class TunerService {
  private readonly deps: TunerDeps;
  private readonly tracker = new TunerTracker();
  private readonly listeners = new Set<() => void>();
  private unsubscribe: Unsubscribe | null = null;
  private snapshot: TunerSnapshot;

  constructor(deps: TunerDeps) {
    this.deps = deps;
    this.snapshot = { ...NO_SOUND, string: 1, open: false };
  }

  /** Foto inmutable: cambia de identidad solo cuando algo cambia (apta para useSyncExternalStore). */
  getSnapshot = (): TunerSnapshot => this.snapshot;

  subscribe = (listener: () => void): Unsubscribe => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Empieza a seguir el tono. */
  open(): void {
    if (this.snapshot.open) return;
    this.tracker.reset();
    this.deps.pitch.setPitchSearch(searchRange(this.snapshot.string));
    this.unsubscribe = this.deps.pitch.subscribePitch((reading) => {
      const target = stringFrequency(this.snapshot.string);
      const state =
        reading === null
          ? this.tracker.push(null, this.deps.clock.now())
          : this.tracker.push(centsFrom(target, reading.frequency), reading.at);
      this.update({ ...state });
    });
    this.update({ ...NO_SOUND, open: true });
  }

  /** Deja de seguir el tono y de medir. */
  close(): void {
    if (!this.snapshot.open) return;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.deps.pitch.setPitchSearch(null);
    this.tracker.reset();
    this.update({ ...NO_SOUND, open: false });
  }

  /** Cambia la cuerda que se afina (empieza de cero: lo medido era de la otra). */
  selectString(string: GuitarString): void {
    if (string === this.snapshot.string) return;
    this.tracker.reset();
    if (this.snapshot.open) this.deps.pitch.setPitchSearch(searchRange(string));
    this.update({ ...NO_SOUND, string });
  }

  private update(patch: Partial<TunerSnapshot>): void {
    const next = { ...this.snapshot, ...patch };
    const previous = this.snapshot;
    // Un cambio de menos de 2 cents con el mismo estado no se repinta (la lectura llega ~47 veces por segundo).
    const steady =
      next.cents !== null &&
      previous.cents !== null &&
      Math.abs(next.cents - previous.cents) < MIN_CENTS_STEP;
    if (
      next.status === previous.status &&
      (next.cents === previous.cents || steady) &&
      next.far === previous.far &&
      next.string === previous.string &&
      next.open === previous.open
    ) {
      return;
    }
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
}
