import { createSeededRng } from '@/core/domain/rng';
import { runJitteredPipeline, onsOf } from '../support/pipeline';
import { SAMPLE_RATE, concat, pianoNote, silence } from '../support/synth';

const PITCHES = [60, 62, 64, 65, 67];

/** 60 notas (5 alturas × 12) una por segundo, con huecos de audio en parte de ellas. */
function stressSignal(options: { holes: boolean; seed?: number }) {
  const rng = createSeededRng(options.seed ?? 11);
  const parts: Float32Array[] = [silence(1200)];
  const expected: number[] = [];
  for (let i = 0; i < 60; i++) {
    const midi = PITCHES[(i * 2 + Math.floor(i / 5)) % PITCHES.length] as number;
    if (i > 0 && expected[expected.length - 1] === midi) {
      // Dos notas iguales seguidas es un caso aparte (re-ataque); aquí las separamos.
      expected.push(midi === 60 ? 62 : 60);
      parts.push(pianoNote(expected[expected.length - 1] as number, { ms: 600, seed: i }));
    } else {
      expected.push(midi);
      parts.push(pianoNote(midi, { ms: 600, seed: i }));
    }
    const note = parts[parts.length - 1] as Float32Array;
    if (options.holes && rng() < 0.35) {
      // Hueco de audio de 5–30 ms en un punto aleatorio de los primeros 350 ms.
      const start = Math.round(((rng() * 330) / 1000) * SAMPLE_RATE);
      const length = Math.round(((5 + rng() * 25) / 1000) * SAMPLE_RATE);
      note.fill(0, start, start + length);
    }
    parts.push(silence(400));
  }
  return { signal: concat(...parts), expected };
}

/** Saltos de tiempo irregulares: la mayoría 1024, algunos retrasos de 2–4 ventanas. */
const JITTER = [1024, 1024, 1100, 1024, 1300, 1024, 1024, 2300, 1024, 1024, 1500, 1024, 3100, 1024];

function detectionStats(result: ReturnType<typeof runJitteredPipeline>, expected: number[]) {
  const heard = onsOf(result).map((item) => item.event.note);
  // Se cuenta cada nota esperada como detectada si aparece en orden (tolerando inserciones erróneas).
  let cursor = 0;
  let found = 0;
  for (const note of heard) {
    if (note === expected[cursor]) {
      found += 1;
      cursor += 1;
    }
  }
  const falsePositives = heard.length - found;
  return { found, total: expected.length, falsePositives, heard };
}

describe('NoteTracker · estrés (huecos de audio y temporizadores retrasados)', () => {
  it('sin huecos y con tiempos regulares: todas las notas, ningún falso', () => {
    const { signal, expected } = stressSignal({ holes: false });
    const stats = detectionStats(runJitteredPipeline(signal, [1024]), expected);
    expect(stats.found).toBe(stats.total);
    expect(stats.falsePositives).toBe(0);
  });

  it('con temporizadores retrasados: ≥ 95 % de las notas y 0 falsas', () => {
    const { signal, expected } = stressSignal({ holes: false });
    const stats = detectionStats(runJitteredPipeline(signal, JITTER), expected);
    expect(stats.found / stats.total).toBeGreaterThanOrEqual(0.95);
    expect(stats.falsePositives).toBe(0);
  });

  it.each([11, 23, 37, 51])(
    'con huecos de audio de 5–30 ms (semilla %i): ≥ 95 %% de las notas y 0 falsas',
    (seed) => {
      const { signal, expected } = stressSignal({ holes: true, seed });
      const stats = detectionStats(runJitteredPipeline(signal, [1024]), expected);
      expect(stats.found / stats.total).toBeGreaterThanOrEqual(0.95);
      expect(stats.falsePositives).toBe(0);
    },
  );

  it.each([11, 23, 37, 51])(
    'con huecos Y temporizadores retrasados a la vez (semilla %i): ≥ 93 %% y 0 falsas',
    (seed) => {
      const { signal, expected } = stressSignal({ holes: true, seed });
      const stats = detectionStats(runJitteredPipeline(signal, JITTER), expected);
      expect(stats.found / stats.total).toBeGreaterThanOrEqual(0.93);
      expect(stats.falsePositives).toBe(0);
    },
  );
});
