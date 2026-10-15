import { LEVELS } from '@/core/domain/curriculum';
import { handShape } from '@/core/domain/hand-shape';
import { single, targetOf } from '@/core/domain/target';

const midis = (target: ReturnType<typeof targetOf>) => {
  const shape = handShape(target);
  return shape?.fingers.map((placement) => placement.midi);
};

describe('handShape', () => {
  it('mano derecha en posición de cinco dedos: Do Re Mi Fa Sol con los dedos 1 a 5', () => {
    const shape = handShape(targetOf([60], { fingers: [1], hand: 'derecha' }));
    expect(shape?.hand).toBe('derecha');
    expect(shape?.fingers.map((f) => [f.finger, f.midi, f.used])).toEqual([
      [1, 60, true],
      [2, 62, false],
      [3, 64, false],
      [4, 65, false],
      [5, 67, false],
    ]);
  });

  it('una tercera Mi–Sol (dedos 3-5): el 3 apoya en Mi y el 5 en Sol; los demás acompañan', () => {
    const shape = handShape(targetOf([64, 67], { fingers: [3, 5], hand: 'derecha' }));
    expect(shape?.fingers.map((f) => [f.finger, f.midi, f.used])).toEqual([
      [1, 60, false],
      [2, 62, false],
      [3, 64, true],
      [4, 65, false],
      [5, 67, true],
    ]);
  });

  it('un acorde de Do mayor (1-3-5) usa los dedos 1, 3 y 5 sobre Do, Mi y Sol', () => {
    const shape = handShape(targetOf([60, 64, 67], { fingers: [1, 3, 5], hand: 'derecha' }));
    expect(shape?.fingers.filter((f) => f.used).map((f) => [f.finger, f.midi])).toEqual([
      [1, 60],
      [3, 64],
      [5, 67],
    ]);
    expect(shape?.fingers.find((f) => f.finger === 2)).toMatchObject({ midi: 62, used: false });
  });

  it('cruza la octava: Si–Re con la mano derecha (1-3) cae en Si4, Re5', () => {
    const shape = handShape(targetOf([71, 74], { fingers: [1, 3], hand: 'derecha' }));
    expect(shape?.fingers.map((f) => f.midi)).toEqual([71, 72, 74, 76, 77]);
    expect(shape?.fingers.filter((f) => f.used).map((f) => f.midi)).toEqual([71, 74]);
  });

  it('mano izquierda: el 5 es el más grave y el 1 el más agudo', () => {
    const shape = handShape(targetOf([48, 52, 55], { fingers: [5, 3, 1], hand: 'izquierda' }));
    expect(shape?.fingers.map((f) => [f.finger, f.midi, f.used])).toEqual([
      [1, 55, true],
      [2, 53, false],
      [3, 52, true],
      [4, 50, false],
      [5, 48, true],
    ]);
  });

  it('una tercera de la mano izquierda 5-3 (Do–Mi): el 4 va entre ellos', () => {
    const shape = handShape(targetOf([48, 52], { fingers: [5, 3], hand: 'izquierda' }));
    expect(shape?.fingers.find((f) => f.finger === 4)).toMatchObject({ midi: 50, used: false });
  });

  it('sin mano o sin dedos no hay forma que dibujar', () => {
    expect(handShape(single(60))).toBeNull();
    expect(handShape(targetOf([60], { hand: 'derecha' }))).toBeNull();
  });

  it('si la nota más grave es una tecla negra no dibuja nada (todavía no hay contenido así)', () => {
    expect(handShape(targetOf([61], { fingers: [1], hand: 'derecha' }))).toBeNull();
  });

  it('para todo el contenido: dedos 1 a 5 sin repetir, teclas blancas y cada nota tocada con su dedo', () => {
    for (const def of LEVELS) {
      for (const target of def.pool) {
        const shape = handShape(target);
        const where = `${def.mode} ${def.level} ${target.notes.join('-')}`;
        expect(shape, where).not.toBeNull();
        if (!shape) continue;
        expect(
          shape.fingers.map((f) => f.finger),
          where,
        ).toEqual([1, 2, 3, 4, 5]);
        expect(new Set(shape.fingers.map((f) => f.midi)).size, where).toBe(5);
        expect(
          shape.fingers.every((f) => ![1, 3, 6, 8, 10].includes(f.midi % 12)),
          where,
        ).toBe(true);
        // Cada nota del objetivo queda justo bajo el dedo que la toca.
        target.notes.forEach((note, i) => {
          const finger = target.fingers[i];
          expect(shape.fingers.find((f) => f.finger === finger)?.midi, where).toBe(note);
        });
        // Una mano de cinco dedos abarca de la nota 5.ª (un 7 de semitonos) a una octava.
        const spread =
          Math.max(...shape.fingers.map((f) => f.midi)) -
          Math.min(...shape.fingers.map((f) => f.midi));
        expect(spread, where).toBeLessThanOrEqual(9);
      }
    }
  });

  it('las notas de la mano derecha ascienden con el dedo y las de la izquierda descienden', () => {
    for (const def of LEVELS) {
      for (const target of def.pool) {
        const placed = midis(target) ?? [];
        const ascending = placed.every((midi, i) => i === 0 || midi > (placed[i - 1] ?? 0));
        const descending = placed.every((midi, i) => i === 0 || midi < (placed[i - 1] ?? 0));
        expect(def.hand === 'derecha' ? ascending : descending, `${def.mode} ${def.level}`).toBe(
          true,
        );
      }
    }
  });
});
