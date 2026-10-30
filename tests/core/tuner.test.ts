import {
  FAR_CENTS,
  IN_TUNE_HOLD_MS,
  MIN_READINGS,
  OUT_OF_TUNE_CENTS,
  SEARCH_CENTS,
  SETTLE_MS,
  SILENCE_MS,
  TUNED_SILENCE_MS,
  TunerTracker,
  centsFrom,
  searchRange,
  stringFrequency,
} from '@/core/domain/tuner';

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

describe('TunerTracker', () => {
  it('sin lecturas no opina', () => {
    const tracker = new TunerTracker();
    expect(tracker.getState()).toEqual({ status: 'sin-sonido', cents: null, far: false });
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
    expect(low.getState()).toEqual({ status: 'baja', cents: -20, far: false });

    const high = new TunerTracker();
    feed(high, 0, 400, 35);
    expect(high.getState()).toEqual({ status: 'alta', cents: 35, far: false });

    const far = new TunerTracker();
    feed(far, 0, 400, -(FAR_CENTS + 40));
    expect(far.getState()).toMatchObject({ status: 'baja', far: true });
  });

  it('dentro de ±5 cents pasa por «casi» y solo tras 600 ms queda «afinada»', () => {
    const tracker = new TunerTracker();
    const end = feed(tracker, 0, 450, 2);
    expect(tracker.getState().status).toBe('casi');
    feed(tracker, end, IN_TUNE_HOLD_MS, 2);
    expect(tracker.getState()).toEqual({ status: 'afinada', cents: 2, far: false });
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
    expect(['casi', 'afinada']).toContain(tracker.getState().status);
  });

  it('el vibrato de ±20 cents a 5,5 Hz promedia cerca de la nota', () => {
    const tracker = new TunerTracker();
    feed(tracker, 0, 3000, (t) => -10 + 20 * Math.sin((2 * Math.PI * 5.5 * t) / 1000));
    const state = tracker.getState();
    expect(state.cents).not.toBeNull();
    expect(Math.abs(state.cents ?? 99)).toBeLessThanOrEqual(15);
  });

  it('tras el silencio vuelve a «sin sonido» y olvida lo anterior', () => {
    const tracker = new TunerTracker();
    const end = feed(tracker, 0, 1000, 0);
    expect(tracker.getState().status).toBe('afinada');
    const lastReading = end - 20;
    // «Afinada» se deja ver unos segundos tras callarse la cuerda (el nailon se apaga pronto).
    tracker.push(null, lastReading + SILENCE_MS + 1);
    expect(tracker.getState().status).toBe('afinada');
    tracker.push(null, lastReading + TUNED_SILENCE_MS - 1);
    expect(tracker.getState().status).toBe('afinada');
    tracker.push(null, lastReading + TUNED_SILENCE_MS + 1);
    expect(tracker.getState()).toEqual({ status: 'sin-sonido', cents: null, far: false });
    // Con pocas lecturas nuevas todavía no opina (lo anterior se olvidó).
    feed(tracker, end + 3000, 60, 0);
    expect(tracker.getState().status).toBe('sin-sonido');
  });

  it('reset deja el estado de partida', () => {
    const tracker = new TunerTracker();
    feed(tracker, 0, 1000, 0);
    expect(tracker.reset().status).toBe('sin-sonido');
  });
});
