import type { Midi } from './note';

/**
 * Los parámetros del piano de quien practica: cuántas teclas tiene, cómo llama su teclado al Do central y,
 * si el micrófono lee alguna nota una octava más arriba o abajo, cómo corregirlo.
 */

/** Los tamaños de teclado más comunes (teclas). */
export const KEYBOARD_SIZES = [25, 32, 37, 49, 61, 76, 88] as const;
export type KeyboardSize = (typeof KEYBOARD_SIZES)[number];
export const DEFAULT_KEYBOARD_SIZE: KeyboardSize = 61;

export function isKeyboardSize(value: unknown): value is KeyboardSize {
  return KEYBOARD_SIZES.some((size) => size === value);
}

/** De qué nota a qué nota va cada tamaño (MIDI): el 61 es el de 5 octavas, Do2 a Do7. */
const RANGES: Readonly<Record<KeyboardSize, { readonly low: Midi; readonly high: Midi }>> = {
  25: { low: 48, high: 72 },
  32: { low: 41, high: 72 },
  37: { low: 48, high: 84 },
  49: { low: 36, high: 84 },
  61: { low: 36, high: 96 },
  76: { low: 28, high: 103 },
  88: { low: 21, high: 108 },
};

export function keyboardRange(keys: KeyboardSize): { low: Midi; high: Midi } {
  const range = RANGES[keys];
  return { low: range.low, high: range.high };
}

/** Las octavas completas que caben en el teclado (61 teclas: 5). */
export function octaveCount(keys: KeyboardSize): number {
  return Math.round(keys / 12);
}

// ─── Cómo se llama el Do central ───────────────────────────────────────────────────────────────────

/**
 * Cómo numera las octavas el teclado: la estándar llama Do4 al Do central (MIDI 60); Yamaha, Casio y otros lo
 * llaman Do3. Solo cambia el **nombre** que se muestra, no el sonido.
 */
export type OctaveNaming = 'estandar' | 'yamaha';
export const OCTAVE_NAMINGS: readonly OctaveNaming[] = ['estandar', 'yamaha'];
export const DEFAULT_OCTAVE_NAMING: OctaveNaming = 'estandar';

/** Cuántas octavas se resta al número de octava que se muestra. */
export const namingShift = (naming: OctaveNaming): number => (naming === 'yamaha' ? -1 : 0);

// ─── Corregir lo que lee el micrófono ──────────────────────────────────────────────────────────────

/** Una nota que el micrófono lee una o más octavas lejos de la que se tocó. */
export interface MicFix {
  /** La nota que se tocó de verdad (MIDI). */
  readonly note: Midi;
  /** Cuánto se equivoca: lo leído menos lo tocado (±12, ±24). */
  readonly shift: number;
}

/** Hasta cuántos semitonos de la nota leída se aplica la corrección (media octava). */
const FIX_REACH = 6;

export function sanitizeFixes(raw: unknown): MicFix[] {
  if (!Array.isArray(raw)) return [];
  const fixes: MicFix[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const { note, shift } = item as { note?: unknown; shift?: unknown };
    if (
      typeof note === 'number' &&
      Number.isInteger(note) &&
      note >= 0 &&
      note <= 127 &&
      typeof shift === 'number' &&
      Number.isInteger(shift) &&
      shift !== 0 &&
      shift % 12 === 0 &&
      Math.abs(shift) <= 24
    ) {
      fixes.push({ note, shift });
    }
  }
  return fixes.slice(0, 32);
}

export function sameFixes(a: readonly MicFix[], b: readonly MicFix[]): boolean {
  return (
    a.length === b.length &&
    a.every((fix, i) => fix.note === b[i]?.note && fix.shift === b[i]?.shift)
  );
}

/**
 * La nota que de verdad se tocó, dada la que leyó el micrófono: si cae cerca de una lectura con octava
 * equivocada que se vio al probar, se corrige; si no, se queda como está.
 */
export function correctNote(fixes: readonly MicFix[], detected: Midi): Midi {
  let best: MicFix | null = null;
  let bestDistance = Infinity;
  for (const fix of fixes) {
    const distance = Math.abs(detected - (fix.note + fix.shift));
    if (distance <= FIX_REACH && distance < bestDistance) {
      best = fix;
      bestDistance = distance;
    }
  }
  if (!best) return detected;
  const corrected = detected - best.shift;
  return corrected >= 0 && corrected <= 127 ? corrected : detected;
}

// ─── La prueba ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Las notas que el micrófono puede oír con un piano: del Do3 al Do6 (en nombres estándar; MIDI 48–84). Por debajo, el
 * altavoz de un teclado casi no da graves; por encima, el sonido es demasiado agudo para medirlo bien. Es el rango
 * del rastreador de notas (`minMidi` y `maxMidi`).
 */
export const MIC_RANGE = { low: 48, high: 84 } as const;

/** Las notas que se piden en la prueba: repartidas por la parte del teclado que el micrófono puede oír. */
export function testNotes(keys: KeyboardSize): Midi[] {
  const { low, high } = keyboardRange(keys);
  const wanted = [48, 52, 55, 60, 64, 67, 72, 76, 79, 84];
  return wanted.filter(
    (note) => note >= Math.max(low, MIC_RANGE.low) && note <= Math.min(high, MIC_RANGE.high),
  );
}

/** Cuántas teclas del teclado quedan fuera de lo que el micrófono puede oír (por debajo y por encima). */
export function keysOutsideMic(keys: KeyboardSize): { below: number; above: number } {
  const { low, high } = keyboardRange(keys);
  return {
    below: Math.max(0, Math.min(high, MIC_RANGE.low - 1) - low + 1),
    above: Math.max(0, high - Math.max(low, MIC_RANGE.high + 1) + 1),
  };
}

export type ProbeKind = 'bien' | 'octava-arriba' | 'octava-abajo' | 'otra';

export function probeKind(expected: Midi, detected: Midi): ProbeKind {
  const delta = detected - expected;
  if (delta === 0) return 'bien';
  if (delta > 0 && delta % 12 === 0) return 'octava-arriba';
  if (delta < 0 && delta % 12 === 0) return 'octava-abajo';
  return 'otra';
}

export interface ProbeResult {
  readonly expected: Midi;
  readonly detected: Midi | null;
}

/** De lo que salió en la prueba, las correcciones de octava que se pueden aplicar. */
export function fixesFrom(results: readonly ProbeResult[]): MicFix[] {
  return results.flatMap((result) => {
    if (result.detected === null) return [];
    const kind = probeKind(result.expected, result.detected);
    return kind === 'octava-arriba' || kind === 'octava-abajo'
      ? [{ note: result.expected, shift: result.detected - result.expected }]
      : [];
  });
}

/** Cuántas notas de la prueba salieron bien, y cuántas se pudieron probar. */
export function probeSummary(results: readonly ProbeResult[]): {
  ok: number;
  heard: number;
  total: number;
} {
  const heard = results.filter((result) => result.detected !== null);
  return {
    ok: heard.filter((result) => result.detected === result.expected).length,
    heard: heard.length,
    total: results.length,
  };
}
