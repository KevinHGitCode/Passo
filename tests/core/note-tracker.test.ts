import {
  SAMPLE_RATE,
  concat,
  highpass,
  mix,
  noise,
  pianoNote,
  reverb,
  saturate,
  silence,
  sine,
  voice,
  withSnr,
} from '../support/synth';
import { onsOf, runPipeline } from '../support/pipeline';

/** Un segundo de silencio para la calibración y luego lo que se pida. */
const CALIBRATION = silence(1200);

function notes(...midis: number[]) {
  return midis.map((midi) => pianoNote(midi, { ms: 700 }));
}

/** Notas separadas por `gapMs` desde 1,2 s. Devuelve la señal y el instante real de cada ataque. */
function sequence(parts: Float32Array[], gapMs = 900) {
  const onsets: number[] = [];
  const pieces: Float32Array[] = [CALIBRATION];
  let at = 1200;
  for (const part of parts) {
    onsets.push(at);
    const padded = concat(part, silence(Math.max(0, gapMs - (part.length / SAMPLE_RATE) * 1000)));
    pieces.push(padded);
    at += gapMs;
  }
  pieces.push(silence(600));
  return { signal: concat(...pieces), onsets };
}

describe('NoteTracker · notas aisladas', () => {
  it('no emite nada durante la calibración ni con silencio', () => {
    const result = runPipeline(silence(6000));
    expect(result.events).toHaveLength(0);
    expect(result.state.phase).toBe('escuchando');
  });

  it('una nota: un on con la nota correcta, un off, y la hora del ataque con ±15 ms', () => {
    const { signal, onsets } = sequence(notes(64));
    const result = runPipeline(signal);
    const ons = onsOf(result);
    expect(ons).toHaveLength(1);
    expect(ons[0]?.event.note).toBe(64);
    expect(ons[0]?.event.source).toBe('microfono');
    expect(Math.abs((ons[0]?.event.at ?? 0) - (onsets[0] ?? 0))).toBeLessThanOrEqual(15);
    expect(result.events.filter((item) => item.event.type === 'off')).toHaveLength(1);
  });

  it('la nota se confirma rápido: ≤ 130 ms después del ataque', () => {
    const { signal, onsets } = sequence(notes(60));
    const ons = onsOf(runPipeline(signal));
    expect((ons[0]?.emittedAt ?? 0) - (onsets[0] ?? 0)).toBeLessThanOrEqual(130);
  });

  it.each([60, 62, 64, 65, 67, 72, 79, 84, 48])('reconoce MIDI %i', (midi) => {
    const { signal } = sequence(notes(midi));
    const ons = onsOf(runPipeline(signal));
    expect(ons.map((item) => item.event.note)).toEqual([midi]);
  });

  it('una secuencia Do-Re-Mi-Fa-Sol sale en el mismo orden', () => {
    const { signal } = sequence(notes(60, 62, 64, 65, 67));
    const ons = onsOf(runPipeline(signal));
    expect(ons.map((item) => item.event.note)).toEqual([60, 62, 64, 65, 67]);
  });

  it('la velocidad refleja la fuerza del ataque', () => {
    const soft = onsOf(runPipeline(sequence([pianoNote(64, { ms: 700, amplitude: 0.03 })]).signal));
    const hard = onsOf(runPipeline(sequence([pianoNote(64, { ms: 700, amplitude: 0.6 })]).signal));
    expect(hard[0]?.event.velocity ?? 0).toBeGreaterThan(soft[0]?.event.velocity ?? 0);
  });
});

describe('NoteTracker · la misma nota repetida', () => {
  it.each([1000, 600])('la misma nota cada %i ms da un ataque cada vez', (gap) => {
    const { signal } = sequence(notes(64, 64, 64), gap);
    const ons = onsOf(runPipeline(signal));
    expect(ons.map((item) => item.event.note)).toEqual([64, 64, 64]);
  });

  it('un ataque más flojo que el anterior (−6 dB) también cuenta a 1,5 s', () => {
    const loud = pianoNote(64, { ms: 700, amplitude: 0.4 });
    const soft = pianoNote(64, { ms: 700, amplitude: 0.2 });
    const ons = onsOf(runPipeline(sequence([loud, soft], 1500).signal));
    expect(ons).toHaveLength(2);
  });

  it('un solo toque sostenido largo no produce un segundo ataque', () => {
    const long = pianoNote(64, { ms: 3000 });
    const { signal } = sequence([long], 3200);
    expect(onsOf(runPipeline(signal))).toHaveLength(1);
  });
});

describe('NoteTracker · lo que NO es una nota', () => {
  it.each(['blanco', 'rosa', 'ventilador'] as const)(
    'ruido %s constante: ningún evento',
    (kind) => {
      const result = runPipeline(noise(kind, 12000, 0.02));
      expect(result.events).toHaveLength(0);
    },
  );

  it('el ruido de fondo no impide oír una nota (SNR 15 dB)', () => {
    const base = sequence(notes(64, 67)).signal;
    const signal = withSnr(base, noise('rosa', 9000, 0.05), 15);
    // El ruido está también durante la calibración: el umbral se adapta.
    const ons = onsOf(runPipeline(signal));
    expect(ons.map((item) => item.event.note)).toEqual([64, 67]);
  });

  it('una vocal sostenida que entra despacio (700 ms) no es un ataque', () => {
    const result = runPipeline(
      concat(CALIBRATION, voice(220, 3000, { fadeInMs: 700 }), silence(600)),
    );
    expect(onsOf(result)).toHaveLength(0);
  });

  it('un glissando de voz sostenido tampoco', () => {
    const result = runPipeline(
      concat(CALIBRATION, voice(180, 3000, { endHz: 330, fadeInMs: 700 }), silence(600)),
    );
    expect(onsOf(result)).toHaveLength(0);
  });

  it('dos teclas a la vez (Do4 + Sol4) no dan una nota: la fundamental virtual se rechaza', () => {
    const dyad = mix([
      { signal: pianoNote(60, { ms: 900, inharmonicity: 0 }) },
      { signal: pianoNote(67, { ms: 900, inharmonicity: 0 }) },
    ]);
    const ons = onsOf(runPipeline(sequence([dyad]).signal));
    expect(ons).toHaveLength(0);
  });

  it('Do4 + Mi4 (fuera del rango fiable como fundamental virtual) tampoco', () => {
    const dyad = mix([
      { signal: pianoNote(60, { ms: 900, inharmonicity: 0 }) },
      { signal: pianoNote(64, { ms: 900, inharmonicity: 0 }) },
    ]);
    expect(onsOf(runPipeline(sequence([dyad]).signal))).toHaveLength(0);
  });

  it('una nota por debajo del rango fiable (Mi2) no se acepta', () => {
    expect(onsOf(runPipeline(sequence(notes(40)).signal))).toHaveLength(0);
  });

  it('una senoide pura sin ataque (zumbido que se enciende lento) no cuenta', () => {
    const swell = sine(262, 3000, 0.2).map(
      (value, i) => value * Math.min(1, i / (0.7 * SAMPLE_RATE)),
    );
    expect(onsOf(runPipeline(concat(CALIBRATION, swell, silence(600))))).toHaveLength(0);
  });
});

describe('NoteTracker · toque suave y sonido de fondo', () => {
  it('un toque suave (ataque de 25 ms) también se oye', () => {
    const soft = [60, 64, 67].map((midi) =>
      pianoNote(midi, { ms: 700, attackMs: 25, amplitude: 0.08 }),
    );
    const ons = onsOf(runPipeline(sequence(soft).signal));
    expect(ons.map((item) => item.event.note)).toEqual([60, 64, 67]);
  });

  it('con una nota larga de fondo a −20 dB, las notas nuevas se siguen oyendo', () => {
    const base = sequence(notes(62, 65)).signal;
    const hum = concat(silence(1200), sine(220, base.length / 48 - 1200, 0.03));
    const ons = onsOf(runPipeline(mix([{ signal: base }, { signal: hum }])));
    expect(ons.map((item) => item.event.note)).toEqual([62, 65]);
  });
});

describe('NoteTracker · cadena acústica real', () => {
  const chain = (s: Float32Array) =>
    withSnr(
      reverb(saturate(highpass(s, 200), 2), 0.5).slice(0, s.length),
      noise('rosa', s.length / 48, 0.1),
      18,
    );

  it('altavoz pequeño + saturación + sala + ruido: las 5 notas del nivel 1', () => {
    const { signal } = sequence(notes(60, 62, 64, 65, 67));
    const ons = onsOf(runPipeline(chain(signal)));
    expect(ons.map((item) => item.event.note)).toEqual([60, 62, 64, 65, 67]);
  });

  it('fundamental muy débil en Do4: sigue siendo Do4', () => {
    const weak = pianoNote(60, { ms: 700, fundamentalGain: 0.08 });
    expect(onsOf(runPipeline(sequence([weak]).signal)).map((item) => item.event.note)).toEqual([
      60,
    ]);
  });
});

describe('NoteTracker · afinación del teclado', () => {
  it.each([-30, -10, 10, 30])(
    'un teclado desafinado %i cents sigue dando la nota correcta',
    (cents) => {
      const detuned = [60, 62, 64, 65, 67, 60, 62].map((midi) =>
        pianoNote(midi, { ms: 700, cents }),
      );
      const ons = onsOf(runPipeline(sequence(detuned).signal));
      expect(ons.map((item) => item.event.note)).toEqual([60, 62, 64, 65, 67, 60, 62]);
    },
  );

  it('estima la afinación tras 5 notas (−30 cents reales ≈ −24,5 medidos: el piano sintético es 5,5 cents agudo por inarmonicidad)', () => {
    const detuned = [60, 62, 64, 65, 67, 60].map((midi) =>
      pianoNote(midi, { ms: 700, cents: -30 }),
    );
    const { state } = runPipeline(sequence(detuned).signal);
    expect(state.tuningOffsetCents).not.toBeNull();
    expect(Math.abs((state.tuningOffsetCents ?? 0) + 24.5)).toBeLessThanOrEqual(6);
  });

  it('un teclado afinado a 440 Hz da una estimación cercana a 0', () => {
    const exact = [60, 62, 64, 65, 67].map((midi) =>
      pianoNote(midi, { ms: 700, inharmonicity: 0 }),
    );
    const { state } = runPipeline(sequence(exact).signal);
    expect(Math.abs(state.tuningOffsetCents ?? 99)).toBeLessThanOrEqual(6);
  });
});

describe('NoteTracker · avisos', () => {
  it('avisa de saturación cuando el pico llega al máximo', () => {
    const loud = pianoNote(64, { ms: 700, amplitude: 1.2 }).map((v) =>
      Math.max(-1, Math.min(1, v)),
    );
    expect(runPipeline(sequence([loud]).signal).hints).toContain('saturado');
  });

  it('avisa de «débil» cuando suena algo por debajo del umbral', () => {
    const faint = pianoNote(64, { ms: 1200, amplitude: 0.0045 });
    const result = runPipeline(concat(CALIBRATION, faint, silence(600)));
    expect(onsOf(result)).toHaveLength(0);
    expect(result.hints).toContain('debil');
  });

  it('avisa de «ruidoso» si el ambiente es muy ruidoso al calibrar', () => {
    const result = runPipeline(noise('blanco', 4000, 0.06));
    expect(result.hints).toContain('ruidoso');
  });

  it('un ataque que no se deja identificar da «confuso», no una nota', () => {
    const clap = noise('blanco', 80, 0.5).map((v, i) => v * Math.exp(-i / 800));
    const result = runPipeline(concat(CALIBRATION, clap, silence(1500)));
    expect(onsOf(result)).toHaveLength(0);
    expect(result.hints).toContain('confuso');
  });
});

describe('NoteTracker · reset y estado', () => {
  it('reset() suelta la nota en curso', () => {
    const { signal } = sequence([pianoNote(64, { ms: 3000 })], 3200);
    const result = runPipeline(signal.slice(0, Math.round(2.0 * SAMPLE_RATE)));
    expect(result.state.heard?.midi).toBe(64);
    const events = result.tracker.reset(2000);
    expect(events).toEqual([{ type: 'off', note: 64, velocity: 0, at: 2000, source: 'microfono' }]);
    expect(result.tracker.getState().heard).toBeNull();
  });

  it('informa el avance de la calibración', () => {
    const half = runPipeline(silence(700));
    expect(half.state.phase).toBe('calibrando');
    expect(half.state.calibration).toBeGreaterThan(0.4);
    expect(half.state.calibration).toBeLessThan(1);
  });
});
