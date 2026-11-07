import { describe, expect, it } from 'vitest';
import {
  KEYBOARD_SIZES,
  correctNote,
  fixesFrom,
  isKeyboardSize,
  keyboardRange,
  namingShift,
  octaveCount,
  probeKind,
  probeSummary,
  sameFixes,
  sanitizeFixes,
  testNotes,
} from '@/core/domain/piano-setup';

describe('el tamaño del teclado', () => {
  it('el de 61 teclas tiene 5 octavas, de Do2 a Do7', () => {
    expect(keyboardRange(61)).toEqual({ low: 36, high: 96 });
    expect(octaveCount(61)).toBe(5);
    expect(octaveCount(88)).toBe(7);
    expect(octaveCount(49)).toBe(4);
  });

  it('cada tamaño tiene tantas teclas como dice', () => {
    for (const keys of KEYBOARD_SIZES) {
      const { low, high } = keyboardRange(keys);
      // Teclas = semitonos del rango + 1 (los de 32 y 76 acaban donde acaban).
      expect(high - low + 1, `${keys}`).toBeGreaterThanOrEqual(keys - 1);
      expect(high - low + 1, `${keys}`).toBeLessThanOrEqual(keys + 1);
    }
  });

  it('solo se aceptan los tamaños conocidos', () => {
    expect(isKeyboardSize(61)).toBe(true);
    expect(isKeyboardSize(60)).toBe(false);
    expect(isKeyboardSize('61')).toBe(false);
  });
});

describe('cómo se llama el Do central', () => {
  it('Yamaha lo llama Do3: una octava menos; el estándar, Do4', () => {
    expect(namingShift('yamaha')).toBe(-1);
    expect(namingShift('estandar')).toBe(0);
  });
});

describe('corregir lo que lee el micrófono', () => {
  it('una nota leída una octava arriba de lo tocado vuelve a su sitio', () => {
    // Se tocó el Mi3 (52) y el micrófono leyó Mi4 (64).
    const fixes = [{ note: 52, shift: 12 }];
    expect(correctNote(fixes, 64)).toBe(52);
    // Las vecinas dentro de media octava también (Re4 = 62 era Re3).
    expect(correctNote(fixes, 62)).toBe(50);
  });

  it('lo que no se parece a lo visto en la prueba no se toca', () => {
    const fixes = [{ note: 52, shift: 12 }];
    expect(correctNote(fixes, 72)).toBe(72);
    expect(correctNote(fixes, 40)).toBe(40);
    expect(correctNote([], 64)).toBe(64);
  });

  it('con varias correcciones gana la más cercana', () => {
    const fixes = [
      { note: 48, shift: 12 },
      { note: 55, shift: -12 },
    ];
    expect(correctNote(fixes, 60)).toBe(48);
    expect(correctNote(fixes, 43)).toBe(55);
  });

  it('no corrige si la nota saldría del teclado MIDI', () => {
    expect(correctNote([{ note: 134, shift: -24 }], 110)).toBe(110);
  });

  it('se limpia lo guardado: solo octavas enteras, de -24 a 24', () => {
    expect(
      sanitizeFixes([
        { note: 52, shift: 12 },
        { note: 52, shift: 5 },
        { note: 52, shift: 0 },
        { note: 200, shift: 12 },
        { note: 52, shift: 36 },
        'x',
        null,
      ]),
    ).toEqual([{ note: 52, shift: 12 }]);
    expect(sanitizeFixes('no')).toEqual([]);
    expect(sameFixes([{ note: 52, shift: 12 }], [{ note: 52, shift: 12 }])).toBe(true);
    expect(sameFixes([{ note: 52, shift: 12 }], [])).toBe(false);
  });
});

describe('la prueba', () => {
  it('pide notas repartidas por el teclado y solo las que existen en él', () => {
    expect(testNotes(61)).toEqual([40, 48, 52, 55, 60, 64, 67, 72, 79, 84]);
    expect(testNotes(25)).toEqual([48, 52, 55, 60, 64, 67, 72]);
    expect(testNotes(88).every((note) => note >= 21 && note <= 108)).toBe(true);
  });

  it('cada lectura se clasifica: bien, una octava arriba o abajo, otra', () => {
    expect(probeKind(60, 60)).toBe('bien');
    expect(probeKind(52, 64)).toBe('octava-arriba');
    expect(probeKind(64, 52)).toBe('octava-abajo');
    expect(probeKind(60, 62)).toBe('otra');
  });

  it('de las lecturas con una octava de más o de menos salen las correcciones', () => {
    const results = [
      { expected: 48, detected: 60 },
      { expected: 52, detected: 64 },
      { expected: 60, detected: 60 },
      { expected: 64, detected: 66 },
      { expected: 67, detected: null },
    ];
    expect(fixesFrom(results)).toEqual([
      { note: 48, shift: 12 },
      { note: 52, shift: 12 },
    ]);
    expect(probeSummary(results)).toEqual({ ok: 1, heard: 4, total: 5 });
  });
});
