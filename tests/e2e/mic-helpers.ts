import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

export const MIC_EVIDENCE_DIR = join('evidencias', 'fase-1');
export const MIC_CAPTURES_DIR = join(MIC_EVIDENCE_DIR, 'capturas');

export function ensureMicEvidenceDirs(): void {
  mkdirSync(MIC_CAPTURES_DIR, { recursive: true });
}

export async function micCapture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(MIC_CAPTURES_DIR, `${name}.png`) });
}

export function pause(page: Page, ms = 450): Promise<void> {
  return page.waitForTimeout(ms);
}

/** Forma del objeto que el script instala en la página. */
export interface FakeMic {
  setMode(mode: 'ok' | 'pending' | 'denied' | 'notfound' | 'busy'): void;
  prepare(): Promise<void>;
  /** Suena una nota tipo piano. Devuelve el instante (performance.now) en que se pidió. */
  note(
    midi: number,
    options?: { ms?: number; amp?: number; cents?: number; offsetMs?: number },
  ): number;
  noise(ms: number, level: number): void;
  endTrack(): void;
  readonly calls: unknown[];
}

/**
 * Micrófono simulado: sustituye a `getUserMedia` por un flujo real de audio (MediaStream) en el
 * que la prueba hace sonar notas tipo piano (parciales con inarmonicidad, decaimiento y ráfaga de
 * martillo) y ruido. La app ejecuta toda su tubería real: análisis, seguimiento y pantalla.
 */
export const FAKE_MIC_SCRIPT = `
(() => {
  let ctx = null;
  let dest = null;
  const state = { mode: 'ok', calls: [], track: null };
  const ensure = async () => {
    if (!ctx) {
      ctx = new AudioContext();
      dest = ctx.createMediaStreamDestination();
      // Ruido de fondo muy bajo, como el de cualquier micrófono real.
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.0015;
      const floor = ctx.createBufferSource();
      floor.buffer = buffer;
      floor.loop = true;
      floor.connect(dest);
      floor.start();
    }
    if (ctx.state !== 'running') await ctx.resume();
  };
  const frequency = (midi, cents) => 440 * Math.pow(2, (midi - 69) / 12 + cents / 1200);

  function tone(midi, options) {
    const ms = options.ms ?? 600;
    const amp = options.amp ?? 0.3;
    const cents = options.cents ?? 0;
    const t0 = ctx.currentTime + 0.02 + (options.offsetMs ?? 0) / 1000;
    const end = t0 + ms / 1000;
    const f0 = frequency(midi, cents);
    const master = ctx.createGain();
    master.gain.value = amp;
    master.connect(dest);
    for (let n = 1; n <= 10; n++) {
      const freq = n * f0 * Math.sqrt(1 + 0.0004 * n * n);
      if (freq > 9000) break;
      const osc = ctx.createOscillator();
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      const t60 = 4 / (0.6 * n);
      const levelAtEnd = Math.max(0.0005, Math.pow(0.0005, ms / 1000 / t60)) / n;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(1 / n, t0 + 0.005);
      gain.gain.exponentialRampToValueAtTime(levelAtEnd, end);
      gain.gain.exponentialRampToValueAtTime(0.0001, end + 0.05);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(end + 0.1);
    }
    // Ráfaga de ruido del martillo (20 ms).
    const length = Math.round(ctx.sampleRate * 0.02);
    const hammer = ctx.createBuffer(1, length, ctx.sampleRate);
    const samples = hammer.getChannelData(0);
    for (let i = 0; i < length; i++) samples[i] = (Math.random() * 2 - 1) * 0.15 * Math.exp((-i / length) * 5);
    const source = ctx.createBufferSource();
    source.buffer = hammer;
    source.connect(master);
    source.start(t0);
  }

  window.__fakeMic = {
    setMode(mode) { state.mode = mode; },
    async prepare() { await ensure(); },
    note(midi, options = {}) {
      const asked = performance.now();
      if (ctx && ctx.state === 'running') tone(midi, options);
      else ensure().then(() => tone(midi, options));
      return asked;
    },
    noise(ms, level) {
      const run = () => {
        const length = Math.round(ctx.sampleRate * ms / 1000);
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * level;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(dest);
        source.start(ctx.currentTime + 0.02);
      };
      if (ctx && ctx.state === 'running') run(); else ensure().then(run);
    },
    endTrack() {
      const track = state.track;
      if (track && typeof track.onended === 'function') track.onended(new Event('ended'));
    },
    get calls() { return state.calls; },
  };

  const errors = {
    denied: ['NotAllowedError', 'Permission denied'],
    notfound: ['NotFoundError', 'Requested device not found'],
    busy: ['NotReadableError', 'Could not start audio source'],
  };
  Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
    configurable: true,
    value: async (constraints) => {
      state.calls.push(JSON.parse(JSON.stringify(constraints)));
      if (state.mode === 'pending') await new Promise(() => undefined);
      const failure = errors[state.mode];
      if (failure) throw new DOMException(failure[1], failure[0]);
      await ensure();
      const track = dest.stream.getAudioTracks()[0];
      state.track = track;
      Object.defineProperty(track, 'label', { configurable: true, value: 'Micrófono simulado' });
      track.getSettings = () => ({ echoCancellation: false, noiseSuppression: false, autoGainControl: false });
      return dest.stream;
    },
  });
})();
`;

/** Navegador sin micrófono (sin `mediaDevices`). */
export const NO_MEDIA_DEVICES_SCRIPT = `
Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
`;

export function micNote(
  page: Page,
  midi: number,
  options: { ms?: number; amp?: number; cents?: number; offsetMs?: number } = {},
): Promise<number> {
  return page.evaluate(
    ([note, opts]) =>
      (window as unknown as { __fakeMic: FakeMic }).__fakeMic.note(
        note as number,
        opts as { ms?: number },
      ),
    [midi, options] as const,
  );
}

export function micSetMode(page: Page, mode: Parameters<FakeMic['setMode']>[0]): Promise<void> {
  return page.evaluate(
    (value) => (window as unknown as { __fakeMic: FakeMic }).__fakeMic.setMode(value),
    mode,
  );
}

export function micNoise(page: Page, ms: number, level: number): Promise<void> {
  return page.evaluate(
    ([duration, amount]) =>
      (window as unknown as { __fakeMic: FakeMic }).__fakeMic.noise(
        duration as number,
        amount as number,
      ),
    [ms, level] as const,
  );
}

export function micEndTrack(page: Page): Promise<void> {
  return page.evaluate(() => (window as unknown as { __fakeMic: FakeMic }).__fakeMic.endTrack());
}

/** Tiempo (ms) desde que suena la nota hasta que el feedback visible cambia en la pantalla. */
export function measureFeedbackLatency(page: Page, midi: number): Promise<number> {
  return page.evaluate(
    (note) =>
      new Promise<number>((resolve) => {
        const current = () =>
          Number(document.querySelector('[data-testid=feedback]')?.getAttribute('data-id') ?? 0);
        const before = current();
        let start = 0;
        const observer = new MutationObserver(() => {
          if (current() !== before) {
            observer.disconnect();
            resolve(performance.now() - start);
          }
        });
        observer.observe(document.body, { subtree: true, childList: true, attributes: true });
        start = (window as unknown as { __fakeMic: FakeMic }).__fakeMic.note(note, { ms: 450 });
      }),
    midi,
  );
}

export async function keyboardTop(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (document.querySelector('[data-testid=piano]') as Element).getBoundingClientRect().top +
      window.scrollY,
  );
}

export async function targetNote(page: Page): Promise<number> {
  const value = await page.getByTestId('target-note').getAttribute('data-midi');
  if (value === null) throw new Error('No hay nota objetivo en pantalla');
  return Number(value);
}
