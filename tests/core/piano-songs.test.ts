import { describe, expect, it } from 'vitest';
import {
  PIANO_SONGS,
  findPianoSong,
  parseVirtualPiano,
  pianoNoteMatches,
  pianoSongMs,
  songRange,
  stepStartMs,
  virtualKeyToMidi,
} from '@/core/domain/piano-songs';

describe('las teclas del Virtual Piano', () => {
  it('la «1» es el Do2 y las cifras y letras suben por las teclas blancas', () => {
    expect(virtualKeyToMidi('1')).toBe(36);
    expect(virtualKeyToMidi('7')).toBe(47); // Si2
    expect(virtualKeyToMidi('8')).toBe(48); // Do3
    expect(virtualKeyToMidi('t')).toBe(60); // Do4
    expect(virtualKeyToMidi('u')).toBe(64); // Mi4
    expect(virtualKeyToMidi('m')).toBe(96); // Do7
  });

  it('lo que no es una tecla no se lee', () => {
    expect(virtualKeyToMidi('-')).toBeNull();
    expect(virtualKeyToMidi(' ')).toBeNull();
  });

  it('cada letra es un paso y lo de entre corchetes suena a la vez', () => {
    const steps = parseVirtualPiano('6[etu]');
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({ notes: [45], start: 0, beats: 0.5 });
    // La3 Do4 Mi4: La menor.
    expect(steps[1]).toMatchObject({ notes: [57, 60, 64], start: 0.5 });
  });
});

describe('Golden Brown', () => {
  const song = findPianoSong('golden-brown');
  it('está en el catálogo, con un tempo y bastantes pasos', () => {
    expect(PIANO_SONGS.length).toBeGreaterThanOrEqual(1);
    expect(song?.bpm).toBe(94);
    expect(song?.steps.length).toBeGreaterThan(60);
  });

  it('los pasos van en orden, sin huecos, y las notas son de un piano', () => {
    if (!song) throw new Error('falta');
    song.steps.forEach((step, index) => {
      expect(step.start).toBeCloseTo(index * 0.5, 6);
      expect(step.notes.length).toBeGreaterThan(0);
      for (const note of step.notes) {
        expect(note).toBeGreaterThanOrEqual(36);
        expect(note).toBeLessThanOrEqual(96);
      }
    });
    const range = songRange(song);
    expect(range.low).toBeLessThan(range.high);
  });

  it('empieza con el bajo La2 y el acorde de La menor (La Do Mi)', () => {
    if (!song) throw new Error('falta');
    expect(song.steps[0]?.notes).toEqual([45]);
    expect(song.steps[1]?.notes).toEqual([57, 60, 64]);
  });

  it('dura lo que dicen los pulsos y el tempo', () => {
    if (!song) throw new Error('falta');
    const beats = song.steps.length * 0.5;
    expect(pianoSongMs(song)).toBeCloseTo((beats * 60000) / 94, 4);
    expect(pianoSongMs(song, 0.5)).toBeCloseTo(2 * pianoSongMs(song), 4);
    const second = song.steps[1];
    if (!second) throw new Error('falta');
    expect(stepStartMs(song, second)).toBeCloseTo(0.5 * (60000 / 94), 4);
  });
});

describe('qué nota cuenta', () => {
  it('la misma nota cuenta; por encima del Do3 otra octava no', () => {
    expect(pianoNoteMatches(60, 60)).toBe(true);
    expect(pianoNoteMatches(60, 72)).toBe(false);
  });

  it('por debajo del Do3 vale la misma nota en otra octava (el micrófono duda de la octava)', () => {
    expect(pianoNoteMatches(45, 57)).toBe(true);
    expect(pianoNoteMatches(45, 33)).toBe(true);
    expect(pianoNoteMatches(45, 46)).toBe(false);
  });
});
