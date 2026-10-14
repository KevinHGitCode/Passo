import {
  detectPitch,
  frequencyToMidiFloat,
  midiToFrequency,
  nearestNote,
} from '@/core/domain/pitch';
import {
  SAMPLE_RATE,
  highpass,
  noise,
  pianoNote,
  reverb,
  saturate,
  silence,
  sine,
  mix,
  voice,
  withSnr,
} from '../support/synth';

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('Se esperaba un valor');
  return value;
}

/** Ventana de 2048 muestras tomada 150 ms después del ataque. */
function windowOf(signal: Float32Array, startMs = 150, size = 2048): Float32Array {
  const start = Math.round((startMs / 1000) * SAMPLE_RATE);
  return signal.slice(start, start + size);
}

function centsBetween(frequency: number, expectedMidi: number): number {
  return (frequencyToMidiFloat(frequency) - expectedMidi) * 100;
}

describe('conversiones de frecuencia', () => {
  it('La4 = 440 Hz, Do4 ≈ 261,63 Hz y una octava duplica', () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 6);
    expect(midiToFrequency(60)).toBeCloseTo(261.6256, 3);
    expect(midiToFrequency(81)).toBeCloseTo(880, 6);
  });

  it('nearestNote devuelve la nota más cercana y la desviación en cents', () => {
    const exact = nearestNote(440);
    expect(exact.midi).toBe(69);
    expect(exact.cents).toBeCloseTo(0, 6);
    const sharp = nearestNote(442);
    expect(sharp.midi).toBe(69);
    expect(sharp.cents).toBeCloseTo(7.85, 1);
    const flat = nearestNote(midiToFrequency(60) * 2 ** (-30 / 1200));
    expect(flat.midi).toBe(60);
    expect(flat.cents).toBeCloseTo(-30, 3);
  });

  it('el offset de afinación recentra un teclado desafinado', () => {
    const detuned = midiToFrequency(64) * 2 ** (-45 / 1200); // 45 cents por debajo
    expect(nearestNote(detuned).midi).toBe(64);
    // 55 cents por debajo: sin offset se confunde con la nota de abajo; con offset acierta.
    const veryFlat = midiToFrequency(64) * 2 ** (-55 / 1200);
    expect(nearestNote(veryFlat).midi).toBe(63);
    expect(nearestNote(veryFlat, -50).midi).toBe(64);
  });
});

describe('detectPitch · señales limpias', () => {
  it.each([48, 52, 55, 60, 62, 64, 65, 67, 69, 72, 76, 79, 84])(
    'senoide en MIDI %i con error ≤ 2 cents',
    (midi) => {
      const estimate = detectPitch(sine(midiToFrequency(midi), 400), SAMPLE_RATE);
      expect(estimate).not.toBeNull();
      expect(Math.abs(centsBetween(must(estimate).frequency, midi))).toBeLessThanOrEqual(2);
      expect(must(estimate).clarity).toBeGreaterThan(0.95);
    },
  );

  it.each([48, 52, 55, 60, 62, 64, 65, 67, 69, 72, 76, 79, 84])(
    'piano con armónicos exactos en MIDI %i: error ≤ 5 cents',
    (midi) => {
      const note = pianoNote(midi, { inharmonicity: 0 });
      const estimate = detectPitch(windowOf(note), SAMPLE_RATE);
      expect(estimate).not.toBeNull();
      expect(Math.abs(centsBetween(must(estimate).frequency, midi))).toBeLessThanOrEqual(5);
    },
  );

  it.each([60, 62, 64, 65, 67])('piano con inarmonicidad real en MIDI %i: ≤ 12 cents', (midi) => {
    const note = pianoNote(midi, { inharmonicity: 0.0006 });
    const estimate = detectPitch(windowOf(note), SAMPLE_RATE);
    expect(estimate).not.toBeNull();
    expect(Math.abs(centsBetween(must(estimate).frequency, midi))).toBeLessThanOrEqual(12);
  });

  it('funciona igual a 44,1 kHz', () => {
    const note = pianoNote(64, { sampleRate: 44100, inharmonicity: 0 });
    const start = Math.round(0.15 * 44100);
    const estimate = detectPitch(note.slice(start, start + 2048), 44100);
    expect(estimate).not.toBeNull();
    expect(Math.abs(centsBetween(must(estimate).frequency, 64))).toBeLessThanOrEqual(5);
  });

  it('una nota desafinada se mide con su desviación', () => {
    const note = pianoNote(64, { cents: 25, inharmonicity: 0 });
    const estimate = detectPitch(windowOf(note), SAMPLE_RATE);
    expect(centsBetween(must(estimate).frequency, 64)).toBeGreaterThan(20);
    expect(centsBetween(must(estimate).frequency, 64)).toBeLessThan(30);
  });
});

describe('detectPitch · cadena acústica realista', () => {
  const chains: [string, (s: Float32Array) => Float32Array][] = [
    ['altavoz pequeño (pasa-altos 200 Hz)', (s) => highpass(s, 200)],
    ['saturación', (s) => saturate(s, 3)],
    ['sala con reverberación 0,6 s', (s) => reverb(s, 0.6).slice(0, s.length)],
    [
      'todo junto + ruido rosa a 15 dB',
      (s) =>
        withSnr(
          reverb(saturate(highpass(s, 200), 2), 0.4).slice(0, s.length),
          noise('rosa', 2000, 0.1),
          15,
        ),
    ],
  ];

  for (const [name, chain] of chains) {
    it.each([60, 62, 64, 65, 67, 72, 79])(`MIDI %i con ${name}: nota correcta`, (midi) => {
      const note = chain(pianoNote(midi, { ms: 1200, inharmonicity: 0.0004 }));
      const estimate = detectPitch(windowOf(note), SAMPLE_RATE);
      expect(estimate).not.toBeNull();
      expect(Math.abs(centsBetween(must(estimate).frequency, midi))).toBeLessThanOrEqual(12);
    });
  }

  it('con la fundamental muy débil (altavoz pequeño) sigue dando la nota en C4', () => {
    const note = pianoNote(60, { fundamentalGain: 0.08 });
    const estimate = detectPitch(windowOf(note), SAMPLE_RATE);
    expect(estimate).not.toBeNull();
    expect(Math.abs(centsBetween(must(estimate).frequency, 60))).toBeLessThanOrEqual(12);
  });
});

describe('detectPitch · lo que NO debe parecer una nota', () => {
  it('el silencio no tiene altura', () => {
    expect(detectPitch(silence(100), SAMPLE_RATE)).toBeNull();
  });

  it.each(['blanco', 'rosa', 'ventilador'] as const)('el ruido %s tiene baja claridad', (kind) => {
    const estimate = detectPitch(noise(kind, 100, 0.1), SAMPLE_RATE);
    // El zumbido del ventilador es periódico a 120 Hz; el resto no.
    if (estimate !== null && kind !== 'ventilador') expect(estimate.clarity).toBeLessThan(0.75);
  });

  it('dos teclas a la vez (Do4 + Sol4) no producen una «fundamental virtual» creíble', () => {
    const dyad = mix([
      { signal: pianoNote(60, { inharmonicity: 0 }) },
      { signal: pianoNote(67, { inharmonicity: 0 }) },
    ]);
    const estimate = detectPitch(windowOf(dyad), SAMPLE_RATE);
    if (estimate !== null) {
      const isVirtualC3 = Math.abs(centsBetween(estimate.frequency, 48)) < 50;
      if (isVirtualC3) expect(estimate.fundamentalRatio).toBeLessThan(0.03);
    }
  });

  it('Do4 + Do5 se lee como Do4 (la fundamental está presente)', () => {
    const octave = mix([
      { signal: pianoNote(60, { inharmonicity: 0 }) },
      { signal: pianoNote(72, { inharmonicity: 0 }) },
    ]);
    const estimate = detectPitch(windowOf(octave), SAMPLE_RATE);
    expect(estimate).not.toBeNull();
    expect(Math.abs(centsBetween(must(estimate).frequency, 60))).toBeLessThanOrEqual(12);
    expect(must(estimate).fundamentalRatio).toBeGreaterThan(0.3);
  });

  it('una voz sí es periódica: la detección la ve, por eso el ataque es obligatorio en el tracker', () => {
    const estimate = detectPitch(windowOf(voice(220, 800), 300), SAMPLE_RATE);
    expect(estimate).not.toBeNull();
  });
});

describe('detectPitch · coste', () => {
  it('una ventana de 2048 muestras se analiza en menos de 2 ms (mediana)', () => {
    const window = windowOf(pianoNote(64, { ms: 600 }));
    detectPitch(window, SAMPLE_RATE); // calentamiento
    const times: number[] = [];
    for (let i = 0; i < 60; i++) {
      const start = performance.now();
      detectPitch(window, SAMPLE_RATE);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    expect(times[Math.floor(times.length / 2)]).toBeLessThan(2);
  });
});
