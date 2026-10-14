import { analyzeFrame, BLOCK_SIZE, rms } from '@/core/domain/frame-analysis';
import { SAMPLE_RATE, pianoNote, silence, sine } from '../support/synth';

describe('rms', () => {
  it('una senoide de amplitud A tiene RMS A/√2 y el silencio 0', () => {
    expect(rms(sine(440, 100, 0.5))).toBeCloseTo(0.5 / Math.SQRT2, 3);
    expect(rms(silence(50))).toBe(0);
    expect(rms(new Float32Array(0))).toBe(0);
  });
});

describe('analyzeFrame', () => {
  const window = sine(262, 60, 0.4).slice(0, 2048);

  it('entrega un bloque por cada 256 muestras nuevas, con sus tiempos', () => {
    const frame = analyzeFrame(window, 1024, SAMPLE_RATE, 500);
    expect(frame.blockRms).toHaveLength(1024 / BLOCK_SIZE);
    expect(frame.blockBaseline).toHaveLength(frame.blockRms.length);
    expect(frame.blockMs).toBeCloseTo((BLOCK_SIZE / SAMPLE_RATE) * 1000, 6);
    expect(frame.windowMs).toBeCloseTo((2048 / SAMPLE_RATE) * 1000, 6);
    expect(frame.endAt).toBe(500);
  });

  it('calcula RMS y pico de las muestras nuevas y detecta la altura de la ventana', () => {
    const frame = analyzeFrame(window, 1024, SAMPLE_RATE, 0);
    expect(frame.rms).toBeCloseTo(0.4 / Math.SQRT2, 2);
    expect(frame.peak).toBeCloseTo(0.4, 2);
    expect(frame.pitch?.frequency).toBeCloseTo(262, 0);
  });

  it('un ataque en el último bloque contrasta con su línea base en silencio', () => {
    const signal = new Float32Array(2048);
    signal.set(pianoNote(64, { ms: 30 }).slice(0, BLOCK_SIZE), 2048 - BLOCK_SIZE);
    const frame = analyzeFrame(signal, 1024, SAMPLE_RATE, 0);
    const last = frame.blockRms.length - 1;
    expect(frame.blockRms[last]).toBeGreaterThan(0.05);
    expect(frame.blockBaseline[last]).toBe(0);
    expect(frame.blockRms[last - 1]).toBe(0);
  });

  it('con menos muestras nuevas que un bloque no hay bloques', () => {
    expect(analyzeFrame(window, 100, SAMPLE_RATE, 0).blockRms).toHaveLength(0);
  });

  it('el análisis completo de un fotograma cuesta menos de 3 ms (mediana)', () => {
    const w = pianoNote(64, { ms: 600 }).slice(7200, 7200 + 2048);
    analyzeFrame(w, 1024, SAMPLE_RATE, 0);
    const times: number[] = [];
    for (let i = 0; i < 60; i++) {
      const start = performance.now();
      analyzeFrame(w, 1024, SAMPLE_RATE, 0);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    expect(times[30]).toBeLessThan(3);
  });
});
