import { PracticeSession } from '@/core/application/practice-session';
import { roundConfigFor } from '@/core/domain/exercise';
import type { RoundConfig } from '@/core/domain/exercise';
import { createSeededRng } from '@/core/domain/rng';
import { FakeClock } from '../fakes/fake-clock';
import { FakeNoteInput } from '../fakes/fake-note-input';

function setup() {
  const input = new FakeNoteInput('teclado-pc');
  const session = new PracticeSession({
    inputs: [input],
    audio: { noteOn: () => undefined, noteOff: () => undefined },
    clock: new FakeClock(0),
    rng: createSeededRng(3),
    primarySource: 'teclado-pc',
    config: { ...(roundConfigFor('terceras', 1) as RoundConfig), roundSize: 3 },
  });
  input.setStatus({ kind: 'conectado', deviceName: 'Teclado del PC' });
  session.start();
  return { input, session };
}

const chords = { ...(roundConfigFor('acordes', 1) as RoundConfig), roundSize: 3 };

describe('PracticeSession · pausa al configurar y al reanudar', () => {
  it('configurar con la ronda en pausa por una entrada perdida sigue esperándola', () => {
    const { input, session } = setup();
    input.setStatus({ kind: 'desconectado', deviceName: 'Teclado del PC' });
    expect(session.getSnapshot()).toMatchObject({ phase: 'pausada', pauseReason: 'desconexion' });

    session.configure(chords);
    expect(session.getSnapshot()).toMatchObject({
      phase: 'pausada',
      pauseReason: 'desconexion',
      pausedSource: 'teclado-pc',
      mode: 'acordes',
      hits: 0,
    });
    expect(session.getSnapshot().exercise?.target.notes).toHaveLength(3);

    input.setStatus({ kind: 'conectado', deviceName: 'Teclado del PC' });
    expect(session.getSnapshot().phase).toBe('en-curso');
  });

  it('configurar con una pausa manual la deja manual', () => {
    const { session } = setup();
    session.pause();
    session.configure(chords);
    expect(session.getSnapshot()).toMatchObject({
      phase: 'pausada',
      pauseReason: 'manual',
      pausedSource: null,
    });
  });

  it('configurar con la ronda en pausa es un solo cambio (sin pasar un instante por «en curso»)', () => {
    const { session } = setup();
    session.pause();
    const phases: string[] = [];
    session.subscribe(() => phases.push(session.getSnapshot().phase));
    session.configure(chords);
    expect(phases).toEqual(['pausada']);
  });

  it('si la entrada se perdió mientras estaba en pausa manual, reanudar espera a que vuelva', () => {
    const { input, session } = setup();
    session.pause();
    input.setStatus({ kind: 'desconectado', deviceName: 'Teclado del PC' });
    session.resume();
    expect(session.getSnapshot()).toMatchObject({
      phase: 'pausada',
      pauseReason: 'desconexion',
      pausedSource: 'teclado-pc',
    });
    input.setStatus({ kind: 'conectado', deviceName: 'Teclado del PC' });
    expect(session.getSnapshot().phase).toBe('en-curso');
  });

  it('con la entrada conectada reanudar funciona como siempre', () => {
    const { session } = setup();
    session.pause();
    session.resume();
    expect(session.getSnapshot().phase).toBe('en-curso');
  });
});
