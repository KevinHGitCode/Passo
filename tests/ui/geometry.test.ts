import { BLACK_WIDTH, WHITE_WIDTH, layoutKeys, windowAround } from '@/ui/keyboard/geometry';

describe('layoutKeys', () => {
  it('Do3–Do6 tiene 37 teclas: 22 blancas y 15 negras', () => {
    const layout = layoutKeys(48, 84);
    expect(layout.keys).toHaveLength(37);
    expect(layout.whiteCount).toBe(22);
    expect(layout.keys.filter((key) => key.isBlack)).toHaveLength(15);
    expect(layout.width).toBe(22 * WHITE_WIDTH);
  });

  it('las blancas son contiguas y no se solapan', () => {
    const whites = layoutKeys(60, 72).keys.filter((key) => !key.isBlack);
    whites.forEach((key, index) => expect(key.x).toBe(index * WHITE_WIDTH));
  });

  it('cada negra queda entre sus dos blancas vecinas', () => {
    const { keys } = layoutKeys(60, 72);
    const byMidi = new Map(keys.map((key) => [key.midi, key]));
    for (const midi of [61, 63, 66, 68, 70]) {
      const black = byMidi.get(midi);
      const left = byMidi.get(midi - 1);
      const right = byMidi.get(midi + 1);
      if (!black || !left || !right) throw new Error(`Falta la tecla ${midi}`);
      const center = black.x + BLACK_WIDTH / 2;
      expect(center).toBeGreaterThan(left.x);
      expect(center).toBeLessThan(right.x + right.width);
      expect(black.x).toBeGreaterThan(left.x);
      expect(black.x + black.width).toBeLessThan(right.x + right.width);
    }
  });

  it('las negras son más cortas y estrechas que las blancas', () => {
    const { keys } = layoutKeys(60, 72);
    const black = keys.find((key) => key.isBlack);
    const white = keys.find((key) => !key.isBlack);
    expect(black && white && black.width < white.width && black.height < white.height).toBe(true);
  });

  it('exige empezar y terminar en tecla blanca y un rango ordenado', () => {
    expect(() => layoutKeys(61, 72)).toThrow(RangeError);
    expect(() => layoutKeys(60, 73)).toThrow(RangeError);
    expect(() => layoutKeys(72, 60)).toThrow(RangeError);
  });
});

describe('windowAround', () => {
  it('toma la octava de la nota enfocada', () => {
    expect(windowAround(64, 48, 84, 24)).toEqual({ from: 60, to: 84 });
    expect(windowAround(64, 48, 84, 14)).toEqual({ from: 60, to: 74 });
  });

  it('no se sale del rango por el final ni por el principio', () => {
    expect(windowAround(84, 48, 84, 24)).toEqual({ from: 60, to: 84 });
    expect(windowAround(48, 48, 84, 24)).toEqual({ from: 48, to: 72 });
  });
});
