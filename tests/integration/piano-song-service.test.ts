import { describe, expect, it } from 'vitest';
import { HIT_WINDOW_MS, LEAD_IN_MS, PianoSongService } from '@/core/application/piano-song-service';
import { findPianoSong, stepStartMs } from '@/core/domain/piano-songs';
import { FakeClock } from '../fakes/fake-clock';
import { FakeNoteInput } from '../fakes/fake-note-input';

function setup() {
  const input = new FakeNoteInput('teclado-pc');
  const clock = new FakeClock(1000);
  const expectations: (readonly number[] | null)[] = [];
  const service = new PianoSongService({
    inputs: [input],
    clock,
    expectation: { setExpectation: (notes) => expectations.push(notes) },
  });
  const song = findPianoSong('golden-brown');
  if (!song) throw new Error('falta la canción');
  return { input, clock, service, song, expectations };
}

const press = (input: FakeNoteInput, note: number, at: number) =>
  input.emitEvent({ type: 'on', note, velocity: 80, at, source: 'teclado-pc' });

describe('PianoSongService · esperar', () => {
  it('abre en el primer paso, sin empezar; el cabezal está en 0', () => {
    const { service } = setup();
    service.open(findPianoSong('golden-brown') as NonNullable<ReturnType<typeof findPianoSong>>);
    expect(service.getSnapshot()).toMatchObject({
      open: true,
      mode: 'espera',
      phase: 'listo',
      index: 0,
    });
    expect(service.playhead()).toBe(0);
  });

  it('cada paso acertado avanza al siguiente; una nota que no es la del paso se dice', () => {
    const { service, input, song, clock } = setup();
    service.open(song);
    const first = song.steps[0];
    if (!first) throw new Error('paso');
    press(input, 50, 1100);
    expect(service.getSnapshot().wrong).toBe(50);
    expect(service.getSnapshot().index).toBe(0);
    press(input, first.notes[0] as number, 1200);
    expect(service.getSnapshot()).toMatchObject({ phase: 'tocando', index: 1, wrong: null });
    expect(service.getSnapshot().states[0]).toBe('bien');
    clock.advance(5000);
    // El cabezal se queda en la nota que toca (no sigue de largo).
    const second = song.steps[1];
    if (!second) throw new Error('paso');
    expect(service.playhead()).toBeLessThanOrEqual(stepStartMs(song, second) + 0.001);
  });

  it('un acorde pide todas sus notas, en cualquier orden', () => {
    const { service, input, song } = setup();
    service.open(song);
    press(input, 45, 1100);
    const chord = song.steps[1];
    if (!chord) throw new Error('paso');
    expect(chord.notes).toEqual([57, 60, 64]);
    press(input, 64, 1200);
    press(input, 57, 1250);
    expect(service.getSnapshot()).toMatchObject({ index: 1, doneNotes: [64, 57] });
    press(input, 60, 1300);
    expect(service.getSnapshot().index).toBe(2);
  });

  it('abajo del Do3 vale la misma nota en otra octava (el micrófono duda de la octava)', () => {
    const { service, input, song } = setup();
    service.open(song);
    // El primer paso es el La2 (45): un La3 (57) lo da por bueno.
    press(input, 57, 1100);
    expect(service.getSnapshot().index).toBe(1);
  });

  it('avisa al micrófono de qué acorde espera y lo suelta al cerrar', () => {
    const { service, input, song, expectations } = setup();
    service.open(song);
    press(input, 45, 1100);
    expect(expectations[expectations.length - 1]).toEqual([57, 60, 64]);
    service.close();
    expect(expectations[expectations.length - 1]).toBeNull();
  });

  it('recorrer todos los pasos termina la canción', () => {
    const { service, input, song } = setup();
    service.open(song);
    let at = 1100;
    for (const step of song.steps) for (const note of step.notes) press(input, note, (at += 20));
    expect(service.getSnapshot().phase).toBe('terminada');
    expect(service.getSnapshot().states.every((state) => state === 'bien')).toBe(true);
  });

  it('cambiar de modo o velocidad empieza de nuevo', () => {
    const { service, input, song } = setup();
    service.open(song);
    press(input, 45, 1100);
    service.setSpeed('lento');
    expect(service.getSnapshot()).toMatchObject({ speed: 'lento', index: 0, phase: 'listo' });
    service.setMode('tempo');
    expect(service.getSnapshot().mode).toBe('tempo');
  });
});

describe('PianoSongService · a tempo', () => {
  it('empieza con una cuenta atrás y el cabezal corre con el reloj', () => {
    const { service, clock, song } = setup();
    service.open(song, 'tempo');
    expect(service.playhead()).toBe(-LEAD_IN_MS);
    service.start();
    clock.advance(1000);
    expect(service.playhead()).toBeCloseTo(-LEAD_IN_MS + 1000, 6);
    expect(service.getSnapshot().phase).toBe('tocando');
  });

  it('una nota tocada en su hora cuenta (con lo que se adelantó o retrasó); fuera de la ventana, no', () => {
    const { service, input, clock, song } = setup();
    service.open(song, 'tempo');
    service.start();
    // La primera nota toca cuando el cabezal llega a 0: LEAD_IN_MS después.
    clock.advance(LEAD_IN_MS + 100);
    press(input, 45, clock.now());
    const snapshot = service.getSnapshot();
    expect(snapshot.states[0]).toBe('bien');
    expect(snapshot.errors[0]).toBeCloseTo(100, 6);
    expect(snapshot.index).toBe(1);
  });

  it('una nota muy adelantada no cuenta y se marca como equivocada', () => {
    const { service, input, clock, song } = setup();
    service.open(song, 'tempo');
    service.start();
    clock.advance(500);
    press(input, 45, clock.now());
    expect(service.getSnapshot().states[0]).toBe('pendiente');
    expect(service.getSnapshot().wrong).toBe(45);
  });

  it('una nota que no se toca a tiempo se da por fallada y la canción sigue sola', () => {
    const { service, clock, song } = setup();
    service.open(song, 'tempo');
    service.start();
    clock.advance(LEAD_IN_MS + HIT_WINDOW_MS + 50);
    service.tick();
    const snapshot = service.getSnapshot();
    expect(snapshot.states[0]).toBe('fallo');
    expect(snapshot.index).toBeGreaterThanOrEqual(1);
  });

  it('al pasar la última nota la canción termina con lo acertado y lo fallado', () => {
    const { service, input, clock, song } = setup();
    service.open(song, 'tempo');
    service.start();
    clock.advance(LEAD_IN_MS + 20);
    press(input, 45, clock.now());
    clock.advance(60_000);
    service.tick();
    const snapshot = service.getSnapshot();
    expect(snapshot.phase).toBe('terminada');
    expect(snapshot.states.filter((state) => state === 'bien')).toHaveLength(1);
    expect(snapshot.states.filter((state) => state === 'fallo').length).toBe(song.steps.length - 1);
  });

  it('en «a tempo» una nota no pone en marcha la canción antes de dar la salida', () => {
    const { service, input, song } = setup();
    service.open(song, 'tempo');
    press(input, 45, 1100);
    expect(service.getSnapshot().phase).toBe('listo');
  });
});
