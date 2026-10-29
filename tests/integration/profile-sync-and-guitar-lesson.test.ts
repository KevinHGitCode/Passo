import { LessonFlow } from '@/core/application/lesson-flow';
import { PracticeSession } from '@/core/application/practice-session';
import { bindProfileToSession } from '@/core/application/profile-sync';
import { ProgressService } from '@/core/application/progress-service';
import { LEVEL_1_CONFIG } from '@/core/domain/exercise';
import { findLesson, lessonConfig } from '@/core/domain/lessons';
import type { PlayContext } from '@/core/domain/lessons';
import { createSeededRng } from '@/core/domain/rng';
import { FakeCalendar } from '../fakes/fake-calendar';
import { FakeClock } from '../fakes/fake-clock';
import { FakeListeningSink } from '../fakes/fake-listening-sink';
import { FakeNoteInput } from '../fakes/fake-note-input';
import { FakeProgressStore } from '../fakes/fake-progress-store';

const MIC: PlayContext = { sources: ['microfono'], polyphonicMic: false };

function setup(context: PlayContext = MIC) {
  const clock = new FakeClock(1000);
  const input = new FakeNoteInput('microfono');
  const session = new PracticeSession({
    inputs: [input],
    audio: { noteOn: () => undefined, noteOff: () => undefined },
    clock,
    rng: createSeededRng(11),
    config: LEVEL_1_CONFIG,
  });
  const sink = new FakeListeningSink();
  bindProfileToSession(session, sink);
  const store = new FakeProgressStore();
  const progress = new ProgressService(store, new FakeCalendar('2026-10-29'));
  const flow = new LessonFlow({ session, progress, playContext: () => context });
  return { clock, input, session, sink, store, progress, flow };
}

describe('el micrófono escucha según el instrumento de la sesión', () => {
  it('empieza en piano, pasa a guitarra con una lección de guitarra y vuelve con la práctica libre', () => {
    const { session, sink } = setup();
    expect(sink.profiles).toEqual(['piano']);

    const lesson = findLesson('g1-1');
    expect(lesson).not.toBeNull();
    if (!lesson) return;
    session.configure(lessonConfig(lesson));
    expect(session.getSnapshot().instrument).toBe('guitarra');
    expect(sink.profiles).toEqual(['piano', 'guitarra']);

    session.configure(LEVEL_1_CONFIG);
    expect(session.getSnapshot().instrument).toBe('piano');
    expect(sink.profiles).toEqual(['piano', 'guitarra', 'piano']);
  });

  it('cambiar de lección de guitarra a otra de guitarra no repite el aviso', () => {
    const { session, sink } = setup();
    const first = findLesson('g1-1');
    const second = findLesson('g1-2');
    if (!first || !second) throw new Error('Faltan lecciones');
    session.configure(lessonConfig(first));
    session.configure(lessonConfig(second));
    expect(sink.profiles).toEqual(['piano', 'guitarra']);
  });
});

describe('una lección de guitarra de principio a fin', () => {
  it('tocar cada nota una octava abajo o arriba cuenta como acierto y da las tres estrellas', () => {
    const { flow, session, input, clock, store } = setup();
    flow.prepare('g1-1');
    expect(flow.getSnapshot().status).toBe('lista');
    expect(flow.begin()).toBe(true);
    expect(session.getSnapshot().instrument).toBe('guitarra');

    let turn = 0;
    while (session.getSnapshot().phase === 'en-curso') {
      const exercise = session.getSnapshot().exercise;
      if (!exercise) throw new Error('Sin ejercicio');
      clock.advance(1500);
      const target = exercise.target.notes[0];
      // Alterna: la nota exacta, una octava abajo y una octava arriba (el micrófono confunde graves).
      const played = [target, target - 12, target + 12][turn % 3] as number;
      turn += 1;
      input.press(played, clock.now());
      input.release(played, clock.now() + 5);
    }

    const snapshot = flow.getSnapshot();
    expect(snapshot.status).toBe('resultado');
    expect(snapshot.outcome?.score.accuracy).toBe(1);
    expect(snapshot.outcome?.score.stars).toBe(3);
    expect(snapshot.outcome?.lesson.id).toBe('g1-1');
    // Se guardó como lección de guitarra y con claves de guitarra.
    const saved = progress(store);
    expect(saved.lessons['g1-1']?.stars).toBe(3);
    expect(Object.keys(saved.keys).every((key) => key.startsWith('g:'))).toBe(true);
    expect(Object.keys(saved.keys).sort()).toEqual(['g:55', 'g:59', 'g:64']);
  });

  it('con otra entrada que no sea el micrófono, la lección de guitarra no se puede tocar', () => {
    const { flow } = setup({ sources: ['teclado-pc'], polyphonicMic: false });
    flow.prepare('g1-1');
    expect(flow.begin()).toBe(false);
  });

  it('una nota con otro nombre sigue siendo un error', () => {
    const { flow, session, input, clock } = setup();
    flow.prepare('g1-1');
    flow.begin();
    const exercise = session.getSnapshot().exercise;
    if (!exercise) throw new Error('Sin ejercicio');
    clock.advance(800);
    input.press((exercise.target.notes[0] as number) + 1, clock.now());
    expect(session.getSnapshot().errors).toBe(1);
    expect(session.getSnapshot().hits).toBe(0);
  });
});

function progress(store: FakeProgressStore) {
  const stored = store.stored as {
    lessons: Record<string, { stars: number }>;
    keys: Record<string, unknown>;
  };
  return stored;
}
