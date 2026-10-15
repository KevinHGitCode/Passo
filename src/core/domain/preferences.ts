import { EXERCISE_MODES, findLevel } from './curriculum';
import type { ExerciseMode } from './curriculum';
import type { NotationMode } from './note';
import type { InputSource } from './note-event';

export type ThemeChoice = 'auto' | 'claro' | 'oscuro';
export const THEME_CHOICES: readonly ThemeChoice[] = ['auto', 'claro', 'oscuro'];
export const NOTATION_CHOICES: readonly NotationMode[] = ['latina', 'americana'];
/** Entradas elegibles: el micrófono (escucha activa), un piano MIDI o el teclado del PC. */
export const INPUT_CHOICES: readonly InputSource[] = ['microfono', 'midi', 'teclado-pc'];

/** Se sube cuando cambia la forma de lo guardado; una versión desconocida no se interpreta. */
export const PREFERENCES_VERSION = 1;

/** Lo que Kevin (o quien practique) deja elegido de una visita a otra. */
export interface Preferences {
  readonly version: typeof PREFERENCES_VERSION;
  /** Entrada con la que se practica. El micrófono no se enciende solo: hace falta activarlo. */
  readonly input: InputSource;
  readonly notation: NotationMode;
  /** Ayuda: iluminar las teclas objetivo. */
  readonly help: boolean;
  readonly theme: ThemeChoice;
  readonly mode: ExerciseMode;
  /** Último nivel elegido en cada modo. */
  readonly levels: Readonly<Record<ExerciseMode, number>>;
  /** Varias notas por micrófono (BETA): apagado por defecto. */
  readonly polyphonicMic: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  version: PREFERENCES_VERSION,
  input: 'microfono',
  notation: 'latina',
  help: true,
  theme: 'auto',
  mode: 'notas',
  levels: { notas: 1, terceras: 1, acordes: 1 },
  polyphonicMic: false,
};

/** Cambios parciales: los niveles se mezclan por modo. */
export type PreferencesPatch = Partial<Omit<Preferences, 'version' | 'levels'>> & {
  readonly levels?: Partial<Record<ExerciseMode, number>>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.find((candidate) => candidate === value) ?? fallback;
}

function parseLevels(value: unknown, fallback: Preferences['levels']): Preferences['levels'] {
  const source = isRecord(value) ? value : {};
  const level = (mode: ExerciseMode): number => {
    const candidate = source[mode];
    return typeof candidate === 'number' && findLevel(mode, candidate) !== null
      ? candidate
      : fallback[mode];
  };
  return { notas: level('notas'), terceras: level('terceras'), acordes: level('acordes') };
}

/**
 * Convierte lo leído del almacenamiento (o un cambio) en preferencias válidas. Nunca lanza:
 * cada campo inválido toma el valor de `fallback`. Si la versión no es la actual solo se aprovecha
 * el tema (así se conserva el que se guardaba antes de que existieran las preferencias).
 */
export function parsePreferences(
  raw: unknown,
  fallback: Preferences = DEFAULT_PREFERENCES,
): Preferences {
  if (!isRecord(raw)) return fallback;
  const theme = oneOf(raw['theme'], THEME_CHOICES, fallback.theme);
  if (raw['version'] !== PREFERENCES_VERSION) return { ...fallback, theme };
  return {
    version: PREFERENCES_VERSION,
    input: oneOf(raw['input'], INPUT_CHOICES, fallback.input),
    notation: oneOf(raw['notation'], NOTATION_CHOICES, fallback.notation),
    help: typeof raw['help'] === 'boolean' ? raw['help'] : fallback.help,
    theme,
    mode: oneOf(raw['mode'], EXERCISE_MODES, fallback.mode),
    levels: parseLevels(raw['levels'], fallback.levels),
    polyphonicMic:
      typeof raw['polyphonicMic'] === 'boolean' ? raw['polyphonicMic'] : fallback.polyphonicMic,
  };
}

/** Aplica un cambio y lo valida; lo que no sea válido se queda como estaba. */
export function applyPreferencesPatch(current: Preferences, patch: PreferencesPatch): Preferences {
  return parsePreferences(
    { ...current, ...patch, levels: { ...current.levels, ...patch.levels } },
    current,
  );
}

export function samePreferences(a: Preferences, b: Preferences): boolean {
  return (
    a.input === b.input &&
    a.notation === b.notation &&
    a.help === b.help &&
    a.theme === b.theme &&
    a.mode === b.mode &&
    a.polyphonicMic === b.polyphonicMic &&
    EXERCISE_MODES.every((mode) => a.levels[mode] === b.levels[mode])
  );
}
