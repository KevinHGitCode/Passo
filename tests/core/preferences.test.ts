import {
  DEFAULT_PREFERENCES,
  applyPreferencesPatch,
  parsePreferences,
  samePreferences,
} from '@/core/domain/preferences';
import type { Preferences } from '@/core/domain/preferences';

const valid: Preferences = {
  version: 1,
  input: 'teclado-pc',
  instrument: 'guitarra',
  notation: 'americana',
  help: false,
  theme: 'oscuro',
  mode: 'acordes',
  levels: { notas: 1, terceras: 3, acordes: 4 },
  polyphonicMic: true,
};

describe('parsePreferences', () => {
  it('lo que no existe o no es un objeto da los valores de fábrica', () => {
    for (const raw of [null, undefined, 3, 'x', [], true]) {
      expect(parsePreferences(raw)).toBe(DEFAULT_PREFERENCES);
    }
  });

  it('por defecto: micrófono, notación latina, con ayuda, tema automático, notas nivel 1, beta apagada', () => {
    expect(DEFAULT_PREFERENCES).toEqual({
      version: 1,
      input: 'microfono',
      instrument: 'piano',
      notation: 'latina',
      help: true,
      theme: 'auto',
      mode: 'notas',
      levels: { notas: 1, terceras: 1, acordes: 1 },
      polyphonicMic: false,
    });
  });

  it('acepta unas preferencias válidas tal cual', () => {
    expect(parsePreferences(JSON.parse(JSON.stringify(valid)))).toEqual(valid);
  });

  it('cada campo inválido toma el valor de fábrica y el resto se conserva', () => {
    const parsed = parsePreferences({
      ...valid,
      input: 'telepatía',
      instrument: 'ukelele',
      notation: 3,
      help: 'sí',
      theme: 'rosa',
      mode: 'ritmo',
      levels: { notas: 1, terceras: 99, acordes: 'x' },
      polyphonicMic: 1,
    });
    expect(parsed).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences({ ...valid, input: 'telepatía' })).toEqual({
      ...valid,
      input: 'microfono',
    });
  });

  it('un nivel que no existe en su modo se descarta (los niveles de terceras no valen para notas)', () => {
    expect(
      parsePreferences({ ...valid, levels: { notas: 3, terceras: 3, acordes: 6 } }).levels,
    ).toEqual({
      notas: 1,
      terceras: 3,
      acordes: 1,
    });
    expect(parsePreferences({ ...valid, levels: { terceras: 2.5 } }).levels.terceras).toBe(1);
  });

  it('una versión desconocida no se interpreta, salvo el tema (migración del tema antiguo)', () => {
    expect(parsePreferences({ theme: 'claro' }).theme).toBe('claro');
    expect(parsePreferences({ ...valid, version: 2 })).toEqual({
      ...DEFAULT_PREFERENCES,
      theme: 'oscuro',
    });
    expect(parsePreferences({ theme: 'rosa' })).toEqual(DEFAULT_PREFERENCES);
  });

  it('con un `fallback` los campos inválidos conservan el valor actual', () => {
    expect(parsePreferences({ ...valid, notation: 'x' }, DEFAULT_PREFERENCES).notation).toBe(
      'latina',
    );
    expect(parsePreferences({ ...valid, notation: 'x' }, valid).notation).toBe('americana');
  });

  it('no modifica lo que recibe', () => {
    const raw = Object.freeze({ ...valid, levels: Object.freeze({ ...valid.levels }) });
    expect(() => parsePreferences(raw)).not.toThrow();
  });
});

describe('coherencia entre entrada y ejercicio', () => {
  it('con el micrófono (sin la beta de varias notas) el ejercicio siempre es el de notas', () => {
    expect(
      parsePreferences({ ...valid, input: 'microfono', mode: 'acordes', polyphonicMic: false })
        .mode,
    ).toBe('notas');
    expect(parsePreferences({ version: 1, input: 'microfono', mode: 'terceras' }).mode).toBe(
      'notas',
    );
  });

  it('con la beta activada el micrófono admite terceras y acordes', () => {
    expect(
      parsePreferences({ ...valid, input: 'microfono', mode: 'acordes', polyphonicMic: true }).mode,
    ).toBe('acordes');
  });

  it('con otra entrada no cambia nada', () => {
    expect(parsePreferences({ ...valid, input: 'midi', mode: 'terceras' }).mode).toBe('terceras');
  });

  it('pasar al micrófono desde terceras vuelve a notas, y los niveles se conservan', () => {
    const onKeyboard = applyPreferencesPatch(valid, { mode: 'terceras', levels: { terceras: 3 } });
    const onMic = applyPreferencesPatch(onKeyboard, { input: 'microfono', polyphonicMic: false });
    expect(onMic.mode).toBe('notas');
    expect(onMic.levels.terceras).toBe(3);
  });

  it('pedir terceras con el micrófono elegido no cambia nada', () => {
    const onMic = applyPreferencesPatch(valid, { input: 'microfono', polyphonicMic: false });
    expect(samePreferences(applyPreferencesPatch(onMic, { mode: 'terceras' }), onMic)).toBe(true);
  });
});

describe('applyPreferencesPatch', () => {
  it('cambia solo lo indicado y mezcla los niveles por modo', () => {
    const next = applyPreferencesPatch(valid, { notation: 'latina', levels: { terceras: 2 } });
    expect(next).toEqual({
      ...valid,
      notation: 'latina',
      levels: { notas: 1, terceras: 2, acordes: 4 },
    });
  });

  it('un valor inválido no cambia nada (ni vuelve al valor de fábrica)', () => {
    const next = applyPreferencesPatch(valid, {
      theme: 'rosa' as never,
      levels: { acordes: 9 },
    });
    expect(samePreferences(next, valid)).toBe(true);
  });
});

describe('samePreferences', () => {
  it('compara todos los campos, incluidos los niveles', () => {
    expect(samePreferences(valid, { ...valid })).toBe(true);
    expect(samePreferences(valid, { ...valid, help: true })).toBe(false);
    expect(samePreferences(valid, { ...valid, levels: { ...valid.levels, acordes: 5 } })).toBe(
      false,
    );
    expect(samePreferences(valid, { ...valid, polyphonicMic: false })).toBe(false);
  });
});
