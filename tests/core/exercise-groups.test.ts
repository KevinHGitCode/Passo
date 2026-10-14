import {
  detectTransposition,
  evaluate,
  LEVEL_1_CONFIG,
  startRound,
  WRONG_GROUP_GAP_MS,
  WRONG_GROUP_MAX_MS,
} from '@/core/domain/exercise';
import type { ExerciseState, Outcome, RoundConfig } from '@/core/domain/exercise';
import type { NoteConfidence, NoteEvent } from '@/core/domain/note-event';
import { createSeededRng } from '@/core/domain/rng';
import { closestTargetNote, sameTarget, single, targetOf } from '@/core/domain/target';

const ctx = { rng: createSeededRng(7), notation: 'latina' as const, help: true };

const on = (note: number, at: number): NoteEvent => ({
  type: 'on',
  note,
  velocity: 90,
  at,
  source: 'teclado-pc',
});
const off = (note: number, at: number): NoteEvent => ({
  type: 'off',
  note,
  velocity: 0,
  at,
  source: 'teclado-pc',
});
const heard = (note: number, at: number, confidence: NoteConfidence = 'alta'): NoteEvent => ({
  type: 'on',
  note,
  velocity: 80,
  at,
  source: 'microfono',
  confidence,
});

/** Estado con un objetivo de varias notas; el resto de objetivos de la ronda es el nivel 1. */
function groupState(notes: number[], config: RoundConfig = LEVEL_1_CONFIG): ExerciseState {
  return { ...startRound(config, createSeededRng(1), 1000), target: targetOf(notes) };
}

/** Aplica eventos en orden y devuelve el último resultado. */
function play(state: ExerciseState, events: NoteEvent[]) {
  let current = state;
  let outcome: Outcome = { kind: 'ignorado' };
  for (const event of events) ({ state: current, outcome } = evaluate(current, event, ctx));
  return { state: current, outcome };
}

describe('Target', () => {
  it('ordena de grave a agudo, quita repetidas y exige al menos una nota válida', () => {
    expect(targetOf([67, 60, 64, 60]).notes).toEqual([60, 64, 67]);
    expect(() => targetOf([])).toThrow(RangeError);
    expect(() => targetOf([60, 200])).toThrow(RangeError);
    expect(single(62).notes).toEqual([62]);
  });

  it('se compara por notas', () => {
    expect(sameTarget(targetOf([60, 64]), targetOf([64, 60]))).toBe(true);
    expect(sameTarget(targetOf([60, 64]), targetOf([60, 65]))).toBe(false);
    expect(sameTarget(single(60), targetOf([60, 64]))).toBe(false);
  });

  it('la nota más cercana: en un empate, la más grave', () => {
    const third = targetOf([60, 64]);
    expect(closestTargetNote(third, 61)).toBe(60);
    expect(closestTargetNote(third, 62)).toBe(60);
    expect(closestTargetNote(third, 63)).toBe(64);
    expect(closestTargetNote(third, 90)).toBe(64);
  });
});

describe('evaluate · objetivo de varias notas', () => {
  it('una nota del conjunto es un avance, no un acierto ni un error', () => {
    const { state, outcome } = play(groupState([60, 64]), [on(60, 1200)]);
    expect(outcome).toEqual({ kind: 'parcial', held: [60], missing: [64], at: 1200 });
    expect(state.held).toEqual([60]);
    expect(state.attempts).toHaveLength(0);
    expect(state.completedTargets).toBe(0);
  });

  it('con todas las notas pulsadas a la vez acierta, en cualquier orden', () => {
    for (const order of [
      [60, 64],
      [64, 60],
    ]) {
      const { state, outcome } = play(
        groupState([60, 64]),
        order.map((note, i) => on(note, 1200 + i * 30)),
      );
      expect(outcome.kind).toBe('acierto');
      expect(state.completedTargets).toBe(1);
      expect(state.held).toEqual([]);
      expect(state.attempts).toHaveLength(1);
      expect(state.attempts[0]).toMatchObject({
        isCorrect: true,
        firstTryCorrect: true,
        targetNotes: [60, 64],
        playedMidi: order[1],
        reactionMs: 230,
      });
    }
  });

  it('un acorde de tres notas', () => {
    const { outcome } = play(groupState([60, 64, 67]), [on(60, 1100), on(64, 1120), on(67, 1140)]);
    expect(outcome.kind).toBe('acierto');
  });

  it('el avance muestra qué falta', () => {
    const { outcome } = play(groupState([60, 64, 67]), [on(60, 1100), on(67, 1120)]);
    expect(outcome).toMatchObject({ kind: 'parcial', held: [60, 67], missing: [64] });
  });

  it('soltar una nota la quita: tocar las notas una tras otra, soltando, no es un acorde', () => {
    const { state, outcome } = play(groupState([60, 64]), [
      on(60, 1100),
      off(60, 1200),
      on(64, 1300),
    ]);
    expect(outcome).toMatchObject({ kind: 'parcial', held: [64], missing: [60] });
    expect(state.completedTargets).toBe(0);
  });

  it('una tecla repetida mientras sigue pulsada no cambia nada', () => {
    const first = play(groupState([60, 64]), [on(60, 1100)]);
    const again = evaluate(first.state, on(60, 1150), ctx);
    expect(again.outcome.kind).toBe('ignorado');
    expect(again.state).toBe(first.state);
  });

  it('soltar una tecla que no cuenta no cambia el estado', () => {
    const state = groupState([60, 64]);
    expect(evaluate(state, off(72, 1100), ctx).state).toBe(state);
  });

  it('una nota de más es un error al instante; no avanza pero conserva lo ya pulsado', () => {
    const { state, outcome } = play(groupState([60, 64]), [on(60, 1100), on(62, 1200)]);
    expect(outcome).toMatchObject({ kind: 'error', semitones: 2 });
    expect(state.held).toEqual([60]);
    expect(state.completedTargets).toBe(0);
    expect(state.attempts).toHaveLength(1);
    expect(state.attempts[0]).toMatchObject({
      isCorrect: false,
      playedMidi: 62,
      targetMidi: 60,
      targetNotes: [60, 64],
    });
  });

  it('tras un error se puede completar el acorde, pero ya no cuenta a la primera', () => {
    const { state, outcome } = play(groupState([60, 64]), [
      on(60, 1100),
      on(62, 1200),
      on(64, 1900),
    ]);
    expect(outcome.kind).toBe('acierto');
    expect(state.attempts.map((a) => a.isCorrect)).toEqual([false, true]);
    expect(state.attempts[1]).toMatchObject({ attemptIndexForTarget: 2, firstTryCorrect: false });
  });

  it('un acorde mal armado cuenta un solo error, no uno por nota', () => {
    const wrong = [on(61, 1100), on(62, 1150), on(66, 1200)];
    const { state } = play(groupState([60, 64]), wrong);
    expect(state.attempts.filter((a) => !a.isCorrect)).toHaveLength(1);
  });

  it('un grupo de errores se cierra por pausa entre notas o por duración máxima', () => {
    const gap = WRONG_GROUP_GAP_MS + 1;
    const afterGap = play(groupState([60, 64]), [on(61, 1100), on(62, 1100 + gap)]);
    expect(afterGap.state.attempts).toHaveLength(2);

    // Notas separadas justo por debajo de la pausa, pero que pasan de la duración máxima.
    const step = WRONG_GROUP_GAP_MS;
    const at = (i: number) => 1100 + i * step;
    expect(at(3) - at(0)).toBeGreaterThan(WRONG_GROUP_MAX_MS);
    const long = play(
      groupState([60, 64]),
      [61, 62, 66, 68, 69].map((note, i) => on(note, at(i))),
    );
    expect(long.state.attempts.filter((a) => !a.isCorrect)).toHaveLength(2);
  });

  it('el aviso de transposición ignora los errores de acordes', () => {
    const { state } = play(groupState([60, 64]), [
      on(62, 1000),
      on(62, 1000 + 400),
      on(62, 1000 + 800),
      on(62, 1000 + 1200),
    ]);
    expect(state.attempts.filter((a) => !a.isCorrect)).toHaveLength(4);
    expect(detectTransposition(state.attempts)).toBeNull();
  });

  it('el último objetivo de la ronda entrega el resumen con la nota más grave del conjunto', () => {
    const config: RoundConfig = { ...LEVEL_1_CONFIG, roundSize: 1 };
    const { outcome } = play(groupState([60, 64], config), [
      on(62, 1100),
      on(60, 1700),
      on(64, 1750),
    ]);
    expect(outcome.kind).toBe('ronda-completa');
    if (outcome.kind !== 'ronda-completa') return;
    expect(outcome.summary.mostMissed).toEqual({ midi: 60, errors: 1 });
    expect(outcome.summary.slowest?.midi).toBe(60);
  });

  it('el nuevo objetivo empieza sin notas pulsadas', () => {
    const { state } = play(groupState([60, 64]), [on(60, 1100), on(64, 1120)]);
    expect(state.held).toEqual([]);
    expect(state.wrongGroup).toBeNull();
  });
});

describe('evaluate · objetivo de varias notas por micrófono', () => {
  it('una nota del conjunto avanza, aunque la oiga con poca seguridad', () => {
    const { outcome } = play(groupState([60, 64]), [heard(60, 1200, 'media')]);
    expect(outcome).toMatchObject({ kind: 'parcial', missing: [64] });
  });

  it('una nota ajena nunca es error: un micrófono de una sola voz no puede juzgar un acorde', () => {
    for (const confidence of ['alta', 'media'] as const) {
      const state = groupState([60, 64]);
      const result = evaluate(state, heard(62, 1200, confidence), ctx);
      expect(result.outcome).toMatchObject({
        kind: 'dudoso',
        reason: 'poca-confianza',
        targetMidi: 60,
      });
      expect(result.state).toBe(state);
    }
  });

  it('con un objetivo de una nota nada cambia: nota ajena con confianza alta sí es error', () => {
    expect(evaluate(groupState([62]), heard(64, 1200), ctx).outcome.kind).toBe('error');
  });
});
