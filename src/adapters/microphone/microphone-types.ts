/**
 * Lo mínimo que usamos de `getUserMedia` y Web Audio para escuchar el micrófono.
 * Así el adaptador se prueba con falsos y no depende de los tipos de DOM.
 */
export interface MicTrackLike {
  readonly label: string;
  onended: (() => void) | null;
  stop(): void;
  getSettings?(): {
    readonly echoCancellation?: boolean | undefined;
    readonly noiseSuppression?: boolean | undefined;
    readonly autoGainControl?: boolean | undefined;
  };
}

export interface MicStreamLike {
  getAudioTracks(): MicTrackLike[];
}

export interface MediaDevicesLike {
  getUserMedia(constraints: {
    audio: boolean | Record<string, unknown>;
    video: boolean;
  }): Promise<MicStreamLike>;
}

export interface AnalyserLike {
  fftSize: number;
  getFloatTimeDomainData(buffer: Float32Array<ArrayBuffer>): void;
  disconnect(): void;
}

export interface MicSourceLike {
  connect(destination: AnalyserLike): unknown;
  disconnect(): void;
}

export interface MicAudioContextLike {
  readonly sampleRate: number;
  /** Segundos de audio transcurridos: marca el ritmo de las muestras reales. */
  readonly currentTime: number;
  readonly state: string;
  resume(): Promise<void>;
  close(): Promise<void>;
  createMediaStreamSource(stream: MicStreamLike): MicSourceLike;
  createAnalyser(): AnalyserLike;
  addEventListener(type: 'statechange', listener: () => void): void;
  removeEventListener(type: 'statechange', listener: () => void): void;
}

export interface TimersLike {
  setInterval(callback: () => void, ms: number): number;
  clearInterval(id: number): void;
}

/** Visibilidad de la pestaña (en el navegador, `document`). */
export interface VisibilityLike {
  readonly hidden: boolean;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}
