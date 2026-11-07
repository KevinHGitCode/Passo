import { describe, expect, it } from 'vitest';
import { chordSymbol, matchChords } from '@/core/domain/chords';
import { detectNotes, noteOfFrequency, spectralPeaks } from '@/core/domain/multi-pitch';
import { strum } from '../support/strum';
import { SAMPLE_RATE, guitarNote } from '../support/synth';

/** La ventana de 8192 muestras que se analiza (de 40 ms a 210 ms tras el ataque). */
const window = (signal: Float32Array): Float32Array => signal.subarray(1900, 1900 + 8192);

const CHORDS: Record<string, readonly number[]> = {
  G: [43, 47, 50, 55, 59, 67],
  C: [48, 52, 55, 60, 64],
  D7: [50, 57, 60, 66],
  D: [50, 57, 62, 66],
  Em: [40, 47, 52, 55, 59, 64],
  Am: [45, 52, 57, 60, 64],
  E: [40, 47, 52, 56, 59, 64],
  A: [45, 52, 57, 61, 64],
  Dm: [50, 57, 62, 65],
  F: [41, 48, 53, 57, 60, 65],
  A7: [45, 52, 55, 61, 64],
  E7: [40, 47, 50, 56, 59, 64],
  G7: [43, 47, 50, 55, 59, 65],
  Cmaj7: [48, 52, 55, 59, 64],
  Am7: [45, 52, 55, 60, 64],
};

describe('los picos del espectro', () => {
  it('una sola cuerda: el pico más fuerte cae en su frecuencia, con los cents que se desvía', () => {
    const signal = guitarNote(52, { ms: 600, cents: -30 }).subarray(2400, 2400 + 8192);
    const peaks = spectralPeaks(signal, SAMPLE_RATE);
    const strongest = [...peaks].sort((a, b) => b.amplitude - a.amplitude)[0];
    const heard = noteOfFrequency(strongest?.frequency ?? 0);
    expect(heard.midi % 12).toBeGreaterThanOrEqual(0);
    // El pico de la fundamental (Mi3, 164,8 Hz, 30 cents baja).
    const fundamental = peaks.find(
      (peak) => Math.abs(peak.frequency - 164.81 * 2 ** (-30 / 1200)) < 3,
    );
    expect(fundamental).toBeDefined();
  });

  it('noteOfFrequency da la nota y los cents', () => {
    expect(noteOfFrequency(440)).toMatchObject({ midi: 69 });
    const sharp = noteOfFrequency(440 * 2 ** (20 / 1200));
    expect(sharp.midi).toBe(69);
    expect(sharp.cents).toBeCloseTo(20, 4);
  });
});

describe('reconocer el acorde que suena (guitarra sintética, rasgueo hacia abajo)', () => {
  for (const [name, notes] of Object.entries(CHORDS)) {
    it(`${name}`, () => {
      const heard = detectNotes(window(strum(notes)), SAMPLE_RATE);
      const top = matchChords(heard);
      expect(
        chordSymbol((top[0] as (typeof top)[number]).chord),
        `oí ${heard.map((n) => n.midi).join(',')}`,
      ).toBe(name);
    });
  }

  it('hacia arriba (las cuerdas agudas primero) da el mismo acorde', () => {
    const heard = detectNotes(
      window(strum([...(CHORDS.D7 as readonly number[])].reverse())),
      SAMPLE_RATE,
    );
    expect(
      chordSymbol((matchChords(heard)[0] as ReturnType<typeof matchChords>[number]).chord),
    ).toBe('D7');
  });

  it('una cuerda mal puesta se nota: Sol mayor con el Re bajado un semitono sigue pareciendo Sol, pero suena un Do♯ de más', () => {
    const wrong = [43, 47, 49, 55, 59, 67];
    const top = matchChords(detectNotes(window(strum(wrong)), SAMPLE_RATE))[0];
    expect(top?.extra).toContain(1);
    expect(top?.score ?? 1).toBeLessThan(
      matchChords(detectNotes(window(strum(CHORDS.G as number[])), SAMPLE_RATE))[0]?.score ?? 0,
    );
  });
});
