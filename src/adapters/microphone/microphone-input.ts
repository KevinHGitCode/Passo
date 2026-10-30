import { ChordListener } from '@/core/domain/chord-listener';
import { analyzeFrame, BLOCK_SIZE } from '@/core/domain/frame-analysis';
import { trackerConfigFor } from '@/core/domain/listening-profile';
import type { ListeningProfile } from '@/core/domain/listening-profile';
import type { Midi } from '@/core/domain/note';
import { detectPitch } from '@/core/domain/pitch';
import type { NoteEvent } from '@/core/domain/note-event';
import { NoteTracker } from '@/core/domain/note-tracker';
import type { Clock } from '@/core/ports/clock';
import type { ChordLogSource } from '@/core/ports/chord-log';
import type { ExpectationSink } from '@/core/ports/expectation-sink';
import { SILENT_MONITOR } from '@/core/ports/input-monitor';
import type { ListeningProfileSink } from '@/core/ports/listening-profile-sink';
import type { InputMonitor, ListenPhase, MonitorSnapshot } from '@/core/ports/input-monitor';
import type { InputStatus, NoteInput, Unsubscribe } from '@/core/ports/note-input';
import type { PitchMonitor, PitchReading, PitchTarget } from '@/core/ports/pitch-monitor';
import type {
  AnalyserLike,
  MediaDevicesLike,
  MicAudioContextLike,
  MicSourceLike,
  MicStreamLike,
  MicTrackLike,
  TimersLike,
  VisibilityLike,
} from './microphone-types';

export interface MicrophoneDeps {
  /** `navigator.mediaDevices`, o `undefined` si el navegador no lo tiene. */
  readonly mediaDevices: MediaDevicesLike | undefined;
  readonly createContext: () => MicAudioContextLike | undefined;
  readonly clock: Clock;
  readonly timers: TimersLike;
  readonly visibility?: VisibilityLike | undefined;
}

/** Ventana de análisis, salto entre fotogramas y periodo del temporizador. */
const WINDOW = 2048;
const FFT_SIZE = 4096;
const HOP = 1024;
const TICK_MS = 10;
/** Máximo de publicaciones del monitor por segundo (evita repintar sin necesidad). */
const MONITOR_MIN_INTERVAL_MS = 66;
const HEARD_RETENTION_MS = 1500;
const LEVEL_STEPS = 64;
/** Claridad mínima para dar por buena una lectura de tono del afinador. */
const PITCH_MIN_CLARITY = 0.6;
/** Hueco máximo (segundos) que se tolera sin reiniciar el seguimiento; menores solo marcan «tras un hueco». */
const MAX_GAP_SAMPLES_FACTOR = 0.5;

const CONSTRAINTS = {
  audio: {
    // Para música no queremos que el navegador «limpie» el sonido: borra tonos sostenidos.
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
  },
  video: false,
} as const;

/** Escala dBFS de −60 a 0 → 0..1, cuantizada. */
function levelOf(rms: number): number {
  const db = 20 * Math.log10(Math.max(rms, 1e-5));
  const scaled = Math.min(1, Math.max(0, (db + 60) / 60));
  return Math.round(scaled * LEVEL_STEPS) / LEVEL_STEPS;
}

function errorName(error: unknown): string {
  return String((error as { name?: unknown } | null)?.name ?? '');
}

function statusForError(error: unknown): InputStatus {
  switch (errorName(error)) {
    case 'NotAllowedError':
    case 'SecurityError':
    case 'PermissionDeniedError':
      return { kind: 'permiso-denegado' };
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return { kind: 'sin-dispositivo' };
    case 'NotReadableError':
    case 'AbortError':
    case 'TrackStartError':
      return { kind: 'sin-dispositivo', reason: 'ocupado' };
    default:
      return { kind: 'sin-soporte' };
  }
}

interface Capture {
  readonly context: MicAudioContextLike;
  readonly stream: MicStreamLike;
  readonly tracks: readonly MicTrackLike[];
  readonly source: MicSourceLike;
  readonly analyser: AnalyserLike;
  readonly buffer: Float32Array<ArrayBuffer>;
  readonly deviceName: string;
  readonly onContextChange: () => void;
  timerId: number;
  /** Segundos de contexto ya procesados. */
  consumedTime: number | null;
}

/**
 * Escucha activa: oye el instrumento por el micrófono y convierte el audio en eventos de nota.
 * El audio nunca sale del navegador: solo se calculan nivel, altura y ataques.
 */
export class MicrophoneInput
  implements
    NoteInput,
    InputMonitor,
    ExpectationSink,
    ListeningProfileSink,
    PitchMonitor,
    PitchTarget,
    ChordLogSource
{
  readonly source = 'microfono';
  private readonly deps: MicrophoneDeps;
  private readonly handlers = new Set<(event: NoteEvent) => void>();
  private readonly statusHandlers = new Set<(status: InputStatus) => void>();
  private readonly monitorHandlers = new Set<(snapshot: MonitorSnapshot) => void>();
  private status: InputStatus = { kind: 'inactivo' };
  private monitor: MonitorSnapshot = SILENT_MONITOR;
  private capture: Capture | null = null;
  private tracker = new NoteTracker();
  /** Cómo escucha según el instrumento; se aplica al encender y, en caliente, al cambiar. */
  private profile: ListeningProfile = 'piano';
  /** Verifica acordes (varias notas a la vez) cuando la sesión dice qué se espera; si no, no hace nada. */
  private readonly chords = new ChordListener();
  private startToken = 0;
  private suspended = false;
  private degraded = false;
  private lastPublishAt = -Infinity;
  private lastHeard: { midi: number; cents: number; until: number } | null = null;
  private lastDeviceName = 'Micrófono';
  /** Intervalo donde buscar el tono continuo (afinador); `null`: no se mide. */
  private pitchSearch: { minHz: number; maxHz: number } | null = null;
  private pitch: PitchReading | null = null;
  private readonly pitchHandlers = new Set<(reading: PitchReading | null) => void>();
  /** Contexto creado en el gesto mientras se espera el permiso: hay que cerrarlo si se apaga antes. */
  private pendingContext: MicAudioContextLike | null = null;

  constructor(deps: MicrophoneDeps) {
    this.deps = deps;
  }

  getStatus(): InputStatus {
    return this.status;
  }

  getChordLog() {
    return this.chords.getLog();
  }

  /** Qué acorde se espera oír (`null`: ninguno). Con un acorde esperado las notas se verifican a la vez. */
  setExpectation(notes: readonly Midi[] | null): void {
    this.chords.setExpectation(notes);
  }

  /**
   * Cambia cómo se escucha según el instrumento. Con el micrófono encendido es en caliente: no vuelve a
   * calibrar el ruido, pero suelta la nota en curso y olvida la afinación aprendida.
   */
  setProfile(profile: ListeningProfile): void {
    if (profile === this.profile) return;
    this.profile = profile;
    if (!this.capture) return;
    this.emitAll(this.tracker.reconfigure(trackerConfigFor(profile), this.deps.clock.now()));
    this.publish(true);
  }

  getMonitor(): MonitorSnapshot {
    return this.monitor;
  }

  getPitch(): PitchReading | null {
    return this.pitch;
  }

  subscribePitch(handler: (reading: PitchReading | null) => void): Unsubscribe {
    this.pitchHandlers.add(handler);
    return () => this.pitchHandlers.delete(handler);
  }

  /** Mide el tono continuo solo dentro de este intervalo (afinador); con `null` deja de medir. */
  setPitchSearch(range: { readonly minHz: number; readonly maxHz: number } | null): void {
    this.pitchSearch = range === null ? null : { minHz: range.minHz, maxHz: range.maxHz };
    if (range === null) this.setPitch(null);
  }

  subscribe(handler: (event: NoteEvent) => void): Unsubscribe {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  subscribeStatus(handler: (status: InputStatus) => void): Unsubscribe {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  subscribeMonitor(handler: (snapshot: MonitorSnapshot) => void): Unsubscribe {
    this.monitorHandlers.add(handler);
    return () => this.monitorHandlers.delete(handler);
  }

  /** Pide el micrófono y empieza a escuchar. Debe llamarse desde un gesto del usuario (clic). */
  async start(): Promise<void> {
    const token = ++this.startToken;
    this.release();
    const mediaDevices = this.deps.mediaDevices;
    if (!mediaDevices) {
      this.setStatus({ kind: 'sin-soporte' });
      return;
    }
    this.setStatus({ kind: 'iniciando' });

    // El contexto se crea y se reanuda ya, dentro del gesto, antes de esperar el permiso.
    let context: MicAudioContextLike | undefined;
    try {
      context = this.deps.createContext();
      void context?.resume().catch(() => undefined);
    } catch {
      context = undefined;
    }
    if (!context) {
      this.setStatus({ kind: 'sin-soporte' });
      return;
    }
    this.pendingContext = context;

    let stream: MicStreamLike;
    try {
      stream = await this.requestStream(mediaDevices);
    } catch (error) {
      void context.close().catch(() => undefined);
      if (this.pendingContext === context) this.pendingContext = null;
      if (token === this.startToken) this.setStatus(statusForError(error));
      return;
    }
    if (token !== this.startToken) {
      // Se apagó mientras se esperaba el permiso: hay que soltar el micrófono (la luz del equipo).
      stream.getAudioTracks().forEach((track) => track.stop());
      void context.close().catch(() => undefined);
      return;
    }
    this.pendingContext = null;
    this.begin(context, stream);
  }

  /** Apaga el micrófono y libera todo. */
  stop(): void {
    this.startToken += 1;
    this.release();
    this.setStatus({ kind: 'inactivo' });
  }

  private async requestStream(mediaDevices: MediaDevicesLike): Promise<MicStreamLike> {
    try {
      return await mediaDevices.getUserMedia(CONSTRAINTS);
    } catch (error) {
      if (errorName(error) !== 'OverconstrainedError') throw error;
      return mediaDevices.getUserMedia({ audio: true, video: false });
    }
  }

  private begin(context: MicAudioContextLike, stream: MicStreamLike): void {
    try {
      this.setUp(context, stream);
    } catch {
      // Un flujo sin pistas o un contexto que falla: se suelta todo y se informa, sin dejar la luz del micrófono encendida.
      this.release();
      stream.getAudioTracks().forEach((track) => track.stop());
      void context.close().catch(() => undefined);
      this.setStatus({ kind: 'sin-soporte' });
    }
  }

  private setUp(context: MicAudioContextLike, stream: MicStreamLike): void {
    const tracks = stream.getAudioTracks();
    const track = tracks[0];
    const settings = track?.getSettings?.();
    this.degraded =
      settings?.echoCancellation === true ||
      settings?.noiseSuppression === true ||
      settings?.autoGainControl === true;
    this.lastDeviceName = track?.label.trim() || 'Micrófono';

    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    source.connect(analyser); // Nunca se conecta a la salida: el micrófono no debe oírse a sí mismo.

    const onContextChange = () => this.onContextChange();
    context.addEventListener('statechange', onContextChange);
    tracks.forEach((item) => {
      item.onended = () => this.onTrackEnded();
    });
    this.deps.visibility?.addEventListener('visibilitychange', this.onVisibility);

    this.suspended = this.deps.visibility?.hidden === true;
    this.tracker = new NoteTracker(trackerConfigFor(this.profile));
    this.lastHeard = null;
    this.capture = {
      context,
      stream,
      tracks,
      source,
      analyser,
      buffer: new Float32Array(FFT_SIZE),
      deviceName: this.lastDeviceName,
      onContextChange,
      timerId: this.deps.timers.setInterval(() => this.tick(), TICK_MS),
      consumedTime: null,
    };
    this.setStatus({ kind: 'conectado', deviceName: this.lastDeviceName });
    this.publish(true);
  }

  /** Procesa las muestras nuevas, si hay suficientes, y publica el estado. */
  private tick(): void {
    const capture = this.capture;
    if (!capture) return;
    if (this.suspended || capture.context.state !== 'running') {
      capture.consumedTime = null;
      this.publish(false);
      return;
    }

    const sampleRate = capture.context.sampleRate;
    const now = capture.context.currentTime;
    if (capture.consumedTime === null) capture.consumedTime = now;
    const available = Math.floor((now - capture.consumedTime) * sampleRate);
    if (available < HOP) return;

    const at = this.deps.clock.now();
    if (available > MAX_GAP_SAMPLES_FACTOR * sampleRate) {
      // Hueco de más de medio segundo (pestaña ahogada): no se puede fiar del seguimiento, se reinicia.
      this.emitAll(this.tracker.reset(at));
      this.emitAll(this.chords.reset(at));
    }
    const gap = available > WINDOW;
    // Se consumen bloques completos: el resto (las muestras más recientes) queda para el siguiente fotograma.
    const consumed = gap ? WINDOW : Math.floor(available / BLOCK_SIZE) * BLOCK_SIZE;
    const lag = gap ? 0 : available - consumed;
    capture.analyser.getFloatTimeDomainData(capture.buffer);
    const windowEnd = FFT_SIZE - lag;
    const window = capture.buffer.subarray(windowEnd - WINDOW, windowEnd);
    capture.consumedTime = gap ? now : capture.consumedTime + consumed / sampleRate;

    try {
      const endAt = at - (lag / sampleRate) * 1000;
      const analysis = analyzeFrame(window, consumed, sampleRate, endAt, gap);
      const monophonic = this.tracker.push(analysis);
      const state = this.tracker.getState();
      this.measurePitch(
        capture.buffer.subarray(0, windowEnd),
        sampleRate,
        endAt,
        analysis.rms,
        state,
      );
      // Un hueco corto de audio deja el anillo discontinuo: el oyente de acordes olvida lo anterior.
      if (gap) this.emitAll(this.chords.reset(at));
      const chord = this.chords.push(window.subarray(window.length - consumed), sampleRate, endAt, {
        noiseRms: state.noiseFloor,
        tuningCents: state.tuningOffsetCents ?? 0,
        listening: state.phase === 'escuchando',
      });
      // Con un acorde esperado las notas las dice el verificador (el seguimiento de una voz solo
      // confundiría); durante la calibración todavía no se sabe cuánto ruido hay y no se mide.
      if (this.chords.isActive()) {
        this.emitAll(chord);
      } else {
        this.emitAll(monophonic);
      }
    } catch {
      // Un fallo en un fotograma (o en un oyente) no debe detener la escucha.
    }
    this.publish(false);
  }

  /** Tono continuo para el afinador: solo con un intervalo pedido y con sonido por encima del umbral. */
  private measurePitch(
    samples: Float32Array,
    sampleRate: number,
    at: number,
    rms: number,
    state: ReturnType<NoteTracker['getState']>,
  ): void {
    const range = this.pitchSearch;
    if (range === null) return;
    let reading: PitchReading | null = null;
    if (state.phase === 'escuchando' && rms >= state.gate) {
      const estimate = detectPitch(
        samples.subarray(Math.max(0, samples.length - FFT_SIZE)),
        sampleRate,
        range,
      );
      if (estimate !== null && estimate.clarity >= PITCH_MIN_CLARITY) {
        reading = { frequency: estimate.frequency, clarity: estimate.clarity, at };
      }
    }
    this.setPitch(reading);
  }

  private setPitch(reading: PitchReading | null): void {
    const changed = reading !== null || this.pitch !== null;
    this.pitch = reading;
    // Mientras se mide, el silencio se avisa en cada fotograma: así quien sigue el tono sabe cuánto
    // lleva sin oír nada (una sola notificación de «ya no suena» no basta para olvidar lo anterior).
    if (changed || this.pitchSearch !== null) this.notify(this.pitchHandlers, reading);
  }

  private emitAll(events: readonly NoteEvent[]): void {
    for (const event of events) {
      for (const handler of this.handlers) {
        try {
          handler(event);
        } catch {
          // Un oyente que falla no debe impedir que los demás reciban la nota.
        }
      }
    }
  }

  private readonly onVisibility = (): void => {
    const hidden = this.deps.visibility?.hidden === true;
    if (hidden === this.suspended) return;
    this.suspended = hidden;
    if (hidden) {
      this.emitAll(this.tracker.reset(this.deps.clock.now()));
      this.emitAll(this.chords.reset(this.deps.clock.now()));
    } else {
      // Al volver se mide el ruido de nuevo (el entorno puede haber cambiado) conservando la afinación.
      this.emitAll(this.tracker.restart(this.deps.clock.now()));
      this.emitAll(this.chords.reset(this.deps.clock.now()));
    }
    this.publish(true);
  };

  private onContextChange(): void {
    const capture = this.capture;
    if (!capture) return;
    if (capture.context.state !== 'running') {
      this.emitAll(this.tracker.reset(this.deps.clock.now()));
      this.emitAll(this.chords.reset(this.deps.clock.now()));
    } else {
      this.emitAll(this.tracker.restart(this.deps.clock.now()));
      this.emitAll(this.chords.reset(this.deps.clock.now()));
    }
    this.publish(true);
  }

  /** La pista terminó (se desenchufó el micrófono o el sistema lo retiró). */
  private onTrackEnded(): void {
    if (!this.capture) return;
    const deviceName = this.capture.deviceName;
    this.release();
    this.setStatus({ kind: 'desconectado', deviceName });
  }

  /** Suelta pistas, nodos, contexto, temporizador y oyentes. Emite `off` si había una nota. */
  private release(): void {
    if (this.pendingContext) {
      void this.pendingContext.close().catch(() => undefined);
      this.pendingContext = null;
    }
    const capture = this.capture;
    if (!capture) {
      this.publishOff();
      return;
    }
    this.capture = null;
    this.deps.timers.clearInterval(capture.timerId);
    this.deps.visibility?.removeEventListener('visibilitychange', this.onVisibility);
    capture.context.removeEventListener('statechange', capture.onContextChange);
    this.emitAll(this.tracker.reset(this.deps.clock.now()));
    this.emitAll(this.chords.reset(this.deps.clock.now()));
    capture.tracks.forEach((track) => {
      track.onended = null;
      track.stop();
    });
    capture.source.disconnect();
    capture.analyser.disconnect();
    void capture.context.close().catch(() => undefined);
    this.publishOff();
  }

  private publishOff(): void {
    this.setPitch(null);
    this.lastHeard = null;
    this.monitor = SILENT_MONITOR;
    this.notify(this.monitorHandlers, this.monitor);
  }

  private currentPhase(): ListenPhase {
    if (!this.capture) return 'apagado';
    if (this.suspended || this.capture.context.state !== 'running') return 'suspendido';
    return this.tracker.getState().phase === 'calibrando' ? 'calibrando' : 'escuchando';
  }

  /** Publica el estado del monitor, a lo sumo ~15 veces por segundo salvo cambios importantes. */
  private publish(force: boolean): void {
    if (!this.capture) return;
    const now = this.deps.clock.now();
    const state = this.tracker.getState();
    if (state.heard) this.lastHeard = { ...state.heard, until: now + HEARD_RETENTION_MS };
    else if (this.lastHeard && now > this.lastHeard.until) this.lastHeard = null;

    const next: MonitorSnapshot = {
      phase: this.currentPhase(),
      calibration: Math.round(state.calibration * LEVEL_STEPS) / LEVEL_STEPS,
      level: levelOf(state.level),
      gateLevel: levelOf(state.gate),
      clipping: state.hint === 'saturado',
      degraded: this.degraded,
      heard: this.lastHeard
        ? { midi: this.lastHeard.midi, cents: Math.round(this.lastHeard.cents) }
        : null,
      tuningOffsetCents:
        state.tuningOffsetCents === null ? null : Math.round(state.tuningOffsetCents),
      hint: state.hint,
    };
    const previous = this.monitor;
    const changed =
      next.phase !== previous.phase ||
      next.hint !== previous.hint ||
      next.clipping !== previous.clipping ||
      next.degraded !== previous.degraded ||
      next.heard?.midi !== previous.heard?.midi ||
      next.tuningOffsetCents !== previous.tuningOffsetCents;
    const levelMoved =
      next.level !== previous.level ||
      next.calibration !== previous.calibration ||
      next.gateLevel !== previous.gateLevel;
    if (!force && !changed && !levelMoved) return;
    if (!force && !changed && now - this.lastPublishAt < MONITOR_MIN_INTERVAL_MS) return;
    if (!force && changed && now - this.lastPublishAt < 8) return;
    this.lastPublishAt = now;
    this.monitor = next;
    this.notify(this.monitorHandlers, next);
  }

  /** Un oyente que falla no debe impedir que los demás se enteren ni dejar la escucha a medias. */
  private notify<T>(handlers: ReadonlySet<(value: T) => void>, value: T): void {
    for (const handler of handlers) {
      try {
        handler(value);
      } catch {
        // Se ignora: el fallo es del oyente, no de la escucha.
      }
    }
  }

  private setStatus(status: InputStatus): void {
    this.status = status;
    this.notify(this.statusHandlers, status);
  }
}
