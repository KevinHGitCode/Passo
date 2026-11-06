import { WebAudioOutput } from '@/adapters/audio/web-audio-output';
import { midiToFrequency } from '@/core/domain/pitch';
import type { AudioStatus } from '@/core/ports/audio-control';
import { FakeAudioContext } from '../fakes/fake-audio-context';

function setup() {
  const context = new FakeAudioContext();
  const output = new WebAudioOutput(() => context);
  const statuses: AudioStatus[] = [];
  output.subscribeStatus((status) => statuses.push(status));
  return { context, output, statuses };
}

describe('midiToFrequency', () => {
  it('La4 = 440 Hz, Do4 ≈ 261,63 Hz y una octava duplica la frecuencia', () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 6);
    expect(midiToFrequency(60)).toBeCloseTo(261.6256, 3);
    expect(midiToFrequency(81)).toBeCloseTo(880, 6);
  });
});

describe('WebAudioOutput', () => {
  it('empieza "bloqueado" y pasa a "listo" al desbloquear con un gesto', async () => {
    const { context, output, statuses } = setup();
    expect(output.getStatus()).toBe('bloqueado');
    await output.unlock();
    expect(context.resumeCalls).toBe(1);
    expect(output.getStatus()).toBe('listo');
    expect(statuses).toEqual(['listo']);
  });

  it('noteOn crea dos osciladores a la frecuencia correcta y los arranca', () => {
    const { context, output } = setup();
    output.noteOn(69, 100);
    expect(context.oscillators).toHaveLength(2);
    expect(context.oscillators.map((o) => o.frequency.value)).toEqual([440, 880]);
    expect(context.oscillators.every((o) => o.started !== null && o.connected)).toBe(true);
  });

  it('una velocidad mayor da más volumen', () => {
    const quiet = setup();
    quiet.output.noteOn(60, 20);
    const loud = setup();
    loud.output.noteOn(60, 120);
    const peak = (calls: string[]) => Number(/lin:([\d.]+)@/.exec(calls.join(' '))?.[1]);
    const quietGain = quiet.context.gains.at(-1)?.gain.calls ?? [];
    const loudGain = loud.context.gains.at(-1)?.gain.calls ?? [];
    expect(peak(loudGain)).toBeGreaterThan(peak(quietGain));
  });

  it('noteOff programa la liberación y detiene los osciladores', () => {
    const { context, output } = setup();
    output.noteOn(60, 90);
    context.currentTime = 1;
    output.noteOff(60);
    const oscillators = context.oscillators;
    expect(oscillators.every((o) => o.stopped !== null && o.stopped > 1)).toBe(true);
    oscillators.forEach((o) => o.onended?.());
    expect(oscillators.every((o) => !o.connected)).toBe(true);
  });

  it('volver a tocar la misma nota corta la anterior (no se acumulan voces)', () => {
    const { context, output } = setup();
    output.noteOn(60, 90);
    output.noteOn(60, 90);
    expect(context.oscillators).toHaveLength(4);
    expect(context.oscillators.slice(0, 2).every((o) => o.stopped !== null)).toBe(true);
  });

  it('noteOff de una nota que no suena no hace nada', () => {
    const { output } = setup();
    expect(() => output.noteOff(61)).not.toThrow();
  });

  it('sin Web Audio informa "sin-soporte" y no lanza al tocar', async () => {
    const output = new WebAudioOutput(() => undefined);
    expect(() => output.noteOn(60, 90)).not.toThrow();
    await output.unlock();
    expect(output.getStatus()).toBe('sin-soporte');
  });
});

describe('WebAudioOutput · la nota de referencia', () => {
  const tone = {
    frequency: 110,
    durationMs: 2500,
    attackMs: 7,
    releaseMs: 150,
    harmonics: [0.6, 1, 0.8, 0.5, 0.35, 0.25],
  } as const;

  it('crea un oscilador por armónico, a múltiplos exactos de la fundamental, y los arranca', () => {
    const { context, output } = setup();
    output.playTone(tone, () => undefined);
    expect(context.oscillators.map((o) => o.frequency.value)).toEqual([
      110, 220, 330, 440, 550, 660,
    ]);
    expect(context.oscillators.every((o) => o.type === 'sine' && o.started !== null)).toBe(true);
    // Cada uno se detiene un poco después del final previsto.
    expect(context.oscillators.every((o) => (o.stopped ?? 0) > 2.5)).toBe(true);
  });

  it('el reparto de amplitudes suma 1 (el volumen no depende de cuántos armónicos lleve)', () => {
    const { context, output } = setup();
    output.playTone(tone, () => undefined);
    const parts = context.gains.slice(-6).map((g) => g.gain.value);
    expect(parts.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 6);
    expect(parts[1]).toBeGreaterThan(parts[0] ?? 1);
  });

  it('avisa una sola vez al terminar, por mucho que terminen varios osciladores', () => {
    vi.useFakeTimers();
    try {
      const { context, output } = setup();
      const onEnd = vi.fn();
      output.playTone(tone, onEnd);
      const last = context.oscillators[context.oscillators.length - 1];
      last?.onended?.();
      last?.onended?.();
      expect(onEnd).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(5000);
      expect(onEnd).toHaveBeenCalledTimes(1);
      expect(context.oscillators.every((o) => !o.connected)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('si el audio está bloqueado y nunca avanza, igualmente da el tono por terminado', () => {
    vi.useFakeTimers();
    try {
      const { output } = setup();
      const onEnd = vi.fn();
      output.playTone(tone, onEnd);
      vi.advanceTimersByTime(2500);
      expect(onEnd).not.toHaveBeenCalled();
      vi.advanceTimersByTime(400);
      expect(onEnd).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stopTone lo corta con un final breve y avisa al momento', () => {
    const { context, output } = setup();
    const onEnd = vi.fn();
    output.playTone(tone, onEnd);
    output.stopTone();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(context.oscillators.every((o) => (o.stopped ?? 99) < 0.2)).toBe(true);
    output.stopTone();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('stopTone avisa al momento pero suelta los nodos cuando el fundido ya terminó (sin clic)', () => {
    vi.useFakeTimers();
    try {
      const { context, output } = setup();
      const onEnd = vi.fn();
      output.playTone(tone, onEnd);
      output.stopTone();
      expect(onEnd).toHaveBeenCalledTimes(1);
      // El final suave todavía se está oyendo: nada desconectado.
      expect(context.oscillators.every((o) => o.connected)).toBe(true);
      vi.advanceTimersByTime(200);
      expect(context.oscillators.every((o) => !o.connected)).toBe(true);
      expect(onEnd).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('un tono nuevo corta el anterior', () => {
    const { context, output } = setup();
    const first = vi.fn();
    const second = vi.fn();
    output.playTone(tone, first);
    output.playTone({ ...tone, frequency: 82.41 }, second);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    expect(context.oscillators).toHaveLength(12);
  });

  it('desde un gesto desbloquea el audio si seguía bloqueado', async () => {
    const { context, output } = setup();
    output.playTone(tone, () => undefined);
    await Promise.resolve();
    expect(context.resumeCalls).toBe(1);
    expect(output.getStatus()).toBe('listo');
  });

  it('sin Web Audio avisa al momento y no falla', () => {
    const output = new WebAudioOutput(() => undefined);
    const onEnd = vi.fn();
    expect(() => output.playTone(tone, onEnd)).not.toThrow();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(() => output.stopTone()).not.toThrow();
  });
});
