// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach } from 'vitest';
import { ProgressService } from '@/core/application/progress-service';
import { PROGRESS_VERSION } from '@/core/domain/progress';
import { ProgressScreen, formatDuration } from '@/ui/screens/ProgressScreen';
import { AccuracyChart } from '@/ui/screens/AccuracyChart';
import { KeyHeatmap } from '@/ui/screens/KeyHeatmap';
import { FakeCalendar } from '../fakes/fake-calendar';
import { FakeProgressStore } from '../fakes/fake-progress-store';

afterEach(cleanup);

const TODAY = '2026-10-26';

type Samples = [number, number][];
const many = (ok: number, miss: number, ms = 1000): Samples => [
  ...Array.from({ length: miss }, (): [number, number] => [0, ms]),
  ...Array.from({ length: ok }, (): [number, number] => [1, ms]),
];

function stored(options: {
  xp?: number;
  history?: { lesson: string; accuracy: number; rhythm: number }[];
  keys?: Record<string, Samples>;
  daily?: Record<string, { ms: number; lessons: number }>;
  lessons?: Record<string, number>;
  streak?: { count: number; last: string };
}) {
  return {
    version: PROGRESS_VERSION,
    xp: options.xp ?? 0,
    streak: options.streak ? { ...options.streak, restWeek: null } : undefined,
    lessons: Object.fromEntries(
      Object.entries(options.lessons ?? {}).map(([id, stars]) => [
        id,
        { stars, accuracy: 900, rhythm: 200, plays: 1, day: TODAY },
      ]),
    ),
    keys: options.keys ?? {},
    daily: options.daily ?? {},
    history: (options.history ?? []).map((entry) => ({ day: TODAY, ...entry })),
  };
}

function setup(seed: Parameters<typeof stored>[0] | null, options: { failSaves?: boolean } = {}) {
  const store = new FakeProgressStore(seed === null ? null : stored(seed));
  if (options.failSaves) store.failSaves = true;
  const progress = new ProgressService(store, new FakeCalendar(TODAY));
  render(<ProgressScreen progress={progress} notation="latina" />);
  return { store, progress };
}

describe('formatDuration', () => {
  it('da segundos, minutos u horas según el tamaño', () => {
    expect(formatDuration(45_000)).toBe('45 s');
    expect(formatDuration(12 * 60_000)).toBe('12 min');
    expect(formatDuration(60 * 60_000)).toBe('1 h');
    expect(formatDuration((5 * 60 + 40) * 60_000)).toBe('5 h 40');
    expect(formatDuration((2 * 60 + 5) * 60_000)).toBe('2 h 05');
    expect(formatDuration(0)).toBe('0 s');
  });
});

describe('progreso · sin datos', () => {
  it('invita a empezar y no inventa cifras', () => {
    setup(null);
    expect(screen.getByRole('heading', { level: 1, name: 'Progreso' })).toBeTruthy();
    expect(screen.getByTestId('progreso-vacio').textContent).toContain('Todavía no hay datos');
    expect(screen.getByTestId('kpi-accuracy').textContent).toBe('—');
    expect(screen.getByTestId('kpi-rhythm').textContent).toBe('—');
    expect(screen.getByTestId('kpi-time').textContent).toBe('—');
    expect(screen.getByRole('link', { name: 'Ir al camino' }).getAttribute('href')).toBe('#/');
  });

  it('el mapa del teclado sale sin datos y la gráfica pide completar lecciones', () => {
    setup(null);
    expect(screen.getByTestId('heat-list').textContent).toContain('Todavía no hay datos');
    expect(screen.getByTestId('chart-empty').textContent).toContain('Completa 2 lecciones');
  });
});

describe('progreso · con datos', () => {
  const seed = {
    xp: 1240,
    lessons: { 'u1-1': 3, 'u1-2': 2, 'u1-3': 1 },
    streak: { count: 4, last: TODAY },
    history: [
      { lesson: 'u1-1', accuracy: 800, rhythm: 200 },
      { lesson: 'u1-2', accuracy: 900, rhythm: 240 },
      { lesson: 'u1-3', accuracy: 1000, rhythm: 280 },
    ],
    daily: {
      '2026-10-25': { ms: 3_600_000, lessons: 2 },
      '2026-10-26': { ms: 1_200_000, lessons: 1 },
    },
    keys: { '62': many(2, 6), '60': many(7, 0), '64': many(5, 1) } as Record<string, Samples>,
  };

  it('las cifras salen del progreso', () => {
    setup(seed);
    expect(screen.getByText('5 · Aprendiz')).toBeTruthy();
    expect(screen.getByTestId('kpi-accuracy').textContent).toBe('90 %');
    expect(screen.getByTestId('kpi-rhythm').textContent).toContain('24');
    expect(screen.getByTestId('kpi-time').textContent).toBe('1 h 20');
    expect(screen.getByText('2 días con práctica')).toBeTruthy();
    expect(screen.getByText('3 de 32 lecciones hechas · racha de 4 días')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Experiencia hacia el nivel 6' })).toBeTruthy();
  });

  it('el mapa del teclado pinta cada tecla según su acierto', () => {
    setup(seed);
    expect(screen.getByTestId('heat-62').getAttribute('data-level')).toBe('debil');
    expect(screen.getByTestId('heat-60').getAttribute('data-level')).toBe('fuerte');
    // 5 de 6 a la primera con lo reciente pesando más: 'buena' o 'fuerte' según el peso.
    expect(['buena', 'media']).toContain(screen.getByTestId('heat-64').getAttribute('data-level'));
    expect(screen.getByTestId('heat-65').getAttribute('data-level')).toBe('sin-datos');
  });

  it('las teclas débiles llevan rayas, y las que tienen datos su porcentaje', () => {
    setup(seed);
    const weak = screen.getByTestId('heat-62');
    expect(weak.querySelector('rect[fill="url(#heat-hatch)"]')).toBeTruthy();
    expect(weak.querySelector('.heat__percent')).toBeTruthy();
    expect(screen.getByTestId('heat-65').querySelector('.heat__percent')).toBeNull();
  });

  it('hay una lista equivalente con los mismos datos para lectores de pantalla', () => {
    setup(seed);
    const list = screen.getByTestId('heat-list');
    expect(within(list).getByText(/Re4: \d+ % \(menos de 70 %\)/)).toBeTruthy();
    expect(within(list).getByText(/Do4: \d+ % \(95 % o más\)/)).toBeTruthy();
  });

  it('ofrece practicar la tecla más floja', () => {
    setup(seed);
    const link = screen.getByRole('link', { name: 'Practicar 3 min' });
    expect(link.getAttribute('href')).toBe('#/leccion/repaso-debiles');
    expect(screen.getByText('Re4', { selector: 'strong' })).toBeTruthy();
  });

  it('la gráfica dibuja la evolución con su meta', () => {
    setup(seed);
    const chart = screen.getByTestId('chart');
    expect(chart.querySelectorAll('.chart__dot')).toHaveLength(3);
    expect(chart.querySelector('.chart__goal')).toBeTruthy();
    expect(within(chart).getByRole('img').getAttribute('aria-label')).toBe(
      'Tu precisión pasó de 80 % a 100 % en tus últimas 3 lecciones. La meta es 95 %.',
    );
    expect(screen.queryByTestId('progreso-vacio')).toBeNull();
  });
});

describe('progreso · borrar', () => {
  const seed = { xp: 300, history: [{ lesson: 'u1-1', accuracy: 900, rhythm: 200 }] };

  it('pide confirmación antes de borrar y se puede cancelar', () => {
    const { progress } = setup(seed);
    fireEvent.click(screen.getByTestId('borrar'));
    expect(screen.getByTestId('confirmar-borrado').textContent).toContain('¿Seguro?');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByTestId('confirmar-borrado')).toBeNull();
    expect(progress.getSnapshot().state.xp).toBe(300);
  });

  it('confirmar borra todo el progreso', () => {
    const { progress } = setup(seed);
    fireEvent.click(screen.getByTestId('borrar'));
    fireEvent.click(screen.getByTestId('borrar-si'));
    expect(progress.getSnapshot().state.xp).toBe(0);
    expect(screen.getByTestId('progreso-vacio')).toBeTruthy();
    expect(screen.getByTestId('kpi-accuracy').textContent).toBe('—');
  });
});

describe('progreso · aviso de almacenamiento', () => {
  it('con una versión mayor guardada se avisa de que no se guarda', () => {
    const store = new FakeProgressStore({ version: PROGRESS_VERSION + 1 });
    const progress = new ProgressService(store, new FakeCalendar(TODAY));
    render(<ProgressScreen progress={progress} notation="latina" />);
    expect(screen.getByTestId('no-guarda').textContent).toContain('no se guarda');
  });
});

describe('piezas del progreso', () => {
  it('la gráfica con menos de 2 puntos no se dibuja', () => {
    render(
      <AccuracyChart entries={[{ day: TODAY, lesson: 'u1-1', accuracy: 900, rhythm: 100 }]} />,
    );
    expect(screen.getByTestId('chart-empty')).toBeTruthy();
  });

  it('el mapa admite la notación americana', () => {
    render(<KeyHeatmap history={{ '62': [] }} notation="americana" />);
    expect(screen.getByTestId('heat-62')).toBeTruthy();
    expect(screen.getAllByText('C3').length).toBeGreaterThan(0);
  });
});
