import { REVIEW_AFTER_MS, StringBoard, sameMarks } from '@/core/domain/string-board';
import { STANDARD_TUNING, TUNINGS, tuningNote } from '@/core/domain/tuning';

describe('StringBoard', () => {
  it('empieza con las seis cuerdas sin afinar', () => {
    const marks = StringBoard.empty().marks(0);
    expect(Object.values(marks)).toEqual(Array(6).fill('sin-afinar'));
  });

  it('una cuerda afinada se recuerda y las demás no cambian', () => {
    const board = StringBoard.empty().tuned(6, 1000);
    expect(board.markOf(6, 2000)).toBe('afinada');
    expect(board.markOf(5, 2000)).toBe('sin-afinar');
  });

  it('es inmutable: afinar devuelve otro tablero', () => {
    const empty = StringBoard.empty();
    const tuned = empty.tuned(3, 0);
    expect(empty.markOf(3, 0)).toBe('sin-afinar');
    expect(tuned.markOf(3, 0)).toBe('afinada');
  });

  it('a los 5 minutos una cuerda afinada pasa a «revisar»', () => {
    const board = StringBoard.empty().tuned(4, 1000);
    expect(board.markOf(4, 1000 + REVIEW_AFTER_MS - 1)).toBe('afinada');
    expect(board.markOf(4, 1000 + REVIEW_AFTER_MS)).toBe('revisar');
  });

  it('oírla desafinarse la deja en «revisar»; volver a afinarla, en «afinada»', () => {
    const drifted = StringBoard.empty().tuned(2, 0).drifted(2);
    expect(drifted.markOf(2, 10)).toBe('revisar');
    expect(drifted.tuned(2, 20).markOf(2, 30)).toBe('afinada');
  });

  it('desafinarse una cuerda que nunca se afinó no la marca', () => {
    const board = StringBoard.empty();
    expect(board.drifted(1)).toBe(board);
    expect(board.drifted(1).markOf(1, 0)).toBe('sin-afinar');
  });

  it('la segunda vuelta pasa a «revisar» todas las afinadas y deja las demás', () => {
    const board = StringBoard.empty().tuned(6, 0).tuned(5, 0).allForReview();
    expect(board.markOf(6, 1)).toBe('revisar');
    expect(board.markOf(5, 1)).toBe('revisar');
    expect(board.markOf(4, 1)).toBe('sin-afinar');
  });

  it('sameMarks compara las seis marcas', () => {
    const a = StringBoard.empty().marks(0);
    expect(sameMarks(a, StringBoard.empty().marks(0))).toBe(true);
    expect(sameMarks(a, StringBoard.empty().tuned(1, 0).marks(0))).toBe(false);
  });
});

describe('afinaciones', () => {
  it('la estándar son las notas de las lecciones (Mi4 Si3 Sol3 Re3 La2 Mi2)', () => {
    expect(
      [1, 2, 3, 4, 5, 6].map((s) => tuningNote(STANDARD_TUNING, s as 1 | 2 | 3 | 4 | 5 | 6)),
    ).toEqual([64, 59, 55, 50, 45, 40]);
  });

  it('la lista trae la estándar primero', () => {
    expect(TUNINGS[0]).toBe(STANDARD_TUNING);
  });
});
