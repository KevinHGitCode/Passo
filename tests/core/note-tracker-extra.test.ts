import { analyzeFrame } from '@/core/domain/frame-analysis';
import { NoteTracker } from '@/core/domain/note-tracker';
import { detectPitch, midiToFrequency } from '@/core/domain/pitch';
import { runPipeline, onsOf } from '../support/pipeline';
import {
  SAMPLE_RATE,
  concat,
  mix,
  noise,
  pianoNote,
  silence,
  sine,
  streamFrames,
  voice,
  withSnr,
} from '../support/synth';

const CALIBRATION = silence(1200);

function sequence(parts: Float32Array[], gapMs = 900) {
  const pieces: Float32Array[] = [CALIBRATION];
  for (const part of parts) {
    pieces.push(concat(part, silence(Math.max(0, gapMs - (part.length / SAMPLE_RATE) * 1000))));
  }
  pieces.push(silence(600));
  return concat(...pieces);
}

describe('confianza y octavas dudosas', () => {
  it('una nota limpia sale con confianza «alta»', () => {
    const ons = onsOf(runPipeline(sequence([pianoNote(64, { ms: 700 })])));
    expect(ons[0]?.event.confidence).toBe('alta');
  });

  it('con energía fuerte una octava por debajo (posible octava equivocada), la confianza baja a «media»', () => {
    const note = mix([
      { signal: pianoNote(60, { ms: 800, inharmonicity: 0 }) },
      { signal: sine(midiToFrequency(48), 800, 0.03) },
    ]);
    const estimate = detectPitch(note.slice(7200, 7200 + 2048), SAMPLE_RATE);
    expect(estimate?.subharmonicRatio ?? 0).toBeGreaterThan(0.15);
    const ons = onsOf(runPipeline(sequence([note])));
    expect(ons.map((item) => item.event.note)).toEqual([60]);
    expect(ons[0]?.event.confidence).toBe('media');
  });

  it('una nota normal tiene un subarmónico casi nulo', () => {
    const note = pianoNote(60, { ms: 800, inharmonicity: 0 });
    const estimate = detectPitch(note.slice(7200, 7200 + 2048), SAMPLE_RATE);
    expect(estimate?.subharmonicRatio ?? 1).toBeLessThan(0.1);
  });
});

describe('afinación extrema y ruido', () => {
  it.each([-45, 35])(
    'un teclado a %i cents de La4 = 440 sigue dando las notas correctas',
    (cents) => {
      const notes = [60, 62, 64, 65, 67, 60, 62, 64].map((midi) =>
        pianoNote(midi, { ms: 700, cents }),
      );
      const ons = onsOf(runPipeline(sequence(notes)));
      expect(ons.map((item) => item.event.note)).toEqual([60, 62, 64, 65, 67, 60, 62, 64]);
    },
  );

  it('con SNR de 10 dB se oyen ≥ 95 % de 20 notas y no hay notas falsas', () => {
    const midis = Array.from(
      { length: 20 },
      (_, i) => [60, 62, 64, 65, 67][(i * 3 + 1) % 5] as number,
    );
    const fixed = midis.map((m, i) => (i > 0 && midis[i - 1] === m ? (m === 60 ? 62 : 60) : m));
    const clean = sequence(
      fixed.map((midi, i) => pianoNote(midi, { ms: 600, seed: i })),
      1000,
    );
    const noisy = withSnr(clean, noise('rosa', 2000, 0.1, 5), 10);
    const heard = onsOf(runPipeline(noisy)).map((item) => item.event.note);
    let cursor = 0;
    let found = 0;
    for (const note of heard) {
      if (note === fixed[cursor]) {
        found += 1;
        cursor += 1;
      }
    }
    expect(found / fixed.length).toBeGreaterThanOrEqual(0.95);
    expect(heard.length - found).toBe(0);
  });

  it('un minuto de ruido rosa, ventilador y vocal lenta no produce ninguna nota', () => {
    const signal = concat(
      CALIBRATION,
      noise('rosa', 20000, 0.03, 3),
      noise('ventilador', 20000, 0.03, 4),
      voice(220, 20000, { fadeInMs: 900 }),
      silence(600),
    );
    expect(runPipeline(signal).events).toHaveLength(0);
  });
});

describe('teclas vecinas y notas casi simultáneas', () => {
  it('Do4 fuerte + Re4 a −6 dB: nunca sale una nota «alta» equivocada', () => {
    const dyad = mix([
      { signal: pianoNote(60, { ms: 900, inharmonicity: 0 }) },
      { signal: pianoNote(62, { ms: 900, inharmonicity: 0 }), gain: 0.5 },
    ]);
    const ons = onsOf(runPipeline(sequence([dyad], 1200)));
    for (const item of ons) {
      if (item.event.confidence === 'alta') expect(item.event.note).toBe(60);
    }
  });

  it('Do4 y 40 ms después Sol4: el segundo ataque (dentro del periodo refractario) no es una nota nueva', () => {
    const dyad = mix([
      { signal: pianoNote(60, { ms: 900 }) },
      { signal: pianoNote(67, { ms: 900 }), offsetMs: 40 },
    ]);
    const ons = onsOf(runPipeline(sequence([dyad], 1200)));
    expect(ons.some((item) => item.event.note === 67)).toBe(false);
  });
});

describe('avisos de señal y reinicio', () => {
  it('silencio digital exacto durante más de un segundo avisa «sin señal» (micrófono silenciado)', () => {
    expect(runPipeline(silence(5000)).hints).toContain('sin-senal');
  });

  it('con un ruido de fondo normal no avisa de «sin señal»', () => {
    expect(runPipeline(noise('rosa', 5000, 0.002)).hints).not.toContain('sin-senal');
  });

  it('restart() vuelve a calibrar pero conserva la afinación aprendida', () => {
    const detuned = [60, 62, 64, 65, 67, 60].map((midi) =>
      pianoNote(midi, { ms: 700, cents: -30 }),
    );
    const { tracker, state } = runPipeline(sequence(detuned));
    expect(state.tuningOffsetCents).not.toBeNull();
    const learned = state.tuningOffsetCents;
    tracker.restart(10000);
    expect(tracker.getState().phase).toBe('calibrando');
    expect(tracker.getState().tuningOffsetCents).toBe(learned);
  });

  it('tras reset() un sonido ya en marcha (sin ataque visible) no se toma por una nota nueva', () => {
    const tracker = new NoteTracker();
    const signal = concat(CALIBRATION, pianoNote(64, { ms: 3000 }));
    const events: string[] = [];
    let reset = false;
    streamFrames(signal, (window, newSamples, endAt) => {
      if (!reset && endAt > 2500) {
        reset = true;
        tracker.reset(endAt);
      }
      for (const event of tracker.push(analyzeFrame(window, newSamples, SAMPLE_RATE, endAt))) {
        if (endAt > 2500) events.push(event.type + event.note);
      }
    });
    expect(events.filter((item) => item.startsWith('on'))).toEqual([]);
  });

  it('una calibración con valores no finitos no deja el micrófono sordo', () => {
    const tracker = new NoteTracker();
    const bad = analyzeFrame(new Float32Array(2048).fill(Number.NaN), 1024, SAMPLE_RATE, 100);
    tracker.push(bad);
    streamFrames(concat(silence(1500), pianoNote(64, { ms: 700 }), silence(500)), (w, n, at) => {
      tracker.push(analyzeFrame(w, n, SAMPLE_RATE, at + 200));
    });
    expect(Number.isFinite(tracker.getState().gate)).toBe(true);
  });
});

describe('liberación de una tecla y ataque inmediato (la guardia de huecos no se lo traga)', () => {
  it.each([90, 120, 160, 220])(
    'una nota que se suelta (apagador) y otra %i ms después: se oyen las dos',
    (gapMs) => {
      const first = pianoNote(64, { ms: 500 }).map((value, index, all) => {
        const fadeStart = all.length - Math.round(0.03 * SAMPLE_RATE);
        return index < fadeStart
          ? value
          : (value * (all.length - index)) / (all.length - fadeStart);
      });
      const second = pianoNote(67, { ms: 600 });
      const signal = sequence([concat(first, silence(gapMs), second)], 1600);
      const notes = onsOf(runPipeline(signal)).map((item) => item.event.note);
      expect(notes).toEqual([64, 67]);
    },
  );
});
