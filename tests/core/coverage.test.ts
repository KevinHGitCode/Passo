import { evaluate, startRound } from '@/core/domain/exercise';
import type { RoundConfig } from '@/core/domain/exercise';
import { findLesson, lessonConfig } from '@/core/domain/lessons';
import { reviewLesson } from '@/core/domain/review';
import { createSeededRng } from '@/core/domain/rng';
import type { Target } from '@/core/domain/target';

/** Juega una ronda entera acertando todo y devuelve la sucesión de objetivos (como texto). */
function sequence(config: RoundConfig, seed: number): string[] {
  const rng = createSeededRng(seed);
  let state = startRound(config, rng, 0);
  const keys: string[] = [state.target.notes.join('-')];
  let at = 0;
  while (!state.finished) {
    at += 100;
    const target: Target = state.target;
    let last = state;
    for (const note of target.notes) {
      last = evaluate(
        last,
        { type: 'on', note, velocity: 90, at, source: 'teclado-pc' },
        { rng, notation: 'latina', help: true, now: at },
      ).state;
    }
    state = last;
    if (!state.finished) keys.push(state.target.notes.join('-'));
  }
  return keys;
}

const lessonOf = (id: string): RoundConfig => {
  const lesson = findLesson(id);
  if (!lesson) throw new Error(`Falta la lección ${id}`);
  return lessonConfig(lesson);
};

const counts = (keys: readonly string[]): Map<string, number> => {
  const map = new Map<string, number>();
  for (const key of keys) map.set(key, (map.get(key) ?? 0) + 1);
  return map;
};

describe('cobertura de notas en las lecciones', () => {
  it('las lecciones piden cobertura; el repaso armado al momento no', () => {
    expect(lessonOf('u1-1').coverage).toBe(true);
    const review = reviewLesson({
      '62': Array.from({ length: 8 }, (_, i) => ({ ok: i > 5, ms: 1000 })),
      '65': Array.from({ length: 8 }, (_, i) => ({ ok: i > 5, ms: 1000 })),
    });
    expect(review).not.toBeNull();
    if (review) expect(lessonConfig(review).coverage).toBe(false);
  });

  it('ninguna nota se queda sin salir y todas salen casi las mismas veces (10 objetivos, 3 notas)', () => {
    const config = lessonOf('u1-1');
    for (let seed = 1; seed <= 150; seed++) {
      const keys = sequence(config, seed);
      expect(keys).toHaveLength(10);
      const byKey = counts(keys);
      expect(byKey.size, `semilla ${seed}`).toBe(3);
      for (const count of byKey.values()) {
        expect(count, `semilla ${seed}`).toBeGreaterThanOrEqual(3);
        expect(count, `semilla ${seed}`).toBeLessThanOrEqual(4);
      }
    }
  });

  it('con 5 notas y 14 objetivos cada nota sale 2 o 3 veces', () => {
    const config = lessonOf('u1-3');
    for (let seed = 1; seed <= 150; seed++) {
      const byKey = counts(sequence(config, seed));
      expect(byKey.size, `semilla ${seed}`).toBe(5);
      for (const count of byKey.values()) {
        expect(count, `semilla ${seed}`).toBeGreaterThanOrEqual(2);
        expect(count, `semilla ${seed}`).toBeLessThanOrEqual(3);
      }
    }
  });

  it('con 9 notas y solo 10 objetivos salen las 9 (sin cobertura se quedarían notas sin tocar)', () => {
    const covered = lessonOf('u5-2');
    expect(covered.pool).toHaveLength(9);
    const plain: RoundConfig = { ...covered, coverage: false };
    let missingPlain = 0;
    for (let seed = 1; seed <= 150; seed++) {
      expect(new Set(sequence(covered, seed)).size, `semilla ${seed}`).toBe(9);
      if (new Set(sequence(plain, seed)).size < 9) missingPlain++;
    }
    // Al azar puro casi siempre falta alguna nota.
    expect(missingPlain).toBeGreaterThan(100);
  });

  it('nunca repite la misma nota seguida, tampoco al empezar un ciclo nuevo', () => {
    const config = lessonOf('u1-1');
    for (let seed = 1; seed <= 150; seed++) {
      const keys = sequence(config, seed);
      keys.slice(1).forEach((key, i) => expect(key, `semilla ${seed} paso ${i}`).not.toBe(keys[i]));
    }
  });

  it('la misma semilla da la misma sucesión', () => {
    const config = lessonOf('u1-3');
    expect(sequence(config, 42)).toEqual(sequence(config, 42));
  });

  it('sin cobertura (práctica libre) la sucesión por semilla no cambia', () => {
    const base: RoundConfig = { ...lessonOf('u1-3'), coverage: false };
    const without: RoundConfig = {
      mode: base.mode,
      level: base.level,
      pool: base.pool,
      roundSize: base.roundSize,
    };
    expect(sequence(without, 7)).toEqual(sequence(base, 7));
  });
});
