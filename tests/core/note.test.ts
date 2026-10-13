import {
  isBlackKey,
  isValidMidi,
  noteName,
  octaveOf,
  pitchClass,
  pitchName,
  semitoneDistance,
} from '@/core/domain/note';

describe('noteName', () => {
  it.each([
    [21, 'La0', 'A0'],
    [60, 'Do4', 'C4'],
    [69, 'La4', 'A4'],
    [108, 'Do8', 'C8'],
    [0, 'Do-1', 'C-1'],
    [127, 'Sol9', 'G9'],
  ])('MIDI %i → %s / %s', (midi, latina, americana) => {
    expect(noteName(midi, 'latina')).toBe(latina);
    expect(noteName(midi, 'americana')).toBe(americana);
  });

  it('usa siempre sostenidos para las teclas negras', () => {
    expect(noteName(61, 'latina')).toBe('Do#4');
    expect(noteName(61, 'americana')).toBe('C#4');
    expect(noteName(70, 'latina')).toBe('La#4');
  });

  it('rechaza números fuera de rango o no enteros', () => {
    expect(() => noteName(128, 'latina')).toThrow(RangeError);
    expect(() => noteName(-1, 'americana')).toThrow(RangeError);
    expect(() => noteName(60.5, 'latina')).toThrow(RangeError);
  });
});

describe('pitchName, pitchClass y octaveOf', () => {
  it('separa nombre, clase y octava', () => {
    expect(pitchName(67, 'latina')).toBe('Sol');
    expect(pitchClass(67)).toBe(7);
    expect(octaveOf(67)).toBe(4);
    expect(octaveOf(59)).toBe(3);
  });
});

describe('isBlackKey', () => {
  it('reconoce las cinco teclas negras de la octava', () => {
    const negras = [61, 63, 66, 68, 70];
    for (let midi = 60; midi < 72; midi++) {
      expect(isBlackKey(midi)).toBe(negras.includes(midi));
    }
  });
});

describe('semitoneDistance', () => {
  it('es positiva si se tocó más agudo y negativa si más grave', () => {
    expect(semitoneDistance(62, 64)).toBe(2);
    expect(semitoneDistance(64, 62)).toBe(-2);
    expect(semitoneDistance(60, 60)).toBe(0);
  });
});

describe('isValidMidi', () => {
  it('acepta 0–127 enteros', () => {
    expect(isValidMidi(0)).toBe(true);
    expect(isValidMidi(127)).toBe(true);
    expect(isValidMidi(128)).toBe(false);
    expect(isValidMidi(1.5)).toBe(false);
  });
});
