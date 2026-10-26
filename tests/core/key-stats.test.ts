import {
  KEY_WINDOW,
  MIN_SAMPLES,
  addSamples,
  globalMedianMs,
  heatLevel,
  keyStat,
  samplesOf,
  slowestKeys,
  targetKey,
  weakKeys,
} from '@/core/domain/key-stats';
import type { KeyHistory, KeySample } from '@/core/domain/key-stats';
import { round } from '../support/rounds';

const ok = (ms = 1000): KeySample => ({ ok: true, ms });
const miss = (ms = 1000): KeySample => ({ ok: false, ms });
const many = (count: number, sample: KeySample): KeySample[] =>
  Array.from({ length: count }, () => sample);

describe('muestras por objetivo', () => {
  it('una muestra por objetivo: a la primera o no, y lo que tardó en acertar', () => {
    const attempts = round([
      { notes: [60], ms: 800 },
      { notes: [62], ms: 2000, firstTry: false },
      { notes: [64, 67], ms: 1500 },
    ]);
    expect(samplesOf(attempts)).toEqual([
      { key: '60', sample: { ok: true, ms: 800 } },
      { key: '62', sample: { ok: false, ms: 2000 } },
      { key: '64-67', sample: { ok: true, ms: 1500 } },
    ]);
  });

  it('un objetivo que nunca se acertó no deja muestra', () => {
    const attempts = round([{ ms: 1000 }]).slice(0, 0);
    expect(samplesOf(attempts)).toEqual([]);
  });

  it('la clave de un objetivo une sus notas', () => {
    expect(targetKey([60, 64, 67])).toBe('60-64-67');
  });

  it('solo se guardan las últimas diez muestras de cada tecla', () => {
    let history: KeyHistory = {};
    for (let i = 0; i < 14; i++) {
      history = addSamples(history, [{ key: '60', sample: { ok: i % 2 === 0, ms: i } }]);
    }
    const samples = history['60'] ?? [];
    expect(samples).toHaveLength(KEY_WINDOW);
    expect(samples[0]?.ms).toBe(4);
    expect(samples[KEY_WINDOW - 1]?.ms).toBe(13);
  });

  it('añadir no modifica el historial anterior', () => {
    const before: KeyHistory = { '60': [ok()] };
    const after = addSamples(before, [{ key: '60', sample: miss() }]);
    expect(before['60']).toHaveLength(1);
    expect(after['60']).toHaveLength(2);
  });
});

describe('estadística de una tecla', () => {
  it('lo reciente pesa más que lo antiguo', () => {
    const recentMisses = keyStat('60', [...many(5, ok()), ...many(5, miss())]);
    const oldMisses = keyStat('60', [...many(5, miss()), ...many(5, ok())]);
    expect(oldMisses.accuracy).toBeGreaterThan(recentMisses.accuracy);
    expect(recentMisses.accuracy).toBeLessThan(0.5);
  });

  it('el peso sube con los fallos: (fallos + 1) / (n + 3)', () => {
    const clean = keyStat('60', many(10, ok()));
    expect(clean.weight).toBeCloseTo(1 / 13, 6);
    const weak = keyStat('60', many(10, miss()));
    expect(weak.weight).toBeGreaterThan(clean.weight * 5);
  });

  it('la mediana es la del tiempo en acertar', () => {
    expect(keyStat('60', [ok(1000), ok(5000), ok(2000)]).medianMs).toBe(2000);
    expect(keyStat('60', [ok(1000), ok(3000)]).medianMs).toBe(2000);
    expect(keyStat('60', []).medianMs).toBe(0);
  });

  it('se recupera con 4 de las últimas 5 a la primera', () => {
    expect(keyStat('60', [...many(5, miss()), miss(), ok(), ok(), ok(), ok()]).recovered).toBe(
      true,
    );
    expect(keyStat('60', [...many(5, miss()), ok(), ok(), miss(), miss(), ok()]).recovered).toBe(
      false,
    );
    expect(keyStat('60', [ok(), ok(), ok(), ok()]).recovered).toBe(false);
  });
});

describe('teclas débiles', () => {
  it('con menos de 5 muestras nunca es débil (sale gris, no roja)', () => {
    expect(MIN_SAMPLES).toBe(5);
    expect(weakKeys({ '60': many(4, miss()) })).toEqual([]);
  });

  it('acertar menos del 80 % a la primera la hace débil', () => {
    const history: KeyHistory = {
      '60': [...many(4, miss()), ok(), ok(), miss(), ok()],
      '62': many(8, ok()),
    };
    expect(weakKeys(history).map((stat) => stat.key)).toEqual(['60']);
  });

  it('tardar más de 1,5 veces la mediana global también la hace débil', () => {
    const history: KeyHistory = {
      '60': many(6, ok(1000)),
      '62': many(6, ok(1000)),
      '64': many(6, ok(1000)),
      '65': many(6, ok(2600)),
    };
    expect(globalMedianMs(history)).toBe(1000);
    expect(weakKeys(history).map((stat) => stat.key)).toEqual(['65']);
  });

  it('una tecla recuperada sale de la lista', () => {
    const history: KeyHistory = { '60': [...many(6, miss()), ...many(5, ok())] };
    expect(weakKeys(history)).toEqual([]);
  });

  it('las ordena de más a menos débil', () => {
    const history: KeyHistory = {
      '60': [...many(4, ok()), ...many(2, miss())],
      '62': [...many(2, ok()), ...many(4, miss())],
    };
    // 4 aciertos y 2 fallos al final: peso menor; 2 y 4: mayor.
    expect(weakKeys(history).map((stat) => stat.key)).toEqual(['62', '60']);
  });

  it('si casi nada es débil, ofrece las más lentas (con al menos 3 muestras)', () => {
    const history: KeyHistory = {
      '60': many(6, ok(900)),
      '62': many(6, ok(1800)),
      '64': many(2, ok(9000)),
    };
    expect(slowestKeys(history).map((stat) => stat.key)).toEqual(['62', '60']);
  });
});

describe('mapa de calor', () => {
  const level = (samples: KeySample[]) => heatLevel(keyStat('60', samples));

  it('con menos de 5 muestras la tecla sale sin datos', () => {
    expect(level(many(4, miss()))).toBe('sin-datos');
    expect(level([])).toBe('sin-datos');
  });

  it('según el acierto (con más peso a lo reciente): fuerte, buena, media y débil', () => {
    expect(level(many(10, ok()))).toBe('fuerte');
    // Un fallo en mitad de la ventana: ~92 %.
    expect(level([...many(4, ok()), miss(), ...many(5, ok())])).toBe('buena');
    // Un fallo en el último intento pesa mucho: ~81 %.
    expect(level([...many(9, ok()), miss()])).toBe('media');
    expect(level([...many(8, miss()), ...many(2, ok())])).toBe('debil');
  });
});
