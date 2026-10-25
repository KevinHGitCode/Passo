import { chordComplete, verifyChord } from '@/core/domain/chord-verifier';
import type { ChordVerdict } from '@/core/domain/chord-verifier';
import { createSeededRng } from '@/core/domain/rng';
import {
  SAMPLE_RATE,
  highpass,
  mix,
  noise,
  pianoNote,
  rmsOf,
  samplesFor,
  silence,
} from '../support/synth';

const N = 8192;
const SKIP_MS = 40;

interface Scenario {
  /** Notas que suenan de verdad. */
  readonly played: readonly number[];
  /** Ganancia de cada nota (por defecto 1). */
  readonly gains?: readonly number[];
  /** Retraso de cada nota respecto a la primera, en ms (arpegio rápido o acorde algo desigual). */
  readonly strum?: readonly number[];
  readonly noiseKind?: 'blanco' | 'rosa' | 'ventilador';
  readonly snrDb?: number;
  readonly highpassHz?: number;
  readonly fundamentalGain?: number;
  /** Desafinación real del teclado, en cents. */
  readonly cents?: number;
  /** Afinación que el verificador conoce (la estimada por el seguimiento); 0 si no se sabe. */
  readonly knownCents?: number;
  /** Notas de un acorde anterior que todavía suenan (bajo) antes del ataque. */
  readonly previous?: readonly number[];
  /** Volumen del acorde anterior (1 = el de las notas nuevas). */
  readonly previousGain?: number;
  /** Notas que la medición anterior de este acorde dio por presentes. */
  readonly held?: readonly number[];
  readonly seed?: number;
}

/** Devuelve las ventanas antes y después del ataque, como las vería el verificador. */
function render(scenario: Scenario) {
  const { played, gains = [], strum = [], seed = 1, previous = [] } = scenario;
  const lead = 1500;
  const tail = 600;
  const total = lead + tail + 400;
  const chord = mix([
    { signal: silence(total) },
    ...played.map((midi, i) => ({
      signal: pianoNote(midi, {
        ms: tail + 400,
        seed: seed + i,
        amplitude: 0.2,
        fundamentalGain: scenario.fundamentalGain ?? 1,
        cents: scenario.cents ?? 0,
      }),
      offsetMs: lead + (strum[i] ?? 0),
      gain: gains[i] ?? 1,
    })),
  ]);
  // Un acorde anterior que sigue sonando (el piano sostiene varios segundos).
  const old = mix([
    { signal: silence(total) },
    ...previous.map((midi, i) => ({
      signal: pianoNote(midi, { ms: total, seed: 50 + i, amplitude: 0.2, t60: 4 }),
      gain: scenario.previousGain ?? 1,
    })),
  ]);
  let signal = mix([{ signal: chord }, { signal: old }]);
  if (scenario.highpassHz) signal = highpass(signal, scenario.highpassHz);
  // El ruido de la sala se fija respecto al volumen del acorde (o a un nivel fijo si no suena nada).
  const reference = played.length > 0 ? rmsOf(chord) : 0.05;
  const noiseRms = reference / 10 ** ((scenario.snrDb ?? 30) / 20);
  const room = noise(scenario.noiseKind ?? 'rosa', total, noiseRms, 11 + seed);
  const noisy = mix([{ signal }, { signal: room }]);
  const onset = samplesFor(lead);
  const preEnd = onset - samplesFor(20);
  const pre = noisy.slice(preEnd - N, preEnd);
  const post = noisy.slice(onset + samplesFor(SKIP_MS), onset + samplesFor(SKIP_MS) + N);
  return { pre, post, noiseRms, tuningCents: scenario.knownCents ?? 0, held: scenario.held ?? [] };
}

function verify(expected: readonly number[], scenario: Scenario): ChordVerdict {
  const { pre, post, noiseRms, tuningCents, held } = render(scenario);
  return verifyChord({ post, pre, sampleRate: SAMPLE_RATE, expected, noiseRms, tuningCents, held });
}

const presentOf = (verdict: ChordVerdict) =>
  verdict.notes.filter((note) => note.present).map((note) => note.midi);

const DO_MAYOR = [60, 64, 67];
const FA_MAYOR = [65, 69, 72];
const SOL_MAYOR = [67, 71, 74];
const LA_MENOR = [69, 72, 76];
const RE_MENOR = [62, 65, 69];
const MI_MENOR = [64, 67, 71];
const CHORDS = [DO_MAYOR, FA_MAYOR, SOL_MAYOR, LA_MENOR, RE_MENOR, MI_MENOR];

describe('verifyChord · un acorde completo', () => {
  it('detecta las tres notas de Do mayor y ninguna nota de más', () => {
    const verdict = verify(DO_MAYOR, { played: DO_MAYOR });
    expect(presentOf(verdict)).toEqual(DO_MAYOR);
    expect(chordComplete(verdict)).toBe(true);
    expect(verdict.extras).toEqual([]);
  });

  it('con los seis acordes de la mano derecha', () => {
    for (const chord of CHORDS) {
      const verdict = verify(chord, { played: chord, seed: chord[0] ?? 0 });
      expect(presentOf(verdict), chord.join('-')).toEqual(chord);
      expect(verdict.extras, chord.join('-')).toEqual([]);
    }
  });

  it('también una tercera (dos notas)', () => {
    const verdict = verify([62, 65], { played: [62, 65] });
    expect(chordComplete(verdict)).toBe(true);
  });
});

describe('verifyChord · lo que falta', () => {
  it('una nota que no suena se marca como ausente y las otras como presentes', () => {
    for (const chord of CHORDS) {
      for (let missing = 0; missing < chord.length; missing++) {
        const played = chord.filter((_, i) => i !== missing);
        const verdict = verify(chord, { played, seed: (chord[0] ?? 0) + missing });
        const absent = verdict.notes.filter((note) => !note.present).map((note) => note.midi);
        expect(absent, `${chord.join('-')} sin ${chord[missing]}`).toEqual([chord[missing]]);
      }
    }
  });

  it('solo la fundamental: faltan la tercera y la quinta', () => {
    const verdict = verify(DO_MAYOR, { played: [60] });
    expect(presentOf(verdict)).toEqual([60]);
  });

  it('silencio o solo ruido de la sala: ninguna presente ni de más', () => {
    for (const kind of ['blanco', 'rosa', 'ventilador'] as const) {
      const verdict = verify(DO_MAYOR, { played: [], noiseKind: kind, snrDb: 20 });
      expect(presentOf(verdict), kind).toEqual([]);
      expect(verdict.extras, kind).toEqual([]);
    }
  });

  it('una tecla vecina en vez de la tercera (Fa en lugar de Mi): la tercera falta', () => {
    const verdict = verify(DO_MAYOR, { played: [60, 65, 67] });
    expect(verdict.notes.find((note) => note.midi === 64)?.present).toBe(false);
    expect(verdict.notes.find((note) => note.midi === 60)?.present).toBe(true);
    expect(verdict.notes.find((note) => note.midi === 67)?.present).toBe(true);
  });

  it('la tercera una octava más grave (Mi3 en vez de Mi4): no cuenta, aunque su 2.º armónico caiga en Mi4', () => {
    const verdict = verify(DO_MAYOR, { played: [60, 52, 67] });
    expect(verdict.notes.find((note) => note.midi === 64)?.present).toBe(false);
  });
});

describe('verifyChord · condiciones reales del Yamaha con micrófono de portátil', () => {
  it('con las notas a distinto volumen (±6 dB)', () => {
    const verdict = verify(DO_MAYOR, { played: DO_MAYOR, gains: [1, 0.5, 1.6] });
    expect(chordComplete(verdict)).toBe(true);
  });

  it('con el acorde algo desigual (las notas entran con hasta 40 ms de diferencia)', () => {
    const verdict = verify(DO_MAYOR, { played: DO_MAYOR, strum: [0, 25, 40] });
    expect(chordComplete(verdict)).toBe(true);
  });

  it('con altavoz pequeño: sin graves (filtro paso alto) y fundamental débil', () => {
    const verdict = verify(DO_MAYOR, {
      played: DO_MAYOR,
      highpassHz: 220,
      fundamentalGain: 0.5,
    });
    expect(chordComplete(verdict)).toBe(true);
  });

  it('con ruido de ventilador a 20 dB', () => {
    const verdict = verify(FA_MAYOR, { played: FA_MAYOR, noiseKind: 'ventilador', snrDb: 20 });
    expect(chordComplete(verdict)).toBe(true);
  });

  it('con un acorde anterior que sigue sonando bajito: el nuevo se reconoce y no se cuela el viejo', () => {
    const verdict = verify(SOL_MAYOR, { played: SOL_MAYOR, previous: DO_MAYOR });
    expect(chordComplete(verdict)).toBe(true);
    // Tocar solo Sol y Si (sin Re) tras Do mayor: el Mi o el Do viejos no deben hacer pasar nada.
    const partial = verify(MI_MENOR, { played: [67, 71], previous: DO_MAYOR });
    expect(partial.notes.find((note) => note.midi === 64)?.present).toBe(false);
  });
});

describe('verifyChord · notas de más', () => {
  it('una nota lejana y clara se detecta como de más', () => {
    const verdict = verify(DO_MAYOR, { played: [...DO_MAYOR, 74] });
    expect(verdict.extras).toContain(74);
  });

  it('los armónicos del propio acorde no se confunden con notas de más (Do5 es el 2.º armónico de Do4)', () => {
    for (const chord of CHORDS) {
      const verdict = verify(chord, {
        played: chord,
        fundamentalGain: 0.4,
        seed: 77 + (chord[0] ?? 0),
      });
      expect(verdict.extras, chord.join('-')).toEqual([]);
    }
  });
});

describe('verifyChord · el semitono vecino no es la nota esperada', () => {
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
  // [esperadas, tocadas, la esperada que falta]: la tecla de al lado en lugar de la correcta.
  const cases: [string, number[], number[], number][] = [
    ['Mi–Sol tocando Fa–Sol', [64, 67], [65, 67], 64],
    ['Re–Fa tocando Re–Mi', [62, 65], [62, 64], 65],
    ['Si–Re tocando Do–Re', [71, 74], [72, 74], 71],
    ['Do–Mi tocando Do–Re#', [60, 64], [60, 63], 64],
    ['Sol–Si–Re tocando Fa#–Si–Re', [67, 71, 74], [66, 71, 74], 67],
    ['Do–Mi–Sol tocando Do–Fa–Sol', [60, 64, 67], [60, 65, 67], 64],
  ];

  for (const [name, expected, played, missing] of cases) {
    it(`${name}: la nota que falta no se da por buena (0 de 8 falsos aciertos)`, () => {
      let leaks = 0;
      let flaggedExtra = 0;
      for (const seed of SEEDS) {
        const verdict = verify(expected, { played, seed });
        if (verdict.notes.find((note) => note.midi === missing)?.present) leaks += 1;
        if (verdict.extras.some((extra) => !expected.includes(extra))) flaggedExtra += 1;
      }
      expect(leaks).toBe(0);
      // Y además se señala la nota vecina que sí sonó como «de más».
      expect(flaggedExtra).toBeGreaterThanOrEqual(6);
    });
  }

  it('las notas tocadas de verdad junto a una vecina de más siguen sin colarse como completas', () => {
    const verdict = verify([64, 67], { played: [64, 65, 67] });
    expect(chordComplete(verdict) && verdict.extras.length === 0).toBe(false);
  });
});

describe('verifyChord · una octava más grave con un altavoz sin graves', () => {
  it('Do–Mi–Sol una octava abajo no completa el acorde (paso alto de 250 Hz y fundamental débil)', () => {
    let accepted = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const verdict = verify(DO_MAYOR, {
        played: [48, 52, 55],
        highpassHz: 250,
        fundamentalGain: 0.3,
        seed,
      });
      if (chordComplete(verdict)) accepted += 1;
    }
    expect(accepted).toBe(0);
  });

  it('con las fundamentales intactas tampoco', () => {
    expect(chordComplete(verify(DO_MAYOR, { played: [48, 52, 55] }))).toBe(false);
  });

  it('y una nota que cae en 1,5 veces otra del acorde (Re5 sobre Sol4) no tumba al Sol4 de verdad', () => {
    const verdict = verify(DO_MAYOR, { played: [...DO_MAYOR, 74] });
    expect(presentOf(verdict)).toEqual(DO_MAYOR);
  });
});

describe('verifyChord · acorde que se completa con las notas anteriores todavía sonando', () => {
  it('sin saber lo anterior, las notas que siguen sonando (sin subir) faltan; sabiéndolo, cuentan', () => {
    const base = { played: [64], previous: [60, 67] };
    const without = verify(DO_MAYOR, base);
    expect(without.notes.filter((note) => !note.present).map((note) => note.midi)).toEqual([
      60, 67,
    ]);
    const withHeld = verify(DO_MAYOR, { ...base, held: [60, 67] });
    expect(chordComplete(withHeld)).toBe(true);
  });

  it('lo que se arrastra no inventa notas: si una no suena, sigue faltando', () => {
    const verdict = verify(DO_MAYOR, { played: [64], previous: [60], held: [60, 67] });
    expect(verdict.notes.find((note) => note.midi === 67)?.present).toBe(false);
  });
});

describe('verifyChord · con el acorde anterior aún sonando fuerte', () => {
  it('Sol mayor sonando y luego Re menor (a media fuerza) se reconoce: lo que ya sonaba no cuenta como vecino', () => {
    let complete = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const verdict = verify(RE_MENOR, {
        played: RE_MENOR,
        gains: [0.5, 0.5, 0.5],
        previous: SOL_MAYOR,
        previousGain: 5,
        seed,
      });
      if (chordComplete(verdict)) complete += 1;
    }
    expect(complete).toBeGreaterThanOrEqual(7);
  });
});

describe('verifyChord · mano izquierda (graves)', () => {
  const DO3 = [48, 52, 55];
  const FA3 = [53, 57, 60];

  it('con las fundamentales intactas se reconocen', () => {
    for (const chord of [DO3, FA3]) {
      expect(chordComplete(verify(chord, { played: chord })), chord.join('-')).toBe(true);
    }
  });

  it('con un altavoz que corta los graves (sin fundamental) basta con los parciales', () => {
    for (const chord of [DO3, FA3]) {
      const verdict = verify(chord, { played: chord, highpassHz: 240, fundamentalGain: 0.3 });
      expect(chordComplete(verdict), chord.join('-')).toBe(true);
    }
  });

  it('el silencio y el ruido no cuentan como acorde', () => {
    for (const kind of ['blanco', 'rosa', 'ventilador'] as const) {
      const verdict = verify(DO3, { played: [], noiseKind: kind, snrDb: 20 });
      expect(presentOf(verdict), kind).toEqual([]);
    }
  });

  it('una nota que falta se echa en falta si suena el resto', () => {
    const verdict = verify(DO3, { played: [48, 55] });
    expect(verdict.notes.find((note) => note.midi === 52)?.present).toBe(false);
  });

  it('el mismo acorde una octava más arriba no lo completa (con estas notas; en graves no está garantizado en general)', () => {
    expect(chordComplete(verify(DO3, { played: DO_MAYOR }))).toBe(false);
  });
});

describe('verifyChord · desafinación del teclado', () => {
  it('un teclado desafinado ±35 cents se reconoce cuando se conoce la afinación (la estima el seguimiento)', () => {
    for (const cents of [-35, -20, 20, 35]) {
      const verdict = verify(DO_MAYOR, { played: DO_MAYOR, cents, knownCents: cents });
      expect(chordComplete(verdict), `${cents} cents`).toBe(true);
    }
  });

  it('y hasta ±25 cents aunque no se conozca', () => {
    for (const cents of [-25, 25]) {
      expect(chordComplete(verify(DO_MAYOR, { played: DO_MAYOR, cents })), `${cents} cents`).toBe(
        true,
      );
    }
  });
});

describe('verifyChord · banco de casos aleatorios', () => {
  it(
    '≥ 95 % de los acordes buenos se reconocen y ≤ 3 % de las notas ausentes cuelan',
    { timeout: 120000 },
    () => {
      const rng = createSeededRng(2024);
      const goodFailures: string[] = [];
      const leaks: string[] = [];
      const TRIALS = 60;
      for (let trial = 0; trial < TRIALS; trial++) {
        const chord = CHORDS[Math.floor(rng() * CHORDS.length)] as number[];
        const gains = chord.map(() => 0.5 + rng() * 1.2);
        const strum = chord.map((_, i) => (i === 0 ? 0 : Math.floor(rng() * 40)));
        const noiseKind = (['blanco', 'rosa', 'ventilador'] as const)[Math.floor(rng() * 3)] as
          'blanco' | 'rosa' | 'ventilador';
        const snrDb = 18 + Math.floor(rng() * 14);
        const fundamentalGain = 0.4 + rng() * 0.6;
        const highpassHz = rng() < 0.4 ? 200 : 0;
        const base = {
          gains,
          strum,
          noiseKind,
          snrDb,
          fundamentalGain,
          highpassHz,
          seed: trial + 1,
        };
        const label = JSON.stringify({
          chord,
          ...base,
          gains: gains.map((g) => +g.toFixed(2)),
          fundamentalGain: +fundamentalGain.toFixed(2),
        });

        const verdict = verify(chord, { ...base, played: chord });
        if (!chordComplete(verdict)) {
          goodFailures.push(
            label +
              ' => ' +
              JSON.stringify(
                verdict.notes.map((n) => [
                  n.midi,
                  n.present,
                  +n.snr.toFixed(1),
                  +n.peak.toFixed(1),
                  +n.rise.toFixed(1),
                ]),
              ),
          );
        }

        const missing = Math.floor(rng() * chord.length);
        const keep = (_: unknown, i: number) => i !== missing;
        const partial = verify(chord, {
          ...base,
          played: chord.filter(keep),
          gains: gains.filter(keep),
          strum: strum.filter(keep),
        });
        const evidence = partial.notes.find((note) => note.midi === chord[missing]);
        if (evidence?.present) {
          leaks.push(
            label +
              ' sin ' +
              chord[missing] +
              ' => ' +
              JSON.stringify([
                +evidence.snr.toFixed(1),
                +evidence.peak.toFixed(1),
                +evidence.rise.toFixed(1),
              ]),
          );
        }
      }
      expect(goodFailures.length / TRIALS, goodFailures.join('\n')).toBeLessThanOrEqual(0.05);
      expect(leaks.length / TRIALS, leaks.join('\n')).toBeLessThanOrEqual(0.03);
    },
  );
});
