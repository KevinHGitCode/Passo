import type { Attempt } from '@/core/domain/exercise';
import { findLesson } from '@/core/domain/lessons';
import type { Lesson } from '@/core/domain/lessons';
import {
  MAX_LEVEL,
  MIC_GROUP_RHYTHM_FACTOR,
  MIC_RHYTHM_FACTOR,
  baseXpOf,
  measureRhythm,
  pianistLevel,
  repeatFactor,
  rhythmFactor,
  scoreLesson,
  starsFor,
  xpToReach,
} from '@/core/domain/scoring';
import type { InputSource } from '@/core/domain/note-event';

const lesson = (id: string): Lesson => {
  const found = findLesson(id);
  if (!found) throw new Error(`Falta la lección ${id}`);
  return found;
};

interface Spec {
  readonly notes?: readonly number[];
  readonly ms: number;
  readonly firstTry?: boolean;
  readonly source?: InputSource;
  readonly help?: boolean;
}

/**
 * Una ronda de `specs.length` objetivos. Cada uno se acierta a la primera por defecto; con
 * `firstTry: false` hay antes un error (y el acierto es el segundo intento).
 */
function round(specs: readonly Spec[]): Attempt[] {
  const attempts: Attempt[] = [];
  specs.forEach((spec, index) => {
    const notes = spec.notes ?? [60];
    const base = {
      targetMidi: notes[0] as number,
      targetNotes: notes as Attempt['targetNotes'],
      shownAt: 0,
      inputSource: spec.source ?? 'teclado-pc',
      noteNameMode: 'latina' as const,
      mode: 'notas' as const,
      level: 0,
      velocity: 90,
      helpOn: spec.help ?? true,
      targetIndex: index,
      detectionConfidence: null,
    };
    let attemptIndex = 1;
    if (spec.firstTry === false) {
      attempts.push({
        ...base,
        playedMidi: 61,
        isCorrect: false,
        playedAt: 100,
        reactionMs: 100,
        attemptIndexForTarget: 1,
        firstTryCorrect: false,
      });
      attemptIndex = 2;
    }
    attempts.push({
      ...base,
      playedMidi: notes[0] as number,
      isCorrect: true,
      playedAt: spec.ms,
      reactionMs: spec.ms,
      attemptIndexForTarget: attemptIndex,
      firstTryCorrect: attemptIndex === 1,
    });
  });
  return attempts;
}

const steady = (count: number, ms: number, extra: Partial<Spec> = {}): Spec[] =>
  Array.from({ length: count }, () => ({ ms, ...extra }));

describe('estrellas', () => {
  const base = { rhythmMet: true, withoutHelp: true } as const;

  it('por debajo del 70 % no hay estrellas (hay que repetir)', () => {
    expect(starsFor({ ...base, kind: 'nueva', accuracy: 0.69 })).toBe(0);
    expect(starsFor({ ...base, kind: 'nueva', accuracy: 0 })).toBe(0);
  });

  it('el 70 % exacto completa la lección (1 estrella)', () => {
    expect(starsFor({ ...base, kind: 'nueva', accuracy: 0.7 })).toBe(1);
    expect(starsFor({ ...base, kind: 'repaso', accuracy: 0.7 })).toBe(1);
  });

  it('la 2.ª estrella pide 80 % en las nuevas y 90 % en repasos y pruebas', () => {
    expect(starsFor({ ...base, kind: 'nueva', accuracy: 0.79 })).toBe(1);
    expect(starsFor({ ...base, kind: 'nueva', accuracy: 0.8 })).toBe(2);
    expect(starsFor({ ...base, kind: 'repaso', accuracy: 0.89 })).toBe(1);
    expect(starsFor({ ...base, kind: 'repaso', accuracy: 0.9 })).toBe(2);
    expect(starsFor({ ...base, kind: 'prueba', accuracy: 0.89 })).toBe(1);
    expect(starsFor({ ...base, kind: 'prueba', accuracy: 0.9 })).toBe(2);
  });

  it('la 3.ª estrella pide 95 % y el ritmo objetivo', () => {
    expect(starsFor({ ...base, kind: 'nueva', accuracy: 0.949 })).toBe(2);
    expect(starsFor({ ...base, kind: 'nueva', accuracy: 0.95 })).toBe(3);
    expect(starsFor({ ...base, kind: 'nueva', accuracy: 1, rhythmMet: false })).toBe(2);
  });

  it('en las pruebas la 3.ª estrella exige tocar sin ayuda', () => {
    expect(starsFor({ ...base, kind: 'prueba', accuracy: 1, withoutHelp: false })).toBe(2);
    expect(starsFor({ ...base, kind: 'prueba', accuracy: 1 })).toBe(3);
    // En lecciones nuevas y repasos la ayuda no cuenta.
    expect(starsFor({ ...base, kind: 'repaso', accuracy: 1, withoutHelp: false })).toBe(3);
  });
});

describe('ritmo', () => {
  it('cuenta notas por minuto con el tiempo de cada objetivo, sin el primero', () => {
    // 5 objetivos: el primero (orientarse) no cuenta. Los 4 siguientes, 1 s cada uno = 60 notas/min.
    const attempts = round([{ ms: 5000 }, ...steady(4, 1000)]);
    const { notesPerMinute, activeMs } = measureRhythm(attempts);
    expect(activeMs).toBe(4000);
    expect(notesPerMinute).toBeCloseTo(60, 6);
  });

  it('un objetivo de varias notas cuenta todas sus notas', () => {
    const attempts = round([
      { ms: 3000 },
      { notes: [60, 64, 67], ms: 3000 },
      { notes: [60, 64], ms: 2000 },
    ]);
    // (3 + 2) notas en 5 s = 60 notas/min.
    expect(measureRhythm(attempts).notesPerMinute).toBeCloseTo(60, 6);
  });

  it('los errores no suman tiempo: solo cuenta el intento que acierta', () => {
    const attempts = round([{ ms: 1000 }, { ms: 1000, firstTry: false }, { ms: 1000 }]);
    expect(measureRhythm(attempts).activeMs).toBe(2000);
  });

  it('sin objetivos resueltos (o sin tiempo) da 0, nunca infinito', () => {
    expect(measureRhythm([]).notesPerMinute).toBe(0);
    expect(measureRhythm(round([{ ms: 1000 }])).notesPerMinute).toBe(0);
    expect(measureRhythm(round([{ ms: 1000 }, { ms: 0 }])).notesPerMinute).toBe(0);
  });

  it('la meta se relaja con el micrófono: × 0,9 con notas y × 0,75 con grupos', () => {
    const mic = round(steady(3, 1000, { source: 'microfono' }));
    expect(rhythmFactor(mic, lesson('u2-1'))).toBe(MIC_RHYTHM_FACTOR);
    expect(rhythmFactor(mic, lesson('u6-1'))).toBe(MIC_GROUP_RHYTHM_FACTOR);
    expect(rhythmFactor(round(steady(3, 1000)), lesson('u2-1'))).toBe(1);
    expect(rhythmFactor([], lesson('u2-1'))).toBe(1);
  });
});

describe('experiencia', () => {
  it('10 por objetivo a la primera, 5 a la segunda y nada después', () => {
    const attempts = round([{ ms: 1000 }, { ms: 1000, firstTry: false }, { ms: 1000 }]);
    expect(baseXpOf(attempts)).toBe(10 + 5 + 10);
  });

  it('al repetir una lección se da 100 %, 50 % y luego 25 %', () => {
    expect([0, 1, 2, 3, 10].map(repeatFactor)).toEqual([1, 0.5, 0.25, 0.25, 0.25]);
  });
});

describe('puntuar una lección', () => {
  it('una ronda perfecta a buen ritmo da 3 estrellas', () => {
    // Unidad 2 (nueva, meta 12 notas/min): 1 s por nota son 60 notas/min.
    const score = scoreLesson(round(steady(10, 1000)), lesson('u2-1'));
    expect(score.accuracy).toBe(1);
    expect(score.rhythmGoal).toBe(12);
    expect(score.rhythmMet).toBe(true);
    expect(score.stars).toBe(3);
    expect(score.baseXp).toBe(100);
    expect(score.summary.totalTargets).toBe(10);
  });

  it('perfecta pero lenta: 2 estrellas por el ritmo', () => {
    // 6 s por nota = 10 notas/min < 12.
    const score = scoreLesson(round(steady(10, 6000)), lesson('u2-1'));
    expect(score.rhythmMet).toBe(false);
    expect(score.stars).toBe(2);
  });

  it('la unidad 1 no exige ritmo: lenta pero perfecta da 3 estrellas', () => {
    const score = scoreLesson(round(steady(10, 20_000)), lesson('u1-1'));
    expect(score.rhythmGoal).toBeNull();
    expect(score.rhythmMet).toBe(true);
    expect(score.stars).toBe(3);
  });

  it('con el micrófono la meta baja: 11 notas/min bastan donde piden 12', () => {
    // 60 000 / 11 ≈ 5455 ms por nota.
    const specs = steady(10, 5455, { source: 'microfono' });
    expect(scoreLesson(round(specs), lesson('u2-1')).rhythmMet).toBe(true);
    expect(scoreLesson(round(steady(10, 5455)), lesson('u2-1')).rhythmMet).toBe(false);
  });

  it('la precisión es de aciertos a la primera: 2 fallos de 10 dan 80 % (2 estrellas en una nueva)', () => {
    const specs: Spec[] = steady(10, 1000).map((spec, i) => ({ ...spec, firstTry: i >= 2 }));
    const score = scoreLesson(round(specs), lesson('u2-1'));
    expect(score.accuracy).toBeCloseTo(0.8, 6);
    expect(score.stars).toBe(2);
  });

  it('con 3 fallos de 10 no se llega al 80 %: 1 estrella; con 4 (60 %) hay que repetir', () => {
    const miss = (n: number): Spec[] =>
      steady(10, 1000).map((spec, i) => ({ ...spec, firstTry: i >= n }));
    expect(scoreLesson(round(miss(3)), lesson('u2-1')).stars).toBe(1);
    expect(scoreLesson(round(miss(4)), lesson('u2-1')).stars).toBe(0);
  });

  it('en una prueba con la ayuda encendida no hay 3.ª estrella', () => {
    const withHelp = scoreLesson(round(steady(20, 1000, { help: true })), lesson('u2-4'));
    const without = scoreLesson(round(steady(20, 1000, { help: false })), lesson('u2-4'));
    expect(withHelp.withoutHelp).toBe(false);
    expect(withHelp.stars).toBe(2);
    expect(without.withoutHelp).toBe(true);
    expect(without.stars).toBe(3);
  });
});

describe('nivel de pianista', () => {
  it('la experiencia necesaria crece: 100, 300, 600, 1000, 1500…', () => {
    expect([2, 3, 4, 5, 6].map(xpToReach)).toEqual([100, 300, 600, 1000, 1500]);
    expect(xpToReach(1)).toBe(0);
  });

  it('empieza en el nivel 1 sin experiencia', () => {
    expect(pianistLevel(0)).toEqual({
      level: 1,
      name: 'Principiante',
      xpIntoLevel: 0,
      xpForNext: 100,
    });
  });

  it('sube justo al alcanzar la experiencia de un nivel', () => {
    expect(pianistLevel(99).level).toBe(1);
    expect(pianistLevel(100)).toMatchObject({ level: 2, xpIntoLevel: 0, xpForNext: 200 });
    expect(pianistLevel(1240)).toMatchObject({ level: 5, name: 'Aprendiz', xpIntoLevel: 240 });
  });

  it('los nombres cambian por tramos y el máximo no tiene siguiente', () => {
    expect(pianistLevel(xpToReach(7)).name).toBe('Intérprete');
    expect(pianistLevel(xpToReach(11)).name).toBe('Pianista');
    expect(pianistLevel(xpToReach(16)).name).toBe('Maestro');
    const top = pianistLevel(xpToReach(MAX_LEVEL) + 5000);
    expect(top.level).toBe(MAX_LEVEL);
    expect(top.xpForNext).toBeNull();
  });

  it('datos raros no rompen: negativos, decimales e infinitos', () => {
    expect(pianistLevel(-50).level).toBe(1);
    expect(pianistLevel(Number.NaN).level).toBe(1);
    expect(pianistLevel(Number.POSITIVE_INFINITY).level).toBe(1);
    expect(pianistLevel(100.9).level).toBe(2);
  });
});
