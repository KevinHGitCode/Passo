// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach } from 'vitest';
import { AnswerBar } from '@/ui/game/AnswerBar';
import { GameButton, GameLink } from '@/ui/game/GameButton';
import { LessonNode } from '@/ui/game/LessonNode';
import { ProgressRing } from '@/ui/game/ProgressRing';
import { Stars } from '@/ui/game/Stars';
import { Icon } from '@/ui/game/icons';
import type { IconName } from '@/ui/game/icons';

afterEach(cleanup);

const classesOf = (element: Element | null): string[] => [...(element?.classList ?? [])];

describe('GameButton y GameLink', () => {
  it('el botón es de tipo button por defecto y lleva la variante pedida', () => {
    render(<GameButton>Continuar</GameButton>);
    const button = screen.getByRole('button', { name: 'Continuar' });
    expect(button.getAttribute('type')).toBe('button');
    expect(classesOf(button)).toEqual(['game-btn', 'game-btn--primary']);
  });

  it('acepta variante, tamaño, ancho completo y clases extra', () => {
    render(
      <GameButton variant="success" size="lg" block className="extra">
        Seguir
      </GameButton>,
    );
    const button = screen.getByRole('button', { name: 'Seguir' });
    expect(classesOf(button)).toEqual([
      'game-btn',
      'game-btn--success',
      'game-btn--lg',
      'game-btn--block',
      'extra',
    ]);
  });

  it('dispara el clic y respeta disabled', () => {
    const onClick = vi.fn();
    const { rerender } = render(<GameButton onClick={onClick}>Pulsa</GameButton>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(
      <GameButton onClick={onClick} disabled>
        Pulsa
      </GameButton>,
    );
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('el enlace usa la dirección y las mismas clases', () => {
    render(
      <GameLink href="#/progreso" variant="secondary">
        Ver progreso
      </GameLink>,
    );
    const link = screen.getByRole('link', { name: 'Ver progreso' });
    expect(link.getAttribute('href')).toBe('#/progreso');
    expect(classesOf(link)).toEqual(['game-btn', 'game-btn--secondary']);
  });
});

describe('Stars', () => {
  it('el nombre accesible dice cuántas estrellas hay de tres', () => {
    for (const value of [0, 1, 2, 3] as const) {
      const { unmount } = render(<Stars value={value} />);
      expect(screen.getByRole('img', { name: `${value} de 3 estrellas` })).toBeTruthy();
      unmount();
    }
  });

  it('dibuja tres estrellas: las ganadas rellenas y las demás vacías (discontinuas)', () => {
    const { container } = render(<Stars value={2} size="lg" />);
    expect(container.querySelectorAll('.game-star--on')).toHaveLength(2);
    expect(container.querySelectorAll('.game-star--off')).toHaveLength(1);
    expect(classesOf(container.firstElementChild)).toContain('game-stars--lg');
  });
});

describe('ProgressRing', () => {
  const fraction = (value: number): number => {
    const { container, unmount } = render(<ProgressRing value={value} label="Precisión" />);
    const attr = container.querySelector('.game-ring__fill')?.getAttribute('stroke-dasharray');
    unmount();
    const [filled, total] = (attr ?? '').split(' ').map(Number);
    return (filled ?? 0) / (total ?? 1);
  };

  it('lleva el nombre accesible y rellena la fracción pedida', () => {
    render(<ProgressRing value={0.5} label="Precisión 50 %" />);
    expect(screen.getByRole('img', { name: 'Precisión 50 %' })).toBeTruthy();
    expect(fraction(0.5)).toBeCloseTo(0.5, 5);
    expect(fraction(0.94)).toBeCloseTo(0.94, 5);
  });

  it('acota valores fuera de rango o raros', () => {
    expect(fraction(2)).toBeCloseTo(1, 5);
    expect(fraction(-1)).toBe(0);
    expect(fraction(Number.NaN)).toBe(0);
  });
});

describe('AnswerBar', () => {
  it('muestra título, detalle, tono y acciones', () => {
    render(
      <AnswerBar
        tone="error"
        title="Era Mi4"
        detail="Tocaste Fa4"
        actions={<button type="button">Reintentar</button>}
        data-testid="barra"
      />,
    );
    const bar = screen.getByTestId('barra');
    expect(bar.getAttribute('data-tone')).toBe('error');
    expect(classesOf(bar)).toContain('game-answer--error');
    expect(bar.textContent).toContain('Era Mi4');
    expect(bar.textContent).toContain('Tocaste Fa4');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  it('sin detalle ni acciones no deja huecos', () => {
    const { container } = render(<AnswerBar tone="ok" title="¡Perfecto!" />);
    expect(container.querySelector('.game-answer__detail')).toBeNull();
    expect(container.querySelector('.game-answer__actions')).toBeNull();
  });

  it('no es una zona aria-live (la pantalla ya anuncia los resultados)', () => {
    const { container } = render(<AnswerBar tone="partial" title="Casi" detail="Falta el Sol4" />);
    expect(container.querySelector('[aria-live]')).toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});

describe('LessonNode', () => {
  const base = { kind: 'nueva', title: 'Mi · Fa · Sol', stars: 0 } as const;

  it('una lección hecha es un enlace con sus estrellas y su estado en el nombre', () => {
    render(<LessonNode {...base} state="hecha" stars={2} href="#/leccion/u1-1" />);
    const link = screen.getByRole('link', { name: 'Mi · Fa · Sol, hecha' });
    expect(link.getAttribute('href')).toBe('#/leccion/u1-1');
    expect(screen.getByRole('img', { name: '2 de 3 estrellas' })).toBeTruthy();
  });

  it('la actual muestra el globo y el título', () => {
    render(<LessonNode {...base} state="actual" href="#/leccion/u1-2" bubble="Empezar" />);
    expect(screen.getByText('Empezar')).toBeTruthy();
    expect(screen.getByText('Mi · Fa · Sol')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mi · Fa · Sol, siguiente' })).toBeTruthy();
  });

  it('el globo solo aparece en la lección actual', () => {
    render(<LessonNode {...base} state="abierta" href="#/x" bubble="Empezar" />);
    expect(screen.queryByText('Empezar')).toBeNull();
  });

  it('una lección bloqueada es un botón aria-disabled que explica al pulsarlo', () => {
    const onExplain = vi.fn();
    render(
      <LessonNode
        {...base}
        state="bloqueada"
        reason="Termina la lección anterior."
        onExplain={onExplain}
      />,
    );
    const button = screen.getByRole('button', {
      name: 'Mi · Fa · Sol, bloqueada. Termina la lección anterior.',
    });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);
    expect(onExplain).toHaveBeenCalledTimes(1);
  });

  it('bloqueo por la entrada es otro estado, con otro texto', () => {
    const { container } = render(
      <LessonNode
        {...base}
        state="bloqueada-entrada"
        reason="Necesita piano MIDI o teclado del PC."
      />,
    );
    expect(
      screen.getByRole('button', {
        name: 'Mi · Fa · Sol, no disponible con tu entrada. Necesita piano MIDI o teclado del PC.',
      }),
    ).toBeTruthy();
    expect(container.firstElementChild?.getAttribute('data-state')).toBe('bloqueada-entrada');
  });

  it('el tipo de lección cambia la clase (repaso y prueba tienen su color)', () => {
    const { container, rerender } = render(
      <LessonNode {...base} kind="repaso" state="abierta" href="#/x" />,
    );
    expect(classesOf(container.firstElementChild)).toContain('game-node--repaso');
    rerender(<LessonNode {...base} kind="prueba" state="abierta" href="#/x" />);
    expect(classesOf(container.firstElementChild)).toContain('game-node--prueba');
  });
});

describe('Icon', () => {
  const names: IconName[] = [
    'check',
    'cross',
    'lock',
    'play',
    'review',
    'trophy',
    'flame',
    'bolt',
    'home',
    'chart',
    'keys',
    'gear',
    'target',
  ];

  it('todos los iconos son decorativos y dibujan al menos un trazo', () => {
    for (const name of names) {
      const { container, unmount } = render(<Icon name={name} />);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('aria-hidden'), name).toBe('true');
      expect(svg?.querySelectorAll('path').length, name).toBeGreaterThan(0);
      unmount();
    }
  });

  it('respeta el tamaño pedido', () => {
    const { container } = render(<Icon name="check" size={40} />);
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('40');
  });
});
