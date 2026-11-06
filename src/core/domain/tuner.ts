import type { GuitarString } from './instrument';
import { REFERENCE_A4_HZ, midiToFrequency } from './pitch';
import { STANDARD_TUNING, tuningNote } from './tuning';
import type { Tuning } from './tuning';

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
export const READING_WINDOW_MS = 350;
/** Tras empezar a sonar, la cuerda «se asienta»: el ataque sube unos 10–30 cents un momento. */
export const SETTLE_MS = 250;
/** Sin lecturas durante este tiempo, vuelve a «sin sonido»; «Afinada» se deja ver más tiempo. */
export const SILENCE_MS = 500;
export const TUNED_SILENCE_MS = 2000;
/** Entre ±5 y ±15 cents la cuerda está «casi» (zona ámbar); más allá, claramente grave o aguda. */
export const NEAR_CENTS = 15;
/** A partir de aquí la cuerda está «muy» grave o aguda (se dice distinto). */
export const FAR_CENTS = 50;

/** Con qué afinación y qué La4 se mide (por omisión, la estándar con La4 = 440 Hz). */
export interface TuneOptions {
  readonly tuning?: Tuning;
  readonly referenceHz?: number;
}

/** Frecuencia de la cuerda al aire (por omisión, en afinación estándar con La4 = 440 Hz). */
export function stringFrequency(string: GuitarString, options: TuneOptions = {}): number {
  return midiToFrequency(
    tuningNote(options.tuning ?? STANDARD_TUNING, string),
    options.referenceHz ?? REFERENCE_A4_HZ,
  );
}

/** Cents que `frequency` se desvía de `target` (positivo = más aguda). */
export function centsFrom(target: number, frequency: number): number {
  return 1200 * Math.log2(frequency / target);
}

/** El intervalo de frecuencias donde se busca el tono de la cuerda elegida. */
export function searchRange(
  string: GuitarString,
  options: TuneOptions = {},
): { minHz: number; maxHz: number } {
  const target = stringFrequency(string, options);
  return {
    minHz: target * 2 ** (-SEARCH_CENTS / 1200),
    maxHz: target * 2 ** (SEARCH_CENTS / 1200),
  };
}

/** `afinando`: dentro de ±5 cents pero todavía sin sostenerlo el tiempo necesario. */
export type TunerStatus = 'sin-sonido' | 'baja' | 'alta' | 'afinando' | 'afinada';

export interface TunerState {
  readonly status: TunerStatus;
  /** Desviación (mediana de las lecturas recientes), redondeada; `null` sin sonido. */
  readonly cents: number | null;
  /** La desviación pasa de `FAR_CENTS`: «muy grave» / «muy aguda». */
  readonly far: boolean;
  /** Grave o aguda, pero a no más de `NEAR_CENTS` (la zona «casi»). */
  readonly near: boolean;
}

export const NO_SOUND: TunerState = { status: 'sin-sonido', cents: null, far: false, near: false };

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
  private soundSince: number | null = null;
  private inTuneSince: number | null = null;
  private state: TunerState = NO_SOUND;

  getState(): TunerState {
    return this.state;
  }

  reset(): TunerState {
    this.readings = [];
    this.lastReadingAt = -Infinity;
    this.soundSince = null;
    this.inTuneSince = null;
    this.state = NO_SOUND;
    return this.state;
  }

  /** `cents` es la desviación medida respecto a la cuerda, o `null` si no se oyó nada claro. */
  push(cents: number | null, at: number): TunerState {
    if (cents !== null) {
      this.lastReadingAt = at;
      this.soundSince ??= at;
      // Las lecturas del ataque (la cuerda sube unos cents al pulsarla) no entran en la mediana.
      if (at - this.soundSince >= SETTLE_MS) this.readings.push({ cents, at });
    } else if (
      at - this.lastReadingAt >=
      (this.state.status === 'afinada' ? TUNED_SILENCE_MS : SILENCE_MS)
    ) {
      return this.reset();
    }
    this.readings = this.readings.filter((reading) => at - reading.at <= READING_WINDOW_MS);
    // Sin sonido nuevo no se opina de nuevo (lo anterior se mantiene), y el ataque no cuenta.
    if (cents === null || this.soundSince === null) return this.state;
    if (at - this.soundSince < SETTLE_MS) return this.state;
    if (this.readings.length < MIN_READINGS) return this.state;

    const middle = median(this.readings.map((reading) => reading.cents));
    const rounded = Math.round(middle);
    const wasTuned = this.state.status === 'afinada';
    const limit = wasTuned ? OUT_OF_TUNE_CENTS : IN_TUNE_CENTS;

    if (Math.abs(middle) <= limit) {
      this.inTuneSince ??= at;
      const held = wasTuned || at - this.inTuneSince >= IN_TUNE_HOLD_MS;
      this.state = {
        status: held ? 'afinada' : 'afinando',
        cents: rounded,
        far: false,
        near: false,
      };
    } else {
      this.inTuneSince = null;
      this.state = {
        status: middle < 0 ? 'baja' : 'alta',
        cents: rounded,
        far: Math.abs(middle) > FAR_CENTS,
        near: Math.abs(middle) <= NEAR_CENTS,
      };
    }
    return this.state;
  }
}
