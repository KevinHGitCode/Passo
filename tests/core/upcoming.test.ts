import {
  LEVEL_1_CONFIG,
  UPCOMING_COUNT,
  evaluate,
  pickTarget,
  startRound,
} from '@/core/domain/exercise';
import type { ExerciseState, RoundConfig } from '@/core/domain/exercise';
import type { NoteEvent } from '@/core/domain/note-event';
import { createSeededRng } from '@/core/domain/rng';
import { roundConfigFor } from '@/core/domain/exercise';

const config = (roundSize: number, base: RoundConfig = LEVEL_1_CONFIG): RoundConfig => ({
  ...base,
  roundSize,
});

function press(state: ExerciseState, note: number, at: number, rng = createSeededRng(99)) {
  const event: NoteEvent = { type: 'on', note, velocity: 90, at, source: 'teclado-pc' };
  return evaluate(state, event, { rng, notation: 'latina', help: true }).state;
}

/** Toca el objetivo actual (todas sus notas). */
function solve(state: ExerciseState, at: number, rng = createSeededRng(99)): ExerciseState {
  let current = state;
  for (const note of state.target.notes) current = press(current, note, at, rng);
  return current;
}

describe('cola de objetivos siguientes', () => {
  it('al empezar ya hay dos elegidos, distintos de su anterior', () => {
    const state = startRound(config(20), createSeededRng(5), 0);
    expect(UPCOMING_COUNT).toBe(2);
    expect(state.upcoming).toHaveLength(2);
    expect(state.upcoming[0]).not.toBe(state.target);
    expect(state.upcoming[1]).not.toBe(state.upcoming[0]);
  });

  it('solo se eligen los que quedan por jugar: una ronda de 1 no tiene siguientes y una de 2 tiene uno', () => {
    expect(startRound(config(1), createSeededRng(5), 0).upcoming).toHaveLength(0);
    expect(startRound(config(2), createSeededRng(5), 0).upcoming).toHaveLength(1);
    expect(startRound(config(3), createSeededRng(5), 0).upcoming).toHaveLength(2);
  });

  it('acertar pasa el primero de la cola a objetivo y repone la cola', () => {
    const start = startRound(config(20), createSeededRng(5), 0);
    const [first, second] = start.upcoming;
    const next = solve(start, 500);
    expect(next.target).toBe(first);
    expect(next.upcoming[0]).toBe(second);
    expect(next.upcoming).toHaveLength(2);
  });

  it('al final de la ronda la cola se acorta: el último objetivo no tiene siguientes', () => {
    let state = startRound(config(4), createSeededRng(5), 0);
    const lengths = [state.upcoming.length];
    for (let i = 0; i < 3; i++) {
      state = solve(state, 500 + i);
      lengths.push(state.upcoming.length);
    }
    expect(lengths).toEqual([2, 2, 1, 0]);
  });

  it('la sucesión de objetivos de una semilla es la misma que elegir uno a uno (no cambia)', () => {
    for (const seed of [1, 7, 42, 123]) {
      const rng = createSeededRng(seed);
      const lazy = [];
      let previous = null;
      for (let i = 0; i < 20; i++) {
        previous = pickTarget(LEVEL_1_CONFIG.pool, previous, rng);
        lazy.push(previous.notes[0]);
      }

      const sessionRng = createSeededRng(seed);
      let state = startRound(config(20), sessionRng, 0);
      const shown = [state.target.notes[0]];
      for (let i = 1; i < 20; i++) {
        state = solve(state, 100 * i, sessionRng);
        shown.push(state.target.notes[0]);
      }
      expect(shown, `semilla ${seed}`).toEqual(lazy);
    }
  });

  it('funciona igual con terceras y acordes, y los objetivos de la cola traen manos y dedos', () => {
    for (const [mode, level] of [
      ['terceras', 2],
      ['acordes', 4],
    ] as const) {
      let state = startRound(roundConfigFor(mode, level) as RoundConfig, createSeededRng(3), 0);
      expect(
        state.upcoming.every((target) => target.hand !== null && target.fingers.length > 0),
      ).toBe(true);
      const expected = [state.upcoming[0]];
      state = solve(state, 500);
      expect(state.target).toBe(expected[0]);
    }
  });

  it('si la cola está vacía (estado armado a mano), el siguiente objetivo se elige igual', () => {
    const start = { ...startRound(config(20), createSeededRng(5), 0), upcoming: [] };
    const next = solve(start, 500);
    expect(next.completedTargets).toBe(1);
    expect(next.target).not.toBe(start.target);
    expect(next.upcoming).toHaveLength(2);
  });

  it('un error no toca la cola', () => {
    const start = startRound(config(20), createSeededRng(5), 0);
    const wrong = start.target.notes[0] === 60 ? 62 : 60;
    const after = press(start, wrong, 300);
    expect(after.upcoming).toBe(start.upcoming);
    expect(after.target).toBe(start.target);
  });
});
