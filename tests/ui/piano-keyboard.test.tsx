// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach } from 'vitest';
import { PianoKeyboard } from '@/ui/keyboard/piano-keyboard';
import type { KeyVisual } from '@/ui/keyboard/piano-keyboard';

afterEach(cleanup);

function keyElement(container: HTMLElement, midi: number): Element {
  const element = container.querySelector(`[data-midi="${midi}"]`);
  if (!element) throw new Error(`No se dibujó la tecla ${midi}`);
  return element;
}

describe('PianoKeyboard', () => {
  it('dibuja una tecla por nota del rango y expone una etiqueta accesible única', () => {
    const { container, getByRole } = render(
      <PianoKeyboard from={60} to={72} ariaLabel="Teclado de Do4 a Do5" />,
    );
    expect(container.querySelectorAll('[data-midi]')).toHaveLength(13);
    expect(getByRole('img', { name: 'Teclado de Do4 a Do5' })).toBeTruthy();
  });

  it('aplica las clases de estado según el mapa nota → estado', () => {
    const visuals = new Map<number, KeyVisual>([
      [62, { target: true }],
      [64, { pressed: true, feedback: 'wrong' }],
      [60, { feedback: 'correct' }],
      [65, { feedback: 'expected' }],
    ]);
    const { container } = render(
      <PianoKeyboard from={60} to={72} visuals={visuals} ariaLabel="Teclado" />,
    );
    expect(keyElement(container, 62).classList.contains('key--target')).toBe(true);
    expect(keyElement(container, 64).classList.contains('key--pressed')).toBe(true);
    expect(keyElement(container, 64).classList.contains('key--wrong')).toBe(true);
    expect(keyElement(container, 60).classList.contains('key--correct')).toBe(true);
    expect(keyElement(container, 65).classList.contains('key--expected')).toBe(true);
    expect(keyElement(container, 67).getAttribute('class')).toBe('key key--white');
  });

  it('el feedback lleva un icono además del color', () => {
    const visuals = new Map<number, KeyVisual>([
      [60, { feedback: 'correct' }],
      [62, { feedback: 'wrong' }],
      [64, { feedback: 'expected' }],
    ]);
    const { container } = render(
      <PianoKeyboard from={60} to={72} visuals={visuals} ariaLabel="Teclado" />,
    );
    expect(keyElement(container, 60).textContent).toContain('✓');
    expect(keyElement(container, 62).textContent).toContain('✕');
    expect(keyElement(container, 64).textContent).toContain('↓');
  });

  it('muestra las etiquetas solo si se piden', () => {
    const labelFor = (midi: number) => (midi === 60 ? 'Do4' : undefined);
    const { container, rerender } = render(<PianoKeyboard from={60} to={72} ariaLabel="Teclado" />);
    expect(container.textContent).toBe('');
    rerender(<PianoKeyboard from={60} to={72} labelFor={labelFor} ariaLabel="Teclado" />);
    expect(container.textContent).toBe('Do4');
  });

  it('recorta la vista a una ventana con viewBox', () => {
    const { getByTestId } = render(
      <PianoKeyboard from={48} to={84} viewWindow={{ from: 60, to: 72 }} ariaLabel="Teclado" />,
    );
    const [x, , width] = (getByTestId('piano').getAttribute('viewBox') ?? '')
      .split(' ')
      .map(Number);
    expect(x).toBe(7 * 24);
    expect(width).toBe(8 * 24);
  });

  it('la nota oída se marca con un anillo con halo dibujado al final (no queda tapado por otra tecla)', () => {
    const visuals = new Map<number, KeyVisual>([[62, { heard: true }]]);
    const { container } = render(
      <PianoKeyboard from={60} to={72} visuals={visuals} ariaLabel="Teclado" />,
    );
    expect(container.querySelectorAll('.key__heard-ring')).toHaveLength(1);
    expect(container.querySelectorAll('.key__heard-halo')).toHaveLength(1);
    const svg = container.querySelector('svg');
    const lastChild = svg?.lastElementChild;
    expect(lastChild?.querySelector('.key__heard-ring')).not.toBeNull();
    expect(keyElement(container, 62).classList.contains('key--heard')).toBe(true);
    expect(keyElement(container, 62).querySelector('.key__heard-dot')).not.toBeNull();
  });

  it('el viewBox deja margen arriba para que el borde superior de las teclas no se recorte', () => {
    const { getByTestId } = render(<PianoKeyboard from={60} to={72} ariaLabel="Teclado" />);
    const [, y] = (getByTestId('piano').getAttribute('viewBox') ?? '').split(' ').map(Number);
    expect(y).toBeLessThan(0);
  });
});
