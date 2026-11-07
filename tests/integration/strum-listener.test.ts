import { describe, expect, it } from 'vitest';
import { StrumListener } from '@/core/application/strum-listener';
import type { StrumEvent } from '@/core/application/strum-listener';
import { chordSymbol, matchChords } from '@/core/domain/chords';
import { FakeFrameSource } from '../fakes/fake-frame-source';
import { strum } from '../support/strum';
import { concat, guitarNote, silence } from '../support/synth';

const G = [43, 47, 50, 55, 59, 67];
const C = [48, 52, 55, 60, 64];
const D7 = [50, 57, 60, 66];

function listen(mode: Parameters<StrumListener['start']>[0]) {
  const frames = new FakeFrameSource();
  const listener = new StrumListener({ frames });
  const events: StrumEvent[] = [];
  listener.subscribe((event) => events.push(event));
  listener.start(mode);
  return { frames, listener, events };
}

/** Golpes en los instantes dados (ms), cada uno de un acorde y una dirección. */
function pattern(
  strokes: readonly { at: number; notes: readonly number[]; down: boolean; gain?: number }[],
) {
  const total = Math.max(...strokes.map((s) => s.at)) + 1500;
  const length = Math.round((total / 1000) * 48000);
  const out = new Float32Array(length);
  for (const stroke of strokes) {
    const ordered = stroke.down ? stroke.notes : [...stroke.notes].reverse();
    const signal = strum(ordered, {
      spacingMs: 9,
      ms: 1400,
      amplitude: 0.18 * (stroke.gain ?? 1),
      t60: 2,
    });
    const start = Math.round((stroke.at / 1000) * 48000);
    for (let i = 0; i < signal.length && start + i < out.length; i++) {
      out[start + i] = (out[start + i] as number) + (signal[i] as number);
    }
  }
  return out;
}

describe('StrumListener', () => {
  it('sin suscripción al micrófono no pide fotogramas, y al parar deja de oír', () => {
    const frames = new FakeFrameSource();
    const listener = new StrumListener({ frames });
    expect(frames.subscribers).toBe(0);
    listener.start('golpes');
    expect(frames.subscribers).toBe(1);
    listener.stop();
    expect(frames.subscribers).toBe(0);
  });

  it('cada golpe da su dirección y su instante', () => {
    const { frames, events } = listen('golpes');
    frames.play(
      pattern([
        { at: 500, notes: G, down: true },
        { at: 1300, notes: G, down: false },
        { at: 2100, notes: G, down: true },
      ]),
    );
    const hits = events.filter((event) => event.kind === 'golpe');
    expect(hits).toHaveLength(3);
    expect(hits.map((hit) => (hit.kind === 'golpe' ? hit.direction : null))).toEqual([
      'abajo',
      'arriba',
      'abajo',
    ]);
    const times = hits.map((hit) => hit.at);
    expect(times[0]).toBeGreaterThan(450);
    expect(times[0]).toBeLessThan(560);
    expect((times[1] ?? 0) - (times[0] ?? 0)).toBeGreaterThan(700);
    expect((times[1] ?? 0) - (times[0] ?? 0)).toBeLessThan(900);
  });

  it('en modo acorde, dice qué notas suenan y se reconoce el acorde (Sol, Do, Re7)', () => {
    const { frames, events } = listen('acorde');
    frames.play(
      pattern([
        { at: 400, notes: G, down: true },
        { at: 2000, notes: C, down: true },
        { at: 3600, notes: D7, down: true },
      ]),
    );
    const chords = events.filter((event) => event.kind === 'acorde');
    expect(chords).toHaveLength(3);
    const names = chords.map((event) =>
      event.kind === 'acorde'
        ? chordSymbol((matchChords(event.notes)[0] as ReturnType<typeof matchChords>[number]).chord)
        : '',
    );
    expect(names).toEqual(['G', 'C', 'D7']);
    expect(chords.every((event) => event.kind === 'acorde' && event.clean)).toBe(true);
  });

  it('un patrón de rasgueo completo (↓ ↓↑ ↑↓↑ a 70 pulsos, los de arriba más suaves) se oye golpe a golpe', () => {
    const { frames, events } = listen('golpes');
    const beat = 60000 / 70;
    const offsets = [0, 1, 1.5, 2.5, 3, 3.5];
    const dirs = [true, true, false, false, true, false];
    frames.play(
      pattern(
        offsets.map((offset, index) => ({
          at: 500 + offset * beat,
          notes: G,
          down: dirs[index] as boolean,
          gain: dirs[index] ? 1 : 0.75,
        })),
      ),
    );
    const hits = events.flatMap((event) => (event.kind === 'golpe' ? [event] : []));
    expect(
      hits.map((hit) => hit.direction),
      JSON.stringify(
        hits.map((h) => [Math.round(h.at), h.direction, Math.round(h.lagMs * 10) / 10]),
      ),
    ).toEqual(['abajo', 'abajo', 'arriba', 'arriba', 'abajo', 'arriba']);
    // Los tiempos salen a los pulsos del patrón (a 0,1 pulso, ~85 ms).
    hits.forEach((hit, index) => {
      const expected = 500 + (offsets[index] as number) * beat;
      expect(Math.abs(hit.at - expected)).toBeLessThan(90);
    });
  });

  it('en modo nota, cada cuerda suelta da su nota y los cents que se desvía', () => {
    const { frames, events } = listen('nota');
    const signal = concat(
      silence(300),
      guitarNote(52, { ms: 1000, cents: -30, amplitude: 0.3 }),
      silence(200),
      guitarNote(59, { ms: 1000, cents: 12, amplitude: 0.3 }),
    );
    frames.play(signal);
    const notes = events.filter((event) => event.kind === 'nota');
    expect(notes.map((event) => (event.kind === 'nota' ? event.midi : 0))).toEqual([52, 59]);
    const first = notes[0];
    expect(first?.kind === 'nota' ? first.cents : 99).toBeCloseTo(-30, -1);
  });

  it('un acorde que suena sin más golpes no da golpes de más (aunque las cuerdas «batan»)', () => {
    const { frames, events } = listen('golpes');
    frames.play(pattern([{ at: 300, notes: G, down: true }]));
    expect(events.filter((event) => event.kind === 'golpe')).toHaveLength(1);
  });

  it('con ruido de fondo no hay golpes de la nada', () => {
    const { frames, events } = listen('golpes');
    frames.play(silence(2000));
    expect(events).toHaveLength(0);
  });
});
