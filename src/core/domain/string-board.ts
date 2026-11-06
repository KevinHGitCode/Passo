import { GUITAR_STRINGS } from './instrument';
import type { GuitarString } from './instrument';

/**
 * Lo que el afinador recuerda de cada cuerda mientras está abierto. Solo se recuerda lo seguro: «afinada» y
 * «sin afinar». Un «grave» o «aguda» viejo engañaría (al tensar una cuerda, las demás se mueven un poco), así
 * que una cuerda afinada pasa a «revisar» a los 5 minutos, al empezar una segunda vuelta o si se la oye
 * desafinarse.
 */
export type StringMark = 'sin-afinar' | 'afinada' | 'revisar';
export type StringMarks = Readonly<Record<GuitarString, StringMark>>;

/** Una cuerda afinada deja de fiarse pasado este tiempo. */
export const REVIEW_AFTER_MS = 5 * 60_000;

interface Entry {
  readonly tunedAt: number | null;
  readonly review: boolean;
}

const BLANK: Entry = { tunedAt: null, review: false };

/** El estado recordado de las seis cuerdas. Inmutable: cada cambio devuelve otro tablero. */
export class StringBoard {
  private readonly entries: Readonly<Record<GuitarString, Entry>>;

  private constructor(entries: Readonly<Record<GuitarString, Entry>>) {
    this.entries = entries;
  }

  static empty(): StringBoard {
    return new StringBoard({ 1: BLANK, 2: BLANK, 3: BLANK, 4: BLANK, 5: BLANK, 6: BLANK });
  }

  markOf(string: GuitarString, now: number): StringMark {
    const entry = this.entries[string];
    if (entry.tunedAt === null) return 'sin-afinar';
    return entry.review || now - entry.tunedAt >= REVIEW_AFTER_MS ? 'revisar' : 'afinada';
  }

  marks(now: number): StringMarks {
    const marks = {} as Record<GuitarString, StringMark>;
    for (const string of GUITAR_STRINGS) marks[string] = this.markOf(string, now);
    return marks;
  }

  /** La cuerda quedó afinada en el instante `at`. */
  tuned(string: GuitarString, at: number): StringBoard {
    return this.with(string, { tunedAt: at, review: false });
  }

  /** Se oyó desafinarse una cuerda que estaba afinada: hay que revisarla. */
  drifted(string: GuitarString): StringBoard {
    const entry = this.entries[string];
    return entry.tunedAt === null || entry.review
      ? this
      : this.with(string, { tunedAt: entry.tunedAt, review: true });
  }

  /** Segunda vuelta: todas las cuerdas que estaban afinadas pasan a «revisar». */
  allForReview(): StringBoard {
    return GUITAR_STRINGS.reduce<StringBoard>((board, string) => board.drifted(string), this);
  }

  private with(string: GuitarString, entry: Entry): StringBoard {
    return new StringBoard({ ...this.entries, [string]: entry });
  }
}

export function sameMarks(a: StringMarks, b: StringMarks): boolean {
  return GUITAR_STRINGS.every((string) => a[string] === b[string]);
}
