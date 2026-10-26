import { addDays, isValidDay, weekStart } from './day';
import { MAX_REACTION_MS } from './exercise';
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

/** Meta de práctica de cada día, en minutos de tiempo activo. */
export const DAILY_GOAL_MINUTES = 5;
/** Un repaso armado al momento da siempre la mitad de experiencia (se puede repetir; no es camino de XP). */
const DYNAMIC_XP_FACTOR = 0.5;
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

/** Un día de la semana en curso (de lunes a domingo) y si se practicó. */
export interface WeekDay {
  readonly day: string;
  readonly practiced: boolean;
  readonly today: boolean;
  readonly future: boolean;
}

/** Los siete días de la semana de `today`, con los que tuvieron al menos una lección. */
export function weekActivity(state: Progress, today: string): WeekDay[] {
  const monday = weekStart(today);
  return Array.from({ length: 7 }, (_, index) => {
    const day = addDays(monday, index);
    return {
      day,
      practiced: (state.daily[day]?.lessons ?? 0) > 0,
      today: day === today,
      // Las fechas `AAAA-MM-DD` se ordenan como texto.
      future: day > today,
    };
  });
}

/** Las cifras del resumen de progreso. */
export interface ProgressSummary {
  /** Precisión media de las últimas lecciones, de 0 a 1; `null` sin datos. */
  readonly accuracy: number | null;
  /** Ritmo medio (notas por minuto) de las últimas lecciones; `null` sin datos. */
  readonly notesPerMinute: number | null;
  /** Tiempo activo total guardado (los últimos 90 días), en milisegundos. */
  readonly totalMs: number;
  /** Días con al menos una lección terminada. */
  readonly practiceDays: number;
  /** Lecciones del historial reciente que entran en las medias. */
  readonly lessons: number;
}

/** Cuántas de las últimas lecciones entran en las medias (lo reciente dice más que lo antiguo). */
export const SUMMARY_WINDOW = 10;

export function progressSummary(state: Progress): ProgressSummary {
  const recent = state.history.slice(-SUMMARY_WINDOW);
  const average = (pick: (entry: HistoryEntry) => number): number | null =>
    recent.length === 0
      ? null
      : recent.reduce((sum, entry) => sum + pick(entry), 0) / recent.length;
  const accuracy = average((entry) => entry.accuracy);
  const rhythm = average((entry) => entry.rhythm);
  const days = Object.values(state.daily);
  return {
    accuracy: accuracy === null ? null : accuracy / 1000,
    notesPerMinute: rhythm === null ? null : rhythm / 10,
    totalMs: days.reduce((sum, day) => sum + day.ms, 0),
    practiceDays: days.filter((day) => day.lessons > 0).length,
    lessons: recent.length,
  };
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
  const dynamic = lesson.dynamic === true;
  const previous = dynamic ? undefined : state.lessons[lesson.id];
  const previousStars = (previous?.stars ?? 0) as Stars;
  const previousPlays = previous?.plays ?? 0;
  const accuracy = Math.round(score.accuracy * 1000);
  const rhythm = Math.round(score.notesPerMinute * 10);

  const stars = Math.max(previousStars, score.stars) as Stars;
  const newStars = dynamic ? 0 : Math.max(0, score.stars - previousStars);
  const xp = dynamic
    ? Math.round(score.baseXp * DYNAMIC_XP_FACTOR)
    : Math.round(score.baseXp * repeatFactor(previousPlays)) + XP_PER_NEW_STAR * newStars;

  const record: LessonRecord = {
    stars,
    accuracy: Math.max(previous?.accuracy ?? 0, accuracy),
    rhythm: Math.max(previous?.rhythm ?? 0, rhythm),
    // Una ronda sin llegar al 70 % no cuenta como jugada: no baja la experiencia de la primera vez.
    plays: previousPlays + (score.stars >= 1 ? 1 : 0),
    day,
  };

  const playMs = attempts.reduce(
    (sum, attempt) =>
      sum + (attempt.isCorrect ? Math.min(MAX_REACTION_MS, Math.max(0, attempt.reactionMs)) : 0),
    0,
  );
  const today = state.daily[day];
  const daily: DayRecord = {
    ms: Math.min(MAX_DAY_MS, (today?.ms ?? 0) + Math.round(playMs)),
    lessons: (today?.lessons ?? 0) + (score.stars >= 1 ? 1 : 0),
  };

  const streak = score.stars >= 1 ? advanceStreak(state.streak, day) : state.streak;
  const streakBefore = streakAt(state.streak, day);
  const streakAfter = streakAt(streak, day);

  const next = prune({
    ...state,
    xp: Math.min(MAX_XP, state.xp + xp),
    streak,
    lessons: dynamic ? state.lessons : { ...state.lessons, [lesson.id]: record },
    keys: addSamples(state.keys, samplesOf(attempts)),
    daily: { ...state.daily, [day]: daily },
    history: dynamic
      ? state.history
      : [...state.history, { day, lesson: lesson.id, accuracy, rhythm }],
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
