import { PracticeSession } from '@/core/application/practice-session';
import { LEVEL_1_CONFIG, roundConfigFor } from '@/core/domain/exercise';
import type { RoundConfig } from '@/core/domain/exercise';
import type { NoteConfidence, NoteEvent } from '@/core/domain/note-event';
import { createSeededRng } from '@/core/domain/rng';
import { targetOf } from '@/core/domain/target';
import type { AudioOutput } from '@/core/ports/audio-output';
import { FakeClock } from '../fakes/fake-clock';
import { FakeNoteInput } from '../fakes/fake-note-input';

const silentAudio: AudioOutput = { noteOn: () => undefined, noteOff: () => undefined };

const THIRDS: RoundConfig = {
  mode: 'terceras',
  level: 2,
  pool: [targetOf([60, 64])],
  roundSize: 2,
};

function setup(config: RoundConfig = THIRDS, source: 'teclado-pc' | 'microfono' = 'teclado-pc') {
  const clock = new FakeClock(1000);
  const input = new FakeNoteInput(source);
  const session = new PracticeSession({
    inputs: [input],
    audio: silentAudio,
    clock,
    rng: createSeededRng(5),
    config,
  });
  session.start();
  const outcome = () => session.getSnapshot().feedback?.outcome;
  return { clock, input, session, outcome };
}

describe('PracticeSession · objetivos de varias notas', () => {
  it('cada nota es un avance y el acierto llega al tener las dos pulsadas', () => {
    const { input, session, outcome } = setup();
    input.press(60, 1100);
    expect(outcome()).toMatchObject({ kind: 'parcial', held: [60], missing: [64] });
    expect(session.getSnapshot().hits).toBe(0);
    expect(session.getSnapshot().pressed).toEqual([60]);

    input.press(64, 1130);
    expect(outcome()?.kind).toBe('acierto');
    expect(session.getSnapshot().hits).toBe(1);
    expect(session.getSnapshot().errors).toBe(0);
    expect(session.getSnapshot().exercise?.held).toEqual([]);
  });

  it('soltar una nota antes de completar la quita: no hay acorde', () => {
    const { input, session, outcome } = setup();
    input.press(60, 1100);
    input.release(60, 1200);
    input.press(64, 1300);
    expect(outcome()).toMatchObject({ kind: 'parcial', held: [64], missing: [60] });
    expect(session.getSnapshot().hits).toBe(0);
  });

  it('una nota de más es un error; varias seguidas cuentan una vez', () => {
    const { input, session, outcome } = setup();
    input.press(60, 1100);
    input.press(62, 1150);
    input.press(66, 1200);
    expect(outcome()?.kind).toBe('error');
    expect(session.getSnapshot().errors).toBe(1);
    input.press(64, 1900);
    expect(session.getSnapshot().hits).toBe(1);
    expect(session.getSnapshot().errors).toBe(1);
  });

  it('pausar y reanudar borra lo pulsado: lo que se soltó durante la pausa no queda pegado', () => {
    const { input, session, outcome } = setup();
    input.press(60, 1100);
    session.pause();
    input.release(60, 1200);
    session.resume();
    input.press(64, 1300);
    expect(outcome()).toMatchObject({ kind: 'parcial', missing: [60] });
    expect(session.getSnapshot().hits).toBe(0);
  });

  it('dos acordes completan la ronda', () => {
    const { input, session } = setup();
    input.press(60, 1100);
    input.press(64, 1110);
    input.release(60, 1500);
    input.release(64, 1510);
    input.press(64, 2000);
    input.press(60, 2020);
    const snapshot = session.getSnapshot();
    expect(snapshot.phase).toBe('completada');
    expect(snapshot.summary?.firstTryCorrect).toBe(2);
  });
});

describe('PracticeSession · el micrófono y los eventos de soltar', () => {
  const hear = (
    input: FakeNoteInput,
    type: 'on' | 'off',
    note: number,
    at: number,
    confidence: NoteConfidence = 'alta',
  ) => {
    const event: NoteEvent = {
      type,
      note,
      velocity: type === 'on' ? 70 : 0,
      at,
      source: 'microfono',
      confidence,
    };
    input.emitEvent(event);
  };

  it('un «off» del micrófono no se cuenta como eco ni cambia las estadísticas', () => {
    const { input, session } = setup(LEVEL_1_CONFIG, 'microfono');
    const target = session.getSnapshot().exercise?.target.notes[0] ?? 60;
    hear(input, 'on', target, 1100);
    const before = session.getSnapshot().listenStats;
    hear(input, 'off', target, 1600);
    expect(session.getSnapshot().listenStats).toBe(before);
    expect(before).toMatchObject({ alta: 1, eco: 0 });
  });

  it('un acorde por micrófono: sus notas avanzan y una ajena es dudosa, nunca error', () => {
    const { input, session, outcome } = setup(THIRDS, 'microfono');
    hear(input, 'on', 60, 1100);
    expect(outcome()).toMatchObject({ kind: 'parcial', missing: [64] });
    hear(input, 'on', 62, 1300);
    expect(outcome()?.kind).toBe('dudoso');
    expect(session.getSnapshot().errors).toBe(0);
    expect(session.getSnapshot().listenStats.dudoso).toBe(1);
  });
});

describe('PracticeSession · configure (modo y nivel)', () => {
  const chords = roundConfigFor('acordes', 2) as RoundConfig;
  const thirds = roundConfigFor('terceras', 1) as RoundConfig;

  it('antes de empezar solo recuerda el ejercicio y lo muestra en la foto', () => {
    const session = new PracticeSession({
      inputs: [new FakeNoteInput()],
      audio: silentAudio,
      clock: new FakeClock(0),
      rng: createSeededRng(1),
    });
    expect(session.getSnapshot()).toMatchObject({ mode: 'notas', level: 1, phase: 'inactiva' });
    session.configure(chords);
    expect(session.getSnapshot()).toMatchObject({ mode: 'acordes', level: 2, phase: 'inactiva' });
    session.start();
    expect(session.getSnapshot().exercise?.target.notes).toHaveLength(3);
    expect(session.getSnapshot().exercise?.config).toBe(chords);
  });

  it('con una ronda en curso empieza otra con el contenido nuevo', () => {
    const { session, input } = setup(thirds);
    input.press(60, 1100);
    session.configure(chords);
    const snapshot = session.getSnapshot();
    expect(snapshot.phase).toBe('en-curso');
    expect(snapshot).toMatchObject({ mode: 'acordes', level: 2, hits: 0, errors: 0 });
    expect(snapshot.exercise?.target.notes).toHaveLength(3);
    expect(snapshot.exercise?.held).toEqual([]);
    expect(snapshot.feedback).toBeNull();
  });

  it('tras terminar la ronda, la siguiente usa el nuevo ejercicio', () => {
    const { session, input } = setup({ ...THIRDS, roundSize: 1 });
    input.press(60, 1100);
    input.press(64, 1110);
    expect(session.getSnapshot().phase).toBe('completada');
    session.configure(chords);
    expect(session.getSnapshot().phase).toBe('completada');
    session.start();
    expect(session.getSnapshot().exercise?.target.notes).toHaveLength(3);
  });

  it('el intento guarda el modo y todas las notas del objetivo', () => {
    const { session, input } = setup();
    input.press(60, 1100);
    input.press(64, 1110);
    expect(session.getSnapshot().exercise?.attempts[0]).toMatchObject({
      mode: 'terceras',
      level: 2,
      targetNotes: [60, 64],
    });
  });
});
