import {
  DEFAULT_PREFERENCES,
  PREFERENCES_VERSION,
  applyPreferencesPatch,
  parsePreferences,
  samePreferences,
} from '@/core/domain/preferences';
import { MAX_REFERENCE_HZ, MIN_REFERENCE_HZ, isValidReference } from '@/core/domain/tuner';

describe('el La₄ del afinador en las preferencias', () => {
  it('por omisión es 440 Hz', () => {
    expect(DEFAULT_PREFERENCES.tunerReferenceHz).toBe(440);
  });

  it('no sube la versión: lo guardado antes sigue valiendo y da 440', () => {
    expect(PREFERENCES_VERSION).toBe(1);
    const before = {
      version: 1,
      input: 'midi',
      instrument: 'guitarra',
      notation: 'americana',
      help: false,
      theme: 'oscuro',
      mode: 'terceras',
      levels: { notas: 2, terceras: 3, acordes: 1 },
      polyphonicMic: false,
    };
    const parsed = parsePreferences(before);
    expect(parsed.tunerReferenceHz).toBe(440);
    expect(parsed).toMatchObject({ input: 'midi', instrument: 'guitarra', notation: 'americana' });
  });

  it('un La₄ válido se conserva', () => {
    for (const hz of [430, 432, 442, 450]) {
      expect(parsePreferences({ version: 1, tunerReferenceHz: hz }).tunerReferenceHz).toBe(hz);
    }
  });

  it('uno inválido vuelve a 440 y no estropea el resto', () => {
    for (const hz of [429, 451, 440.5, '442', NaN, null, {}, -440]) {
      const parsed = parsePreferences({ version: 1, notation: 'americana', tunerReferenceHz: hz });
      expect(parsed.tunerReferenceHz).toBe(440);
      expect(parsed.notation).toBe('americana');
    }
  });

  it('un cambio se aplica, se valida y cuenta como distinto', () => {
    const changed = applyPreferencesPatch(DEFAULT_PREFERENCES, { tunerReferenceHz: 432 });
    expect(changed.tunerReferenceHz).toBe(432);
    expect(samePreferences(changed, DEFAULT_PREFERENCES)).toBe(false);
    expect(applyPreferencesPatch(changed, { tunerReferenceHz: 99 }).tunerReferenceHz).toBe(432);
  });

  it('isValidReference admite enteros de 430 a 450', () => {
    expect([MIN_REFERENCE_HZ, MAX_REFERENCE_HZ]).toEqual([430, 450]);
    expect(isValidReference(440)).toBe(true);
    expect(isValidReference(429)).toBe(false);
    expect(isValidReference(450.5)).toBe(false);
    expect(isValidReference('440')).toBe(false);
  });
});
