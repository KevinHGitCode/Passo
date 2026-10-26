import { LessonFlow } from '@/core/application/lesson-flow';
import { PracticeSession } from '@/core/application/practice-session';
import { PreferencesService } from '@/core/application/preferences-service';
import { bindSessionToPreferences } from '@/core/application/preferences-sync';
import { ProgressService } from '@/core/application/progress-service';
import { LEVEL_1_CONFIG } from '@/core/domain/exercise';
import { createSeededRng } from '@/core/domain/rng';
import { FakeCalendar } from '../fakes/fake-calendar';
import { FakeClock } from '../fakes/fake-clock';
import { FakeNoteInput } from '../fakes/fake-note-input';
import { FakePreferencesStore } from '../fakes/fake-preferences-store';
import { FakeProgressStore } from '../fakes/fake-progress-store';

function setup() {
  const session = new PracticeSession({
    inputs: [new FakeNoteInput()],
    audio: { noteOn: () => undefined, noteOff: () => undefined },
    clock: new FakeClock(1000),
    rng: createSeededRng(2),
    config: LEVEL_1_CONFIG,
  });
  const preferences = new PreferencesService(
    new FakePreferencesStore({
      version: 1,
      mode: 'terceras',
      levels: { terceras: 2 },
      input: 'midi',
    }),
  );
  const progress = new ProgressService(new FakeProgressStore(), new FakeCalendar());
  const flow = new LessonFlow({
    session,
    progress,
    playContext: () => ({ sources: ['teclado-pc'], polyphonicMic: false }),
  });
  bindSessionToPreferences(session, preferences, {
    exercise: true,
    override: { isActive: flow.isActive, subscribe: flow.subscribe },
  });
  return { session, preferences, flow };
}

describe('lección y preferencias: una sola fuente de verdad', () => {
  it('antes de la lección manda el ejercicio de las preferencias', () => {
    const { session } = setup();
    expect(session.getSnapshot()).toMatchObject({ mode: 'terceras', level: 2 });
  });

  it('durante la lección las preferencias no pisan el conjunto de la lección', () => {
    const { session, preferences, flow } = setup();
    flow.prepare('u2-1');
    flow.begin();
    const config = session.getSnapshot().exercise?.config;
    preferences.update({ mode: 'acordes' });
    preferences.update({ notation: 'americana', help: false });
    expect(session.getSnapshot().exercise?.config).toBe(config);
    expect(session.getSnapshot().phase).toBe('en-curso');
    // Lo que no es el ejercicio sí se aplica.
    expect(session.getSnapshot()).toMatchObject({ notation: 'americana', help: false });
  });

  it('al salir de la lección se restaura el ejercicio completo de las preferencias', () => {
    const { session, flow } = setup();
    flow.prepare('u2-1');
    flow.begin();
    flow.leave();
    expect(session.getSnapshot()).toMatchObject({ phase: 'inactiva', mode: 'terceras', level: 2 });
    // Y al empezar, la ronda usa todo el conjunto de las siete terceras, no el de la lección.
    session.start();
    expect(session.getSnapshot().exercise?.config.pool).toHaveLength(7);
  });

  it('salir de una lección del mismo modo y nivel de las preferencias también restaura el conjunto', () => {
    const { session, preferences, flow } = setup();
    preferences.update({ mode: 'notas' });
    flow.prepare('u1-1');
    flow.leave();
    session.start();
    // Nivel 1 de notas: Do a Sol, cinco notas (la lección u1-1 tenía solo tres).
    expect(session.getSnapshot().exercise?.config.pool).toHaveLength(5);
  });

  it('un cambio de ejercicio hecho durante la lección se aplica al salir', () => {
    const { session, preferences, flow } = setup();
    flow.prepare('u2-1');
    preferences.update({ mode: 'acordes' });
    flow.leave();
    expect(session.getSnapshot()).toMatchObject({ mode: 'acordes' });
  });

  it('sin la opción de lección el enlace se comporta como antes', () => {
    const session = new PracticeSession({
      inputs: [new FakeNoteInput()],
      audio: { noteOn: () => undefined, noteOff: () => undefined },
      clock: new FakeClock(0),
      rng: createSeededRng(1),
    });
    const preferences = new PreferencesService(new FakePreferencesStore());
    const unbind = bindSessionToPreferences(session, preferences, { exercise: true });
    preferences.update({ mode: 'notas', notation: 'americana' });
    expect(session.getSnapshot().notation).toBe('americana');
    unbind();
    preferences.update({ notation: 'latina' });
    expect(session.getSnapshot().notation).toBe('americana');
  });
});
