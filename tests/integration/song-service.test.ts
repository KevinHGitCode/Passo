import { describe, expect, it } from 'vitest';
import { SongService } from '@/core/application/song-service';
import { findSong } from '@/core/domain/songs';
import { FakeNoteInput } from '../fakes/fake-note-input';

function setup(id = 'cumpleanos-feliz') {
  const input = new FakeNoteInput('microfono');
  const songs = new SongService({ input });
  const song = findSong(id);
  if (!song) throw new Error('falta la canción');
  songs.open(song);
  return { input, songs, song };
}

describe('SongService', () => {
  it('abre en el primer paso, sin tiempo ideal y sin resultados', () => {
    const { songs } = setup();
    expect(songs.getSnapshot()).toMatchObject({
      open: true,
      phase: 'listo',
      index: 0,
      idealMs: null,
      feedback: null,
    });
  });

  it('el primer sonido correcto empieza el tiempo y avanza sin juzgar', () => {
    const { songs, input, song } = setup();
    const first = song.steps[0];
    if (first?.kind !== 'nota') throw new Error('paso');
    input.emitEvent({ type: 'on', note: first.midi, velocity: 80, at: 1000, source: 'microfono' });
    const snapshot = songs.getSnapshot();
    expect(snapshot).toMatchObject({ phase: 'tocando', index: 1, feedback: null });
    // Lo que debería tardar en llegar al siguiente: lo que dura el primer paso (0,75 pulsos a 90).
    expect(snapshot.idealMs).toBeCloseTo((0.75 * 60000) / 90, 6);
  });

  it('juzga cuánto se tardó en llegar a cada paso', () => {
    const { songs, input, song } = setup();
    const [a, b] = song.steps;
    if (a?.kind !== 'nota' || b?.kind !== 'nota') throw new Error('paso');
    input.emitEvent({ type: 'on', note: a.midi, velocity: 80, at: 1000, source: 'microfono' });
    // El paso 1 debía llegar a los 500 ms; llega a los 2500: muy lento.
    input.emitEvent({ type: 'on', note: b.midi, velocity: 80, at: 3500, source: 'microfono' });
    const snapshot = songs.getSnapshot();
    expect(snapshot.feedback).toMatchObject({ pace: 'muy-lento', step: 1 });
    expect(snapshot.feedback?.text).toContain('Muy lento en esta nota');
    expect(snapshot.results[1]?.deltaMs).toBeCloseTo(2500 - 500, 6);
  });

  it('una nota equivocada no avanza y avisa solo si se oyó con seguridad', () => {
    const { songs, input, song } = setup();
    const first = song.steps[0];
    if (first?.kind !== 'nota') throw new Error('paso');
    input.emitEvent({
      type: 'on',
      note: first.midi + 1,
      velocity: 80,
      at: 100,
      source: 'microfono',
      confidence: 'media',
    });
    expect(songs.getSnapshot().wrong).toBeNull();
    input.emitEvent({
      type: 'on',
      note: first.midi + 1,
      velocity: 80,
      at: 900,
      source: 'microfono',
      confidence: 'alta',
    });
    expect(songs.getSnapshot()).toMatchObject({ wrong: first.midi + 1, index: 0 });
    // Tocar la buena la quita.
    input.emitEvent({
      type: 'on',
      note: first.midi,
      velocity: 80,
      at: 1800,
      source: 'microfono',
      confidence: 'alta',
    });
    expect(songs.getSnapshot()).toMatchObject({ wrong: null, index: 1 });
  });

  it('la misma pulsación oída dos veces seguidas (la cuerda aún suena) no cuenta dos veces', () => {
    const { songs, input, song } = setup();
    const [a, b] = song.steps;
    if (a?.kind !== 'nota' || b?.kind !== 'nota') throw new Error('paso');
    input.emitEvent({ type: 'on', note: a.midi, velocity: 80, at: 1000, source: 'microfono' });
    input.emitEvent({ type: 'on', note: b.midi, velocity: 80, at: 1100, source: 'microfono' });
    expect(songs.getSnapshot().index).toBe(1);
  });

  it('en un rasgueo cualquier ataque llega al acorde y se juzga el cambio', () => {
    const { songs, input } = setup('de-colores');
    input.emitEvent({ type: 'on', note: 43, velocity: 80, at: 0, source: 'microfono' });
    // G dura 4 pulsos a 70: ~3,43 s. Llega a los 7 s: «el cambio de acorde tardó demasiado».
    input.emitEvent({ type: 'on', note: 48, velocity: 80, at: 7000, source: 'microfono' });
    expect(songs.getSnapshot().feedback?.text).toContain('El cambio de acorde tardó demasiado');
  });

  it('recorrer todos los pasos termina la canción; «de nuevo» y la velocidad reinician', () => {
    const { songs, input, song } = setup();
    let at = 0;
    for (const step of song.steps) {
      if (step.kind !== 'nota') throw new Error('paso');
      at += 600;
      input.emitEvent({ type: 'on', note: step.midi, velocity: 80, at, source: 'microfono' });
    }
    expect(songs.getSnapshot().phase).toBe('terminada');
    songs.restart();
    expect(songs.getSnapshot()).toMatchObject({ phase: 'listo', index: 0 });
    songs.setSpeed('lento');
    expect(songs.getSnapshot().speed).toBe('lento');
  });

  it('al abrir pide el ajuste de escucha de canciones y al cerrar lo devuelve', () => {
    const calls: string[] = [];
    const songs = new SongService({
      input: new FakeNoteInput('microfono'),
      listening: { enter: () => calls.push('enter'), leave: () => calls.push('leave') },
    });
    const song = findSong('estrellita');
    if (!song) throw new Error('falta');
    songs.open(song);
    songs.open(song);
    songs.close();
    songs.close();
    expect(calls).toEqual(['enter', 'leave']);
  });

  it('al cerrar deja de escuchar', () => {
    const { songs, input, song } = setup();
    songs.close();
    const first = song.steps[0];
    if (first?.kind !== 'nota') throw new Error('paso');
    input.emitEvent({ type: 'on', note: first.midi, velocity: 80, at: 100, source: 'microfono' });
    expect(songs.getSnapshot().open).toBe(false);
  });
});
