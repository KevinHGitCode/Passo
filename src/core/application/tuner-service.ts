import { StringBoard, sameMarks } from '../domain/string-board';
import type { StringMarks } from '../domain/string-board';
import { NO_SOUND, TunerTracker, centsFrom, searchRange, stringFrequency } from '../domain/tuner';
import type { TuneOptions, TunerState } from '../domain/tuner';
import type { GuitarString } from '../domain/instrument';
import { REFERENCE_A4_HZ } from '../domain/pitch';
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
  /** Lo que se recuerda de cada cuerda mientras el afinador está abierto (afinada, sin afinar, revisar). */
  readonly strings: StringMarks;
  /** El La4 con el que se mide (440 Hz por omisión). */
  readonly referenceHz: number;
}

export interface TunerDeps {
  readonly pitch: PitchMonitor & PitchTarget;
  readonly clock: Clock;
}

/**
 * Caso de uso del afinador: sigue el tono que da el micrófono, lo mide contra la cuerda elegida y dice si
 * está grave, aguda o afinada. Recuerda qué cuerdas quedaron afinadas mientras está abierto. Solo mide
 * mientras está abierto (el micrófono lo enciende quien lo abre).
 */
export class TunerService {
  private readonly deps: TunerDeps;
  private readonly tracker = new TunerTracker();
  private readonly listeners = new Set<() => void>();
  private unsubscribe: Unsubscribe | null = null;
  private board = StringBoard.empty();
  private referenceHz = REFERENCE_A4_HZ;
  private snapshot: TunerSnapshot;

  constructor(deps: TunerDeps) {
    this.deps = deps;
    this.snapshot = {
      ...NO_SOUND,
      string: 1,
      open: false,
      strings: this.board.marks(deps.clock.now()),
      referenceHz: this.referenceHz,
    };
  }

  /** Foto inmutable: cambia de identidad solo cuando algo cambia (apta para useSyncExternalStore). */
  getSnapshot = (): TunerSnapshot => this.snapshot;

  subscribe = (listener: () => void): Unsubscribe => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Empieza a seguir el tono (y a olvidar lo que se recordaba de las cuerdas). */
  open(): void {
    if (this.snapshot.open) return;
    this.tracker.reset();
    this.board = StringBoard.empty();
    this.deps.pitch.setPitchSearch(searchRange(this.snapshot.string, this.options()));
    this.unsubscribe = this.deps.pitch.subscribePitch((reading) => {
      const now = reading === null ? this.deps.clock.now() : reading.at;
      const target = stringFrequency(this.snapshot.string, this.options());
      const state =
        reading === null
          ? this.tracker.push(null, now)
          : this.tracker.push(centsFrom(target, reading.frequency), reading.at);
      this.remember(state, now);
      this.update({ ...state, strings: this.marks(now) });
    });
    this.update({ ...NO_SOUND, open: true, strings: this.marks(this.deps.clock.now()) });
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

  /** Cambia la cuerda que se afina (empieza de cero: lo medido era de la otra; lo recordado se queda). */
  selectString(string: GuitarString): void {
    if (string === this.snapshot.string) return;
    this.tracker.reset();
    if (this.snapshot.open) this.deps.pitch.setPitchSearch(searchRange(string, this.options()));
    this.update({ ...NO_SOUND, string, strings: this.marks(this.deps.clock.now()) });
  }

  /** Vuelve a mirar si alguna cuerda afinada ya pasó a «revisar» (lo llama la pantalla de vez en cuando). */
  refresh(): void {
    this.update({ strings: this.marks(this.deps.clock.now()) });
  }

  private options(): TuneOptions {
    return { referenceHz: this.referenceHz };
  }

  /** Apunta en el tablero lo que acaba de pasar con la cuerda elegida. */
  private remember(state: TunerState, now: number): void {
    const string = this.snapshot.string;
    if (state.status === 'afinada') {
      if (this.board.markOf(string, now) !== 'afinada') this.board = this.board.tuned(string, now);
    } else if (state.status === 'baja' || state.status === 'alta') {
      this.board = this.board.drifted(string);
    }
  }

  /** Las marcas de ahora, conservando la identidad del objeto si no cambió ninguna. */
  private marks(now: number): StringMarks {
    const next = this.board.marks(now);
    return sameMarks(next, this.snapshot.strings) ? this.snapshot.strings : next;
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
      next.near === previous.near &&
      next.string === previous.string &&
      next.open === previous.open &&
      next.strings === previous.strings &&
      next.referenceHz === previous.referenceHz
    ) {
      return;
    }
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
}
