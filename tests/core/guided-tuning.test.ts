import {
  ADVANCE_MS,
  LOW_TO_HIGH,
  advance,
  currentString,
  holdProgress,
  isComplete,
  isFinished,
  jumpTo,
  missingStrings,
  nextString,
  setPaused,
  skip,
  startRun,
} from '@/core/domain/guided-tuning';
import { StringBoard } from '@/core/domain/string-board';

describe('el orden de la guía', () => {
  it('va de la cuerda más grave a la más aguda: 6, 5, 4, 3, 2, 1', () => {
    expect(LOW_TO_HIGH).toEqual([6, 5, 4, 3, 2, 1]);
  });

  it('empieza en la cuerda 6, en la vuelta 1, sin pausa y sin nada hecho', () => {
    const run = startRun();
    expect(currentString(run)).toBe(6);
    expect(nextString(run)).toBe(5);
    expect(run).toMatchObject({ index: 0, lap: 1, paused: false, finals: {} });
    expect(isFinished(run)).toBe(false);
  });
});

describe('avanzar por la guía', () => {
  it('al dar por buena una cuerda apunta sus cents y pasa a la siguiente', () => {
    const run = advance(startRun(), -2);
    expect(currentString(run)).toBe(5);
    expect(run.finals).toEqual({ 6: -2 });
  });

  it('es inmutable: la pasada de antes no cambia', () => {
    const first = startRun();
    advance(first, 1);
    expect(first.index).toBe(0);
    expect(first.finals).toEqual({});
  });

  it('recorrer las seis la termina, y avanzar de más no hace nada', () => {
    let run = startRun();
    for (let n = 0; n < 6; n++) run = advance(run, 0);
    expect(isFinished(run)).toBe(true);
    expect(currentString(run)).toBeNull();
    expect(nextString(run)).toBeNull();
    expect(advance(run, 3)).toBe(run);
    expect(skip(run)).toBe(run);
  });

  it('la última cuerda no tiene siguiente', () => {
    let run = startRun();
    for (let n = 0; n < 5; n++) run = advance(run, 0);
    expect(currentString(run)).toBe(1);
    expect(nextString(run)).toBeNull();
  });

  it('«Siguiente cuerda» pasa sin apuntar cents', () => {
    const run = skip(startRun());
    expect(currentString(run)).toBe(5);
    expect(run.finals).toEqual({});
  });

  it('tocar una clavija salta a esa cuerda sin perder lo hecho; si no es de la pasada, no', () => {
    const run = advance(startRun(), 1);
    const jumped = jumpTo(run, 2);
    expect(jumped && currentString(jumped)).toBe(2);
    expect(jumped?.finals).toEqual({ 6: 1 });
    expect(jumpTo(startRun([3, 1]), 5)).toBeNull();
  });

  it('recuerda cómo terminó la cuerda anterior: afinada, saltada o ninguna', () => {
    expect(startRun().last).toBeNull();
    expect(advance(startRun(), 0).last).toBe('afinada');
    expect(skip(startRun()).last).toBe('saltada');
    expect(jumpTo(advance(startRun(), 0), 3)?.last).toBeNull();
  });

  it('saltar a la cuerda en la que ya estás no cambia nada', () => {
    const run = advance(startRun(), 1);
    expect(jumpTo(run, 5)).toBe(run);
  });

  it('pausar y seguir cambia solo la pausa', () => {
    const run = startRun();
    const paused = setPaused(run, true);
    expect(paused.paused).toBe(true);
    expect(setPaused(paused, true)).toBe(paused);
    expect(setPaused(paused, false)).toMatchObject({ paused: false, index: 0 });
  });
});

describe('cuándo se da una cuerda por buena', () => {
  it('solo cuenta «afinada» y desde que empezó a estarlo', () => {
    expect(holdProgress('sin-sonido', null, 0)).toEqual({ heldSince: null, advance: false });
    expect(holdProgress('baja', 100, 5000)).toEqual({ heldSince: null, advance: false });
    expect(holdProgress('afinando', 100, 5000)).toEqual({ heldSince: null, advance: false });
    expect(holdProgress('afinada', null, 1000)).toEqual({ heldSince: 1000, advance: false });
  });

  it('tras 1,5 s seguidos afinada, toca avanzar', () => {
    expect(ADVANCE_MS).toBe(1500);
    expect(holdProgress('afinada', 1000, 1000 + ADVANCE_MS - 1).advance).toBe(false);
    expect(holdProgress('afinada', 1000, 1000 + ADVANCE_MS)).toEqual({
      heldSince: 1000,
      advance: true,
    });
  });
});

describe('qué falta y cuándo está completa', () => {
  it('las que faltan van de la grave a la aguda y las afinadas no cuentan', () => {
    const board = StringBoard.empty().tuned(6, 0).tuned(3, 0).tuned(1, 0);
    expect(missingStrings(board.marks(10))).toEqual([5, 4, 2]);
  });

  it('una cuerda «revisar» también falta', () => {
    const board = StringBoard.empty().tuned(6, 0).drifted(6);
    expect(missingStrings(board.marks(10))).toContain(6);
  });

  it('está completa cuando la pasada terminó y las seis están afinadas', () => {
    let run = startRun();
    for (let n = 0; n < 6; n++) run = advance(run, 0);
    let all = StringBoard.empty();
    for (const string of LOW_TO_HIGH) all = all.tuned(string, 0);
    expect(isComplete(run, all.marks(10))).toBe(true);
    expect(isComplete(run, StringBoard.empty().tuned(6, 0).marks(10))).toBe(false);
    expect(isComplete(startRun(), all.marks(10))).toBe(false);
  });
});
