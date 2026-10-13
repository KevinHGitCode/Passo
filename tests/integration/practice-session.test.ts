import { PracticeSession } from '@/core/application/practice-session';
import { LEVEL_1_CONFIG } from '@/core/domain/exercise';
import { createSeededRng } from '@/core/domain/rng';
import type { AudioOutput } from '@/core/ports/audio-output';
import { FakeClock } from '../fakes/fake-clock';
import { FakeNoteInput } from '../fakes/fake-note-input';

class SpyAudio implements AudioOutput {
  readonly calls: string[] = [];
  noteOn(note: number): void {
    this.calls.push(`on:${note}`);
  }
  noteOff(note: number): void {
    this.calls.push(`off:${note}`);
  }
}

function exerciseOf(session: PracticeSession) {
  const exercise = session.getSnapshot().exercise;
  if (!exercise) throw new Error('La sesión no tiene ejercicio en curso');
  return exercise;
}

function setup(roundSize = 3) {
  const clock = new FakeClock(1000);
  const input = new FakeNoteInput('teclado-pc');
  const audio = new SpyAudio();
  const session = new PracticeSession({
    inputs: [input],
    audio,
    clock,
    rng: createSeededRng(5),
    config: { ...LEVEL_1_CONFIG, roundSize },
  });
  session.start();
  const target = () => exerciseOf(session).target;
  return { clock, input, audio, session, target };
}

describe('PracticeSession (integración con entrada falsa)', () => {
  it('empieza en curso con una nota del nivel 1 y sin errores', () => {
    const { session } = setup();
    const snap = session.getSnapshot();
    expect(snap.phase).toBe('en-curso');
    expect(LEVEL_1_CONFIG.pool).toContain(exerciseOf(session).target);
    expect(snap.hits).toBe(0);
    expect(snap.errors).toBe(0);
  });

  it('un error no avanza y suena igualmente; el acierto sí avanza', () => {
    const { input, audio, session, target } = setup();
    const first = target();
    const wrong = first === 60 ? 62 : 60;

    input.press(wrong, 1300);
    expect(exerciseOf(session).target).toBe(first);
    expect(session.getSnapshot().errors).toBe(1);
    expect(session.getSnapshot().feedback?.outcome.kind).toBe('error');

    input.press(first, 1700);
    expect(session.getSnapshot().hits).toBe(1);
    expect(session.getSnapshot().feedback?.outcome.kind).toBe('acierto');
    expect(audio.calls).toEqual([`on:${wrong}`, `on:${first}`]);
  });

  it('el tiempo de reacción sale del reloj del evento, exacto', () => {
    const { input, session, target } = setup();
    input.press(target(), 1620);
    expect(exerciseOf(session).attempts[0]?.reactionMs).toBe(620);
  });

  it('completa la ronda y entrega el resumen', () => {
    const { input, session, target } = setup(2);
    input.press(target(), 1200);
    input.press(target(), 1500);
    const snap = session.getSnapshot();
    expect(snap.phase).toBe('completada');
    expect(snap.feedback?.outcome.kind).toBe('ronda-completa');
  });

  it('lleva la cuenta de teclas pulsadas y envía note-off al audio', () => {
    const { input, audio, session, target } = setup();
    const note = target();
    input.press(note, 1200);
    expect(session.getSnapshot().pressed).toEqual([note]);
    input.release(note, 1250);
    expect(session.getSnapshot().pressed).toEqual([]);
    input.press(60, 1300);
    expect(session.getSnapshot().pressed).toContain(60);
    input.release(60, 1400);
    expect(session.getSnapshot().pressed).not.toContain(60);
    expect(audio.calls).toContain('off:60');
  });

  it('se pausa si se desconecta la fuente en uso y se reanuda al volver', () => {
    const { input, session, target } = setup();
    input.press(target(), 1200);
    const before = session.getSnapshot().exercise;
    input.setStatus({ kind: 'desconectado', deviceName: 'Piano' });
    expect(session.getSnapshot().phase).toBe('pausada');
    expect(session.getSnapshot().pauseReason).toBe('desconexion');

    input.press(target(), 1300);
    expect(session.getSnapshot().exercise).toBe(before);

    input.setStatus({ kind: 'conectado', deviceName: 'Piano' });
    expect(session.getSnapshot().phase).toBe('en-curso');
  });

  it('notifica a los suscriptores en cada cambio y cambia la identidad de la foto', () => {
    const { input, session, target } = setup();
    let calls = 0;
    const unsubscribe = session.subscribe(() => calls++);
    const before = session.getSnapshot();
    input.press(target(), 1200);
    expect(calls).toBeGreaterThan(0);
    expect(session.getSnapshot()).not.toBe(before);
    unsubscribe();
    const count = calls;
    input.press(target(), 1300);
    expect(calls).toBe(count);
  });

  it('cambiar la notación queda registrado en los intentos siguientes', () => {
    const { input, session, target } = setup();
    session.setNotation('americana');
    input.press(target(), 1200);
    expect(exerciseOf(session).attempts[0]?.noteNameMode).toBe('americana');
  });
});
