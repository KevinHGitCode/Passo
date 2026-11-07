import {
  FAR_CENTS,
  IN_TUNE_HOLD_MS,
  MIN_READINGS,
  OUT_OF_TUNE_CENTS,
  SEARCH_CENTS,
  SETTLE_MS,
  FORGET_MS,
  STALE_MS,
  autoSearchRange,
  nearestString,
  TunerTracker,
  centsFrom,
  searchRange,
  stringFrequency,
} from '@/core/domain/tuner';
import { STANDARD_TUNING } from '@/core/domain/tuning';

/** Una lectura cada 20 ms durante `ms`, con la desviación que da `cents(t)`. */
function feed(
  tracker: TunerTracker,
  from: number,
  ms: number,
  cents: number | ((t: number) => number),
): number {
  let at = from;
  for (; at < from + ms; at += 20) {
    tracker.push(typeof cents === 'function' ? cents(at - from) : cents, at);
  }
  return at;
}

describe('frecuencias de las cuerdas', () => {
  it('afinación estándar: 329,63 · 246,94 · 196,00 · 146,83 · 110,00 · 82,41 Hz', () => {
    const hz = [1, 2, 3, 4, 5, 6].map((s) => stringFrequency(s as 1 | 2 | 3 | 4 | 5 | 6));
    expect(hz.map((value) => Math.round(value * 100) / 100)).toEqual([
      329.63, 246.94, 196, 146.83, 110, 82.41,
    ]);
  });

  it('centsFrom: una octava son 1200 cents y el signo dice si sube o baja', () => {
    expect(centsFrom(100, 200)).toBeCloseTo(1200, 6);
    expect(centsFrom(100, 50)).toBeCloseTo(-1200, 6);
    expect(centsFrom(110, 110)).toBe(0);
    expect(centsFrom(110, 110 * 2 ** (30 / 1200))).toBeCloseTo(30, 6);
  });

  it('el intervalo de búsqueda es ±300 cents de la cuerda', () => {
    const { minHz, maxHz } = searchRange(6);
    expect(centsFrom(stringFrequency(6), minHz)).toBeCloseTo(-SEARCH_CENTS, 6);
    expect(centsFrom(stringFrequency(6), maxHz)).toBeCloseTo(SEARCH_CENTS, 6);
    // La octava de la cuerda queda fuera: el afinador no la confunde con la cuerda.
    expect(2 * stringFrequency(6)).toBeGreaterThan(maxHz);
  });
});

describe('el modo automático: qué cuerda suena', () => {
  it('la cuerda al aire más cercana y los cents que se desvía', () => {
    expect(nearestString(stringFrequency(5))).toMatchObject({ string: 5, cents: 0 });
    const flat = nearestString(stringFrequency(2) * 2 ** (-35 / 1200));
    expect(flat.string).toBe(2);
    expect(flat.cents).toBeCloseTo(-35, 6);
    // Entre la 4 y la 3 gana la más cercana.
    expect(nearestString(stringFrequency(4) * 2 ** (180 / 1200)).string).toBe(4);
    expect(nearestString(stringFrequency(3) * 2 ** (-180 / 1200)).string).toBe(3);
  });

  it('el intervalo de búsqueda va de la 6 a la 1 con margen', () => {
    const range = autoSearchRange();
    expect(range.minHz).toBeLessThan(stringFrequency(6));
    expect(range.maxHz).toBeGreaterThan(stringFrequency(1));
  });
});

describe('TunerTracker', () => {
  it('sin lecturas no opina', () => {
    const tracker = new TunerTracker();
    expect(tracker.getState()).toEqual({
      status: 'sin-sonido',
      cents: null,
      far: false,
      near: false,
      stale: false,
    });
    tracker.push(null, 0);
    expect(tracker.getState().status).toBe('sin-sonido');
  });

  it('necesita unas cuantas lecturas antes de opinar', () => {
    const tracker = new TunerTracker();
    for (let i = 0; i < MIN_READINGS - 1; i++) tracker.push(-20, i * 20);
    expect(tracker.getState().status).toBe('sin-sonido');
  });

  it('el ataque no cuenta: los primeros 250 ms tras el silencio no dan «grave» ni «aguda»', () => {
    const tracker = new TunerTracker();
    // La cuerda sube 10–30 cents un momento tras pulsarla y luego se asienta en su sitio.
    feed(tracker, 0, SETTLE_MS - 20, 28);
    expect(tracker.getState().status).toBe('sin-sonido');
    feed(tracker, SETTLE_MS - 20, 400, 0);
    expect(tracker.getState().status).not.toBe('alta');
  });

  it('una cuerda que se asienta en su sitio no llega a decir «aguda»', () => {
    const tracker = new TunerTracker();
    const seen = new Set<string>();
    for (let at = 0; at < 1500; at += 20) {
      // +25 cents al atacar, bajando a 0 en lo que dura el asentamiento (≈ 250 ms).
      tracker.push(Math.max(0, 25 - (25 * at) / SETTLE_MS), at);
      seen.add(tracker.getState().status);
    }
    expect(seen.has('alta')).toBe(false);
    expect(tracker.getState().status).toBe('afinada');
  });

  it('floja, tirante y muy floja', () => {
    const low = new TunerTracker();
    feed(low, 0, 400, -20);
    expect(low.getState()).toEqual({
      status: 'baja',
      cents: -20,
      far: false,
      near: false,
      stale: false,
    });

    const high = new TunerTracker();
    feed(high, 0, 400, 35);
    expect(high.getState()).toEqual({
      status: 'alta',
      cents: 35,
      far: false,
      near: false,
      stale: false,
    });

    const far = new TunerTracker();
    feed(far, 0, 400, -(FAR_CENTS + 40));
    expect(far.getState()).toMatchObject({ status: 'baja', far: true });
  });

  it('dentro de ±5 cents pasa por «afinando» y solo tras 600 ms queda «afinada»', () => {
    const tracker = new TunerTracker();
    const end = feed(tracker, 0, 450, 2);
    expect(tracker.getState().status).toBe('afinando');
    feed(tracker, end, IN_TUNE_HOLD_MS, 2);
    expect(tracker.getState()).toEqual({
      status: 'afinada',
      cents: 2,
      far: false,
      near: false,
      stale: false,
    });
  });

  it('un tirón breve no cuenta: hay que sostenerlo', () => {
    const tracker = new TunerTracker();
    const end = feed(tracker, 0, 300, 20);
    feed(tracker, end, 200, 1);
    expect(tracker.getState().status).not.toBe('afinada');
  });

  it('histéresis: afinada aguanta hasta ±8 y sale pasados ±8', () => {
    const tracker = new TunerTracker();
    let at = feed(tracker, 0, 1000, 0);
    expect(tracker.getState().status).toBe('afinada');
    at = feed(tracker, at, 800, OUT_OF_TUNE_CENTS - 1);
    expect(tracker.getState().status).toBe('afinada');
    feed(tracker, at, 800, OUT_OF_TUNE_CENTS + 3);
    expect(tracker.getState()).toMatchObject({ status: 'alta', cents: 11 });
  });

  it('antes de afinar, ±6 todavía no entra (el listón de entrada es ±5)', () => {
    const tracker = new TunerTracker();
    feed(tracker, 0, 1500, 6);
    expect(tracker.getState().status).toBe('alta');
  });

  it('una lectura suelta fuera de sitio no cambia la mediana', () => {
    const tracker = new TunerTracker();
    const values = [-3, 2, -1, 40, 1, -2, 0];
    let at = 0;
    for (let round = 0; round < 6; round++) {
      for (const value of values) {
        tracker.push(value, at);
        at += 20;
      }
    }
    expect(['afinando', 'afinada']).toContain(tracker.getState().status);
  });

  it('el vibrato de ±20 cents a 5,5 Hz promedia cerca de la nota', () => {
    const tracker = new TunerTracker();
    feed(tracker, 0, 3000, (t) => -10 + 20 * Math.sin((2 * Math.PI * 5.5 * t) / 1000));
    const state = tracker.getState();
    expect(state.cents).not.toBeNull();
    expect(Math.abs(state.cents ?? 99)).toBeLessThanOrEqual(15);
  });

  it('al callarse la cuerda la aguja se queda, atenuada, y solo se olvida mucho después', () => {
    const tracker = new TunerTracker();
    const end = feed(tracker, 0, 1000, -20);
    expect(tracker.getState()).toMatchObject({ status: 'baja', cents: -20, stale: false });
    const lastReading = end - 20;
    tracker.push(null, lastReading + STALE_MS - 1);
    expect(tracker.getState()).toMatchObject({ cents: -20, stale: false });
    tracker.push(null, lastReading + STALE_MS + 1);
    expect(tracker.getState()).toMatchObject({ status: 'baja', cents: -20, stale: true });
    tracker.push(null, lastReading + FORGET_MS - 1);
    expect(tracker.getState()).toMatchObject({ status: 'baja', cents: -20, stale: true });
    tracker.push(null, lastReading + FORGET_MS + 1);
    expect(tracker.getState()).toMatchObject({ status: 'sin-sonido', cents: null, stale: false });
  });

  it('un sonido nuevo tras el silencio devuelve la lectura a «fresca» y mide de cero', () => {
    const tracker = new TunerTracker();
    const end = feed(tracker, 0, 1000, -20);
    tracker.push(null, end + STALE_MS + 500);
    expect(tracker.getState().stale).toBe(true);
    feed(tracker, end + 3000, 1000, 12);
    expect(tracker.getState()).toMatchObject({ status: 'alta', cents: 12, stale: false });
  });

  it('reset deja el estado de partida', () => {
    const tracker = new TunerTracker();
    feed(tracker, 0, 1000, 0);
    expect(tracker.reset().status).toBe('sin-sonido');
  });
});

describe('la zona «casi» (de ±5 a ±15 cents)', () => {
  it('grave o aguda pero cerca se marca como «near»; más allá, no', () => {
    const near = new TunerTracker();
    feed(near, 0, 800, -12);
    expect(near.getState()).toMatchObject({ status: 'baja', cents: -12, near: true, far: false });
    const edge = new TunerTracker();
    feed(edge, 0, 800, 15);
    expect(edge.getState()).toMatchObject({ status: 'alta', near: true });
    const away = new TunerTracker();
    feed(away, 0, 800, 18);
    expect(away.getState()).toMatchObject({ status: 'alta', near: false });
  });

  it('afinada o afinando nunca son «near» (esa es otra zona)', () => {
    const tracker = new TunerTracker();
    feed(tracker, 0, 1200, 2);
    expect(tracker.getState()).toMatchObject({ status: 'afinada', near: false });
  });
});

describe('La4 y afinaciones', () => {
  it('con La4 = 442 todas las cuerdas suben lo mismo (≈ 7,85 cents)', () => {
    const standard = stringFrequency(5);
    const raised = stringFrequency(5, { referenceHz: 442 });
    expect(centsFrom(standard, raised)).toBeCloseTo(1200 * Math.log2(442 / 440), 6);
    expect(raised).toBeCloseTo(110 * (442 / 440), 6);
  });

  it('con La4 = 432 la cuerda 5 (La) da 108 Hz', () => {
    expect(stringFrequency(5, { referenceHz: 432 })).toBeCloseTo(108, 6);
  });

  it('el intervalo de búsqueda sigue a La4', () => {
    const { minHz, maxHz } = searchRange(6, { referenceHz: 432 });
    expect(centsFrom(stringFrequency(6, { referenceHz: 432 }), minHz)).toBeCloseTo(
      -SEARCH_CENTS,
      6,
    );
    expect(maxHz).toBeLessThan(searchRange(6).maxHz);
  });

  it('una afinación propia desplaza las cuerdas que cambian (Re bajo: la 6 baja un tono)', () => {
    const dropD = { ...STANDARD_TUNING, open: [64, 59, 55, 50, 45, 38] };
    expect(centsFrom(stringFrequency(6), stringFrequency(6, { tuning: dropD }))).toBeCloseTo(
      -200,
      6,
    );
    expect(stringFrequency(5, { tuning: dropD })).toBeCloseTo(stringFrequency(5), 6);
  });
});
