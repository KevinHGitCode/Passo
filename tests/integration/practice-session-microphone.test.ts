import { PracticeSession } from '@/core/application/practice-session';
import { LEVEL_1_CONFIG } from '@/core/domain/exercise';
import type { NoteConfidence, NoteEvent } from '@/core/domain/note-event';
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

function setup(options: { primary?: boolean; roundSize?: number } = {}) {
  const clock = new FakeClock(1000);
  const mic = new FakeNoteInput('microfono');
  const pc = new FakeNoteInput('teclado-pc');
  const audio = new SpyAudio();
  const session = new PracticeSession({
    inputs: [mic, pc],
    audio,
    clock,
    rng: createSeededRng(9),
    config: { ...LEVEL_1_CONFIG, roundSize: options.roundSize ?? 5 },
    ...(options.primary === false ? {} : { primarySource: 'microfono' as const }),
  });
  session.start();
  const target = () => {
    const exercise = session.getSnapshot().exercise;
    if (!exercise) throw new Error('sin ejercicio');
    return exercise.target;
  };
  /** Emite una nota por micrófono como lo haría el adaptador. */
  const hear = (note: number, at: number, confidence: NoteConfidence = 'alta') => {
    const event: NoteEvent = {
      type: 'on',
      note,
      velocity: 70,
      at,
      source: 'microfono',
      confidence,
    };
    mic.emitEvent(event);
  };
  return { clock, mic, pc, audio, session, target, hear };
}

describe('PracticeSession · entrada por micrófono', () => {
  it('pausa si se pierde el micrófono aunque todavía no se haya oído ninguna nota', () => {
    const { mic, session } = setup();
    mic.setStatus({ kind: 'conectado', deviceName: 'Micrófono' });
    mic.setStatus({ kind: 'desconectado', deviceName: 'Micrófono' });
    const snapshot = session.getSnapshot();
    expect(snapshot.phase).toBe('pausada');
    expect(snapshot.pausedSource).toBe('microfono');
    mic.setStatus({ kind: 'conectado', deviceName: 'Micrófono' });
    expect(session.getSnapshot().phase).toBe('en-curso');
    expect(session.getSnapshot().pausedSource).toBeNull();
  });

  it('sin entrada principal, perder el micrófono antes de tocar no pausa (comportamiento anterior)', () => {
    const { mic, session } = setup({ primary: false });
    mic.setStatus({ kind: 'desconectado', deviceName: 'Micrófono' });
    expect(session.getSnapshot().phase).toBe('en-curso');
  });

  it('las notas oídas no aparecen como teclas pulsadas', () => {
    const { session, target, hear } = setup();
    hear(target(), 1200);
    expect(session.getSnapshot().pressed).toEqual([]);
    expect(session.getSnapshot().hits).toBe(1);
  });

  it('con el micrófono conectado la app no suena (se oiría a sí misma); sin él, el teclado del PC sí', () => {
    const { mic, pc, audio, target } = setup();
    pc.press(target(), 1100);
    expect(audio.calls).toHaveLength(1);
    mic.setStatus({ kind: 'conectado', deviceName: 'Micrófono' });
    pc.press(target(), 1200);
    expect(audio.calls).toHaveLength(1);
  });

  it('una nota dudosa distinta de la pedida no es un error: la nota sigue y no suma errores', () => {
    const { session, target, hear } = setup();
    const before = target();
    hear(before === 60 ? 62 : 60, 1300, 'media');
    const snapshot = session.getSnapshot();
    expect(snapshot.feedback?.outcome.kind).toBe('dudoso');
    expect(snapshot.errors).toBe(0);
    expect(snapshot.exercise?.attempts).toHaveLength(0);
    expect(target()).toBe(before);
  });

  it('la misma nota mal oída con confianza alta sí es un error', () => {
    const { session, target, hear } = setup();
    hear(target() === 60 ? 62 : 60, 1300, 'alta');
    expect(session.getSnapshot().errors).toBe(1);
  });

  it('la siguiente nota se muestra cuando se entrega el evento, no cuando fue el ataque', () => {
    const { clock, session, target, hear } = setup();
    clock.advance(400); // el adaptador entrega ~150 ms después del ataque; aquí 400 para verlo claro
    hear(target(), 1100); // ataque a 1100, entrega a 1400
    expect(session.getSnapshot().exercise?.shownAt).toBe(1400);
  });

  it('tres errores seguidos con la misma diferencia avisan de un posible teclado transpuesto', () => {
    const { session, target, hear } = setup();
    hear(target() + 2, 1100);
    hear(target() + 2, 1200);
    expect(session.getSnapshot().transposition).toBeNull();
    hear(target() + 2, 1300);
    expect(session.getSnapshot().transposition).toBe(2);
    hear(target(), 1400);
    expect(session.getSnapshot().transposition).toBeNull();
  });
});
