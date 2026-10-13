import { PracticeSession } from '@/core/application/practice-session';
import { LEVEL_1_CONFIG } from '@/core/domain/exercise';
import { createSeededRng } from '@/core/domain/rng';
import type { AudioOutput } from '@/core/ports/audio-output';
import { FakeClock } from '../fakes/fake-clock';
import { FakeNoteInput } from '../fakes/fake-note-input';

class SpyAudio implements AudioOutput {
  readonly calls: string[] = [];
  failing = false;
  noteOn(note: number): void {
    if (this.failing) throw new Error('audio roto');
    this.calls.push(`on:${note}`);
  }
  noteOff(note: number): void {
    this.calls.push(`off:${note}`);
  }
}

function setup(roundSize = 3) {
  const clock = new FakeClock(1000);
  const pc = new FakeNoteInput('teclado-pc');
  const midi = new FakeNoteInput('midi');
  const audio = new SpyAudio();
  const session = new PracticeSession({
    inputs: [pc, midi],
    audio,
    clock,
    rng: createSeededRng(5),
    config: { ...LEVEL_1_CONFIG, roundSize },
  });
  session.start();
  const exercise = () => {
    const current = session.getSnapshot().exercise;
    if (!current) throw new Error('sin ejercicio');
    return current;
  };
  return { clock, pc, midi, audio, session, exercise };
}

describe('PracticeSession · robustez', () => {
  it('el feedback tiene ids crecientes también al empezar otra ronda', () => {
    const { pc, session, exercise } = setup(1);
    pc.press(exercise().target, 1100);
    const first = session.getSnapshot().feedback?.id ?? 0;
    session.start();
    pc.press(exercise().target, 1300);
    expect(session.getSnapshot().feedback?.id).toBeGreaterThan(first);
  });

  it('un piano MIDI no genera sonido en la app (ya suena por sí mismo); el teclado del PC sí', () => {
    const { pc, midi, audio, exercise } = setup();
    midi.press(exercise().target, 1100);
    expect(audio.calls).toEqual([]);
    pc.press(exercise().target, 1200);
    expect(audio.calls).toHaveLength(1);
  });

  it('si el audio lanza un error, la nota se evalúa igual', () => {
    const { pc, audio, session, exercise } = setup();
    audio.failing = true;
    expect(() => pc.press(exercise().target, 1100)).not.toThrow();
    expect(session.getSnapshot().hits).toBe(1);
  });

  it('el tiempo en pausa no cuenta como tiempo de reacción', () => {
    const { clock, midi, session, exercise } = setup();
    midi.press(exercise().target, 1100);
    midi.setStatus({ kind: 'desconectado', deviceName: 'Piano' });
    expect(session.getSnapshot().phase).toBe('pausada');

    clock.advance(60_000);
    midi.setStatus({ kind: 'conectado', deviceName: 'Piano' });
    expect(exercise().shownAt).toBe(61_000);

    midi.press(exercise().target, 61_400);
    expect(exercise().attempts.at(-1)?.reactionMs).toBe(400);
  });

  it('una tecla suelta del PC durante la pausa no impide reanudar al volver el piano', () => {
    const { pc, midi, session, exercise } = setup();
    midi.press(exercise().target, 1100);
    midi.setStatus({ kind: 'desconectado', deviceName: 'Piano' });
    pc.press(60, 1200);
    expect(session.getSnapshot().phase).toBe('pausada');
    midi.setStatus({ kind: 'conectado', deviceName: 'Piano' });
    expect(session.getSnapshot().phase).toBe('en-curso');
  });

  it('pause() y resume() manuales funcionan y las pulsaciones en pausa se ignoran', () => {
    const { pc, session, exercise } = setup();
    session.pause();
    expect(session.getSnapshot().pauseReason).toBe('manual');
    pc.press(exercise().target, 1100);
    expect(session.getSnapshot().hits).toBe(0);
    session.resume();
    expect(session.getSnapshot().phase).toBe('en-curso');
  });

  it('registra si la ayuda estaba activada en cada intento y la posición de la nota', () => {
    const { pc, session, exercise } = setup();
    pc.press(exercise().target, 1100);
    session.setHelp(false);
    pc.press(exercise().target, 1300);
    const attempts = exercise().attempts;
    expect(attempts.map((attempt) => attempt.helpOn)).toEqual([true, false]);
    expect(attempts.map((attempt) => attempt.targetIndex)).toEqual([0, 1]);
  });

  it('dispose() deja de escuchar las entradas', () => {
    const { pc, session, exercise } = setup();
    const target = exercise().target;
    session.dispose();
    pc.press(target, 1100);
    expect(session.getSnapshot().hits).toBe(0);
  });
});
