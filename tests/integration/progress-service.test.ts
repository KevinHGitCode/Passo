import { ProgressService } from '@/core/application/progress-service';
import { findLesson } from '@/core/domain/lessons';
import type { Lesson } from '@/core/domain/lessons';
import { PROGRESS_VERSION, currentStreak, starsOf } from '@/core/domain/progress';
import type { LessonResult } from '@/core/domain/progress';
import { scoreLesson } from '@/core/domain/scoring';
import { FakeCalendar } from '../fakes/fake-calendar';
import { FakeProgressStore } from '../fakes/fake-progress-store';
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
  const store = new FakeProgressStore(stored);
  const calendar = new FakeCalendar('2026-10-26');
  return { store, calendar, service: new ProgressService(store, calendar) };
}

describe('ProgressService', () => {
  it('sin nada guardado empieza vacío y no escribe hasta que hay un resultado', () => {
    const { store, service } = make();
    expect(service.getSnapshot()).toMatchObject({ saved: true, readOnly: false });
    expect(service.getSnapshot().state.xp).toBe(0);
    expect(service.getSnapshot()).toBe(service.getSnapshot());
    expect(store.saves).toHaveLength(0);
  });

  it('carga lo guardado, validándolo', () => {
    const { service } = make({
      version: PROGRESS_VERSION,
      xp: 300,
      lessons: { 'u1-1': { stars: 2, accuracy: 900, rhythm: 100, plays: 1, day: '2026-10-25' } },
      daily: { mal: { ms: 1, lessons: 1 } },
    });
    const { state } = service.getSnapshot();
    expect(state.xp).toBe(300);
    expect(starsOf(state)('u1-1')).toBe(2);
    expect(state.daily).toEqual({});
  });

  it('anotar un resultado guarda una vez, avisa a los oyentes y devuelve lo ganado', () => {
    const { store, service } = make();
    const listener = vi.fn();
    service.subscribe(listener);
    const gains = service.record(result('u2-1'), 'ronda-1');
    expect(gains).toMatchObject({ xp: 130, stars: 3, streak: 1 });
    expect(store.saves).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(service.getSnapshot().state.xp).toBe(130);
    expect(service.getSnapshot().saved).toBe(true);
    expect(JSON.stringify(store.stored)).toContain('"u2-1"');
  });

  it('la misma ronda anotada dos veces (doble aviso, StrictMode) no suma dos veces', () => {
    const { store, service } = make();
    const first = service.record(result('u2-1'), 'ronda-1');
    const second = service.record(result('u2-1'), 'ronda-1');
    expect(second).toBe(first);
    expect(store.saves).toHaveLength(1);
    expect(service.getSnapshot().state.xp).toBe(130);
    // Otra ronda de la misma lección sí cuenta (50 % de la experiencia).
    expect(service.record(result('u2-1'), 'ronda-2').xp).toBe(50);
    expect(store.saves).toHaveLength(2);
  });

  it('usa el día del calendario: la racha sube al día siguiente', () => {
    const { calendar, service } = make();
    service.record(result('u2-1'), 'a');
    calendar.advance(1);
    const gains = service.record(result('u2-2'), 'b');
    expect(gains).toMatchObject({ streak: 2, streakIncreased: true });
    expect(currentStreak(service.getSnapshot().state, service.today())).toBe(2);
  });

  it('relee lo guardado antes de aplicar: dos pestañas no se pisan', () => {
    const { store, service } = make();
    service.record(result('u2-1'), 'pestaña-1');
    // Otra pestaña guarda su propio progreso por debajo.
    const other = new ProgressService(store, new FakeCalendar('2026-10-26'));
    other.record(result('u2-2'), 'pestaña-2');
    // La primera pestaña anota otra lección: debe conservar lo de la segunda.
    service.record(result('u2-3'), 'pestaña-1b');
    const { state } = service.getSnapshot();
    expect(Object.keys(state.lessons).sort()).toEqual(['u2-1', 'u2-2', 'u2-3']);
    expect(state.xp).toBe(130 * 3);
  });

  it('si el almacén falla al guardar, sigue con lo de esta visita y lo dice (saved: false)', () => {
    const { store, service } = make();
    store.failSaves = true;
    const gains = service.record(result('u2-1'), 'a');
    expect(gains.xp).toBe(130);
    expect(service.getSnapshot().saved).toBe(false);
    expect(service.getSnapshot().state.xp).toBe(130);
    // Al volver el almacenamiento, el siguiente resultado lo guarda todo.
    store.failSaves = false;
    service.record(result('u2-2'), 'b');
    expect(service.getSnapshot().saved).toBe(true);
    expect(JSON.stringify(store.stored)).toContain('"u2-1"');
  });

  it('un almacén que lanza al leer o guardar no rompe nada', () => {
    const broken = {
      load: () => {
        throw new Error('bloqueado');
      },
      save: () => {
        throw new Error('bloqueado');
      },
    };
    const service = new ProgressService(broken, new FakeCalendar());
    expect(service.getSnapshot().state.xp).toBe(0);
    expect(service.record(result('u2-1'), 'a').xp).toBe(130);
    expect(service.getSnapshot()).toMatchObject({ saved: false });
  });

  it('lo guardado con una versión mayor se respeta: se puede jugar pero no se sobrescribe', () => {
    const future = { version: PROGRESS_VERSION + 1, datos: 'de otra versión' };
    const { store, service } = make(future);
    expect(service.getSnapshot()).toMatchObject({ readOnly: true, saved: false });
    service.record(result('u2-1'), 'a');
    expect(service.getSnapshot().state.xp).toBe(130);
    expect(store.saves).toHaveLength(0);
    expect(store.stored).toBe(future);
  });

  it('borrar el progreso deja todo a cero y guarda el vacío', () => {
    const { store, service } = make();
    service.record(result('u2-1'), 'a');
    const listener = vi.fn();
    service.subscribe(listener);
    service.reset();
    expect(service.getSnapshot().state.xp).toBe(0);
    expect(Object.keys(service.getSnapshot().state.lessons)).toHaveLength(0);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.saves).toHaveLength(2);
    // Tras borrar, la misma ronda ya no está «recordada»: puede anotarse de nuevo.
    expect(service.record(result('u2-1'), 'a').xp).toBe(130);
  });

  it('dejar de escuchar corta los avisos', () => {
    const { service } = make();
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);
    unsubscribe();
    service.record(result('u2-1'), 'a');
    expect(listener).not.toHaveBeenCalled();
  });
});
