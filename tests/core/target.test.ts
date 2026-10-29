import { firstPosition } from '@/core/domain/instrument';
import { closestTargetNote, sameTarget, single, targetOf } from '@/core/domain/target';

describe('targetOf', () => {
  it('ordena de grave a agudo y quita repetidas', () => {
    expect(targetOf([67, 60, 64, 60]).notes).toEqual([60, 64, 67]);
  });

  it('un objetivo sin extras no trae dedos, mano, acorde ni posiciones', () => {
    expect(single(60)).toEqual({
      notes: [60],
      fingers: [],
      hand: null,
      chord: null,
      positions: [],
    });
  });

  it('necesita al menos una nota válida', () => {
    expect(() => targetOf([])).toThrow(RangeError);
    expect(() => targetOf([128])).toThrow(RangeError);
  });

  it('exige un dedo por nota', () => {
    expect(() => targetOf([60, 64], { fingers: [1] })).toThrow(RangeError);
  });

  it('sameTarget y closestTargetNote miran solo las notas', () => {
    expect(sameTarget(single(60), targetOf([60], { hand: 'derecha' }))).toBe(true);
    expect(sameTarget(single(60), single(62))).toBe(false);
    expect(closestTargetNote(targetOf([60, 64, 67]), 66)).toBe(67);
  });
});

describe('targetOf con posiciones de guitarra', () => {
  it('guarda la posición de la nota', () => {
    const fa = targetOf([65], { positions: [firstPosition(1, 1)] });
    expect(fa.positions).toEqual([{ string: 1, fret: 1, finger: 1 }]);
    expect(fa.notes).toEqual([65]);
  });

  it('la misma nota puede declararse en dos sitios del mástil', () => {
    const enLaTres = targetOf([59], { positions: [{ string: 3, fret: 4, finger: 4 }] });
    const alAire = targetOf([59], { positions: [firstPosition(2, 0)] });
    expect(sameTarget(enLaTres, alAire)).toBe(true);
  });

  it('exige que la posición suene como la nota', () => {
    expect(() => targetOf([65], { positions: [firstPosition(1, 3)] })).toThrow(RangeError);
  });

  it('exige una posición por nota', () => {
    expect(() => targetOf([60, 64], { positions: [firstPosition(2, 1)] })).toThrow(RangeError);
  });
});
