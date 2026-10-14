import {
  detectTransposition,
  LEVEL_1_CONFIG,
  LEVEL_1_POOL,
  evaluate,
  pickNote,
  startRound,
  summarizeRound,
} from '@/core/domain/exercise';
import type { Attempt, ExerciseState, RoundConfig } from '@/core/domain/exercise';
import type { NoteEvent } from '@/core/domain/note-event';
import { createSeededRng } from '@/core/domain/rng';

const ctx = { rng: createSeededRng(7), notation: 'latina' as const, help: true };

function on(note: number, at: number, velocity = 90): NoteEvent {
  return { type: 'on', note, velocity, at, source: 'teclado-pc' };
}

function stateWithTarget(target: number, overrides: Partial<ExerciseState> = {}): ExerciseState {
  return { ...startRound(LEVEL_1_CONFIG, createSeededRng(1), 1000), target, ...overrides };
}

describe('pickNote', () => {
  it('nunca repite la nota anterior, con cualquier semilla', () => {
    for (let seed = 0; seed < 200; seed++) {
      const rng = createSeededRng(seed);
      let previous: number | null = null;
      for (let i = 0; i < 50; i++) {
        const note = pickNote(LEVEL_1_POOL, previous, rng);
        expect(LEVEL_1_POOL).toContain(note);
        expect(note).not.toBe(previous);
        previous = note;
      }
    }
  });

  it('con un solo elemento lo devuelve siempre', () => {
    expect(pickNote([60], 60, createSeededRng(1))).toBe(60);
  });

  it('con rng en el límite superior no se sale del conjunto', () => {
    expect(pickNote(LEVEL_1_POOL, null, () => 0.999999)).toBe(67);
  });

  it('es determinista con la misma semilla y falla con un conjunto vacío', () => {
    const a = pickNote(LEVEL_1_POOL, null, createSeededRng(42));
    const b = pickNote(LEVEL_1_POOL, null, createSeededRng(42));
    expect(a).toBe(b);
    expect(() => pickNote([], null, createSeededRng(1))).toThrow(RangeError);
  });
});

describe('evaluate', () => {
  it('ignora note-off y note-on con velocidad 0', () => {
    const state = stateWithTarget(62);
    const off: NoteEvent = { type: 'off', note: 62, velocity: 0, at: 1100, source: 'midi' };
    expect(evaluate(state, off, ctx).outcome.kind).toBe('ignorado');
    expect(evaluate(state, on(62, 1100, 0), ctx).outcome.kind).toBe('ignorado');
    expect(evaluate(state, on(62, 1100, 0), ctx).state).toBe(state);
  });

  it('un acierto avanza, cambia la nota y reinicia el tiempo de reacción', () => {
    const state = stateWithTarget(62);
    const { state: next, outcome } = evaluate(state, on(62, 1450), ctx);
    expect(outcome.kind).toBe('acierto');
    expect(next.completedTargets).toBe(1);
    expect(next.target).not.toBe(62);
    expect(next.shownAt).toBe(1450);
    expect(next.attemptsOnTarget).toBe(0);
  });

  it('un error no avanza, se registra y da la distancia en semitonos', () => {
    const state = stateWithTarget(62);
    const { state: next, outcome } = evaluate(state, on(64, 1300), ctx);
    expect(outcome).toMatchObject({ kind: 'error', semitones: 2 });
    expect(next.target).toBe(62);
    expect(next.completedTargets).toBe(0);
    expect(next.attempts).toHaveLength(1);
    expect(next.attempts[0]).toMatchObject({ isCorrect: false, playedMidi: 64, targetMidi: 62 });
  });

  it('registra todos los campos del intento con tiempos exactos', () => {
    const state = stateWithTarget(62);
    const first = evaluate(state, on(60, 1300, 70), {
      rng: ctx.rng,
      notation: 'americana',
      help: false,
    });
    const second = evaluate(first.state, on(62, 1900, 100), ctx);
    expect(first.state.attempts[0]).toEqual({
      targetMidi: 62,
      playedMidi: 60,
      isCorrect: false,
      shownAt: 1000,
      playedAt: 1300,
      reactionMs: 300,
      attemptIndexForTarget: 1,
      firstTryCorrect: false,
      inputSource: 'teclado-pc',
      noteNameMode: 'americana',
      level: 1,
      velocity: 70,
      helpOn: false,
      targetIndex: 0,
      detectionConfidence: null,
    });
    expect(second.state.attempts[1]).toMatchObject({
      isCorrect: true,
      attemptIndexForTarget: 2,
      firstTryCorrect: false,
      reactionMs: 900,
      noteNameMode: 'latina',
    });
  });

  it('acertar a la primera marca firstTryCorrect', () => {
    const { state } = evaluate(stateWithTarget(62), on(62, 1200), ctx);
    expect(state.attempts[0]).toMatchObject({ firstTryCorrect: true, attemptIndexForTarget: 1 });
  });

  it('varias teclas a la vez cuentan cada una como intento', () => {
    let state = stateWithTarget(62);
    state = evaluate(state, on(60, 1200), ctx).state;
    state = evaluate(state, on(62, 1200), ctx).state;
    expect(state.attempts.map((a) => a.isCorrect)).toEqual([false, true]);
  });

  it('completa la ronda y entrega el resumen; después ignora todo', () => {
    const config: RoundConfig = { ...LEVEL_1_CONFIG, roundSize: 2 };
    let state = startRound(config, createSeededRng(3), 0);
    state = evaluate(state, on(state.target, 500), ctx).state;
    const last = evaluate(state, on(state.target, 1500), ctx);
    expect(last.outcome.kind).toBe('ronda-completa');
    expect(last.state.finished).toBe(true);
    expect(evaluate(last.state, on(60, 1600), ctx).outcome.kind).toBe('ignorado');
  });
});

describe('summarizeRound', () => {
  it('encuentra la nota más lenta y la más fallada', () => {
    const config: RoundConfig = { ...LEVEL_1_CONFIG, roundSize: 3 };
    let state: ExerciseState = { ...startRound(config, createSeededRng(1), 0), target: 62 };
    state = evaluate(state, on(60, 400), ctx).state;
    state = evaluate(state, on(64, 800), ctx).state;
    state = evaluate(state, on(62, 1000), ctx).state; // 62: dos errores, acierto al 3.er intento
    state = { ...state, target: 64, shownAt: 1000 };
    state = evaluate(state, on(64, 1300), ctx).state; // 64: 300 ms a la primera
    state = { ...state, target: 65, shownAt: 1300 };
    const done = evaluate(state, on(65, 3300), ctx); // 65: 2000 ms a la primera
    const { summary } = done.outcome as Extract<typeof done.outcome, { kind: 'ronda-completa' }>;
    expect(summary.totalTargets).toBe(3);
    expect(summary.firstTryCorrect).toBe(2);
    expect(summary.errors).toBe(2);
    expect(summary.accuracy).toBeCloseTo(2 / 3);
    expect(summary.slowest).toEqual({ midi: 65, reactionMs: 2000 });
    expect(summary.mostMissed).toEqual({ midi: 62, errors: 2 });
  });

  it('sin intentos no inventa datos', () => {
    expect(summarizeRound([])).toEqual({
      totalTargets: 0,
      firstTryCorrect: 0,
      errors: 0,
      accuracy: 0,
      slowest: null,
      mostMissed: null,
    });
  });
});

describe('evaluate · entrada por micrófono', () => {
  const heard = (note: number, at: number, confidence: 'alta' | 'media'): NoteEvent => ({
    type: 'on',
    note,
    velocity: 80,
    at,
    source: 'microfono',
    confidence,
  });

  it('una nota distinta de la pedida con confianza media es dudosa: no cuenta como error ni como intento', () => {
    const state = stateWithTarget(62);
    const result = evaluate(state, heard(64, 1300, 'media'), ctx);
    expect(result.outcome).toEqual({ kind: 'dudoso', heardMidi: 64 });
    expect(result.state).toBe(state);
  });

  it('con confianza alta, una nota distinta sí es un error', () => {
    const result = evaluate(stateWithTarget(62), heard(64, 1300, 'alta'), ctx);
    expect(result.outcome.kind).toBe('error');
  });

  it('un acierto cuenta con cualquier confianza y registra cuál fue', () => {
    const result = evaluate(stateWithTarget(62), heard(62, 1400, 'media'), ctx);
    expect(result.outcome.kind).toBe('acierto');
    expect(result.state.attempts[0]).toMatchObject({
      inputSource: 'microfono',
      detectionConfidence: 'media',
    });
  });

  it('la siguiente nota se "muestra" cuando se entrega el evento, no cuando fue el ataque', () => {
    const result = evaluate(stateWithTarget(62), heard(62, 1400, 'alta'), { ...ctx, now: 1550 });
    expect(result.state.shownAt).toBe(1550);
  });
});

describe('detectTransposition', () => {
  const miss = (target: number, played: number): Attempt =>
    ({ targetMidi: target, playedMidi: played, isCorrect: false }) as Attempt;
  const hit = (target: number): Attempt =>
    ({ targetMidi: target, playedMidi: target, isCorrect: true }) as Attempt;

  it('3 errores seguidos con la misma diferencia indican transposición', () => {
    expect(detectTransposition([miss(60, 62), miss(60, 62), miss(64, 66)])).toBe(2);
    expect(detectTransposition([miss(62, 50), miss(60, 48), miss(64, 52)])).toBe(-12);
  });

  it('no avisa con diferencias distintas, con menos de 3, con aciertos o con diferencia 0 o mayor a una octava', () => {
    expect(detectTransposition([miss(60, 62), miss(60, 63), miss(64, 66)])).toBeNull();
    expect(detectTransposition([miss(60, 62), miss(64, 66)])).toBeNull();
    expect(detectTransposition([miss(60, 62), hit(62), miss(64, 66)])).toBeNull();
    expect(detectTransposition([miss(60, 60), miss(60, 60), miss(60, 60)])).toBeNull();
    expect(detectTransposition([miss(40, 60), miss(41, 61), miss(42, 62)])).toBeNull();
  });
});
