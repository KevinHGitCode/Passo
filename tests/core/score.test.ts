import { describe, expect, it } from 'vitest';
import { GUITAR_OPEN } from '@/core/domain/instrument';
import { layoutBars, noteValueOf, noteValueText, staffPitch } from '@/core/domain/score';
import { SONGS, findSong } from '@/core/domain/songs';

describe('las figuras', () => {
  it('cada duración tiene su nombre y sus rasgos', () => {
    expect(noteValueOf(4)).toMatchObject({ name: 'Redonda', head: 'abierta', stem: false });
    expect(noteValueOf(2)).toMatchObject({ name: 'Blanca', head: 'abierta', stem: true });
    expect(noteValueOf(1)).toMatchObject({ name: 'Negra', head: 'llena', flags: 0 });
    expect(noteValueOf(0.5)).toMatchObject({ name: 'Corchea', flags: 1 });
    expect(noteValueOf(0.25)).toMatchObject({ name: 'Semicorchea', flags: 2 });
    expect(noteValueOf(0.75)).toMatchObject({ name: 'Corchea con puntillo', dotted: true });
    expect(noteValueOf(1.5)).toMatchObject({ name: 'Negra con puntillo', dotted: true });
    expect(noteValueOf(3)).toMatchObject({ name: 'Blanca con puntillo', dotted: true });
  });

  it('una duración que no es exacta toma la figura más cercana', () => {
    expect(noteValueOf(1.1).name).toBe('Negra');
    expect(noteValueOf(0.4).name).toBe('Corchea');
    expect(noteValueOf(10).name).toBe('Redonda');
  });

  it('se dice con los pulsos que dura', () => {
    expect(noteValueText(noteValueOf(1))).toBe('Negra · 1 pulso');
    expect(noteValueText(noteValueOf(0.5))).toBe('Corchea · ½ pulso');
    expect(noteValueText(noteValueOf(2))).toBe('Blanca · 2 pulsos');
    expect(noteValueText(noteValueOf(1.5))).toBe('Negra con puntillo · 1,5 pulsos');
  });
});

describe('el pentagrama', () => {
  it('la guitarra se escribe una octava más aguda: el Mi2 que suena es el Mi3 escrito', () => {
    // Mi grave (MIDI 40) → Mi3 escrito, bajo el pentagrama (7 pasos debajo de la línea de abajo).
    expect(staffPitch(40)).toEqual({ diatonic: 23, sharp: false });
    // Mi4 que suena (la cuerda 1 al aire, 64) → Mi5 escrito.
    expect(staffPitch(64)).toEqual({ diatonic: 37, sharp: false });
    // Sol3 que suena (55) → Sol4 escrito: la segunda línea.
    expect(staffPitch(55)).toEqual({ diatonic: 32, sharp: false });
  });

  it('las notas con alteración llevan sostenido y la misma posición que su natural', () => {
    expect(staffPitch(66)).toEqual({ diatonic: staffPitch(65).diatonic, sharp: true });
    expect(staffPitch(65).sharp).toBe(false);
  });

  it('subir un semitono natural sube un paso (Mi→Fa, Si→Do) y un tono dos', () => {
    expect(staffPitch(53).diatonic - staffPitch(52).diatonic).toBe(1);
    expect(staffPitch(60).diatonic - staffPitch(59).diatonic).toBe(1);
    expect(staffPitch(57).diatonic - staffPitch(55).diatonic).toBe(1);
  });
});

describe('los compases', () => {
  it('Cumpleaños feliz está en 3/4: ocho compases de tres pulsos', () => {
    const song = findSong('cumpleanos-feliz');
    if (!song) throw new Error('falta');
    const bars = layoutBars(song);
    expect(bars).toHaveLength(8);
    expect(bars.every((bar) => bar.beats === 3)).toBe(true);
    // Cada nota queda en un solo compás y no se pierde ninguna.
    expect(bars.flatMap((bar) => bar.events)).toHaveLength(song.steps.length);
    expect(bars[0]?.events.map((event) => event.beat)).toEqual([0, 0.75, 1, 2]);
  });

  it('Estrellita está en 4/4: doce compases de cuatro pulsos', () => {
    const song = findSong('estrellita');
    if (!song) throw new Error('falta');
    const bars = layoutBars(song);
    expect(bars.every((bar) => bar.beats === 4)).toBe(true);
    // Seis frases de ocho pulsos: doce compases.
    expect(bars).toHaveLength(12);
  });

  it('en el rasgueo cada acorde llena un compás (una redonda) con sus cuerdas apiladas', () => {
    const song = findSong('de-colores');
    if (!song) throw new Error('falta');
    const bars = layoutBars(song);
    expect(bars).toHaveLength(song.steps.length);
    const first = bars[0]?.events[0];
    expect(first).toMatchObject({ chord: 'G', strum: '↓ ↓↑ ↑↓↑' });
    expect(first?.value.name).toBe('Redonda');
    expect(first?.pitches).toHaveLength(6);
    expect(first?.tab).toHaveLength(6);
  });

  it('todos los compases de todas las canciones tienen algo y las tablaturas de los acordes cuadran con sus notas', () => {
    for (const song of SONGS) {
      expect(layoutBars(song).every((bar) => bar.events.length > 0)).toBe(true);
      for (const step of song.steps) {
        if (step.kind !== 'acorde') continue;
        const fromTab = step.tab.flatMap((fret, position) =>
          fret === null ? [] : [(GUITAR_OPEN[position] ?? 0) + fret],
        );
        expect([...fromTab].sort((a, b) => a - b)).toEqual([...step.notes].sort((a, b) => a - b));
      }
    }
  });
});
