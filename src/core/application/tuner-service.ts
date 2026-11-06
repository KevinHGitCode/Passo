import { StringBoard, sameMarks } from '../domain/string-board';
import type { StringMarks } from '../domain/string-board';
import { NO_SOUND, TunerTracker, centsFrom, searchRange, stringFrequency } from '../domain/tuner';
import type { TuneOptions, TunerState } from '../domain/tuner';
import type { GuitarString } from '../domain/instrument';
import { REFERENCE_A4_HZ } from '../domain/pitch';
import { REFERENCE_GUARD_MS, referenceTone } from '../domain/reference-tone';
import type { Clock } from '../ports/clock';
import type { Unsubscribe } from '../ports/note-input';
import type { PitchMonitor, PitchTarget } from '../ports/pitch-monitor';
import type { ToneOutput } from '../ports/tone-output';

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
  /** Hay dónde hacer sonar la nota de referencia. */
  readonly canReference: boolean;
  /** La nota de referencia está sonando (mientras tanto no se mide). */
  readonly tone: boolean;
}

export interface TunerDeps {
  readonly pitch: PitchMonitor & PitchTarget;
  readonly clock: Clock;
  /** Salida de la nota de referencia; sin ella el afinador solo mide. */
  readonly tone?: ToneOutput;
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
  /** La referencia suena ahora, y hasta cuándo se ignora lo que oye el micrófono tras ella. */
  private playing = false;
  private toneId = 0;
  private mutedUntil = -Infinity;
  private snapshot: TunerSnapshot;

  constructor(deps: TunerDeps) {
    this.deps = deps;
    this.snapshot = {
      ...NO_SOUND,
      string: 1,
      open: false,
      strings: this.board.marks(deps.clock.now()),
      referenceHz: this.referenceHz,
      canReference: deps.tone !== undefined,
      tone: false,
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
    this.mutedUntil = -Infinity;
    this.deps.pitch.setPitchSearch(searchRange(this.snapshot.string, this.options()));
    this.unsubscribe = this.deps.pitch.subscribePitch((reading) => {
      const now = reading === null ? this.deps.clock.now() : reading.at;
      // Mientras suena la referencia (y un momento después) el micrófono oye a la propia app: no se mide.
      if (this.playing || now < this.mutedUntil) return;
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
    this.stopReference();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.deps.pitch.setPitchSearch(null);
    this.tracker.reset();
    this.update({ ...NO_SOUND, open: false });
  }

  /** Cambia la cuerda que se afina (empieza de cero: lo medido era de la otra; lo recordado se queda). */
  selectString(string: GuitarString): void {
    if (string === this.snapshot.string) return;
    this.stopReference();
    this.tracker.reset();
    if (this.snapshot.open) this.deps.pitch.setPitchSearch(searchRange(string, this.options()));
    this.update({ ...NO_SOUND, string, strings: this.marks(this.deps.clock.now()) });
  }

  /**
   * Hace sonar la nota de la cuerda elegida (la referencia). Mientras suena no se mide, y tampoco unos
   * instantes después: si no, el micrófono oiría el tono exacto de la meta y daría un falso «afinada».
   */
  playReference(): void {
    const tone = this.deps.tone;
    if (!tone || !this.snapshot.open || this.playing) return;
    const string = this.snapshot.string;
    this.tracker.reset();
    this.playing = true;
    const id = ++this.toneId;
    this.update({ ...NO_SOUND, tone: true });
    tone.playTone(referenceTone(string, stringFrequency(string, this.options())), () =>
      this.toneEnded(id),
    );
  }

  /** Corta la nota de referencia si suena. */
  stopReference(): void {
    if (!this.playing) return;
    const id = this.toneId;
    this.deps.tone?.stopTone();
    this.toneEnded(id);
  }

  private toneEnded(id: number): void {
    if (!this.playing || id !== this.toneId) return;
    this.playing = false;
    this.mutedUntil = this.deps.clock.now() + REFERENCE_GUARD_MS;
    this.tracker.reset();
    this.update({ ...NO_SOUND, tone: false });
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
      next.referenceHz === previous.referenceHz &&
      next.tone === previous.tone &&
      next.canReference === previous.canReference
    ) {
      return;
    }
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
}
