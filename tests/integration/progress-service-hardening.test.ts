import { LessonFlow } from '@/core/application/lesson-flow';
import { PracticeSession } from '@/core/application/practice-session';
import { ProgressService } from '@/core/application/progress-service';
import { LEVEL_1_CONFIG } from '@/core/domain/exercise';
import { findLesson } from '@/core/domain/lessons';
import type { Lesson } from '@/core/domain/lessons';
import { PROGRESS_VERSION } from '@/core/domain/progress';
import type { LessonResult } from '@/core/domain/progress';
import { createSeededRng } from '@/core/domain/rng';
import { scoreLesson } from '@/core/domain/scoring';
import { FakeCalendar } from '../fakes/fake-calendar';
import { FakeClock } from '../fakes/fake-clock';
import { FakeNoteInput } from '../fakes/fake-note-input';
import { FakeCapableProgressStore } from '../fakes/fake-progress-store';
import { round, steady } from '../support/rounds';

const lesson = (id: string): Lesson => {
  const found = findLesson(id);
  if (!found) throw new Error(`Falta la lección ${id}`);
  return found;
};

function result(id: string): LessonResult {
  const attempts = round(steady(10, 1000, { notes: [60] }));
  return { lesson: lesson(id), score: scoreLesson(attempts, lesson(id)), attempts };
}

function make(stored: unknown = null) {
  const store = new FakeCapableProgressStore(stored);
  return { store, service: new ProgressService(store, new FakeCalendar('2026-10-26')) };
}

describe('ProgressService · sonda de almacenamiento', () => {
  it('la primera visita ya avisa si el navegador no deja guardar', () => {
    const store = new FakeCapableProgressStore();
    store.available = false;
    const service = new ProgressService(store, new FakeCalendar());
    expect(service.getSnapshot().saved).toBe(false);
  });

  it('con almacenamiento disponible no avisa', () => {
    expect(make().service.getSnapshot().saved).toBe(true);
  });

  it('una sonda que lanza cuenta como «no se puede guardar»', () => {
    const store = new FakeCapableProgressStore();
    store.canSave = () => {
      throw new Error('bloqueado');
    };
    expect(new ProgressService(store, new FakeCalendar()).getSnapshot().saved).toBe(false);
  });
});

describe('ProgressService · una versión nueva escrita después de cargar', () => {
  it('no se pisa: pasa a solo lectura y no guarda', () => {
    const { store, service } = make();
    // Otra pestaña, con una versión nueva de la app, guarda mientras esta sigue abierta.
    const future = { version: PROGRESS_VERSION + 1, datos: 'de otra versión' };
    store.stored = future;
    service.record(result('u2-1'), 'a');
    expect(service.getSnapshot()).toMatchObject({ readOnly: true, saved: false });
    expect(store.saves).toHaveLength(0);
    expect(store.stored).toBe(future);
  });
});

describe('ProgressService · lo que no se reconoce se conserva aparte', () => {
  it('un JSON válido con otra forma se copia antes de poder pisarlo', () => {
    for (const odd of [{}, [], { version: '1' }, 5, 'texto', { version: 0 }]) {
      const { store } = make(odd);
      expect(store.copies, JSON.stringify(odd)).toEqual([odd]);
    }
  });

  it('lo vacío (nada guardado) y lo válido no se copian', () => {
    expect(make(null).store.copies).toEqual([]);
    expect(make({ version: PROGRESS_VERSION, xp: 10 }).store.copies).toEqual([]);
  });

  it('una versión mayor tampoco se copia (se respeta donde está)', () => {
    expect(make({ version: PROGRESS_VERSION + 1 }).store.copies).toEqual([]);
  });

  it('si la copia falla se sigue igual', () => {
    const store = new FakeCapableProgressStore({});
    store.keepCopy = () => {
      throw new Error('sin espacio');
    };
    expect(() => new ProgressService(store, new FakeCalendar())).not.toThrow();
  });
});

describe('ProgressService · borrar', () => {
  it('usa el borrado del almacén (quita también la copia aparte) y vuelve a «se puede guardar»', () => {
    const { store, service } = make({ version: PROGRESS_VERSION + 1 });
    expect(service.getSnapshot().readOnly).toBe(true);
    service.reset();
    expect(store.clears).toBe(1);
    expect(store.stored).toBeNull();
    expect(service.getSnapshot()).toMatchObject({ readOnly: false, saved: true });
    expect(service.getSnapshot().state.xp).toBe(0);
    // Tras borrar se puede volver a guardar.
    service.record(result('u2-1'), 'a');
    expect(store.saves).toHaveLength(1);
  });

  it('si el borrado falla lo dice (saved: false)', () => {
    const { store, service } = make();
    store.clear = () => false;
    service.reset();
    expect(service.getSnapshot().saved).toBe(false);
  });
});

describe('LessonFlow · si guardar falla se ve el resultado igualmente', () => {
  it('un error al anotar no deja la lección «en curso» para siempre', () => {
    const clock = new FakeClock(1000);
    const input = new FakeNoteInput('teclado-pc');
    const session = new PracticeSession({
      inputs: [input],
      audio: { noteOn: () => undefined, noteOff: () => undefined },
      clock,
      rng: createSeededRng(3),
      config: LEVEL_1_CONFIG,
    });
    const progress = new ProgressService(new FakeCapableProgressStore(), new FakeCalendar());
    progress.record = () => {
      throw new Error('fallo inesperado');
    };
    const flow = new LessonFlow({
      session,
      progress,
      playContext: () => ({ sources: ['teclado-pc'], polyphonicMic: false }),
    });
    flow.prepare('u2-1');
    flow.begin();
    while (session.getSnapshot().phase === 'en-curso') {
      clock.advance(1000);
      const note = session.getSnapshot().exercise?.target.notes[0] ?? 60;
      input.press(note, clock.now());
      input.release(note, clock.now() + 5);
    }
    const snapshot = flow.getSnapshot();
    expect(snapshot.status).toBe('resultado');
    expect(snapshot.outcome?.gains.xp).toBe(0);
    expect(snapshot.outcome?.score.stars).toBe(3);
  });
});
