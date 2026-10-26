import { findLesson } from '@/core/domain/lessons';
import type { Lesson } from '@/core/domain/lessons';
import {
  MIN_TARGETS_FOR_LIVE_STATS,
  inputName,
  lessonKindText,
  liveStats,
  thirdStarGoalText,
} from '@/ui/screens/lesson-live';
import { round, steady } from '../support/rounds';

const lesson = (id: string): Lesson => {
  const found = findLesson(id);
  if (!found) throw new Error(`Falta la lección ${id}`);
  return found;
};

describe('marcas en vivo', () => {
  it('antes del tercer objetivo resuelto no hay precisión ni ritmo', () => {
    expect(MIN_TARGETS_FOR_LIVE_STATS).toBe(3);
    const attempts = round(steady(2, 1000));
    expect(liveStats(attempts, 2)).toEqual({ accuracy: null, notesPerMinute: null });
    expect(liveStats([], 0)).toEqual({ accuracy: null, notesPerMinute: null });
  });

  it('desde el tercero da la precisión a la primera y el ritmo', () => {
    const attempts = round(steady(3, 1000));
    const stats = liveStats(attempts, 3);
    expect(stats.accuracy).toBe(1);
    // Sin la primera nota: 2 objetivos en 2 s = 60 notas/min.
    expect(stats.notesPerMinute).toBeCloseTo(60, 6);
  });

  it('un fallo se refleja en la precisión', () => {
    const specs = [{ ms: 1000 }, { ms: 1000, firstTry: false }, { ms: 1000 }, { ms: 1000 }];
    expect(liveStats(round(specs), 4).accuracy).toBeCloseTo(0.75, 6);
  });
});

describe('textos de la lección', () => {
  it('la meta de la 3.ª estrella suma el ritmo cuando la lección lo pide', () => {
    expect(thirdStarGoalText(lesson('u1-1'), 'teclado-pc')).toBe('95 %');
    expect(thirdStarGoalText(lesson('u2-1'), 'teclado-pc')).toBe('95 % y 12 notas/min');
  });

  it('con el micrófono la meta de ritmo baja (× 0,9)', () => {
    expect(thirdStarGoalText(lesson('u2-1'), 'microfono')).toBe('95 % y 11 notas/min');
  });

  it('en una prueba pide leer la nota sin ayuda', () => {
    expect(thirdStarGoalText(lesson('u2-4'), 'midi')).toBe('95 % y 18 notas/min, sin ayuda');
    expect(thirdStarGoalText(lesson('u1-4'), 'midi')).toBe('95 %, sin ayuda');
  });

  it('el tipo de lección y la entrada tienen nombre', () => {
    expect(lessonKindText(lesson('u1-1'))).toBe('Lección nueva');
    expect(lessonKindText(lesson('u1-3'))).toBe('Repaso');
    expect(lessonKindText(lesson('u1-4'))).toBe('Prueba');
    expect(inputName('microfono')).toBe('Micrófono');
    expect(inputName('midi')).toBe('Piano MIDI');
    expect(inputName('teclado-pc')).toBe('Teclado del PC');
    expect(inputName(null)).toBe('Varias entradas');
  });
});
