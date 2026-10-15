import { PracticeSession } from '@/core/application/practice-session';
import { roundConfigFor } from '@/core/domain/exercise';
import type { RoundConfig } from '@/core/domain/exercise';
import type { Midi } from '@/core/domain/note';
import { createSeededRng } from '@/core/domain/rng';
import type { ExpectationSink } from '@/core/ports/expectation-sink';
import { FakeClock } from '../fakes/fake-clock';
import { FakeNoteInput } from '../fakes/fake-note-input';

class SpySink implements ExpectationSink {
  readonly calls: (readonly Midi[] | null)[] = [];
  setExpectation(notes: readonly Midi[] | null): void {
    this.calls.push(notes);
  }
}

function setup(config: RoundConfig, sinks: ExpectationSink[] = [new SpySink()]) {
  const input = new FakeNoteInput('microfono');
  const session = new PracticeSession({
    inputs: [input],
    audio: { noteOn: () => undefined, noteOff: () => undefined },
    clock: new FakeClock(0),
    rng: createSeededRng(3),
    config: { ...config, roundSize: 3 },
    expectationSinks: sinks,
  });
  return { input, session, sink: sinks[0] as SpySink };
}

const thirds = roundConfigFor('terceras', 1) as RoundConfig;
const notes = roundConfigFor('notas', 1) as RoundConfig;

describe('PracticeSession · le dice al micrófono qué acorde se espera', () => {
  it('sin la beta activada no se espera nada, aunque el objetivo sea una tercera', () => {
    const { session, sink } = setup(thirds);
    session.start();
    expect(sink.calls).toEqual([]);
  });

  it('con la beta, al empezar la ronda se espera la tercera actual', () => {
    const { session, sink } = setup(thirds);
    session.setPolyphonicMic(true);
    session.start();
    expect(sink.calls).toHaveLength(1);
    expect(sink.calls[0]).toEqual([...(session.getSnapshot().exercise?.target.notes ?? [])]);
  });

  it('al acertar se espera la siguiente; al terminar la ronda ya no se espera nada', () => {
    const { session, input, sink } = setup(thirds);
    session.setPolyphonicMic(true);
    session.start();
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      for (const note of session.getSnapshot().exercise?.target.notes ?? [])
        input.press(note, 100 + i);
      for (const note of session.getSnapshot().exercise?.target.notes ?? [])
        input.release(note, 150 + i);
    }
    expect(session.getSnapshot().phase).toBe('completada');
    for (const call of sink.calls) seen.push(call === null ? 'ninguna' : call.join('-'));
    expect(seen.length).toBeGreaterThanOrEqual(4);
    expect(seen[seen.length - 1]).toBe('ninguna');
    expect(seen.slice(0, -1).every((value) => value !== 'ninguna')).toBe(true);
  });

  it('el avance parcial dentro de un mismo objetivo no repite la expectativa', () => {
    const { session, input, sink } = setup(thirds);
    session.setPolyphonicMic(true);
    session.start();
    const before = sink.calls.length;
    const [low] = session.getSnapshot().exercise?.target.notes ?? [];
    input.press(low ?? 60, 100);
    expect(sink.calls).toHaveLength(before);
  });

  it('en pausa no se espera nada y al reanudar vuelve', () => {
    const { session, sink } = setup(thirds);
    session.setPolyphonicMic(true);
    session.start();
    session.pause();
    expect(sink.calls[sink.calls.length - 1]).toBeNull();
    session.resume();
    expect(sink.calls[sink.calls.length - 1]).toEqual([
      ...(session.getSnapshot().exercise?.target.notes ?? []),
    ]);
  });

  it('con objetivos de una nota (modo notas) nunca se espera un acorde', () => {
    const { session, sink } = setup(notes);
    session.setPolyphonicMic(true);
    session.start();
    expect(sink.calls).toEqual([]);
  });

  it('apagar la beta o abandonar la ronda quita la expectativa', () => {
    const { session, sink } = setup(thirds);
    session.setPolyphonicMic(true);
    session.start();
    session.setPolyphonicMic(false);
    expect(sink.calls[sink.calls.length - 1]).toBeNull();
    session.setPolyphonicMic(true);
    expect(sink.calls[sink.calls.length - 1]).not.toBeNull();
    session.reset();
    expect(sink.calls[sink.calls.length - 1]).toBeNull();
  });

  it('cambiar de ejercicio con la ronda en curso espera el acorde nuevo', () => {
    const { session, sink } = setup(thirds);
    session.setPolyphonicMic(true);
    session.start();
    session.configure({ ...(roundConfigFor('acordes', 1) as RoundConfig), roundSize: 3 });
    expect(sink.calls[sink.calls.length - 1]).toHaveLength(3);
  });

  it('varios verificadores reciben lo mismo, y uno que falla no rompe la práctica', () => {
    const a = new SpySink();
    const broken: ExpectationSink = {
      setExpectation: () => {
        throw new Error('fallo');
      },
    };
    const b = new SpySink();
    const { session } = setup(thirds, [a, broken, b]);
    session.setPolyphonicMic(true);
    expect(() => session.start()).not.toThrow();
    expect(a.calls).toHaveLength(1);
    expect(b.calls).toHaveLength(1);
    expect(session.getSnapshot().phase).toBe('en-curso');
  });

  it('sin verificadores no pasa nada', () => {
    const session = new PracticeSession({
      inputs: [new FakeNoteInput('microfono')],
      audio: { noteOn: () => undefined, noteOff: () => undefined },
      clock: new FakeClock(0),
      rng: createSeededRng(3),
      config: thirds,
    });
    session.setPolyphonicMic(true);
    expect(() => session.start()).not.toThrow();
  });
});
