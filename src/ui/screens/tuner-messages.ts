import type { GuidedView, TunerSnapshot } from '@/core/application/tuner-service';
import type { GuitarString } from '@/core/domain/instrument';
import type { StringMark } from '@/core/domain/string-board';

/**
 * Los textos y las marcas del afinador, sin dibujar nada. Un solo vocabulario: «grave» y «aguda» dicen
 * **cómo está** la cuerda y la flecha (↑ súbela, ↓ bájala) dice **qué hacer**.
 */

/** Lo que se dice del estado de la cuerda, sin los cents (es lo único que anuncia el lector de pantalla). */
export function tunerStatusText(snapshot: Pick<TunerSnapshot, 'status' | 'far' | 'near'>): string {
  switch (snapshot.status) {
    case 'baja':
      if (snapshot.far) return 'Muy grave';
      return snapshot.near ? 'Casi, un poco grave' : 'Grave';
    case 'alta':
      if (snapshot.far) return 'Muy aguda';
      return snapshot.near ? 'Casi, un poco aguda' : 'Aguda';
    case 'afinando':
      return 'Afinando';
    case 'afinada':
      return 'Afinada';
    case 'sin-sonido':
      return '';
  }
}

/** La palabra corta de la etiqueta del medidor: «Casi» en la zona ámbar, si no, el estado. */
export function tunerChipText(snapshot: Pick<TunerSnapshot, 'status' | 'far' | 'near'>): string {
  if ((snapshot.status === 'baja' || snapshot.status === 'alta') && snapshot.near) return 'Casi';
  return tunerStatusText(snapshot);
}

/** El color del medidor: nada, fuera de tono, en la zona «casi» o afinando/afinada. */
export type TunerTone = 'none' | 'off' | 'near' | 'ok';

export function tunerTone(snapshot: Pick<TunerSnapshot, 'status' | 'near'>): TunerTone {
  switch (snapshot.status) {
    case 'sin-sonido':
      return 'none';
    case 'afinando':
    case 'afinada':
      return 'ok';
    case 'baja':
    case 'alta':
      return snapshot.near ? 'near' : 'off';
  }
}

export type HintIcon = 'up' | 'down' | 'wait' | 'check' | 'listen' | 'sound';

export interface TunerHint {
  readonly text: string;
  readonly icon: HintIcon | null;
}

/** La instrucción de debajo del medidor. */
export function tunerHint(
  snapshot: Pick<TunerSnapshot, 'status' | 'far' | 'near' | 'string' | 'tone'> & {
    readonly guided?: Pick<GuidedView, 'paused'> | null;
  },
  context: {
    readonly name: string;
    readonly listening: boolean;
    readonly weakHint: string | null;
    readonly loud?: boolean;
  },
): TunerHint {
  if (snapshot.guided?.paused === true) {
    return { text: 'Guía en pausa. Pulsa «Seguir» cuando quieras.', icon: 'wait' };
  }
  if (snapshot.tone) {
    return {
      text: 'Suena la nota de referencia. Escúchala y compárala con tu cuerda.',
      icon: 'sound',
    };
  }
  switch (snapshot.status) {
    case 'baja':
      if (snapshot.far) return { text: 'Aprieta la clavija: está muy grave.', icon: 'up' };
      return {
        text: snapshot.near ? 'Casi: sube un poquito la clavija.' : 'Aprieta un poco la clavija.',
        icon: 'up',
      };
    case 'alta':
      if (snapshot.far) {
        return {
          text: 'Afloja la clavija: está muy aguda. Baja por debajo de la nota y vuelve a subir.',
          icon: 'down',
        };
      }
      return {
        text: snapshot.near ? 'Casi: baja un poquito la clavija.' : 'Afloja un poco la clavija.',
        icon: 'down',
      };
    case 'afinando':
      return { text: 'Ahí está: mantén la cuerda sonando.', icon: 'wait' };
    case 'afinada':
      return { text: 'Lista. Puedes pasar a la siguiente cuerda.', icon: 'check' };
    case 'sin-sonido':
      if (!context.listening) return { text: '', icon: null };
      if (context.loud === true && context.weakHint === null) {
        return {
          text: `Oigo sonido, pero no distingo la cuerda ${snapshot.string}. Toca solo esa cuerda, firme, y acércate al micrófono.`,
          icon: 'listen',
        };
      }
      return {
        text:
          context.weakHint ??
          `Toca la cuerda ${snapshot.string} (${context.name}) al aire y déjala sonar.`,
        icon: 'listen',
      };
  }
}

/** Cómo se ve cada clavija: lo que se oye ahora (si es la elegida) o lo que se recuerda de ella. */
export type PegKey = 'pend' | 'sube' | 'baja' | 'listo' | 'revisar' | 'sig';

export interface PegVisual {
  readonly key: PegKey;
  /** La marca del círculo (siempre con texto en la etiqueta: nunca solo color). */
  readonly badge: string;
  /** Para el lector de pantalla y las leyendas. */
  readonly word: string;
}

const PEGS: Readonly<Record<PegKey, PegVisual>> = {
  pend: { key: 'pend', badge: '', word: 'sin afinar' },
  sube: { key: 'sube', badge: '↑', word: 'grave: súbela' },
  baja: { key: 'baja', badge: '↓', word: 'aguda: bájala' },
  listo: { key: 'listo', badge: '✓', word: 'afinada' },
  revisar: { key: 'revisar', badge: '↻', word: 'revisar' },
  sig: { key: 'sig', badge: '→', word: 'la siguiente' },
};

const FROM_MARK: Readonly<Record<StringMark, PegKey>> = {
  'sin-afinar': 'pend',
  afinada: 'listo',
  revisar: 'revisar',
};

export function pegVisual(
  snapshot: Pick<TunerSnapshot, 'status' | 'string' | 'strings'> & {
    readonly guided?: Pick<GuidedView, 'next' | 'finished'> | null;
  },
  string: GuitarString,
): PegVisual {
  if (string === snapshot.string) {
    if (snapshot.status === 'baja') return PEGS.sube;
    if (snapshot.status === 'alta') return PEGS.baja;
    if (snapshot.status === 'afinada') return PEGS.listo;
  }
  // En la guía, la cuerda que viene después se marca con una flecha (si aún no está afinada).
  const guide = snapshot.guided;
  if (guide && !guide.finished && guide.next === string && snapshot.strings[string] !== 'afinada') {
    return PEGS.sig;
  }
  return PEGS[FROM_MARK[snapshot.strings[string]]];
}

/** «la más aguda» / «la más grave» para los extremos; nada para las demás. */
export function stringRole(string: GuitarString): string {
  return string === 1 ? 'la más aguda' : string === 6 ? 'la más grave' : '';
}

const HZ = new Intl.NumberFormat('es', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatHz(hz: number): string {
  return HZ.format(hz);
}

/** «−22», «+3», «0» (con el signo menos de verdad). */
export function formatCents(cents: number): string {
  if (cents > 0) return `+${cents}`;
  if (cents < 0) return `−${Math.abs(cents)}`;
  return '0';
}

/** Los consejos de «Cómo afinar bien». */
export const TUNING_TIPS: readonly string[] = [
  'Toca una sola cuerda, suave, y silencia las demás con la mano.',
  'Con cuerdas nuevas: estíralas con cuidado y repite la afinación varias veces.',
  'No subas más de un tono las cuerdas 1 y 2: se pueden romper.',
  'Pon el micrófono a 20–30 cm de la boca de la guitarra y lejos del ventilador.',
  'Comprobación por oído: pisa el traste 5 de una cuerda (el 4 en la cuerda 3) y compárala con la siguiente al aire: no deben oírse batidos. La cuerda 1 no tiene siguiente.',
];
