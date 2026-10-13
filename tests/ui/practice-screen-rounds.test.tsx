// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { PracticeSession } from '@/core/application/practice-session';
import { LEVEL_1_CONFIG } from '@/core/domain/exercise';
import { createSeededRng } from '@/core/domain/rng';
import { PracticeScreen } from '@/ui/practice/PracticeScreen';
import { FakeClock } from '../fakes/fake-clock';
import { FakeNoteInput } from '../fakes/fake-note-input';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup(roundSize = 2) {
  const input = new FakeNoteInput('teclado-pc');
  const session = new PracticeSession({
    inputs: [input],
    audio: { noteOn: () => undefined, noteOff: () => undefined },
    clock: new FakeClock(0),
    rng: createSeededRng(3),
    config: { ...LEVEL_1_CONFIG, roundSize },
  });
  render(<PracticeScreen session={session} theme="auto" onCycleTheme={() => undefined} />);
  const press = (note: number) => act(() => input.press(note, 100));
  const targetMidi = () => Number(screen.getByTestId('target-note').dataset['midi']);
  const wrongNote = () => (targetMidi() === 60 ? 62 : 60);
  const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
  return { session, press, targetMidi, wrongNote, wait };
}

describe('PracticeScreen · varias rondas y detalles', () => {
  it('en la 2.ª ronda el feedback vuelve a mostrarse desde la primera pulsación', () => {
    const { press, targetMidi, wrongNote, wait } = setup(2);
    fireEvent.click(screen.getByTestId('start'));
    press(wrongNote());
    wait(2000);
    press(targetMidi());
    press(targetMidi());
    wait(2000);
    fireEvent.click(screen.getByText('Otra ronda'));
    press(wrongNote());
    expect(screen.getByTestId('feedback').dataset['tone']).toBe('error');
  });

  it('el feedback desaparece solo pasado un rato', () => {
    const { press, wrongNote, wait } = setup();
    fireEvent.click(screen.getByTestId('start'));
    press(wrongNote());
    expect(screen.queryByTestId('feedback')).not.toBeNull();
    wait(2000);
    expect(screen.queryByTestId('feedback')).toBeNull();
  });

  it('la bienvenida aclara que Do4 es el Do central (C3 / Do3 en otros pianos)', () => {
    setup();
    expect(screen.getByTestId('welcome').textContent).toContain('Do central');
    expect(screen.getByTestId('welcome').textContent).toContain('C3');
  });

  it('el resumen sale del estado de la sesión, no del feedback efímero', () => {
    const { session, press, targetMidi, wait } = setup(1);
    fireEvent.click(screen.getByTestId('start'));
    press(targetMidi());
    wait(5000);
    expect(session.getSnapshot().summary?.totalTargets).toBe(1);
    expect(screen.getByTestId('summary').textContent).toContain('1/1');
  });

  it('en un error el anuncio para lectores de pantalla incluye el número de error', () => {
    const { press, wrongNote } = setup();
    fireEvent.click(screen.getByTestId('start'));
    press(wrongNote());
    expect(screen.getByRole('status').textContent).toContain('error 1');
    press(wrongNote());
    expect(screen.getByRole('status').textContent).toContain('error 2');
  });

  it('el tablero recibe el foco al empezar (el botón pulsado desaparece)', () => {
    setup();
    fireEvent.click(screen.getByTestId('start'));
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Práctica: toca esta nota');
  });
});
