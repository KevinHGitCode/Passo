import { LessonFlow } from '@/core/application/lesson-flow';
import { PracticeSession } from '@/core/application/practice-session';
import { ProgressService } from '@/core/application/progress-service';
import { LEVEL_1_CONFIG } from '@/core/domain/exercise';
import { findLesson, lessonConfig } from '@/core/domain/lessons';
import type { Lesson, PlayContext } from '@/core/domain/lessons';
import { REVIEW_LESSON_ID, reviewLesson } from '@/core/domain/review';
import { starsOf } from '@/core/domain/progress';
import { createSeededRng } from '@/core/domain/rng';
import { FakeCalendar } from '../fakes/fake-calendar';
import { FakeClock } from '../fakes/fake-clock';
import { FakeNoteInput } from '../fakes/fake-note-input';
import { FakeProgressStore } from '../fakes/fake-progress-store';

function setup(
  context: PlayContext = { sources: ['teclado-pc'], polyphonicMic: false },
  resolveLesson?: (lessonId: string) => Lesson | null,
) {
  const clock = new FakeClock(1000);
  const input = new FakeNoteInput('teclado-pc');
  const session = new PracticeSession({
    inputs: [input],
    audio: { noteOn: () => undefined, noteOff: () => undefined },
    clock,
    rng: createSeededRng(3),
    config: LEVEL_1_CONFIG,
  });
  const store = new FakeProgressStore();
  const calendar = new FakeCalendar('2026-10-26');
  const progress = new ProgressService(store, calendar);
  let playContext = context;
  const flow = new LessonFlow({
    session,
    progress,
    playContext: () => playContext,
    ...(resolveLesson ? { resolveLesson } : {}),
  });
  return {
    clock,
    input,
    session,
    store,
    progress,
    flow,
    setContext: (next: PlayContext) => {
      playContext = next;
    },
  };
}
type Setup = ReturnType<typeof setup>;

/** Toca bien todo lo que pide la ronda en curso, un objetivo por segundo. */
function playRound({ clock, input, session }: Setup, msPerTarget = 1000): void {
  while (session.getSnapshot().phase === 'en-curso') {
    const exercise = session.getSnapshot().exercise;
    if (!exercise) throw new Error('Sin ejercicio');
    clock.advance(msPerTarget);
    for (const note of exercise.target.notes) input.press(note, clock.now());
    for (const note of exercise.target.notes) input.release(note, clock.now() + 5);
  }
}

describe('PracticeSession.subscribeRounds', () => {
  it('avisa una sola vez por ronda, con la configuración y los intentos', () => {
    const { session, input, clock } = setup();
    const config = { ...LEVEL_1_CONFIG, roundSize: 3 };
    session.configure(config);
    const listener = vi.fn();
    session.subscribeRounds(listener);
    session.start();
    playRound({ clock, input, session } as Setup);
    expect(listener).toHaveBeenCalledTimes(1);
    const round = listener.mock.calls[0]?.[0];
    expect(round.config).toBe(config);
    expect(round.attempts).toHaveLength(3);
    expect(round.summary.totalTargets).toBe(3);
    // Más pulsaciones con la ronda terminada no repiten el aviso.
    input.press(60, clock.now() + 1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('un oyente que falla no rompe la sesión ni a los demás', () => {
    const { session, input, clock } = setup();
    session.configure({ ...LEVEL_1_CONFIG, roundSize: 2 });
    const good = vi.fn();
    session.subscribeRounds(() => {
      throw new Error('falló');
    });
    session.subscribeRounds(good);
    session.start();
    playRound({ clock, input, session } as Setup);
    expect(good).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().phase).toBe('completada');
  });

  it('se puede dejar de escuchar', () => {
    const { session, input, clock } = setup();
    session.configure({ ...LEVEL_1_CONFIG, roundSize: 2 });
    const listener = vi.fn();
    const stop = session.subscribeRounds(listener);
    stop();
    session.start();
    playRound({ clock, input, session } as Setup);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('LessonFlow', () => {
  it('empieza libre y no toca la sesión', () => {
    const { flow, session } = setup();
    expect(flow.getSnapshot()).toEqual({ status: 'libre', lessonId: null, outcome: null });
    expect(flow.isActive()).toBe(false);
    expect(session.getSnapshot().level).toBe(1);
  });

  it('preparar una lección la deja lista y configura la sesión con su conjunto, sin empezar', () => {
    const { flow, session } = setup();
    flow.prepare('u2-1');
    expect(flow.getSnapshot()).toMatchObject({ status: 'lista', lessonId: 'u2-1' });
    expect(flow.isActive()).toBe(true);
    expect(session.getSnapshot().phase).toBe('inactiva');
    expect(session.getSnapshot().mode).toBe('notas');
    expect(session.getSnapshot().level).toBe(0);
  });

  it('preparar es idempotente (React puede repetir el efecto)', () => {
    const { flow } = setup();
    const listener = vi.fn();
    flow.subscribe(listener);
    flow.prepare('u2-1');
    flow.prepare('u2-1');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('una lección que no existe sale del flujo', () => {
    const { flow } = setup();
    flow.prepare('u2-1');
    flow.prepare('no-existe');
    expect(flow.getSnapshot().status).toBe('libre');
  });

  it('empezar pone la ronda en curso con el conjunto de la lección', () => {
    const { flow, session } = setup();
    flow.prepare('u2-1');
    expect(flow.begin()).toBe(true);
    expect(flow.getSnapshot().status).toBe('en-curso');
    const pool = findLesson('u2-1')?.pool ?? [];
    expect(pool).toContain(session.getSnapshot().exercise?.target);
    expect(session.getSnapshot().exercise?.config.roundSize).toBe(10);
  });

  it('empezar desde la propia pantalla de la sesión (session.start) también la pone en curso', () => {
    const { flow, session } = setup();
    flow.prepare('u2-1');
    session.start();
    expect(flow.getSnapshot().status).toBe('en-curso');
  });

  it('al terminar la ronda se puntúa, se guarda una vez y queda el resultado', () => {
    const ctx = setup();
    ctx.flow.prepare('u2-1');
    ctx.flow.begin();
    playRound(ctx);
    const snapshot = ctx.flow.getSnapshot();
    expect(snapshot.status).toBe('resultado');
    expect(snapshot.outcome?.score.stars).toBe(3);
    expect(snapshot.outcome?.score.accuracy).toBe(1);
    expect(snapshot.outcome?.gains).toMatchObject({ xp: 130, newStars: 3, streak: 1 });
    expect(ctx.store.saves).toHaveLength(1);
    expect(starsOf(ctx.progress.getSnapshot().state)('u2-1')).toBe(3);
  });

  it('el resultado se mantiene aunque se vuelva a pedir la misma lección', () => {
    const ctx = setup();
    ctx.flow.prepare('u2-1');
    ctx.flow.begin();
    playRound(ctx);
    ctx.flow.prepare('u2-1');
    expect(ctx.flow.getSnapshot().status).toBe('resultado');
    expect(ctx.store.saves).toHaveLength(1);
  });

  it('repetir deja la lección lista otra vez y la nueva ronda da la mitad de experiencia', () => {
    const ctx = setup();
    ctx.flow.prepare('u2-1');
    ctx.flow.begin();
    playRound(ctx);
    ctx.flow.retry();
    expect(ctx.flow.getSnapshot()).toMatchObject({ status: 'lista', outcome: null });
    expect(ctx.session.getSnapshot().phase).toBe('inactiva');
    ctx.flow.begin();
    playRound(ctx);
    expect(ctx.flow.getSnapshot().outcome?.gains.xp).toBe(50);
    expect(ctx.store.saves).toHaveLength(2);
    expect(ctx.progress.getSnapshot().state.lessons['u2-1']?.plays).toBe(2);
  });

  it('salir a media lección no guarda nada y deja la sesión en la bienvenida', () => {
    const ctx = setup();
    ctx.flow.prepare('u2-1');
    ctx.flow.begin();
    ctx.clock.advance(1000);
    const first = ctx.session.getSnapshot().exercise?.target.notes[0] ?? 0;
    ctx.input.press(first, ctx.clock.now());
    ctx.flow.leave();
    expect(ctx.flow.getSnapshot().status).toBe('libre');
    expect(ctx.session.getSnapshot().phase).toBe('inactiva');
    expect(ctx.store.saves).toHaveLength(0);
    expect(ctx.progress.getSnapshot().state.xp).toBe(0);
  });

  it('salir avisa después de vaciar la sesión (así nadie encuentra una ronda a medias)', () => {
    const ctx = setup();
    ctx.flow.prepare('u2-1');
    ctx.flow.begin();
    const phases: string[] = [];
    ctx.flow.subscribe(() => phases.push(ctx.session.getSnapshot().phase));
    ctx.flow.leave();
    expect(phases).toEqual(['inactiva']);
  });

  it('lo que se juega en la práctica libre nunca se guarda como lección', () => {
    const ctx = setup();
    ctx.session.configure({ ...LEVEL_1_CONFIG, roundSize: 2 });
    ctx.session.start();
    playRound(ctx);
    expect(ctx.store.saves).toHaveLength(0);
    // Ni aunque haya una lección preparada pero sin empezar.
    ctx.flow.prepare('u2-1');
    expect(ctx.flow.getSnapshot().status).toBe('lista');
  });

  it('una ronda de otra configuración, aun con la lección en curso, no cuenta', () => {
    const ctx = setup();
    ctx.flow.prepare('u2-1');
    ctx.flow.begin();
    ctx.session.configure({ ...LEVEL_1_CONFIG, roundSize: 2 });
    playRound(ctx);
    expect(ctx.store.saves).toHaveLength(0);
    expect(ctx.flow.getSnapshot().status).not.toBe('resultado');
  });

  it('abandonar la ronda en curso vuelve a «lista» sin guardar (la entrada ya no sirve)', () => {
    const ctx = setup();
    ctx.flow.prepare('u2-1');
    ctx.flow.begin();
    ctx.flow.abandonRound();
    expect(ctx.flow.getSnapshot().status).toBe('lista');
    expect(ctx.session.getSnapshot().phase).toBe('inactiva');
    expect(ctx.store.saves).toHaveLength(0);
    // Sin ronda en curso no hace nada.
    ctx.flow.abandonRound();
    expect(ctx.flow.getSnapshot().status).toBe('lista');
  });

  it('si la sesión vuelve a la bienvenida (cambio de entrada), la lección vuelve a «lista»', () => {
    const ctx = setup();
    ctx.flow.prepare('u2-1');
    ctx.flow.begin();
    ctx.session.reset();
    expect(ctx.flow.getSnapshot().status).toBe('lista');
  });

  it('con la ronda en pausa sigue «en curso»', () => {
    const ctx = setup();
    ctx.flow.prepare('u2-1');
    ctx.flow.begin();
    ctx.session.pause();
    expect(ctx.flow.getSnapshot().status).toBe('en-curso');
  });

  it('una lección de terceras con micrófono sin la beta no se puede empezar', () => {
    const ctx = setup({ sources: ['microfono'], polyphonicMic: false });
    ctx.flow.prepare('u6-1');
    expect(ctx.flow.begin()).toBe(false);
    expect(ctx.flow.getSnapshot().status).toBe('lista');
    expect(ctx.session.getSnapshot().phase).toBe('inactiva');
    // Con la beta, sí.
    ctx.setContext({ sources: ['microfono'], polyphonicMic: true });
    expect(ctx.flow.begin()).toBe(true);
  });

  it('begin sin lección preparada, o ya en curso, no hace nada', () => {
    const ctx = setup();
    expect(ctx.flow.begin()).toBe(false);
    ctx.flow.prepare('u2-1');
    ctx.flow.begin();
    expect(ctx.flow.begin()).toBe(false);
  });

  it('prepararse en otra lección descarta la anterior sin guardar', () => {
    const ctx = setup();
    ctx.flow.prepare('u2-1');
    ctx.flow.begin();
    ctx.flow.prepare('u2-2');
    expect(ctx.flow.getSnapshot()).toMatchObject({ status: 'lista', lessonId: 'u2-2' });
    expect(ctx.session.getSnapshot().phase).toBe('inactiva');
    expect(ctx.store.saves).toHaveLength(0);
  });

  it('la configuración de la sesión es la de la lección', () => {
    const ctx = setup();
    ctx.flow.prepare('u2-4');
    ctx.flow.begin();
    const lesson = findLesson('u2-4');
    expect(ctx.session.getSnapshot().exercise?.config).toMatchObject({
      pool: lessonConfig(lesson as NonNullable<typeof lesson>).pool,
      roundSize: 20,
    });
  });

  it('una lección armada al momento (repaso) se resuelve aparte, da experiencia y no deja estrellas', () => {
    const weak = Array.from({ length: 8 }, (_, i) => ({ ok: i > 5, ms: 1000 }));
    const lesson = reviewLesson({ '62': weak, '64': weak, '65': weak });
    const ctx = setup(undefined, (id) => (id === REVIEW_LESSON_ID ? lesson : findLesson(id)));
    ctx.flow.prepare(REVIEW_LESSON_ID);
    expect(ctx.flow.getSnapshot()).toMatchObject({ status: 'lista', lessonId: REVIEW_LESSON_ID });
    ctx.flow.begin();
    playRound(ctx);
    expect(ctx.flow.getSnapshot().status).toBe('resultado');
    expect(ctx.flow.getSnapshot().outcome?.gains.xp).toBe(70);
    expect(ctx.progress.getSnapshot().state.lessons).toEqual({});
  });

  it('sin resolver propio, un identificador desconocido no existe', () => {
    const ctx = setup();
    ctx.flow.prepare(REVIEW_LESSON_ID);
    expect(ctx.flow.getSnapshot().status).toBe('libre');
  });

  it('dejar de escuchar y liberar', () => {
    const ctx = setup();
    const listener = vi.fn();
    const stop = ctx.flow.subscribe(listener);
    stop();
    ctx.flow.prepare('u2-1');
    expect(listener).not.toHaveBeenCalled();
    ctx.flow.dispose();
    ctx.flow.leave();
  });
});
