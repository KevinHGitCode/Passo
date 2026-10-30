import { evaluate, startRound } from '@/core/domain/exercise';
import type { ExerciseState, RoundConfig } from '@/core/domain/exercise';
import type { NoteEvent } from '@/core/domain/note-event';
import { detectPitch, fundamentalShare } from '@/core/domain/pitch';
import { single } from '@/core/domain/target';
import { centsFrom, searchRange, stringFrequency } from '@/core/domain/tuner';
import { SAMPLE_RATE, guitarNote, highpass, noise, samplesFor, withSnr } from '../support/synth';
import { midiToFrequency } from '@/core/domain/pitch';

const ctx = { rng: () => 0, notation: 'latina' as const, help: true };
const on = (note: number, at: number): NoteEvent => ({
  type: 'on',
  note,
  velocity: 90,
  at,
  source: 'microfono',
  confidence: 'alta',
});

/** Una ronda con un orden fijo de objetivos: primero Mi (64) y luego Si (59). */
function roundOf(octaveFree: boolean): ExerciseState {
  const config: RoundConfig = {
    mode: 'notas',
    level: 0,
    pool: [single(64), single(59), single(55)],
    roundSize: 5,
    ...(octaveFree ? { octaveFree: true } : {}),
  };
  return {
    ...startRound(config, () => 0, 0),
    target: single(64),
    upcoming: [single(59), single(55)],
  };
}

describe('el rebote de la cuerda anterior con el juicio por nombre', () => {
  it('guarda la nota que de verdad se oyó, aparte de la plegada', () => {
    const state = roundOf(true);
    const { state: next } = evaluate(state, on(52, 500), ctx);
    expect(next.attempts[0]).toMatchObject({ playedMidi: 64, heardMidi: 52, isCorrect: true });
  });

  it('un rebote del Mi anterior leído en otra octava es eco, no un error', () => {
    const first = evaluate(roundOf(true), on(64, 500), ctx);
    expect(first.outcome.kind).toBe('acierto');
    // Ahora toca Si; el Mi sigue sonando y el micrófono lo lee una octava más grave.
    const ghost = evaluate(first.state, on(52, 900), ctx);
    expect(ghost.outcome.kind).toBe('ignorado');
    expect(ghost.state.attempts).toHaveLength(1);
  });

  it('sin el juicio por nombre, la misma nota en otra octava sí cuenta como error (piano)', () => {
    const first = evaluate(roundOf(false), on(64, 500), ctx);
    const other = evaluate(first.state, on(52, 900), ctx);
    expect(other.outcome.kind).toBe('error');
  });

  it('pasado el tiempo del eco, una nota con el nombre anterior vuelve a juzgarse', () => {
    const first = evaluate(roundOf(true), on(64, 500), ctx);
    const late = evaluate(first.state, on(52, 2000), ctx);
    expect(late.outcome.kind).toBe('error');
  });

  it('otro nombre distinto del anterior sigue siendo un error', () => {
    const first = evaluate(roundOf(true), on(64, 500), ctx);
    const wrong = evaluate(first.state, on(60, 900), ctx);
    expect(wrong.outcome.kind).toBe('error');
  });
});

describe('un error creíble en el mástil de la guitarra', () => {
  const guitarConfig: RoundConfig = {
    mode: 'notas',
    level: 0,
    pool: [single(64), single(59), single(55)],
    roundSize: 5,
    octaveFree: true,
    maxWrongDistance: 24,
  };
  const withTarget = (config: RoundConfig): ExerciseState => ({
    ...startRound(config, () => 0, 0),
    target: single(64),
    upcoming: [single(59), single(55)],
  });

  it('una nota a 15 semitonos (de la cuerda 6 a la 3) sí cuenta como error', () => {
    const { outcome } = evaluate(withTarget(guitarConfig), on(49, 500), ctx);
    expect(outcome.kind).toBe('error');
  });

  it('con la distancia por omisión (una octava) esa nota ni cuenta ni resta (piano)', () => {
    const plain: RoundConfig = {
      mode: 'notas',
      level: 0,
      pool: guitarConfig.pool,
      roundSize: 5,
      octaveFree: true,
    };
    const { outcome } = evaluate(withTarget(plain), on(49, 500), ctx);
    expect(outcome).toMatchObject({ kind: 'dudoso', reason: 'lejana' });
  });

  it('más allá de dos octavas sigue siendo ruido', () => {
    const { outcome } = evaluate(withTarget(guitarConfig), on(30, 500), ctx);
    expect(outcome).toMatchObject({ kind: 'dudoso', reason: 'lejana' });
  });
});

/** Una nota con los armónicos 1/n (sin inarmonicidad): la lectura debe caer en su sitio. */
function harmonics(frequency: number, ms = 400): Float32Array {
  const out = new Float32Array(samplesFor(ms));
  for (let n = 1; n <= 8; n++) {
    for (let i = 0; i < out.length; i++) {
      out[i] =
        (out[i] as number) + Math.sin((2 * Math.PI * n * frequency * i) / SAMPLE_RATE) / n / 2;
    }
  }
  return out;
}

describe('detectPitch con un intervalo estrecho (el afinador)', () => {
  it.each([1, 2, 3, 4, 5, 6] as const)('mide la cuerda %i al aire a menos de 1 cent', (string) => {
    const target = stringFrequency(string);
    const estimate = detectPitch(harmonics(target, 200).slice(0, 4096), SAMPLE_RATE, {
      ...searchRange(string),
    });
    expect(estimate).not.toBeNull();
    expect(Math.abs(centsFrom(target, estimate?.frequency ?? 1))).toBeLessThan(1);
  });

  it.each([-120, -40, 25, 90])('sigue una cuerda 6 desafinada %i cents', (offset) => {
    const target = stringFrequency(6);
    const signal = harmonics(target * 2 ** (offset / 1200), 200).slice(0, 4096);
    const estimate = detectPitch(signal, SAMPLE_RATE, searchRange(6));
    expect(estimate).not.toBeNull();
    expect(Math.abs(centsFrom(target, estimate?.frequency ?? 1) - offset)).toBeLessThan(1.5);
  });

  it('una guitarra sintética (Karplus-Strong) también sale en su sitio', () => {
    for (const string of [1, 3, 5, 6] as const) {
      const midi = [64, 59, 55, 50, 45, 40][string - 1] as number;
      const note = guitarNote(midi, { ms: 400 }).slice(2400, 2400 + 4096);
      const estimate = detectPitch(note, SAMPLE_RATE, searchRange(string));
      expect(estimate, `cuerda ${string}`).not.toBeNull();
      expect(Math.abs(centsFrom(midiToFrequency(midi), estimate?.frequency ?? 1))).toBeLessThan(6);
    }
  });

  it('una nota fuera del intervalo no se toma por la cuerda', () => {
    // Un La2 (110 Hz) con la cuerda 6 (82,4 Hz) elegida: 500 cents arriba, fuera de ±300.
    const estimate = detectPitch(harmonics(110, 200).slice(0, 4096), SAMPLE_RATE, searchRange(6));
    if (estimate !== null) {
      expect(Math.abs(centsFrom(stringFrequency(6), estimate.frequency))).toBeGreaterThan(20);
    }
  });
});

describe('detectPitch con las opciones por omisión (el piano) no cambia', () => {
  it('lee de Do2 a Sol#5 (hasta 830 Hz, el rango del piano) a menos de 3 cents', () => {
    for (let midi = 36; midi <= 80; midi += 4) {
      const frequency = midiToFrequency(midi);
      const estimate = detectPitch(harmonics(frequency, 200).slice(0, 4096), SAMPLE_RATE);
      expect(estimate, `MIDI ${midi}`).not.toBeNull();
      expect(Math.abs(centsFrom(frequency, estimate?.frequency ?? 1)), `MIDI ${midi}`).toBeLessThan(
        3,
      );
    }
  });
});

describe('fundamentalShare (la fundamental frente a sus seis primeros armónicos)', () => {
  const window = (frequency: number) => harmonics(frequency, 200).slice(0, 4096);

  it('una nota con su fundamental da 1', () => {
    expect(fundamentalShare(window(82.41), SAMPLE_RATE, 82.41)).toBeCloseTo(1, 1);
  });

  it('un submúltiplo del tono tocado da casi 0 (el Mi4 leído como Mi2)', () => {
    for (const note of [329.63, 246.94, 196]) {
      expect(fundamentalShare(window(note), SAMPLE_RATE, 82.41)).toBeLessThan(0.1);
    }
  });

  it('no se deja engañar por el ruido de fondo', () => {
    const noisy = withSnr(window(329.63), noise('blanco', 200, 0.05, 3), 15);
    expect(fundamentalShare(noisy.slice(0, 4096), SAMPLE_RATE, 82.41)).toBeLessThan(0.2);
  });

  it('con un micrófono que recorta los graves, la cuerda correcta sigue pasando', () => {
    const note = highpass(guitarNote(40, { ms: 700 }), 300).slice(8000, 8000 + 4096);
    expect(fundamentalShare(note, SAMPLE_RATE, 82.41)).toBeGreaterThan(0.4);
  });
});
