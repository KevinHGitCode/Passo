import { ChordListener, DEFAULT_LISTENER_CONFIG } from '@/core/domain/chord-listener';
import type { ListenContext } from '@/core/domain/chord-listener';
import type { NoteEvent } from '@/core/domain/note-event';
import { SAMPLE_RATE, concat, mix, noise, pianoNote, silence } from '../support/synth';

const CONTEXT: ListenContext = { noiseRms: 0.002, tuningCents: 0, listening: true };
const DO_MAYOR = [60, 64, 67];

interface Heard {
  readonly event: NoteEvent;
  /** Instante de la corriente (ms) en que se entregó el evento. */
  readonly deliveredAt: number;
}

/** Alimenta el oyente con la señal en trozos, como lo haría el micrófono, y recoge los eventos. */
function run(
  listener: ChordListener,
  signal: Float32Array,
  options: { chunk?: number; sampleRate?: number; onChunk?: (positionMs: number) => void } = {},
): Heard[] {
  const { chunk = 1024, sampleRate = SAMPLE_RATE, onChunk } = options;
  const heard: Heard[] = [];
  for (let start = 0; start < signal.length; start += chunk) {
    const end = Math.min(signal.length, start + chunk);
    const endMs = (end / sampleRate) * 1000;
    onChunk?.(endMs);
    for (const event of listener.push(signal.subarray(start, end), sampleRate, endMs, CONTEXT)) {
      heard.push({ event, deliveredAt: endMs });
    }
  }
  return heard;
}

function chordAt(
  notes: readonly number[],
  seconds: number,
  total: number,
  extra: { gains?: readonly number[]; seed?: number } = {},
) {
  const parts = notes.map((midi, i) => ({
    signal: pianoNote(midi, {
      ms: total * 1000 - seconds * 1000,
      amplitude: 0.2,
      seed: (extra.seed ?? 1) + i,
    }),
    offsetMs: seconds * 1000,
    gain: extra.gains?.[i] ?? 1,
  }));
  return mix([{ signal: silence(total * 1000) }, ...parts]);
}

const withRoom = (signal: Float32Array, seed = 5) =>
  mix([{ signal }, { signal: noise('rosa', (signal.length / SAMPLE_RATE) * 1000, 0.002, seed) }]);

const ons = (heard: Heard[]) =>
  heard.filter((item) => item.event.type === 'on').map((item) => item.event.note);

describe('ChordListener', () => {
  it('oye un acorde completo: un «on» por nota, fechado en el ataque y tras la ventana de análisis', () => {
    const listener = new ChordListener();
    listener.setExpectation(DO_MAYOR);
    const heard = run(listener, withRoom(chordAt(DO_MAYOR, 1, 2.5)));
    expect(ons(heard)).toEqual(DO_MAYOR);
    expect(heard.every((item) => item.event.source === 'microfono')).toBe(true);
    for (const item of heard) {
      // El ataque fue a 1000 ms; la fecha del evento es la del ataque, no la de la medida.
      expect(item.event.at).toBeGreaterThan(980);
      expect(item.event.at).toBeLessThan(1030);
      // Se entrega después de saltar el martillo y medir (≈ 40 + 170 ms), sin tardar de más.
      expect(item.deliveredAt - 1000).toBeGreaterThanOrEqual(200);
      expect(item.deliveredAt - 1000).toBeLessThanOrEqual(330);
    }
  });

  it('sin acorde esperado no emite nada, aunque suene', () => {
    const listener = new ChordListener();
    expect(run(listener, withRoom(chordAt(DO_MAYOR, 1, 2)))).toEqual([]);
    listener.setExpectation(null);
    expect(run(listener, withRoom(chordAt(DO_MAYOR, 1, 2)))).toEqual([]);
    listener.setExpectation([60]);
    expect(listener.isActive()).toBe(false);
  });

  it('el silencio y el ruido de la sala no producen nada', () => {
    const listener = new ChordListener();
    listener.setExpectation(DO_MAYOR);
    expect(run(listener, withRoom(silence(3000)))).toEqual([]);
  });

  it('un acorde incompleto emite solo las notas que suenan', () => {
    const listener = new ChordListener();
    listener.setExpectation(DO_MAYOR);
    const heard = run(listener, withRoom(chordAt([60, 67], 1, 2.5)));
    expect(ons(heard)).toEqual([60, 67]);
  });

  it('cada ataque se juzga por sí solo: el siguiente suelta lo anterior (off) y vuelve a medir', () => {
    const listener = new ChordListener();
    listener.setExpectation(DO_MAYOR);
    const first = chordAt([60, 67], 1, 3.5);
    const second = chordAt(DO_MAYOR, 2.5, 3.5, { seed: 9 });
    const heard = run(listener, withRoom(mix([{ signal: first }, { signal: second }])));
    const sequence = heard.map((item) => `${item.event.type}:${item.event.note}`);
    expect(sequence).toEqual(['on:60', 'on:67', 'off:60', 'off:67', 'on:60', 'on:64', 'on:67']);
  });

  it('un acorde que se sostiene no se mide dos veces', () => {
    const listener = new ChordListener();
    listener.setExpectation(DO_MAYOR);
    const heard = run(listener, withRoom(chordAt(DO_MAYOR, 0.5, 5)));
    expect(ons(heard)).toEqual(DO_MAYOR);
    expect(heard.filter((item) => item.event.type === 'off')).toHaveLength(0);
  });

  it('cambiar el acorde esperado antes de medir descarta la medida pendiente', () => {
    const listener = new ChordListener();
    listener.setExpectation(DO_MAYOR);
    let changed = false;
    const heard = run(listener, withRoom(chordAt(DO_MAYOR, 1, 2.5)), {
      onChunk: (ms) => {
        if (!changed && ms > 1100) {
          changed = true;
          listener.setExpectation([65, 69, 72]);
        }
      },
    });
    expect(heard).toEqual([]);
  });

  it('el mismo acorde esperado otra vez no reinicia nada', () => {
    const listener = new ChordListener();
    listener.setExpectation(DO_MAYOR);
    let touched = false;
    const heard = run(listener, withRoom(chordAt(DO_MAYOR, 1, 2.5)), {
      onChunk: (ms) => {
        if (!touched && ms > 1100) {
          touched = true;
          listener.setExpectation([67, 60, 64]);
        }
      },
    });
    expect(ons(heard)).toEqual(DO_MAYOR);
  });

  it('un acorde pulsado de nuevo tras apagarse se vuelve a oír', () => {
    const listener = new ChordListener();
    listener.setExpectation(DO_MAYOR);
    const total = 5;
    const first = chordAt(DO_MAYOR, 0.5, total);
    // Se corta el sonido a los 1,5 s (la primera nota deja de sonar) y se vuelve a pulsar a los 3 s.
    const cut = concat(
      first.subarray(0, Math.round(1.5 * SAMPLE_RATE)),
      silence((total - 1.5) * 1000),
    );
    const again = chordAt(DO_MAYOR, 3, total, { seed: 20 });
    const heard = run(listener, withRoom(mix([{ signal: cut }, { signal: again }])));
    expect(ons(heard)).toEqual([...DO_MAYOR, ...DO_MAYOR]);
  });

  it('una nota de más clara se entrega con confianza «media» (la sesión la tratará como dudosa)', () => {
    const listener = new ChordListener();
    listener.setExpectation(DO_MAYOR);
    const heard = run(listener, withRoom(chordAt([...DO_MAYOR, 74], 1, 2.5)));
    const extra = heard.find((item) => item.event.note === 74);
    expect(extra?.event).toMatchObject({ type: 'on', confidence: 'media' });
    expect(ons(heard).filter((note) => DO_MAYOR.includes(note))).toEqual(DO_MAYOR);
  });

  it('con un acorde bien tocado la confianza es alta', () => {
    const listener = new ChordListener();
    listener.setExpectation(DO_MAYOR);
    const heard = run(listener, withRoom(chordAt(DO_MAYOR, 1, 2.5)));
    expect(heard.every((item) => item.event.confidence === 'alta')).toBe(true);
  });

  it('da igual el tamaño de los trozos con los que llegue el audio', () => {
    const signal = withRoom(chordAt(DO_MAYOR, 1, 2.5));
    const results = [256, 1024, 4096].map((chunk) => {
      const listener = new ChordListener();
      listener.setExpectation(DO_MAYOR);
      return ons(run(listener, signal, { chunk }));
    });
    expect(results).toEqual([DO_MAYOR, DO_MAYOR, DO_MAYOR]);
  });

  it('funciona a 44,1 kHz', () => {
    const sampleRate = 44100;
    const notes = DO_MAYOR.map((midi, i) =>
      pianoNote(midi, { ms: 1500, amplitude: 0.2, sampleRate, seed: i + 1 }),
    );
    const signal = concat(
      silence(1000, sampleRate),
      mix(
        notes.map((note) => ({ signal: note })),
        sampleRate,
      ),
    );
    const listener = new ChordListener();
    listener.setExpectation(DO_MAYOR);
    expect(ons(run(listener, signal, { sampleRate }))).toEqual(DO_MAYOR);
  });

  it('un clic o un golpe seco (sin tono) no completa nada', () => {
    const click = new Float32Array(SAMPLE_RATE * 2);
    for (let i = 0; i < 400; i++)
      click[SAMPLE_RATE + i] = ((Math.sin(i * 12.9898) * 43758.5453) % 1) * 0.5;
    const listener = new ChordListener();
    listener.setExpectation(DO_MAYOR);
    expect(ons(run(listener, withRoom(click)))).toEqual([]);
  });

  it('después de un reset sigue funcionando: vuelve a oír el siguiente acorde', () => {
    const listener = new ChordListener();
    listener.setExpectation(DO_MAYOR);
    run(listener, withRoom(chordAt(DO_MAYOR, 0.5, 1.5)));
    listener.reset(2000);
    expect(ons(run(listener, withRoom(chordAt(DO_MAYOR, 1, 2.5, { seed: 7 }))))).toEqual(DO_MAYOR);
  });

  it('guarda un registro de lo medido (para validar con un piano real): esperado, notas y su evidencia', () => {
    const listener = new ChordListener();
    listener.setExpectation(DO_MAYOR);
    run(listener, withRoom(chordAt([60, 67], 1, 2.5)));
    const log = listener.getLog();
    expect(log).toHaveLength(1);
    expect(log[0]?.expected).toEqual(DO_MAYOR);
    expect(log[0]?.notes.map((note) => [note.midi, note.present])).toEqual([
      [60, true],
      [64, false],
      [67, true],
    ]);
    expect(log[0]?.notes.every((note) => Number.isFinite(note.snr) && note.peak >= 0)).toBe(true);
    expect(Math.abs((log[0]?.at ?? 0) - 1000)).toBeLessThan(30);
  });

  it('el registro conserva exactamente las últimas mediciones (su tamaño es configurable)', () => {
    const listener = new ChordListener({ ...DEFAULT_LISTENER_CONFIG, logSize: 3 });
    listener.setExpectation(DO_MAYOR);
    const parts = Array.from({ length: 6 }, (_, i) => chordAt(DO_MAYOR, 0.2, 1.4, { seed: i + 1 }));
    run(listener, withRoom(concat(...parts)));
    const log = listener.getLog();
    expect(log).toHaveLength(3);
    const times = log.map((item) => item.at);
    expect(times).toEqual([...times].sort((x, y) => x - y));
    // Son las tres últimas: los ataques de los acordes 4.º, 5.º y 6.º (a 0,2 s dentro de cada trozo de 1,4 s).
    [4400, 5800, 7200].forEach((expected, i) =>
      expect(Math.abs((times[i] ?? 0) - expected)).toBeLessThan(40),
    );
  });

  it('el registro por defecto guarda 30 y se entrega como copia (no se puede alterar desde fuera)', () => {
    expect(DEFAULT_LISTENER_CONFIG.logSize).toBe(30);
    const listener = new ChordListener();
    listener.setExpectation(DO_MAYOR);
    run(listener, withRoom(chordAt(DO_MAYOR, 1, 2.5)));
    const log = listener.getLog() as unknown as unknown[];
    log.length = 0;
    expect(listener.getLog()).toHaveLength(1);
  });

  it('durante la calibración no mide ni deja rastro: después mide con normalidad', () => {
    const listener = new ChordListener();
    listener.setExpectation(DO_MAYOR);
    const signal = withRoom(chordAt(DO_MAYOR, 0.3, 3));
    const chunk = 1024;
    const heard: Heard[] = [];
    for (let start = 0; start < signal.length; start += chunk) {
      const end = Math.min(signal.length, start + chunk);
      const endMs = (end / SAMPLE_RATE) * 1000;
      // Los primeros 1,2 s el micrófono todavía calibra.
      const context = { ...CONTEXT, listening: endMs > 1200 };
      for (const event of listener.push(signal.subarray(start, end), SAMPLE_RATE, endMs, context)) {
        heard.push({ event, deliveredAt: endMs });
      }
    }
    expect(heard).toEqual([]);
    expect(listener.getLog()).toHaveLength(0);
    expect(ons(run(listener, withRoom(chordAt(DO_MAYOR, 1, 2.5, { seed: 4 }))))).toEqual(DO_MAYOR);
  });

  it('las notas de más se entregan antes que las esperadas (la sesión puede pasar al siguiente objetivo)', () => {
    const listener = new ChordListener();
    listener.setExpectation(DO_MAYOR);
    const heard = run(listener, withRoom(chordAt([...DO_MAYOR, 74], 1, 2.5)));
    const order = heard.map((item) => item.event.note);
    expect(order[0]).toBe(74);
    expect(order.slice(1)).toEqual(DO_MAYOR);
  });

  it('reset olvida el audio y suelta lo que sonaba', () => {
    const listener = new ChordListener();
    listener.setExpectation(DO_MAYOR);
    run(listener, withRoom(chordAt(DO_MAYOR, 0.5, 1.5)));
    const released = listener.reset(2000);
    expect(released.map((event) => `${event.type}:${event.note}`)).toEqual([
      'off:60',
      'off:64',
      'off:67',
    ]);
    expect(listener.reset(2100)).toEqual([]);
  });
});
