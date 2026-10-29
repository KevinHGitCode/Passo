import {
  DEFAULT_INSTRUMENT,
  GUITAR_OPEN,
  INSTRUMENTS,
  firstPosition,
  isInstrument,
  midiAt,
  noteLabel,
  openStringName,
} from '@/core/domain/instrument';

describe('instrumentos', () => {
  it('son piano y guitarra, y el piano es el de siempre', () => {
    expect(INSTRUMENTS).toEqual(['piano', 'guitarra']);
    expect(DEFAULT_INSTRUMENT).toBe('piano');
  });

  it.each([
    ['piano', true],
    ['guitarra', true],
    ['bajo', false],
    ['', false],
    [null, false],
    [undefined, false],
    [3, false],
  ])('isInstrument(%j) → %s', (value, expected) => {
    expect(isInstrument(value)).toBe(expected);
  });
});

describe('guitarra: afinación estándar', () => {
  it('las cuerdas al aire suenan Mi4 Si3 Sol3 Re3 La2 Mi2', () => {
    expect(GUITAR_OPEN).toEqual([64, 59, 55, 50, 45, 40]);
    expect([1, 2, 3, 4, 5, 6].map((string) => midiAt(string, 0))).toEqual([64, 59, 55, 50, 45, 40]);
  });

  it('cada traste sube un semitono', () => {
    expect(midiAt(1, 1)).toBe(65); // Fa4
    expect(midiAt(1, 3)).toBe(67); // Sol4
    expect(midiAt(6, 3)).toBe(43); // Sol2
    expect(midiAt(5, 3)).toBe(48); // Do3
  });

  it('el traste 5 de una cuerda es la cuerda de abajo al aire (menos la 3 y la 2)', () => {
    expect(midiAt(6, 5)).toBe(midiAt(5, 0));
    expect(midiAt(5, 5)).toBe(midiAt(4, 0));
    expect(midiAt(4, 5)).toBe(midiAt(3, 0));
    expect(midiAt(3, 4)).toBe(midiAt(2, 0));
    expect(midiAt(2, 5)).toBe(midiAt(1, 0));
  });

  it('rechaza cuerdas y trastes imposibles', () => {
    expect(() => midiAt(0, 0)).toThrow(RangeError);
    expect(() => midiAt(7, 0)).toThrow(RangeError);
    expect(() => midiAt(1.5, 0)).toThrow(RangeError);
    expect(() => midiAt(1, -1)).toThrow(RangeError);
    expect(() => midiAt(1, 20)).toThrow(RangeError);
    expect(() => midiAt(1, 2.5)).toThrow(RangeError);
  });

  it('nombra las cuerdas al aire', () => {
    expect(
      [1, 2, 3, 4, 5, 6].map((s) => openStringName(s as 1 | 2 | 3 | 4 | 5 | 6, 'latina')),
    ).toEqual(['Mi', 'Si', 'Sol', 'Re', 'La', 'Mi']);
    expect(openStringName(2, 'americana')).toBe('B');
  });
});

describe('firstPosition', () => {
  it('el dedo es el traste (índice en el 1) y ninguno al aire', () => {
    expect(firstPosition(1, 0)).toEqual({ string: 1, fret: 0, finger: null });
    expect(firstPosition(1, 1)).toEqual({ string: 1, fret: 1, finger: 1 });
    expect(firstPosition(4, 2)).toEqual({ string: 4, fret: 2, finger: 2 });
    expect(firstPosition(6, 3)).toEqual({ string: 6, fret: 3, finger: 3 });
    expect(firstPosition(2, 4)).toEqual({ string: 2, fret: 4, finger: 4 });
  });

  it('no sale de la primera posición', () => {
    expect(() => firstPosition(1, 5)).toThrow(RangeError);
  });
});

describe('noteLabel', () => {
  it('en piano lleva octava; en guitarra no', () => {
    expect(noteLabel(64, 'latina', 'piano')).toBe('Mi4');
    expect(noteLabel(64, 'latina', 'guitarra')).toBe('Mi');
    expect(noteLabel(40, 'latina', 'guitarra')).toBe('Mi');
    expect(noteLabel(65, 'americana', 'guitarra')).toBe('F');
    expect(noteLabel(61, 'latina', 'guitarra')).toBe('Do#');
  });
});
