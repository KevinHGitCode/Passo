import {
  LOW_TO_HIGH,
  advance,
  currentString,
  holdProgress,
  isComplete,
  isFinished,
  jumpTo,
  missingStrings,
  nextString,
  setPaused,
  skip,
  startRun,
} from '../domain/guided-tuning';
import type { GuidedRun, Lap } from '../domain/guided-tuning';
import type { GuitarString } from '../domain/instrument';
import { REFERENCE_A4_HZ } from '../domain/pitch';
import { REFERENCE_GUARD_MS, referenceTone } from '../domain/reference-tone';
import { StringBoard, sameMarks } from '../domain/string-board';
import type { StringMarks } from '../domain/string-board';
import {
  NO_SOUND,
  TunerTracker,
  centsFrom,
  isValidReference,
  searchRange,
  stringFrequency,
} from '../domain/tuner';
import type { TuneOptions, TunerState } from '../domain/tuner';
import type { Clock } from '../ports/clock';
import type { Unsubscribe } from '../ports/note-input';
import type { PitchMonitor, PitchTarget } from '../ports/pitch-monitor';
import type { ToneOutput } from '../ports/tone-output';

/** Cuánto tiene que cambiar la desviación (cents) para que la pantalla se vuelva a pintar. */
const MIN_CENTS_STEP = 2;

/** El modo guiado visto desde la pantalla. */
export interface GuidedView {
  /** Las cuerdas de esta pasada, en orden (de la grave a la aguda). */
  readonly queue: readonly GuitarString[];
  /** Posición actual; es `queue.length` cuando terminó. */
  readonly index: number;
  readonly lap: Lap;
  readonly paused: boolean;
  readonly finished: boolean;
  /** Terminó y las seis cuerdas quedaron afinadas. */
  readonly complete: boolean;
  /** Las que todavía no están afinadas, de la grave a la aguda. */
  readonly missing: readonly GuitarString[];
  /** La cuerda que viene después de la actual. */
  readonly next: GuitarString | null;
  /** Los cents con los que quedó cada cuerda al darla por buena. */
  readonly finals: Readonly<Partial<Record<GuitarString, number>>>;
}

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
  /** El modo guiado «Afinar las 6», o `null` si se afina a mano. */
  readonly guided: GuidedView | null;
}

export interface TunerDeps {
  readonly pitch: PitchMonitor & PitchTarget;
  readonly clock: Clock;
  /** Salida de la nota de referencia; sin ella el afinador solo mide. */
  readonly tone?: ToneOutput;
}

/**
 * Caso de uso del afinador: sigue el tono que da el micrófono, lo mide contra la cuerda elegida y dice si
 * está grave, aguda o afinada. Recuerda qué cuerdas quedaron afinadas mientras está abierto, puede hacer
 * sonar la nota de referencia y guiar la afinación de las seis cuerdas. Solo mide mientras está abierto (el
 * micrófono lo enciende quien lo abre).
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
  /** La pasada guiada en curso y desde cuándo está afinada la cuerda actual. */
  private run: GuidedRun | null = null;
  private heldSince: number | null = null;
  private viewCache: { run: GuidedRun; marks: StringMarks; view: GuidedView } | null = null;
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
      guided: null,
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
    this.run = null;
    this.heldSince = null;
    this.deps.pitch.setPitchSearch(searchRange(this.snapshot.string, this.options()));
    this.unsubscribe = this.deps.pitch.subscribePitch((reading) => this.onReading(reading));
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
    this.run = null;
    this.heldSince = null;
    this.update({ ...NO_SOUND, open: false });
  }

  /**
   * Cambia la cuerda que se afina (empieza de cero: lo medido era de la otra; lo recordado se queda). En el
   * modo guiado, tocar una clavija salta a esa cuerda sin perder lo hecho; si no está en la pasada, se sale
   * de la guía y se sigue a mano.
   */
  selectString(string: GuitarString): void {
    if (this.run !== null) {
      this.run = isFinished(this.run) ? null : jumpTo(this.run, string);
      this.heldSince = null;
    }
    if (string === this.snapshot.string) {
      this.update({});
      return;
    }
    this.goTo(string);
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

  /**
   * Cambia el La4 con el que se mide (de 430 a 450 Hz). Todas las cuentas cambian, así que lo medido y lo
   * recordado se olvidan, y la guía y la referencia se paran.
   */
  setReferenceHz(hz: number): void {
    if (!isValidReference(hz) || hz === this.referenceHz) return;
    this.stopReference();
    this.referenceHz = hz;
    this.run = null;
    this.heldSince = null;
    this.board = StringBoard.empty();
    this.tracker.reset();
    if (this.snapshot.open) {
      this.deps.pitch.setPitchSearch(searchRange(this.snapshot.string, this.options()));
    }
    this.update({
      ...NO_SOUND,
      referenceHz: hz,
      strings: this.marks(this.deps.clock.now()),
    });
  }

  /** «Afinar las 6»: empieza por la cuerda 6 y sigue hasta la 1. */
  startGuided(): void {
    if (!this.snapshot.open) return;
    this.beginRun(LOW_TO_HIGH, 1);
  }

  /** «Repasar las 6»: una segunda vuelta; las que estaban afinadas pasan a «revisar». */
  repeatGuided(): void {
    if (!this.snapshot.open) return;
    this.board = this.board.allForReview();
    this.beginRun(LOW_TO_HIGH, 2);
  }

  /** «Seguir con las que faltan» tras una pasada incompleta. */
  continueGuided(): void {
    if (!this.snapshot.open) return;
    const missing = missingStrings(this.board.marks(this.deps.clock.now()));
    if (missing.length === 0) return;
    this.beginRun(missing, this.run?.lap ?? 1);
  }

  /** «Siguiente cuerda» sin haberla afinado. */
  skipGuided(): void {
    if (this.run === null || isFinished(this.run)) return;
    this.run = skip(this.run);
    this.afterStep();
  }

  pauseGuided(): void {
    this.setGuidedPaused(true);
  }

  resumeGuided(): void {
    this.setGuidedPaused(false);
  }

  /** Sale de la guía y sigue a mano con la cuerda que estuviera. */
  exitGuided(): void {
    if (this.run === null) return;
    this.run = null;
    this.heldSince = null;
    this.update({});
  }

  /** Vuelve a mirar si alguna cuerda afinada ya pasó a «revisar» (lo llama la pantalla de vez en cuando). */
  refresh(): void {
    this.update({ strings: this.marks(this.deps.clock.now()) });
  }

  private onReading(reading: { frequency: number; at: number } | null): void {
    const now = reading === null ? this.deps.clock.now() : reading.at;
    // Mientras suena la referencia (y un momento después) el micrófono oye a la propia app: no se mide.
    if (this.playing || now < this.mutedUntil) return;
    if (this.run?.paused === true) return;
    const target = stringFrequency(this.snapshot.string, this.options());
    const state =
      reading === null
        ? this.tracker.push(null, now)
        : this.tracker.push(centsFrom(target, reading.frequency), reading.at);
    this.remember(state, now);
    if (this.run !== null && !isFinished(this.run)) {
      const progress = holdProgress(state.status, this.heldSince, now);
      this.heldSince = progress.heldSince;
      if (progress.advance) {
        this.run = advance(this.run, state.cents);
        this.afterStep();
        return;
      }
    }
    this.update({ ...state, strings: this.marks(now) });
  }

  private beginRun(queue: readonly GuitarString[], lap: Lap): void {
    this.stopReference();
    this.run = startRun(queue, lap);
    this.heldSince = null;
    this.afterStep();
  }

  private setGuidedPaused(paused: boolean): void {
    if (this.run === null || isFinished(this.run) || this.run.paused === paused) return;
    this.run = setPaused(this.run, paused);
    this.heldSince = null;
    this.tracker.reset();
    this.update({ ...NO_SOUND });
  }

  /** Tras avanzar, saltar o empezar: la cuerda de la guía pasa a ser la elegida (o la pasada termina). */
  private afterStep(): void {
    this.heldSince = null;
    const string = this.run === null ? null : currentString(this.run);
    if (string === null) {
      this.tracker.reset();
      this.update({ ...NO_SOUND, strings: this.marks(this.deps.clock.now()) });
      return;
    }
    this.goTo(string);
  }

  /** Pone `string` como la cuerda que se mide, de cero. */
  private goTo(string: GuitarString): void {
    this.stopReference();
    this.tracker.reset();
    if (this.snapshot.open) this.deps.pitch.setPitchSearch(searchRange(string, this.options()));
    this.update({ ...NO_SOUND, string, strings: this.marks(this.deps.clock.now()) });
  }

  private toneEnded(id: number): void {
    if (!this.playing || id !== this.toneId) return;
    this.playing = false;
    this.mutedUntil = this.deps.clock.now() + REFERENCE_GUARD_MS;
    this.tracker.reset();
    this.update({ ...NO_SOUND, tone: false });
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

  /** La guía vista desde la pantalla, con la misma identidad mientras nada cambie. */
  private guidedView(marks: StringMarks): GuidedView | null {
    const run = this.run;
    if (run === null) return null;
    const cache = this.viewCache;
    if (cache !== null && cache.run === run && cache.marks === marks) return cache.view;
    const view: GuidedView = {
      queue: run.queue,
      index: run.index,
      lap: run.lap,
      paused: run.paused,
      finished: isFinished(run),
      complete: isComplete(run, marks),
      missing: missingStrings(marks),
      next: nextString(run),
      finals: run.finals,
    };
    this.viewCache = { run, marks, view };
    return view;
  }

  private update(patch: Partial<TunerSnapshot>): void {
    const merged = { ...this.snapshot, ...patch };
    const next: TunerSnapshot = { ...merged, guided: this.guidedView(merged.strings) };
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
      next.canReference === previous.canReference &&
      next.guided === previous.guided
    ) {
      return;
    }
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
}
