import { GUITAR_STRINGS } from './instrument';
import type { GuitarString } from './instrument';
import type { StringMarks } from './string-board';
import type { TunerStatus } from './tuner';

/**
 * El modo guiado «Afinar las 6»: una pasada por las cuerdas **de la grave a la aguda** (6→1). Cada cuerda
 * se da por buena cuando queda afinada y se sostiene un momento en verde; entonces la guía pasa a la
 * siguiente. En ese orden los parciales de una cuerda nunca caen en el intervalo de la siguiente, así que
 * lo que sigue sonando de la anterior no se confunde con la nueva. Todo es puro: el tiempo llega por parámetro.
 */

/** Cuánto se queda una cuerda afinada «en verde» antes de que la guía pase a la siguiente. */
export const ADVANCE_MS = 1500;

/** De la cuerda más grave a la más aguda. */
export const LOW_TO_HIGH: readonly GuitarString[] = [...GUITAR_STRINGS].reverse();

export type Lap = 1 | 2;

/** Una pasada de la guía: qué cuerdas toca, en qué punto va y cómo quedó cada una. */
export interface GuidedRun {
  /** Las cuerdas de esta pasada, en orden. */
  readonly queue: readonly GuitarString[];
  /** Posición actual; `queue.length` es «terminada». */
  readonly index: number;
  /** 1 la primera vuelta; 2 el repaso. */
  readonly lap: Lap;
  readonly paused: boolean;
  /** Los cents con los que quedó cada cuerda al darla por buena. */
  readonly finals: Readonly<Partial<Record<GuitarString, number>>>;
}

export function startRun(queue: readonly GuitarString[] = LOW_TO_HIGH, lap: Lap = 1): GuidedRun {
  return { queue, index: 0, lap, paused: false, finals: {} };
}

export function isFinished(run: GuidedRun): boolean {
  return run.index >= run.queue.length;
}

/** La cuerda que se afina ahora; `null` si la pasada terminó. */
export function currentString(run: GuidedRun): GuitarString | null {
  return run.queue[run.index] ?? null;
}

/** La que viene después; `null` si es la última. */
export function nextString(run: GuidedRun): GuitarString | null {
  return run.queue[run.index + 1] ?? null;
}

/**
 * Da por buena la cuerda actual con los `cents` con que quedó y pasa a la siguiente. Si ya terminó, no
 * hace nada.
 */
export function advance(run: GuidedRun, cents: number | null): GuidedRun {
  const string = currentString(run);
  if (string === null) return run;
  return {
    ...run,
    index: run.index + 1,
    finals: cents === null ? run.finals : { ...run.finals, [string]: cents },
  };
}

/** «Siguiente cuerda» sin haberla afinado. */
export function skip(run: GuidedRun): GuidedRun {
  return isFinished(run) ? run : { ...run, index: run.index + 1 };
}

/** Salta a una cuerda de la pasada (tocando su clavija) sin perder lo hecho; `null` si no está en ella. */
export function jumpTo(run: GuidedRun, string: GuitarString): GuidedRun | null {
  const index = run.queue.indexOf(string);
  return index === -1 ? null : { ...run, index };
}

export function setPaused(run: GuidedRun, paused: boolean): GuidedRun {
  return run.paused === paused ? run : { ...run, paused };
}

/**
 * ¿Hay que pasar a la siguiente cuerda? Cuando la cuerda lleva `ADVANCE_MS` seguidos «afinada». Devuelve
 * desde cuándo está afinada (`null` si ya no lo está) y si ya toca avanzar.
 */
export function holdProgress(
  status: TunerStatus,
  heldSince: number | null,
  at: number,
): { heldSince: number | null; advance: boolean } {
  if (status !== 'afinada') return { heldSince: null, advance: false };
  const since = heldSince ?? at;
  return { heldSince: since, advance: at - since >= ADVANCE_MS };
}

/** Las cuerdas que todavía no están afinadas (para «Seguir con las que faltan»), de la grave a la aguda. */
export function missingStrings(marks: StringMarks): GuitarString[] {
  return LOW_TO_HIGH.filter((string) => marks[string] !== 'afinada');
}

/** La pasada terminó y las seis cuerdas quedaron afinadas. */
export function isComplete(run: GuidedRun, marks: StringMarks): boolean {
  return isFinished(run) && missingStrings(marks).length === 0;
}
