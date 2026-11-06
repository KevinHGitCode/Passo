import { REFERENCE_GUARD_MS, REFERENCE_TONE_MS, referenceTone } from '@/core/domain/reference-tone';

describe('referenceTone', () => {
  it('lleva la frecuencia de la cuerda y dura 2,5 s con un ataque corto y un final suave', () => {
    const tone = referenceTone(6, 82.41);
    expect(tone.frequency).toBe(82.41);
    expect(tone.durationMs).toBe(REFERENCE_TONE_MS);
    expect(REFERENCE_TONE_MS).toBe(2500);
    expect(tone.attackMs).toBeLessThanOrEqual(10);
    expect(tone.releaseMs).toBe(150);
  });

  it('las cuerdas 6 y 5 pesan más en los armónicos que en la fundamental (altavoces de portátil)', () => {
    for (const string of [5, 6] as const) {
      const { harmonics } = referenceTone(string, 100);
      expect(harmonics).toEqual([0.6, 1, 0.8, 0.5, 0.35, 0.25]);
      expect(harmonics[0]).toBeLessThan(harmonics[1] as number);
    }
  });

  it('las cuerdas 4 a 1 mandan con la fundamental y llevan cuatro armónicos', () => {
    for (const string of [1, 2, 3, 4] as const) {
      const { harmonics } = referenceTone(string, 200);
      expect(harmonics).toEqual([1, 0.5, 0.3, 0.2]);
      expect(Math.max(...harmonics)).toBe(harmonics[0]);
    }
  });

  it('tras el tono la medición espera medio segundo', () => {
    expect(REFERENCE_GUARD_MS).toBe(500);
  });
});
