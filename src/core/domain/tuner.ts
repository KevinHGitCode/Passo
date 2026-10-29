import { GUITAR_OPEN } from './instrument';
import type { GuitarString } from './instrument';
import { midiToFrequency } from './pitch';

/**
 * El afinador de guitarra. La persona elige la cuerda y se mide contra **esa** cuerda (no contra el
 * semitono más cercano): una cuerda muy floja se lee como floja, no como otra nota.
 */

/** Hasta dónde se busca el tono alrededor de la cuerda elegida (±300 cents = tres semitonos). */
export const SEARCH_CENTS = 300;
/** Se considera afinada con la mediana dentro de ±5 cents durante este tiempo… */
export const IN_TUNE_CENTS = 5;
export const IN_TUNE_HOLD_MS = 600;
/** …y deja de estarlo al salir de ±8 (así no parpadea alrededor del límite). */
export const OUT_OF_TUNE_CENTS = 8;
/** Lecturas mínimas para opinar, y cuánto tiempo hacia atrás cuentan. */
export const MIN_READINGS = 5;
export const READING_WINDOW_MS = 700;
/** Sin lecturas durante este tiempo, vuelve a «sin sonido». */
export const SILENCE_MS = 500;
/** A partir de aquí la cuerda está «muy» floja o tirante (se dice distinto). */
export const FAR_CENTS = 50;

/** Frecuencia de la cuerda al aire en afinación estándar (La4 = 440 Hz). */
export function stringFrequency(string: GuitarString): number {
  return midiToFrequency(GUITAR_OPEN[string - 1] as number);
}

/** Cents que `frequency` se desvía de `target` (positivo = más aguda). */
export function centsFrom(target: number, frequency: number): number {
  return 1200 * Math.log2(frequency / target);
}

/** El intervalo de frecuencias donde se busca el tono de la cuerda elegida. */
export function searchRange(string: GuitarString): { minHz: number; maxHz: number } {
  const target = stringFrequency(string);
  return {
    minHz: target * 2 ** (-SEARCH_CENTS / 1200),
    maxHz: target * 2 ** (SEARCH_CENTS / 1200),
  };
}

export type TunerStatus = 'sin-sonido' | 'baja' | 'alta' | 'casi' | 'afinada';

export interface TunerState {
  readonly status: TunerStatus;
  /** Desviación (mediana de las lecturas recientes), redondeada; `null` sin sonido. */
  readonly cents: number | null;
  /** La desviación pasa de `FAR_CENTS`: «muy floja» / «muy tirante». */
  readonly far: boolean;
}

export const NO_SOUND: TunerState = { status: 'sin-sonido', cents: null, far: false };

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

/**
 * Convierte las lecturas de tono (una por fotograma, ~20 ms) en un estado estable. Lógica pura: el
 * tiempo llega con cada lectura. Con ±5 cents sostenidos 600 ms «afina»; sale a ±8.
 */
export class TunerTracker {
  private readings: { cents: number; at: number }[] = [];
  private lastReadingAt = -Infinity;
  private inTuneSince: number | null = null;
  private state: TunerState = NO_SOUND;

  getState(): TunerState {
    return this.state;
  }

  reset(): TunerState {
    this.readings = [];
    this.lastReadingAt = -Infinity;
    this.inTuneSince = null;
    this.state = NO_SOUND;
    return this.state;
  }

  /** `cents` es la desviación medida respecto a la cuerda, o `null` si no se oyó nada claro. */
  push(cents: number | null, at: number): TunerState {
    if (cents !== null) {
      this.readings.push({ cents, at });
      this.lastReadingAt = at;
    } else if (at - this.lastReadingAt >= SILENCE_MS) {
      return this.reset();
    }
    this.readings = this.readings.filter((reading) => at - reading.at <= READING_WINDOW_MS);
    if (this.readings.length < MIN_READINGS) return this.state;

    const middle = median(this.readings.map((reading) => reading.cents));
    const rounded = Math.round(middle);
    const wasTuned = this.state.status === 'afinada';
    const limit = wasTuned ? OUT_OF_TUNE_CENTS : IN_TUNE_CENTS;

    if (Math.abs(middle) <= limit) {
      this.inTuneSince ??= at;
      const held = wasTuned || at - this.inTuneSince >= IN_TUNE_HOLD_MS;
      this.state = { status: held ? 'afinada' : 'casi', cents: rounded, far: false };
    } else {
      this.inTuneSince = null;
      this.state = {
        status: middle < 0 ? 'baja' : 'alta',
        cents: rounded,
        far: Math.abs(middle) > FAR_CENTS,
      };
    }
    return this.state;
  }
}
