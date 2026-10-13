// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach } from 'vitest';
import { PracticeSession } from '@/core/application/practice-session';
import { LEVEL_1_CONFIG } from '@/core/domain/exercise';
import { createSeededRng } from '@/core/domain/rng';
import { PracticeScreen } from '@/ui/practice/PracticeScreen';
import { FakeClock } from '../fakes/fake-clock';
import { FakeNoteInput } from '../fakes/fake-note-input';

afterEach(cleanup);

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
  const press = (note: number, at = 100) => act(() => input.press(note, at));
  const start = () => fireEvent.click(screen.getByTestId('start'));
  const targetMidi = () => Number(screen.getByTestId('target-note').dataset['midi']);
  const wrongNote = () => (targetMidi() === 60 ? 62 : 60);
  return { session, press, start, targetMidi, wrongNote };
}

describe('PracticeScreen', () => {
  it('antes de empezar muestra la bienvenida y el botón Empezar', () => {
    setup();
    expect(screen.getByTestId('welcome')).toBeTruthy();
    expect(screen.queryByTestId('target')).toBeNull();
  });

  it('al empezar muestra una nota del nivel 1 con su nombre y octava', () => {
    const { start, targetMidi } = setup();
    start();
    expect(LEVEL_1_CONFIG.pool).toContain(targetMidi());
    expect(screen.getByTestId('target-note').textContent).toMatch(/^(Do|Re|Mi|Fa|Sol)4$/);
  });

  it('un error muestra icono, texto y la distancia, y no avanza', () => {
    const { start, press, targetMidi, wrongNote } = setup();
    start();
    const before = targetMidi();
    press(wrongNote());
    const feedback = screen.getByTestId('feedback');
    expect(feedback.dataset['tone']).toBe('error');
    expect(feedback.textContent).toContain('Incorrecto');
    expect(feedback.textContent).toContain('Era');
    expect(feedback.querySelector('svg')).not.toBeNull();
    expect(targetMidi()).toBe(before);
    expect(screen.getByTestId('counters').textContent).toContain('Errores 1');
  });

  it('un acierto avanza la nota y suma al progreso', () => {
    const { start, press, targetMidi } = setup(5);
    start();
    press(targetMidi());
    expect(screen.getByTestId('feedback').dataset['tone']).toBe('ok');
    expect(screen.getByTestId('counters').textContent).toContain('Notas 1/5');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('1');
  });

  it('cambiar la notación cambia los nombres (Do ↔ C)', () => {
    const { start, session } = setup();
    start();
    fireEvent.click(screen.getByLabelText('C D E'));
    expect(session.getSnapshot().notation).toBe('americana');
    expect(screen.getByTestId('target-note').textContent).toMatch(/^[CDEFG]4$/);
  });

  it('sin ayuda la tecla objetivo no se ilumina, pero un error revela la correcta', () => {
    const { start, press, targetMidi, wrongNote } = setup();
    start();
    const piano = () => screen.getByTestId('piano');
    expect(piano().querySelector('.key--target')).not.toBeNull();
    fireEvent.click(screen.getByTestId('help-switch'));
    expect(piano().querySelector('.key--target')).toBeNull();
    press(wrongNote());
    expect(
      piano().querySelector(`[data-midi="${targetMidi()}"]`)?.classList.contains('key--expected'),
    ).toBe(true);
  });

  it('al completar la ronda muestra el resumen y permite otra ronda', () => {
    const { start, press, targetMidi } = setup(2);
    start();
    press(targetMidi());
    press(targetMidi());
    const summary = screen.getByTestId('summary');
    expect(within(summary).getByText('¡Ronda completa!')).toBeTruthy();
    expect(summary.textContent).toContain('2/2');
    fireEvent.click(within(summary).getByText('Otra ronda'));
    expect(screen.getByTestId('target')).toBeTruthy();
  });

  it('anuncia el estado en una región aria-live', () => {
    const { start, press, wrongNote } = setup();
    start();
    expect(screen.getByRole('status').textContent).toMatch(/^Toca (Do|Re|Mi|Fa|Sol)4$/);
    press(wrongNote());
    expect(screen.getByRole('status').textContent).toContain('Incorrecto');
  });
});
