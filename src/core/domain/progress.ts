import { isValidDay } from './day';
import type { Attempt } from './exercise';
import { addSamples, samplesOf, targetKey } from './key-stats';
import type { KeyHistory, KeySample } from './key-stats';
import { LESSONS, findLesson } from './lessons';
import type { Lesson } from './lessons';
import { XP_PER_NEW_STAR, pianistLevel, repeatFactor } from './scoring';
import type { LessonScore, Stars } from './scoring';
import { EMPTY_STREAK, advanceStreak, streakAt } from './streak';
import type { Streak } from './streak';

/**
 * Lo que Passo recuerda de cada persona: experiencia, racha, lo hecho en cada lección, cómo sale cada
 * tecla, el tiempo de cada día y las últimas lecciones. Se guarda en el navegador; es todo enteros
 * pequeños y se valida como las preferencias (lo ajeno o dañado nunca rompe nada).
 */

/** Se sube cuando cambia la forma de lo guardado. Una versión mayor solo se lee, no se pisa. */
export const PROGRESS_VERSION = 1;

export const MAX_DAILY_DAYS = 90;
export const MAX_HISTORY = 50;
const MAX_XP = 100_000_000;
const MAX_DAY_MS = 86_400_000;

export interface LessonRecord {
  /** Mejores estrellas conseguidas. */
  readonly stars: Stars;
  /** Mejor precisión, en milésimas (0–1000). */
  readonly accuracy: number;
  /** Mejor ritmo, en décimas de nota por minuto. */
  readonly rhythm: number;
  /** Veces que se ha terminado una ronda de esta lección. */
  readonly plays: number;
  /** Último día en que se jugó. */
  readonly day: string;
}

export interface DayRecord {
  /** Milisegundos de tiempo activo ese día. */
  readonly ms: number;
  /** Lecciones terminadas ese día. */
  readonly lessons: number;
}

export interface HistoryEntry {
  readonly day: string;
  readonly lesson: string;
  /** Precisión en milésimas. */
  readonly accuracy: number;
  /** Ritmo en décimas de nota por minuto. */
  readonly rhythm: number;
}

export interface Progress {
  readonly version: typeof PROGRESS_VERSION;
  readonly xp: number;
  readonly streak: Streak;
  readonly lessons: Readonly<Record<string, LessonRecord>>;
  readonly keys: KeyHistory;
  readonly daily: Readonly<Record<string, DayRecord>>;
  readonly history: readonly HistoryEntry[];
}

export const EMPTY_PROGRESS: Progress = {
  version: PROGRESS_VERSION,
  xp: 0,
  streak: EMPTY_STREAK,
  lessons: {},
  keys: {},
  daily: {},
  history: [],
};

// ─── Lectura defensiva ──────────────────────────────────────────────────────────────────────────

export type ProgressStatus =
  /** No había nada guardado (o no se podía leer): se empieza de cero. */
  | 'vacio'
  | 'ok'
  /** Lo guardado es de una versión más nueva: se muestra vacío y **no se debe sobrescribir**. */
  | 'version-mayor';

export interface ParsedProgress {
  readonly state: Progress;
  readonly status: ProgressStatus;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function int(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
}

/** Los objetivos que existen en alguna lección: lo demás guardado se descarta. */
const KNOWN_KEYS: ReadonlySet<string> = new Set(
  LESSONS.flatMap((lesson) => lesson.pool.map((target) => targetKey(target.notes))),
);

function parseStreak(raw: unknown): Streak {
  if (!isRecord(raw)) return EMPTY_STREAK;
  const last = isValidDay(raw['last']) ? raw['last'] : null;
  const count = last === null ? 0 : int(raw['count'], 0, 100_000, 0);
  const restWeek = isValidDay(raw['restWeek']) ? raw['restWeek'] : null;
  return count === 0 ? { ...EMPTY_STREAK, restWeek } : { count, last, restWeek };
}

function parseLessons(raw: unknown): Record<string, LessonRecord> {
  const lessons: Record<string, LessonRecord> = {};
  if (!isRecord(raw)) return lessons;
  for (const [id, value] of Object.entries(raw)) {
    if (findLesson(id) === null || !isRecord(value) || !isValidDay(value['day'])) continue;
    lessons[id] = {
      stars: int(value['stars'], 0, 3, 0) as Stars,
      accuracy: int(value['accuracy'], 0, 1000, 0),
      rhythm: int(value['rhythm'], 0, 99_999, 0),
      plays: int(value['plays'], 0, 100_000, 0),
      day: value['day'],
    };
  }
  return lessons;
}

function parseKeys(raw: unknown): Record<string, readonly KeySample[]> {
  const keys: Record<string, readonly KeySample[]> = {};
  if (!isRecord(raw)) return keys;
  for (const [key, value] of Object.entries(raw)) {
    if (!KNOWN_KEYS.has(key) || !Array.isArray(value)) continue;
    const samples: KeySample[] = [];
    for (const item of value.slice(-10)) {
      if (!Array.isArray(item)) continue;
      samples.push({ ok: item[0] === 1, ms: int(item[1], 0, 600_000, 0) });
    }
    if (samples.length > 0) keys[key] = samples;
  }
  return keys;
}

function parseDaily(raw: unknown): Record<string, DayRecord> {
  const entries: [string, DayRecord][] = [];
  if (isRecord(raw)) {
    for (const [day, value] of Object.entries(raw)) {
      if (!isValidDay(day) || !isRecord(value)) continue;
      entries.push([
        day,
        { ms: int(value['ms'], 0, MAX_DAY_MS, 0), lessons: int(value['lessons'], 0, 10_000, 0) },
      ]);
    }
  }
  entries.sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries.slice(-MAX_DAILY_DAYS));
}

function parseHistory(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: HistoryEntry[] = [];
  for (const value of raw) {
    if (!isRecord(value) || !isValidDay(value['day'])) continue;
    const lesson = value['lesson'];
    if (typeof lesson !== 'string' || findLesson(lesson) === null) continue;
    entries.push({
      day: value['day'],
      lesson,
      accuracy: int(value['accuracy'], 0, 1000, 0),
      rhythm: int(value['rhythm'], 0, 99_999, 0),
    });
  }
  return entries.slice(-MAX_HISTORY);
}

/**
 * Convierte lo leído del almacenamiento en un progreso válido. **Nunca lanza**: cada campo inválido
 * se descarta o toma su valor vacío. Una versión mayor a la conocida no se interpreta.
 */
export function parseProgress(raw: unknown): ParsedProgress {
  if (!isRecord(raw)) return { state: EMPTY_PROGRESS, status: 'vacio' };
  const version = raw['version'];
  if (typeof version !== 'number' || !Number.isFinite(version) || version < 1) {
    return { state: EMPTY_PROGRESS, status: 'vacio' };
  }
  if (version > PROGRESS_VERSION) return { state: EMPTY_PROGRESS, status: 'version-mayor' };
  return {
    status: 'ok',
    state: {
      version: PROGRESS_VERSION,
      xp: int(raw['xp'], 0, MAX_XP, 0),
      streak: parseStreak(raw['streak']),
      lessons: parseLessons(raw['lessons']),
      keys: parseKeys(raw['keys']),
      daily: parseDaily(raw['daily']),
      history: parseHistory(raw['history']),
    },
  };
}

/** Cómo se guardan las muestras de las teclas: `[1|0, ms]`, más compacto que objetos. */
export function serializeProgress(state: Progress): unknown {
  return {
    ...state,
    keys: Object.fromEntries(
      Object.entries(state.keys).map(([key, samples]) => [
        key,
        samples.map((sample) => [sample.ok ? 1 : 0, sample.ms]),
      ]),
    ),
  };
}

// ─── Consultas ──────────────────────────────────────────────────────────────────────────────────

export const starsOf =
  (state: Progress) =>
  (lessonId: string): number =>
    state.lessons[lessonId]?.stars ?? 0;

export function minutesOn(state: Progress, day: string): number {
  return (state.daily[day]?.ms ?? 0) / 60_000;
}

export function currentStreak(state: Progress, today: string): number {
  return streakAt(state.streak, today);
}

// ─── Aplicar el resultado de una lección ────────────────────────────────────────────────────────

export interface LessonResult {
  readonly lesson: Lesson;
  readonly score: LessonScore;
  readonly attempts: readonly Attempt[];
}

/** Lo que cambió con esta ronda: sirve para la pantalla de resultado («+45 XP», «racha de 8 días»). */
export interface ResultGains {
  /** Experiencia ganada (con el factor por repetir y el extra por estrellas nuevas). */
  readonly xp: number;
  readonly previousStars: Stars;
  readonly stars: Stars;
  /** Estrellas que se ganan por primera vez (mejoran la marca anterior). */
  readonly newStars: number;
  /** Veces que se había jugado esta lección antes. */
  readonly previousPlays: number;
  readonly bestAccuracy: boolean;
  readonly bestRhythm: boolean;
  /** Racha después de esta ronda (la lección cuenta si llegó a 1 estrella). */
  readonly streak: number;
  readonly streakIncreased: boolean;
  readonly levelBefore: number;
  readonly levelAfter: number;
}

function prune(state: Progress): Progress {
  const keys = Object.fromEntries(
    Object.entries(state.keys).filter(([key]) => KNOWN_KEYS.has(key)),
  );
  const days = Object.keys(state.daily).sort();
  const daily = Object.fromEntries(
    days.slice(-MAX_DAILY_DAYS).map((day) => [day, state.daily[day]]),
  );
  return {
    ...state,
    keys,
    daily: daily as Progress['daily'],
    history: state.history.slice(-MAX_HISTORY),
  };
}

/**
 * Aplica el resultado de una lección terminada el día `day`. Función pura.
 * - Estrellas, precisión y ritmo guardan la **mejor** marca.
 * - Experiencia: la de la ronda × (100 % la primera vez, 50 % la segunda, 25 % después) + 10 por
 *   estrella nueva.
 * - La racha solo avanza si la lección se completó (1 estrella o más); el tiempo cuenta siempre.
 */
export function applyResult(
  state: Progress,
  result: LessonResult,
  day: string,
): { state: Progress; gains: ResultGains } {
  const { lesson, score, attempts } = result;
  const previous = state.lessons[lesson.id];
  const previousStars = (previous?.stars ?? 0) as Stars;
  const previousPlays = previous?.plays ?? 0;
  const accuracy = Math.round(score.accuracy * 1000);
  const rhythm = Math.round(score.notesPerMinute * 10);

  const stars = Math.max(previousStars, score.stars) as Stars;
  const newStars = Math.max(0, score.stars - previousStars);
  const xp = Math.round(score.baseXp * repeatFactor(previousPlays)) + XP_PER_NEW_STAR * newStars;

  const record: LessonRecord = {
    stars,
    accuracy: Math.max(previous?.accuracy ?? 0, accuracy),
    rhythm: Math.max(previous?.rhythm ?? 0, rhythm),
    plays: previousPlays + 1,
    day,
  };

  const playMs = attempts.reduce(
    (sum, attempt) => sum + (attempt.isCorrect ? Math.max(0, attempt.reactionMs) : 0),
    0,
  );
  const today = state.daily[day];
  const daily: DayRecord = {
    ms: Math.min(MAX_DAY_MS, (today?.ms ?? 0) + Math.round(playMs)),
    lessons: (today?.lessons ?? 0) + 1,
  };

  const streak = score.stars >= 1 ? advanceStreak(state.streak, day) : state.streak;
  const streakBefore = streakAt(state.streak, day);
  const streakAfter = streakAt(streak, day);

  const next = prune({
    ...state,
    xp: Math.min(MAX_XP, state.xp + xp),
    streak,
    lessons: { ...state.lessons, [lesson.id]: record },
    keys: addSamples(state.keys, samplesOf(attempts)),
    daily: { ...state.daily, [day]: daily },
    history: [...state.history, { day, lesson: lesson.id, accuracy, rhythm }],
  });

  return {
    state: next,
    gains: {
      xp,
      previousStars,
      stars: score.stars,
      newStars,
      previousPlays,
      bestAccuracy: accuracy > (previous?.accuracy ?? 0),
      bestRhythm: rhythm > (previous?.rhythm ?? 0),
      streak: streakAfter,
      streakIncreased: streakAfter > streakBefore,
      levelBefore: pianistLevel(state.xp).level,
      levelAfter: pianistLevel(next.xp).level,
    },
  };
}
