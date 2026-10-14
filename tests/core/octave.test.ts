import { detectPitch, frequencyToMidiFloat } from '@/core/domain/pitch';
import { onsOf, runPipeline } from '../support/pipeline';
import { SAMPLE_RATE, concat, highpass, pianoNote, silence } from '../support/synth';

const CALIBRATION = silence(1200);

/**
 * Nota con los parciales impares muy débiles (resonancia del altavoz / sala que realza los pares):
 * la periodicidad más corta es la de la octava de arriba. Es lo que se sospecha del Mi4 del Yamaha.
 */
function evenHeavy(midi: number, odd: number, extra: { ms?: number; seed?: number } = {}) {
  return pianoNote(midi, {
    ms: extra.ms ?? 700,
    seed: extra.seed ?? 1,
    partialGains: [odd, 1, odd, 1, odd, 0.8, odd, 0.6],
  });
}

function notesHeard(signal: Float32Array) {
  return onsOf(runPipeline(concat(CALIBRATION, signal, silence(800)))).map(
    (item) => item.event.note,
  );
}

describe('corrección de octava (el «Mi»)', () => {
  it('el problema existe: con parciales impares muy débiles, la detección sola lee la octava de arriba', () => {
    const note = evenHeavy(64, 0.08);
    const start = Math.round(0.15 * SAMPLE_RATE);
    const estimate = detectPitch(note.slice(start, start + 2048), SAMPLE_RATE);
    expect(estimate).not.toBeNull();
    expect(Math.round(frequencyToMidiFloat(estimate?.frequency ?? 1))).toBe(76);
  });

  it('el seguimiento lo corrige: Mi4 sigue siendo Mi4', () => {
    expect(notesHeard(evenHeavy(64, 0.08))).toEqual([64]);
  });

  it('un Mi5 real (con su propia fundamental) no se convierte en Mi4', () => {
    expect(notesHeard(pianoNote(76, { ms: 700 }))).toEqual([76]);
  });

  it('Mi4 y luego un Mi5 real a 150–1200 ms: se oyen las dos notas, sin conversión falsa', () => {
    for (const gap of [150, 300, 600, 1200]) {
      const first = evenHeavy(64, 0.08, { ms: 500 });
      const second = pianoNote(76, { ms: 700 });
      const signal = concat(first, silence(gap), second);
      const heard = notesHeard(signal);
      expect(heard, `separación de ${gap} ms`).toEqual([64, 76]);
    }
  });

  describe('matriz de confusión', () => {
    const cases: [number, number, number][] = [];
    // Desde Si3: por debajo, la resolución espectral (23 Hz con 2048 muestras) no separa f/2 de su entorno.
    for (const midi of [59, 60, 62, 64, 65, 67, 69, 72]) {
      for (const odd of [1, 0.5, 0.25, 0.15, 0.1]) {
        for (const cutoff of [0, 200]) cases.push([midi, odd, cutoff]);
      }
    }

    it(
      'la nota correcta (sin errores de octava) en ≥ 95 % de los casos',
      { timeout: 60000 },
      () => {
        let correct = 0;
        let octaveErrors = 0;
        for (const [midi, odd, cutoff] of cases) {
          let note = evenHeavy(midi, odd);
          if (cutoff > 0) note = highpass(note, cutoff);
          const heard = notesHeard(note);
          if (heard.length === 1 && heard[0] === midi) correct += 1;
          else if (heard.some((value) => value === midi + 12 || value === midi - 12))
            octaveErrors += 1;
          expect(
            heard.every((value) => value === midi || Math.abs(value - midi) === 12),
            `MIDI ${midi} odd ${odd} hp ${cutoff}: ${heard.join(',')}`,
          ).toBe(true);
        }
        expect(correct / cases.length).toBeGreaterThanOrEqual(0.95);
        expect(octaveErrors / cases.length).toBeLessThanOrEqual(0.02);
      },
    );

    it('notas con espectro normal nunca se «corrigen» una octava abajo (0 conversiones falsas)', () => {
      for (const midi of [60, 64, 67, 72, 76, 79]) {
        for (const seed of [1, 2, 3]) {
          expect(notesHeard(pianoNote(midi, { ms: 700, seed })), `MIDI ${midi}`).toEqual([midi]);
        }
      }
    });
  });
});
