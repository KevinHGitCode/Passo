import type { Attempt } from './exercise';

/**
 * Estadísticas por tecla (o por objetivo: «Do», «Do-Mi», «Do-Mi-Sol»): cómo sale cada una a la
 * primera y cuánto se tarda. Se guardan solo los últimos intentos, así lo débil se recupera practicando.
 */

export interface KeySample {
  /** Se acertó a la primera. */
  readonly ok: boolean;
  /** Milisegundos hasta acertar el objetivo. */
  readonly ms: number;
}

/** Objetivo → sus últimas muestras, de la más antigua a la más reciente. */
export type KeyHistory = Readonly<Record<string, readonly KeySample[]>>;

/** Cuántas muestras se guardan por tecla. */
export const KEY_WINDOW = 10;
/** Con menos muestras la tecla no se juzga (sale gris, no roja). */
export const MIN_SAMPLES = 5;
/** Cada intento más antiguo pesa un 15 % menos que el siguiente. */
export const DECAY = 0.85;
/** Una tecla es débil si acierta a la primera menos de esto… */
export const WEAK_ACCURACY = 0.8;
/** …o si tarda más de esta vez su mediana global. */
export const WEAK_SLOWNESS = 1.5;
/** Salida de «débil»: al menos 4 de los últimos 5 a la primera. */
export const RECOVERY_WINDOW = 5;
export const RECOVERY_HITS = 4;

export function targetKey(notes: readonly number[]): string {
  return notes.join('-');
}

/** Una muestra por objetivo de la ronda: a la primera o no, y lo que tardó en acertarlo. */
export function samplesOf(attempts: readonly Attempt[]): { key: string; sample: KeySample }[] {
  const byTarget = new Map<number, Attempt[]>();
  for (const attempt of attempts) {
    const group = byTarget.get(attempt.targetIndex) ?? [];
    group.push(attempt);
    byTarget.set(attempt.targetIndex, group);
  }
  const samples: { key: string; sample: KeySample }[] = [];
  for (const group of byTarget.values()) {
    const solved = group.find((attempt) => attempt.isCorrect);
    const first = group[0];
    if (solved === undefined || first === undefined) continue;
    samples.push({
      key: targetKey(first.targetNotes),
      sample: { ok: first.firstTryCorrect, ms: Math.max(0, Math.round(solved.reactionMs)) },
    });
  }
  return samples;
}

/** Añade muestras y recorta cada tecla a las últimas `KEY_WINDOW`. */
export function addSamples(
  history: KeyHistory,
  samples: readonly { key: string; sample: KeySample }[],
): KeyHistory {
  const next: Record<string, readonly KeySample[]> = { ...history };
  for (const { key, sample } of samples) {
    next[key] = [...(next[key] ?? []), sample].slice(-KEY_WINDOW);
  }
  return next;
}

export interface KeyStat {
  readonly key: string;
  /** Muestras guardadas (hasta `KEY_WINDOW`). */
  readonly samples: number;
  /** Aciertos a la primera con más peso a lo reciente, de 0 a 1. */
  readonly accuracy: number;
  readonly medianMs: number;
  /** (fallos + 1) / (n + 3): más alto, más débil. Sirve para elegir qué repasar. */
  readonly weight: number;
  /** Al menos 4 de los últimos 5 a la primera. */
  readonly recovered: boolean;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

export function keyStat(key: string, samples: readonly KeySample[]): KeyStat {
  let weightSum = 0;
  let okSum = 0;
  let failSum = 0;
  samples.forEach((sample, index) => {
    const weight = DECAY ** (samples.length - 1 - index);
    weightSum += weight;
    okSum += sample.ok ? weight : 0;
    failSum += sample.ok ? 0 : weight;
  });
  const recent = samples.slice(-RECOVERY_WINDOW);
  return {
    key,
    samples: samples.length,
    accuracy: weightSum === 0 ? 0 : okSum / weightSum,
    medianMs: median(samples.map((sample) => sample.ms)),
    weight: (failSum + 1) / (samples.length + 3),
    recovered:
      recent.length >= RECOVERY_WINDOW && recent.filter((s) => s.ok).length >= RECOVERY_HITS,
  };
}

export function keyStats(history: KeyHistory): KeyStat[] {
  return Object.entries(history).map(([key, samples]) => keyStat(key, samples));
}

/** Mediana de lo que se tarda, con todas las muestras de todas las teclas. */
export function globalMedianMs(history: KeyHistory): number {
  return median(Object.values(history).flatMap((samples) => samples.map((sample) => sample.ms)));
}

/**
 * Teclas débiles: con al menos `MIN_SAMPLES` muestras y (acierto a la primera bajo el 80 % **o** tiempo
 * mediano de más de 1,5 veces el global); lo de fallar se perdona al recuperarse (4 de las últimas
 * 5 a la primera). De más a menos débil.
 */
export function weakKeys(history: KeyHistory): KeyStat[] {
  const global = globalMedianMs(history);
  return keyStats(history)
    .filter(
      (stat) =>
        stat.samples >= MIN_SAMPLES &&
        // Fallar mucho se perdona al recuperarse; tardar mucho se ve en la mediana de la ventana.
        ((stat.accuracy < WEAK_ACCURACY && !stat.recovered) ||
          (global > 0 && stat.medianMs > WEAK_SLOWNESS * global)),
    )
    .sort((a, b) => b.weight - a.weight || b.medianMs - a.medianMs);
}

/** Cuando casi nada es débil: las teclas más lentas (con al menos 3 muestras). */
export function slowestKeys(history: KeyHistory, minSamples = 3): KeyStat[] {
  return keyStats(history)
    .filter((stat) => stat.samples >= minSamples)
    .sort((a, b) => b.medianMs - a.medianMs);
}
