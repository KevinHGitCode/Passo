import { describe, expect, it } from 'vitest';
import { midiAt } from '@/core/domain/instrument';
import {
  SONGS,
  findSong,
  judgePace,
  paceText,
  stepMatches,
  previewEvents,
  songDurationMs,
  stepsFromTab,
  stepMs,
  summarize,
} from '@/core/domain/songs';
import type { StepResult } from '@/core/domain/songs';

describe('el catálogo de canciones', () => {
  it('hay al menos cuatro: tres melodías (con «Cumpleaños feliz» y «Mi corazón encantado») y un rasgueo', () => {
    expect(SONGS.length).toBeGreaterThanOrEqual(4);
    expect(findSong('mi-corazon-encantado')?.style).toBe('melodia');
    expect(findSong('cumpleanos-feliz')?.style).toBe('melodia');
    expect(SONGS.some((song) => song.style === 'rasgueo')).toBe(true);
    expect(new Set(SONGS.map((song) => song.id)).size).toBe(SONGS.length);
  });

  it('cada nota dice una cuerda y un traste que dan su MIDI (el mástil y la nota no se contradicen)', () => {
    for (const song of SONGS) {
      for (const step of song.steps) {
        if (step.kind === 'nota') expect(midiAt(step.string, step.fret)).toBe(step.midi);
        expect(step.beats).toBeGreaterThan(0);
      }
    }
  });

  it('Cumpleaños feliz lleva la melodía de siempre (Sol Sol La Sol Do Si…)', () => {
    const names = findSong('cumpleanos-feliz')
      ?.steps.slice(0, 6)
      .map((step) => (step.kind === 'nota' ? step.midi % 12 : -1));
    // Sol3, Sol3, La3, Sol3, Do4, Si3 → clases de nota 7 7 9 7 0 11
    expect(names).toEqual([7, 7, 9, 7, 0, 11]);
  });

  it('en el rasgueo nunca se repite el mismo acorde dos pasos seguidos (el micrófono no vería el segundo)', () => {
    for (const song of SONGS.filter((item) => item.style === 'rasgueo')) {
      song.steps.forEach((step, index) => {
        const before = song.steps[index - 1];
        if (step.kind === 'acorde' && before?.kind === 'acorde') {
          expect(step.chord).not.toBe(before.chord);
        }
      });
    }
  });
});

describe('la tablatura', () => {
  it('se lee de columna en columna: la cuerda, el traste y lo que dura hasta la siguiente', () => {
    const steps = stepsFromTab([
      ['--3---5-', '--------', '--------', '--------', '--------', '--------'],
    ]);
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({ kind: 'nota', string: 1, fret: 3, midi: 67, beats: 1 });
    expect(steps[1]).toMatchObject({ string: 1, fret: 5, beats: 1 });
    const quick = stepsFromTab([['3-5-', '----', '----', '----', '----', '----']]);
    expect(quick[0]?.beats).toBe(0.5);
  });

  it('un bloque lleva seis líneas', () => {
    expect(() => stepsFromTab([['3-5']])).toThrow(RangeError);
  });

  it('«Mi corazón encantado» empieza con Sol y Sol en la cuerda 1 (traste 3) y no lleva letra', () => {
    const steps = findSong('mi-corazon-encantado')?.steps ?? [];
    expect(steps.length).toBeGreaterThan(40);
    expect(steps[0]).toMatchObject({ string: 1, fret: 3, midi: 67 });
    expect(steps[1]).toMatchObject({ string: 1, fret: 3, midi: 67 });
    expect(steps.every((step) => step.kind === 'nota' && step.lyric === '')).toBe(true);
  });
});

describe('escuchar la canción', () => {
  it('cada nota suena en su turno y se suelta justo antes de la siguiente', () => {
    const song = findSong('cumpleanos-feliz');
    if (!song) throw new Error('falta');
    const events = previewEvents(song, 'normal');
    expect(events.filter((event) => event.type === 'paso')).toHaveLength(song.steps.length);
    expect(events.filter((event) => event.type === 'on')).toHaveLength(song.steps.length);
    const first = events.find((event) => event.type === 'on');
    expect(first).toMatchObject({ at: 0, midi: 55 });
    const off = events.find((event) => event.type === 'off');
    expect(off?.at).toBeCloseTo(0.92 * ((0.75 * 60000) / 90), 6);
    expect(events.map((event) => event.at)).toEqual(
      [...events.map((event) => event.at)].sort((a, b) => a - b),
    );
  });

  it('un rasgueo suena como seis golpes por compás con las notas del acorde', () => {
    const song = findSong('de-colores');
    if (!song) throw new Error('falta');
    const events = previewEvents(song, 'normal');
    const first = song.steps[0];
    if (!first) throw new Error('falta el paso');
    const firstBar = events.filter(
      (event) => event.type === 'on' && event.at < stepMs(song, first, 'normal'),
    );
    // 1 golpe hacia abajo con 6 cuerdas + 2 hacia arriba (4 agudas)… en total seis golpes.
    const strokes = new Set(firstBar.map((event) => Math.floor(event.at / 100)));
    expect(strokes.size).toBeGreaterThanOrEqual(6);
    expect(firstBar.some((event) => event.type === 'on' && event.midi === 43)).toBe(true);
  });

  it('más lento dura más y todas las notas del catálogo suenan', () => {
    for (const song of SONGS) {
      expect(songDurationMs(song, 'lento')).toBeCloseTo(2 * songDurationMs(song, 'normal'), 6);
      for (const step of song.steps) {
        if (step.kind === 'acorde') expect(step.notes.length).toBeGreaterThanOrEqual(4);
      }
    }
  });
});

describe('el ritmo de cada paso', () => {
  it('lo esperado sale de los pulsos y el tempo, y baja con la velocidad', () => {
    const song = findSong('de-colores');
    const step = song?.steps[0];
    if (!song || !step) throw new Error('falta la canción');
    expect(stepMs(song, step, 'normal')).toBeCloseTo((4 * 60000) / 70, 6);
    expect(stepMs(song, step, 'lento')).toBeCloseTo((4 * 60000) / 35, 6);
  });

  it('dentro del 25 % es «a tiempo»; más tarde, lento y muy lento; antes, adelantado', () => {
    expect(judgePace(1000, 1000).pace).toBe('a-tiempo');
    expect(judgePace(1000, 1240).pace).toBe('a-tiempo');
    expect(judgePace(1000, 1600).pace).toBe('lento');
    expect(judgePace(1000, 2200).pace).toBe('muy-lento');
    expect(judgePace(1000, 600).pace).toBe('adelantado');
    // En pasos cortos manda la tolerancia mínima de 250 ms.
    expect(judgePace(250, 480).pace).toBe('a-tiempo');
  });

  it('las frases distinguen notas de cambios de acorde y dicen cuánto', () => {
    expect(paceText('nota', 'a-tiempo', 50)).toBe('Va bien: a tiempo');
    expect(paceText('acorde', 'lento', 800)).toBe('El cambio de acorde fue lento (+0,8 s)');
    expect(paceText('acorde', 'muy-lento', 2400)).toBe(
      'El cambio de acorde tardó demasiado (+2,4 s)',
    );
    expect(paceText('nota', 'adelantado', -500)).toBe('Te adelantaste (−0,5 s)');
  });

  it('una nota vale por su nombre (no su octava) y un acorde, por oírse algo', () => {
    const song = findSong('cumpleanos-feliz');
    const step = song?.steps[0];
    if (!step || step.kind !== 'nota') throw new Error('falta el paso');
    expect(stepMatches(step, step.midi)).toBe(true);
    expect(stepMatches(step, step.midi + 12)).toBe(true);
    expect(stepMatches(step, step.midi + 1)).toBe(false);
    const chord = findSong('de-colores')?.steps[0];
    if (!chord) throw new Error('falta el acorde');
    expect(stepMatches(chord, 40)).toBe(true);
  });
});

describe('el resumen', () => {
  const r = (pace: StepResult['pace'], deltaMs: number): StepResult => ({ pace, deltaMs });

  it('cuenta los pasos, nombra los más lentos y sugiere ir despacio si hay muchos lentos', () => {
    const summary = summarize([
      null,
      r('a-tiempo', 0),
      r('muy-lento', 2000),
      r('lento', 900),
      r('adelantado', -400),
    ]);
    expect(summary).toMatchObject({ total: 4, onTime: 1, slow: 2, fast: 1 });
    expect(summary.slowest.map((item) => item.index)).toEqual([2, 3]);
    expect(summary.suggestSlower).toBe(true);
  });

  it('con casi todo a tiempo no sugiere bajar la velocidad', () => {
    const results = [null, r('a-tiempo', 0), r('a-tiempo', 10), r('a-tiempo', 5), r('lento', 600)];
    expect(summarize(results).suggestSlower).toBe(false);
  });

  it('sin pasos juzgados no dice nada raro', () => {
    expect(summarize([null])).toMatchObject({ total: 0, suggestSlower: false, slowest: [] });
  });
});
