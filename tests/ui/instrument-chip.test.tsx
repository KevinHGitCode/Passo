// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach } from 'vitest';
import { PreferencesService } from '@/core/application/preferences-service';
import { ProgressService } from '@/core/application/progress-service';
import { firstPosition } from '@/core/domain/instrument';
import { PROGRESS_VERSION } from '@/core/domain/progress';
import { Fretboard } from '@/ui/fretboard/Fretboard';
import { InstrumentChip } from '@/ui/instrument/InstrumentChip';
import { FakeCalendar } from '../fakes/fake-calendar';
import { FakePreferencesStore } from '../fakes/fake-preferences-store';
import { FakeProgressStore } from '../fakes/fake-progress-store';

afterEach(cleanup);

describe('Fretboard', () => {
  const base = { notation: 'latina' as const, ariaLabel: 'Mástil de prueba' };

  it('es una imagen con su texto y rotula las seis cuerdas con el nombre de la nota al aire', () => {
    render(<Fretboard target={null} upcoming={[]} {...base} />);
    expect(screen.getByRole('img', { name: 'Mástil de prueba' })).toBeTruthy();
    for (const label of ['1 · Mi', '2 · Si', '3 · Sol', '4 · Re', '5 · La', '6 · Mi']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('con notación americana los rótulos son letras', () => {
    render(<Fretboard target={null} upcoming={[]} notation="americana" ariaLabel="x" />);
    expect(screen.getByText('1 · E')).toBeTruthy();
    expect(screen.getByText('2 · B')).toBeTruthy();
    expect(screen.getByText('3 · G')).toBeTruthy();
  });

  it('«Ahora» lleva el número del dedo y «Después» es otra marca', () => {
    const { container } = render(
      <Fretboard
        target={firstPosition(1, 1)}
        upcoming={[firstPosition(1, 3), firstPosition(2, 1)]}
        {...base}
      />,
    );
    const now = container.querySelectorAll('[data-kind="now"]');
    const later = container.querySelectorAll('[data-kind="later"]');
    expect(now).toHaveLength(1);
    expect(now[0]?.textContent).toBe('1');
    expect(later).toHaveLength(2);
    expect(Array.from(later).map((mark) => mark.textContent)).toEqual(['3', '1']);
  });

  it('una cuerda al aire es un anillo sin número', () => {
    const { container } = render(
      <Fretboard target={firstPosition(3, 0)} upcoming={[]} {...base} />,
    );
    const now = container.querySelector('[data-kind="now"]');
    expect(now).toBeTruthy();
    expect(now?.textContent).toBe('');
    expect(now?.querySelector('circle')?.getAttribute('r')).toBe('9');
  });

  it('sin la ayuda no marca nada (se lee la nota)', () => {
    const { container } = render(
      <Fretboard
        target={firstPosition(1, 1)}
        upcoming={[firstPosition(1, 3)]}
        help={false}
        {...base}
      />,
    );
    expect(container.querySelectorAll('[data-kind]')).toHaveLength(0);
    expect(screen.getByText('1 · Mi')).toBeTruthy();
  });

  it('el resultado se ve en el borde del mástil', () => {
    const { rerender } = render(<Fretboard target={null} upcoming={[]} result="ok" {...base} />);
    expect(screen.getByTestId('fretboard').getAttribute('data-result')).toBe('ok');
    rerender(<Fretboard target={null} upcoming={[]} result="error" {...base} />);
    expect(screen.getByTestId('fretboard').getAttribute('data-result')).toBe('error');
    rerender(<Fretboard target={null} upcoming={[]} {...base} />);
    expect(screen.getByTestId('fretboard').hasAttribute('data-result')).toBe(false);
  });

  it('dibuja los tres trastes y sus números', () => {
    const { container } = render(<Fretboard target={null} upcoming={[]} {...base} />);
    expect(container.querySelectorAll('.fretboard__wire')).toHaveLength(3);
    expect(container.querySelectorAll('.fretboard__string')).toHaveLength(6);
  });
});

function setup(options: { instrument?: 'piano' | 'guitarra'; lessons?: string[] } = {}) {
  const preferences = new PreferencesService(
    new FakePreferencesStore({ version: 1, instrument: options.instrument ?? 'piano' }),
  );
  const store = new FakeProgressStore({
    version: PROGRESS_VERSION,
    xp: 0,
    lessons: Object.fromEntries(
      (options.lessons ?? []).map((id) => [
        id,
        { stars: 1, accuracy: 900, rhythm: 200, plays: 1, day: '2026-10-26' },
      ]),
    ),
    keys: {},
    daily: {},
    history: [],
  });
  const progress = new ProgressService(store, new FakeCalendar('2026-10-26'));
  const onChosen = vi.fn();
  const view = render(
    <InstrumentChip
      instrument={options.instrument ?? 'piano'}
      preferences={preferences}
      progress={progress}
      onChosen={onChosen}
    />,
  );
  const button = () => screen.getByTestId('instrument-chip');
  return { preferences, onChosen, button, view };
}

describe('InstrumentChip', () => {
  it('es un solo botón con el instrumento actual y avisa de que abre una lista', () => {
    const { button } = setup({ instrument: 'guitarra' });
    expect(button().getAttribute('aria-label')).toBe('Instrumento: Guitarra. Cambiar');
    expect(button().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('instrument-list')).toBeNull();
  });

  it('al pulsarlo se abre la lista con los dos instrumentos y marca el actual', () => {
    const { button } = setup({ instrument: 'guitarra' });
    fireEvent.click(button());
    expect(button().getAttribute('aria-expanded')).toBe('true');
    const list = screen.getByTestId('instrument-list');
    const piano = within(list).getByTestId('instrument-piano');
    const guitar = within(list).getByTestId('instrument-guitarra');
    expect(piano.getAttribute('aria-current')).toBeNull();
    expect(guitar.getAttribute('aria-current')).toBe('true');
    expect(guitar.textContent).toContain('actual');
    expect(button().getAttribute('aria-controls')).toBe(list.id);
  });

  it('al abrir, el foco va al instrumento actual', () => {
    const { button } = setup({ instrument: 'guitarra' });
    fireEvent.click(button());
    expect(document.activeElement).toBe(screen.getByTestId('instrument-guitarra'));
  });

  it('elegir otro instrumento lo guarda, cierra la lista, devuelve el foco y lo anuncia', () => {
    const { button, preferences, onChosen } = setup({ instrument: 'piano' });
    fireEvent.click(button());
    fireEvent.click(screen.getByTestId('instrument-guitarra'));
    expect(preferences.getSnapshot().instrument).toBe('guitarra');
    expect(onChosen).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('instrument-list')).toBeNull();
    expect(document.activeElement).toBe(button());
    expect(screen.getByTestId('instrument-live').textContent).toBe('Ahora aprendes Guitarra');
  });

  it('elegir el mismo instrumento solo cierra', () => {
    const { button, preferences, onChosen } = setup({ instrument: 'piano' });
    fireEvent.click(button());
    fireEvent.click(screen.getByTestId('instrument-piano'));
    expect(preferences.getSnapshot().instrument).toBe('piano');
    expect(onChosen).not.toHaveBeenCalled();
    expect(screen.queryByTestId('instrument-list')).toBeNull();
    expect(screen.getByTestId('instrument-live').textContent).toBe('');
  });

  it('Esc cierra la lista y devuelve el foco al chip sin pasar a otros oyentes', () => {
    const { button } = setup();
    const other = vi.fn();
    window.addEventListener('keydown', other);
    fireEvent.click(button());
    fireEvent.keyDown(screen.getByTestId('instrument-list'), { key: 'Escape' });
    expect(screen.queryByTestId('instrument-list')).toBeNull();
    expect(document.activeElement).toBe(button());
    expect(other).not.toHaveBeenCalled();
    window.removeEventListener('keydown', other);
  });

  it('pulsar el chip otra vez la cierra', () => {
    const { button } = setup();
    fireEvent.click(button());
    fireEvent.click(button());
    expect(screen.queryByTestId('instrument-list')).toBeNull();
  });

  it('cuenta las lecciones hechas de cada instrumento, y «Recién empiezas» si no hay ninguna', () => {
    const { button } = setup({ lessons: ['u1-1', 'u1-2', 'g1-1'] });
    fireEvent.click(button());
    expect(screen.getByTestId('instrument-piano').textContent).toContain('2 de 32 lecciones');
    expect(screen.getByTestId('instrument-guitarra').textContent).toContain('1 de 14 lecciones');
  });

  it('sin nada hecho dice «Recién empiezas»', () => {
    const { button } = setup();
    fireEvent.click(button());
    expect(screen.getByTestId('instrument-piano').textContent).toContain('Recién empiezas');
    expect(screen.getByTestId('instrument-guitarra').textContent).toContain('Recién empiezas');
  });

  it('no hay un control de «agregar»: solo los instrumentos que existen', () => {
    const { button } = setup();
    fireEvent.click(button());
    const list = screen.getByTestId('instrument-list');
    expect(within(list).getAllByRole('button')).toHaveLength(2);
    expect(list.textContent).not.toContain('Agregar');
  });

  it('cambiar desde fuera se refleja al volver a abrir', () => {
    const { button, preferences } = setup();
    act(() => preferences.update({ instrument: 'guitarra' }));
    fireEvent.click(button());
    expect(screen.getByTestId('instrument-piano')).toBeTruthy();
  });
});
