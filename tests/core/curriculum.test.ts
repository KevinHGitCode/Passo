import {
  EXERCISE_MODES,
  LEVELS,
  findLevel,
  isExerciseMode,
  levelsOf,
} from '@/core/domain/curriculum';
import {
  DEFAULT_ROUND_SIZE,
  GROUP_ROUND_SIZE,
  LEVEL_1_CONFIG,
  roundConfigFor,
} from '@/core/domain/exercise';
import { isBlackKey } from '@/core/domain/note';
import type { Target } from '@/core/domain/target';

const notesOf = (pool: readonly Target[]) => pool.map((target) => [...target.notes]);
const fingersOf = (pool: readonly Target[]) => pool.map((target) => [...target.fingers]);
const level = (mode: Parameters<typeof findLevel>[0], n: number) => {
  const def = findLevel(mode, n);
  if (!def) throw new Error(`Falta ${mode} ${n}`);
  return def;
};

describe('contenido de los ejercicios', () => {
  it('hay un nivel de notas, tres de terceras y cinco de acordes, sin repetir', () => {
    expect(levelsOf('notas').map((def) => def.level)).toEqual([1]);
    expect(levelsOf('terceras').map((def) => def.level)).toEqual([1, 2, 3]);
    expect(levelsOf('acordes').map((def) => def.level)).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(LEVELS.map((def) => `${def.mode}-${def.level}`)).size).toBe(LEVELS.length);
    expect(findLevel('terceras', 9)).toBeNull();
  });

  it('reconoce los modos válidos', () => {
    for (const mode of EXERCISE_MODES) expect(isExerciseMode(mode)).toBe(true);
    expect(isExerciseMode('ritmo')).toBe(false);
    expect(isExerciseMode(3)).toBe(false);
  });

  it('todo objetivo es válido: notas ordenadas, solo teclas blancas, dentro del teclado y con mano y dedos', () => {
    for (const def of LEVELS) {
      expect(def.pool.length, `${def.mode} ${def.level}`).toBeGreaterThan(0);
      for (const target of def.pool) {
        const where = `${def.mode} ${def.level} ${target.notes.join('-')}`;
        expect([...target.notes], where).toEqual([...target.notes].sort((a, b) => a - b));
        expect(
          target.notes.every((note) => !isBlackKey(note)),
          where,
        ).toBe(true);
        expect(target.notes[0], where).toBeGreaterThanOrEqual(48);
        expect(target.notes[target.notes.length - 1] ?? 0, where).toBeLessThanOrEqual(84);
        expect(target.hand, where).toBe(def.hand);
        expect(target.fingers, where).toHaveLength(target.notes.length);
        // Cabe en una mano: de pulgar a meñique no pasa de una octava.
        expect(
          (target.notes[target.notes.length - 1] ?? 0) - target.notes[0],
          where,
        ).toBeLessThanOrEqual(12);
      }
    }
  });

  it('modo notas: posición de cinco dedos, un dedo por tecla', () => {
    expect(notesOf(level('notas', 1).pool)).toEqual([[60], [62], [64], [65], [67]]);
    expect(fingersOf(level('notas', 1).pool)).toEqual([[1], [2], [3], [4], [5]]);
    expect(LEVEL_1_CONFIG.pool).toBe(level('notas', 1).pool);
  });

  it('terceras: nivel 1 con tres, nivel 2 con las siete, nivel 3 espejo en la mano izquierda', () => {
    expect(notesOf(level('terceras', 1).pool)).toEqual([
      [60, 64],
      [62, 65],
      [64, 67],
    ]);
    expect(notesOf(level('terceras', 2).pool)).toEqual([
      [60, 64],
      [62, 65],
      [64, 67],
      [65, 69],
      [67, 71],
      [69, 72],
      [71, 74],
    ]);
    expect(notesOf(level('terceras', 3).pool)).toEqual(
      notesOf(level('terceras', 2).pool).map((notes) => notes.map((note) => note - 12)),
    );
  });

  it('terceras: dedos de la mano derecha 1-3, 2-4, 3-5… y espejo en la izquierda 5-3, 4-2, 3-1…', () => {
    expect(fingersOf(level('terceras', 2).pool)).toEqual([
      [1, 3],
      [2, 4],
      [3, 5],
      [1, 3],
      [2, 4],
      [3, 5],
      [1, 3],
    ]);
    expect(fingersOf(level('terceras', 3).pool)).toEqual([
      [5, 3],
      [4, 2],
      [3, 1],
      [5, 3],
      [4, 2],
      [3, 1],
      [5, 3],
    ]);
  });

  it('terceras: todas son de tres o cuatro semitonos (menor o mayor)', () => {
    for (const target of level('terceras', 2).pool) {
      const gap = (target.notes[1] ?? 0) - target.notes[0];
      expect([3, 4]).toContain(gap);
    }
  });

  it('acordes: cada nivel suma acordes al anterior y la mano izquierda usa los seis', () => {
    const names = (n: number) => level('acordes', n).pool.map((target) => target.notes.join('-'));
    expect(names(1)).toEqual(['60-64-67', '67-71-74']);
    expect(names(2)).toEqual(['60-64-67', '65-69-72', '67-71-74']);
    expect(names(3)).toEqual(['60-64-67', '65-69-72', '67-71-74', '69-72-76']);
    expect(names(4)).toEqual([
      '60-64-67',
      '62-65-69',
      '64-67-71',
      '65-69-72',
      '67-71-74',
      '69-72-76',
    ]);
    expect(names(5)).toEqual(
      names(4).map((chord) =>
        chord
          .split('-')
          .map((n) => Number(n) - 12)
          .join('-'),
      ),
    );
  });

  it('acordes: tríadas mayores o menores en estado fundamental, con su nombre y dedos 1-3-5 / 5-3-1', () => {
    for (const def of levelsOf('acordes')) {
      for (const target of def.pool) {
        const root = target.notes[0];
        const third = target.notes[1] ?? 0;
        const fifth = target.notes[2] ?? 0;
        expect(target.chord?.root).toBe(root);
        expect(third - root).toBe(target.chord?.quality === 'mayor' ? 4 : 3);
        expect(fifth - root).toBe(7);
        expect([...target.fingers]).toEqual(def.hand === 'derecha' ? [1, 3, 5] : [5, 3, 1]);
      }
    }
    const qualities = level('acordes', 4).pool.map((target) => target.chord?.quality);
    expect(qualities).toEqual(['mayor', 'menor', 'menor', 'mayor', 'mayor', 'menor']);
  });

  it('la configuración de ronda: 20 notas o 12 grupos; un nivel inexistente da null', () => {
    expect(roundConfigFor('notas', 1)).toMatchObject({
      mode: 'notas',
      roundSize: DEFAULT_ROUND_SIZE,
    });
    expect(roundConfigFor('terceras', 2)).toMatchObject({
      mode: 'terceras',
      level: 2,
      roundSize: GROUP_ROUND_SIZE,
    });
    expect(roundConfigFor('acordes', 5)?.pool).toBe(level('acordes', 5).pool);
    expect(roundConfigFor('acordes', 6)).toBeNull();
    expect(roundConfigFor('notas', 2)).toBeNull();
  });
});
