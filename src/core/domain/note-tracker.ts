import type { FrameAnalysis } from './frame-analysis';
import type { Midi } from './note';
import type { NoteConfidence, NoteEvent } from './note-event';
import { nearestNote } from './pitch';

/** Avisos que el seguimiento puede dar para que la interfaz explique por qué «no se oye». */
export type TrackerHint = 'saturado' | 'debil' | 'confuso' | 'ruidoso';

export interface TrackerConfig {
  /** Tiempo inicial de silencio para medir el ruido ambiente. */
  readonly calibrationMs: number;
  /** Umbral mínimo absoluto (valor eficaz) para considerar que suena algo. */
  readonly minGate: number;
  /** El umbral de sonido es `gateFactor × ruido` (con el mínimo anterior). */
  readonly gateFactor: number;
  /** Se considera «soltada» la nota cuando el nivel cae por debajo de `releaseFactor × ruido`. */
  readonly releaseFactor: number;
  /** Un bloque es un ataque si supera `onsetRatio ×` la energía de los 10 ms anteriores (≈ +3 dB). */
  readonly onsetRatio: number;
  /** Tiempo mínimo entre dos ataques (los pianos muestreados tienen «dos jorobas»). */
  readonly refractoryMs: number;
  /** Si al confirmar la energía sigue subiendo más de este factor sobre el ataque, es un barrido lento. */
  readonly swellRatio: number;
  /** Fotogramas estables necesarios para confirmar una nota. */
  readonly confirmFrames: number;
  readonly mediumClarity: number;
  readonly strongClarity: number;
  /** Dispersión máxima de cents entre fotogramas para aceptar la nota. */
  readonly maxCentsSpread: number;
  /** Dispersión máxima para dar confianza `alta`. */
  readonly strongCentsSpread: number;
  /** Presencia mínima de la fundamental (descarta «fundamentales virtuales»). */
  readonly minFundamentalRatio: number;
  /** Rango fiable de notas (Do3–Do6). */
  readonly minMidi: Midi;
  readonly maxMidi: Midi;
  /** Tiempo máximo para confirmar una nota tras un ataque antes de darla por «confusa». */
  readonly confirmTimeoutMs: number;
  /**
   * La misma nota detectada de nuevo antes de este tiempo no es un ataque nuevo: suele ser un hueco
   * de audio o una fluctuación de la propia nota que decae.
   */
  readonly sameNoteRetriggerMs: number;
  /**
   * Un «ataque» con una línea base por debajo de esta fracción del nivel de los últimos 250 ms, mientras
   * suena una nota, es la recuperación de un hueco de audio, no una nueva pulsación (en un re-ataque
   * real la nota anterior sigue sonando justo antes).
   */
  readonly dropoutRatio: number;
  /** Tras ver un hueco de audio dentro de una nota, durante cuántos ms no se aceptan ataques. */
  readonly dropoutGuardMs: number;
  /** Fotogramas silenciosos seguidos para dar la nota por terminada. */
  readonly releaseFrames: number;
  /** Cuánto dura visible un aviso. */
  readonly hintMs: number;
}

export const DEFAULT_TRACKER_CONFIG: TrackerConfig = {
  calibrationMs: 1000,
  minGate: 0.003,
  gateFactor: 4,
  releaseFactor: 2.5,
  onsetRatio: 1.41,
  refractoryMs: 150,
  swellRatio: 1.25,
  confirmFrames: 3,
  mediumClarity: 0.75,
  strongClarity: 0.9,
  maxCentsSpread: 20,
  strongCentsSpread: 10,
  minFundamentalRatio: 0.03,
  minMidi: 48,
  maxMidi: 84,
  confirmTimeoutMs: 450,
  sameNoteRetriggerMs: 300,
  dropoutRatio: 0.15,
  dropoutGuardMs: 90,
  releaseFrames: 2,
  hintMs: 2500,
};

export interface TrackerState {
  readonly phase: 'calibrando' | 'escuchando';
  /** Avance de la calibración, de 0 a 1. */
  readonly calibration: number;
  /** Valor eficaz del último fotograma. */
  readonly level: number;
  /** Pico del último fotograma. */
  readonly peak: number;
  readonly noiseFloor: number;
  readonly gate: number;
  /** Nota que se está oyendo ahora mismo (confirmada), o `null`. */
  readonly heard: { readonly midi: Midi; readonly cents: number } | null;
  /** Afinación estimada del teclado en cents (null hasta tener 5 notas). */
  readonly tuningOffsetCents: number | null;
  readonly hint: TrackerHint | null;
}

interface Candidate {
  readonly onsetAt: number;
  readonly peakLevel: number;
  /** Mayor energía de bloque en los primeros 40 ms: un ataque de piano llega a su máximo ahí. */
  readonly attackPeak: number;
  frames: { midi: Midi; rawCents: number; cents: number; clarity: number }[];
}

interface Sounding {
  readonly midi: Midi;
  readonly cents: number;
  readonly onsetAt: number;
  quietFrames: number;
  /** Desviaciones (cents, sin recentrar) medidas con la nota ya estable. */
  readonly steadyCents: number[];
}

const MEDIAN_WINDOW = 5;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index] as number;
}

/** Velocidad MIDI aproximada (1–127) a partir del nivel del ataque. */
function velocityFor(level: number): number {
  const db = 20 * Math.log10(Math.max(level, 1e-5));
  return Math.min(127, Math.max(1, Math.round((127 * (db + 50)) / 50)));
}

/**
 * Convierte fotogramas de audio en eventos de nota. Lógica pura: no lee reloj ni micrófono.
 *
 * Reglas (de la revisión de expertos): una nota solo se abre con un **ataque**; se confirma con
 * varios fotogramas de altura estable; lo dudoso se marca con confianza `media`.
 */
export class NoteTracker {
  private readonly config: TrackerConfig;
  private phase: TrackerState['phase'] = 'calibrando';
  private calibrationStartedAt: number | null = null;
  private calibrationLevels: number[] = [];
  private noiseFloor = 0;
  private gate: number;
  private lastOnsetAt = -Infinity;
  /** Energía del último bloque procesado (antes de un hueco de muestras). */
  private lastBlockLevel = 0;
  /** Niveles de los últimos bloques (para distinguir un hueco de audio de un re-ataque). */
  private recentBlocks: { at: number; level: number }[] = [];
  /** Hasta cuándo se ignoran ataques porque se vio un hueco de audio dentro de una nota. */
  private dropoutGuardUntil = -Infinity;
  private candidate: Candidate | null = null;
  private sounding: Sounding | null = null;
  private lastFrame = { level: 0, peak: 0 };
  private rawCentsHistory: number[] = [];
  private tuningOffset: number | null = null;
  private hint: { value: TrackerHint; until: number; since: number } | null = null;
  private lastHintAt: Partial<Record<TrackerHint, number>> = {};
  private weakSince: number | null = null;
  private lastEndAt = 0;

  constructor(config: Partial<TrackerConfig> = {}) {
    this.config = { ...DEFAULT_TRACKER_CONFIG, ...config };
    this.gate = this.config.minGate;
  }

  getState(): TrackerState {
    const heard = this.sounding ? { midi: this.sounding.midi, cents: this.sounding.cents } : null;
    const hint = this.hint && this.lastEndAt <= this.hint.until ? this.hint.value : null;
    return {
      phase: this.phase,
      calibration: this.calibrationProgress(),
      level: this.lastFrame.level,
      peak: this.lastFrame.peak,
      noiseFloor: this.noiseFloor,
      gate: this.gate,
      heard,
      tuningOffsetCents: this.tuningOffset,
      hint,
    };
  }

  /** Vuelve a empezar la escucha (p. ej. tras un hueco de audio). Suelta la nota en curso. */
  reset(at: number): NoteEvent[] {
    const events: NoteEvent[] = [];
    if (this.sounding) {
      this.finishTuning();
      events.push(this.offEvent(this.sounding.midi, at));
    }
    this.sounding = null;
    this.candidate = null;
    this.weakSince = null;
    return events;
  }

  /** Procesa un fotograma y devuelve los eventos de nota que produce (normalmente ninguno). */
  push(frame: FrameAnalysis): NoteEvent[] {
    this.lastEndAt = frame.endAt;
    this.lastFrame = { level: frame.rms, peak: frame.peak };
    if (this.phase === 'calibrando') {
      this.calibrate(frame);
      return [];
    }

    if (frame.peak >= 0.98) this.raiseHint('saturado', frame.endAt);

    const events: NoteEvent[] = [];
    this.processBlocks(frame);
    this.processPitch(frame, events);
    this.processSteadyTuning(frame);
    this.processRelease(frame, events);
    this.processQuiet(frame);
    return events;
  }

  private calibrationProgress(): number {
    if (this.phase === 'escuchando') return 1;
    if (this.calibrationStartedAt === null) return 0;
    return Math.min(1, (this.lastEndAt - this.calibrationStartedAt) / this.config.calibrationMs);
  }

  private calibrate(frame: FrameAnalysis): void {
    this.calibrationStartedAt ??= frame.endAt;
    this.calibrationLevels.push(frame.rms);
    if (frame.endAt - this.calibrationStartedAt < this.config.calibrationMs) return;
    this.noiseFloor = percentile(this.calibrationLevels, 20);
    this.updateGate();
    this.phase = 'escuchando';
    if (this.noiseFloor > 0.02) this.raiseHint('ruidoso', frame.endAt);
  }

  private updateGate(): void {
    this.gate = Math.max(this.config.minGate, this.config.gateFactor * this.noiseFloor);
  }

  private releaseLevel(): number {
    return Math.max(this.config.minGate * 0.6, this.config.releaseFactor * this.noiseFloor);
  }

  private raiseHint(value: TrackerHint, at: number): void {
    const last = this.lastHintAt[value];
    if (last !== undefined && at - last < this.config.hintMs * 2) return;
    this.lastHintAt[value] = at;
    this.hint = { value, since: at, until: at + this.config.hintMs };
  }

  /** Busca ataques (subidas de energía) bloque a bloque. */
  private processBlocks(frame: FrameAnalysis): void {
    const count = frame.blockRms.length;
    for (let index = 0; index < count; index++) {
      const level = frame.blockRms[index] as number;
      let baseline = frame.blockBaseline[index] as number;
      // Tras un hueco de muestras, el ataque pudo ocurrir en la parte perdida: el primer bloque se
      // compara con el nivel que había antes del hueco.
      if (baseline < 0) baseline = this.lastBlockLevel;
      else if (index === 0 && frame.afterGap) baseline = Math.min(baseline, this.lastBlockLevel);
      const blockEnd = frame.endAt - (count - 1 - index) * frame.blockMs;
      const blockStart = blockEnd - frame.blockMs;
      const recentMax = this.recentBlocks.reduce(
        (peak, item) => (blockStart - item.at <= 250 ? Math.max(peak, item.level) : peak),
        0,
      );
      // Un bloque casi mudo dentro de una nota que sonaba fuerte es un hueco de audio, no un silencio real.
      if (this.sounding && level < this.config.dropoutRatio * recentMax) {
        this.dropoutGuardUntil = blockEnd + this.config.dropoutGuardMs;
      }
      const isOnset =
        level >= this.gate &&
        level >= this.config.onsetRatio * Math.max(baseline, 0.9 * this.gate) &&
        blockStart - this.lastOnsetAt >= this.config.refractoryMs &&
        blockStart >= this.dropoutGuardUntil;
      if (isOnset) {
        this.lastOnsetAt = blockStart;
        // La nota anterior sigue «sonando» hasta que el nuevo ataque se confirme como otra nota.
        this.candidate = { onsetAt: blockStart, peakLevel: level, attackPeak: level, frames: [] };
        this.weakSince = null;
      } else if (this.candidate && blockStart - this.candidate.onsetAt < 120) {
        const inAttack = blockStart - this.candidate.onsetAt < 40;
        this.candidate = {
          ...this.candidate,
          peakLevel: Math.max(this.candidate.peakLevel, level),
          attackPeak: inAttack
            ? Math.max(this.candidate.attackPeak, level)
            : this.candidate.attackPeak,
        };
      }
      this.lastBlockLevel = level;
      this.recentBlocks.push({ at: blockStart, level });
      while (
        this.recentBlocks.length > 0 &&
        blockStart - (this.recentBlocks[0] as { at: number }).at > 400
      ) {
        this.recentBlocks.shift();
      }
    }
  }

  /** Confirma la nota de un ataque cuando varios fotogramas seguidos coinciden. */
  private processPitch(frame: FrameAnalysis, events: NoteEvent[]): void {
    const candidate = this.candidate;
    if (!candidate) return;
    if (frame.endAt - candidate.onsetAt > this.config.confirmTimeoutMs) {
      this.candidate = null;
      this.raiseHint('confuso', frame.endAt);
      return;
    }
    // Solo valen los fotogramas cuya ventana empieza (casi) después del ataque.
    if (frame.endAt - frame.windowMs < candidate.onsetAt - 20) return;

    // Un ataque de piano llega a su máximo en pocos ms y luego decae: si la energía sigue subiendo, es un barrido lento (voz, zumbido).
    if (frame.rms > this.config.swellRatio * candidate.attackPeak) {
      this.candidate = null;
      return;
    }
    const pitch = frame.pitch;
    const valid =
      pitch !== null &&
      pitch.clarity >= this.config.mediumClarity &&
      pitch.fundamentalRatio >= this.config.minFundamentalRatio;
    if (!valid) {
      candidate.frames = [];
      return;
    }
    const raw = nearestNote(pitch.frequency, 0);
    const corrected = nearestNote(pitch.frequency, this.tuningOffset ?? 0);
    if (corrected.midi < this.config.minMidi || corrected.midi > this.config.maxMidi) {
      candidate.frames = [];
      return;
    }
    const last = candidate.frames[candidate.frames.length - 1];
    if (last && last.midi !== corrected.midi) candidate.frames = [];
    candidate.frames.push({
      midi: corrected.midi,
      rawCents: raw.cents,
      cents: corrected.cents,
      clarity: pitch.clarity,
    });

    if (candidate.frames.length < this.config.confirmFrames) return;
    const recent = candidate.frames.slice(-this.config.confirmFrames);
    const cents = recent.map((item) => item.cents);
    const spread = Math.max(...cents) - Math.min(...cents);
    if (spread >= this.config.maxCentsSpread) {
      candidate.frames = [];
      return;
    }
    const averageClarity = recent.reduce((total, item) => total + item.clarity, 0) / recent.length;
    const confidence: NoteConfidence =
      averageClarity >= this.config.strongClarity && spread < this.config.strongCentsSpread
        ? 'alta'
        : 'media';
    const midi = (recent[recent.length - 1] as { midi: Midi }).midi;
    const meanCents = cents.reduce((total, value) => total + value, 0) / cents.length;

    const previous = this.sounding;
    if (
      previous &&
      previous.midi === midi &&
      candidate.onsetAt - previous.onsetAt < this.config.sameNoteRetriggerMs
    ) {
      // Hueco de audio o fluctuación: sigue siendo la misma nota, no hay ataque nuevo.
      this.candidate = null;
      return;
    }
    if (previous) {
      this.finishTuning();
      events.push(this.offEvent(previous.midi, candidate.onsetAt));
    }
    events.push({
      type: 'on',
      note: midi,
      velocity: velocityFor(candidate.peakLevel),
      at: candidate.onsetAt,
      source: 'microfono',
      confidence,
    });
    this.sounding = {
      midi,
      cents: meanCents,
      onsetAt: candidate.onsetAt,
      quietFrames: 0,
      steadyCents: [],
    };
    this.candidate = null;
  }

  /** Con la nota ya estable (100 ms después del ataque) mide su desviación real para estimar la afinación. */
  private processSteadyTuning(frame: FrameAnalysis): void {
    const sounding = this.sounding;
    const pitch = frame.pitch;
    if (!sounding || !pitch) return;
    if (frame.endAt - frame.windowMs < sounding.onsetAt + 100) return;
    if (pitch.clarity < this.config.strongClarity) return;
    const corrected = nearestNote(pitch.frequency, this.tuningOffset ?? 0);
    if (corrected.midi !== sounding.midi) return;
    sounding.steadyCents.push(nearestNote(pitch.frequency, 0).cents);
  }

  private finishTuning(): void {
    const sounding = this.sounding;
    if (sounding && sounding.steadyCents.length >= 2) {
      this.trackTuning([median(sounding.steadyCents)]);
    }
  }

  /** Estima la afinación del teclado con la mediana de las desviaciones de las últimas notas. */
  private trackTuning(rawCents: readonly number[]): void {
    this.rawCentsHistory.push(median(rawCents));
    if (this.rawCentsHistory.length > MEDIAN_WINDOW) this.rawCentsHistory.shift();
    if (this.rawCentsHistory.length < MEDIAN_WINDOW) return;
    const estimate = Math.max(-45, Math.min(45, median(this.rawCentsHistory)));
    if (this.tuningOffset === null || Math.abs(estimate - this.tuningOffset) > 8) {
      this.tuningOffset = estimate;
    }
  }

  /** Da por terminada la nota cuando el nivel cae cerca del ruido. */
  private processRelease(frame: FrameAnalysis, events: NoteEvent[]): void {
    if (!this.sounding) return;
    if (frame.rms < this.releaseLevel()) this.sounding.quietFrames += 1;
    else this.sounding.quietFrames = 0;
    if (this.sounding.quietFrames >= this.config.releaseFrames) {
      this.finishTuning();
      events.push(this.offEvent(this.sounding.midi, frame.endAt));
      this.sounding = null;
    }
  }

  /** En silencio: refina el ruido ambiente y avisa si suena algo demasiado flojo. */
  private processQuiet(frame: FrameAnalysis): void {
    if (this.sounding || this.candidate) {
      this.weakSince = null;
      return;
    }
    if (frame.rms < this.gate * 0.8) {
      this.noiseFloor = this.noiseFloor * 0.98 + frame.rms * 0.02;
      this.updateGate();
    }
    const weak = frame.rms > 1.5 * Math.max(this.noiseFloor, 0.0005) && frame.rms < this.gate;
    if (weak) {
      this.weakSince ??= frame.endAt;
      if (frame.endAt - this.weakSince >= 400) this.raiseHint('debil', frame.endAt);
    } else {
      this.weakSince = null;
    }
  }

  private offEvent(note: Midi, at: number): NoteEvent {
    return { type: 'off', note, velocity: 0, at, source: 'microfono' };
  }
}
