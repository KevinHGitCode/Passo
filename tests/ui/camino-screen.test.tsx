// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach } from 'vitest';
import { ProgressService } from '@/core/application/progress-service';
import { LESSONS } from '@/core/domain/lessons';
import type { PlayContext } from '@/core/domain/lessons';
import { PROGRESS_VERSION } from '@/core/domain/progress';
import { CaminoScreen } from '@/ui/screens/CaminoScreen';
import { FakeCalendar } from '../fakes/fake-calendar';
import { FakeProgressStore } from '../fakes/fake-progress-store';

afterEach(cleanup);

const TODAY = '2026-10-26'; // lunes
const KEYBOARD: PlayContext = { sources: ['teclado-pc'], polyphonicMic: false };
const MIC: PlayContext = { sources: ['microfono'], polyphonicMic: false };

type LessonSeed = Record<string, { stars: number; plays?: number }>;

function stored(options: {
  xp?: number;
  lessons?: LessonSeed;
  streak?: { count: number; last: string };
  daily?: Record<string, { ms: number; lessons: number }>;
  keys?: Record<string, [number, number][]>;
}) {
  return {
    version: PROGRESS_VERSION,
    xp: options.xp ?? 0,
    streak: options.streak ? { ...options.streak, restWeek: null } : undefined,
    lessons: Object.fromEntries(
      Object.entries(options.lessons ?? {}).map(([id, seed]) => [
        id,
        { stars: seed.stars, accuracy: 900, rhythm: 200, plays: seed.plays ?? 1, day: TODAY },
      ]),
    ),
    daily: options.daily ?? {},
    keys: options.keys ?? {},
    history: [],
  };
}

function setup(
  options: {
    seed?: Parameters<typeof stored>[0] | null;
    play?: PlayContext;
    failSaves?: boolean;
  } = {},
) {
  const store = new FakeProgressStore(options.seed === null ? null : stored(options.seed ?? {}));
  const progress = new ProgressService(store, new FakeCalendar(TODAY));
  const onOpenSettings = vi.fn();
  if (options.failSaves) store.failSaves = true;
  render(
    <CaminoScreen
      progress={progress}
      play={options.play ?? KEYBOARD}
      notation="latina"
      onOpenSettings={onOpenSettings}
    />,
  );
  return { store, progress, onOpenSettings };
}

const node = (id: string) => screen.getByTestId(`node-${id}`);
const stateOf = (id: string) => node(id).getAttribute('data-state');

/** Todas las lecciones de las unidades 1 a 5 con 1 estrella. */
const UP_TO_FIVE: LessonSeed = Object.fromEntries(
  LESSONS.filter((lesson) => lesson.unitId !== 'u6').map((lesson) => [lesson.id, { stars: 1 }]),
);

describe('el camino · primera visita', () => {
  it('muestra las seis unidades con su título y las lecciones de cada una', () => {
    setup({ seed: null });
    expect(screen.getByRole('heading', { level: 1, name: 'Aprender' })).toBeTruthy();
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toContain('Mano derecha: Do a Sol');
    expect(headings).toContain('Terceras y acordes');
    expect(document.querySelectorAll('.unit')).toHaveLength(6);
    expect(document.querySelectorAll('[data-testid^="node-"]')).toHaveLength(LESSONS.length);
  });

  it('solo la primera lección es la actual, con «Empieza aquí»; la prueba de la unidad también está abierta', () => {
    setup({ seed: null });
    expect(stateOf('u1-1')).toBe('actual');
    expect(within(node('u1-1')).getByText('Empieza aquí')).toBeTruthy();
    expect(stateOf('u1-2')).toBe('bloqueada');
    expect(stateOf('u1-3')).toBe('bloqueada');
    // «Saltar con prueba»: la prueba de la unidad está abierta desde el principio.
    expect(stateOf('u1-4')).toBe('abierta');
    expect(stateOf('u2-1')).toBe('bloqueada');
  });

  it('la lección actual es un enlace a su pantalla', () => {
    setup({ seed: null });
    const link = within(node('u1-1')).getByRole('link');
    expect(link.getAttribute('href')).toBe('#/leccion/u1-1');
  });

  it('la racha dice «Empieza hoy», sin tarjeta de puntos débiles', () => {
    setup({ seed: null });
    expect(screen.getAllByText('Empieza hoy').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('card-debiles')).toBeNull();
    expect(screen.getByText('Nivel 1 · Principiante')).toBeTruthy();
  });
});

describe('el camino · con progreso', () => {
  const seed = {
    xp: 240,
    lessons: { 'u1-1': { stars: 3 }, 'u1-2': { stars: 1 } },
    streak: { count: 3, last: TODAY },
    daily: {
      '2026-10-26': { ms: 150_000, lessons: 2 },
      '2026-10-25': { ms: 60_000, lessons: 1 },
    },
  };

  it('las hechas muestran sus estrellas y la siguiente es la actual', () => {
    setup({ seed });
    expect(stateOf('u1-1')).toBe('hecha');
    expect(stateOf('u1-2')).toBe('hecha');
    expect(stateOf('u1-3')).toBe('actual');
    expect(within(node('u1-1')).getByRole('img', { name: '3 de 3 estrellas' })).toBeTruthy();
    expect(within(node('u1-2')).getByRole('img', { name: '1 de 3 estrellas' })).toBeTruthy();
    // Con progreso el globo vuelve a decir «Empezar».
    expect(within(node('u1-3')).getByText('Empezar')).toBeTruthy();
  });

  it('cada unidad cuenta cuántas lecciones lleva', () => {
    setup({ seed });
    const count = document.querySelector('[data-unit="u1"] .unit__count');
    expect(count?.getAttribute('aria-label')).toBe('2 de 4 lecciones hechas');
  });

  it('la racha, la meta de hoy y el nivel salen del progreso', () => {
    setup({ seed });
    expect(screen.getByText('3 días seguidos')).toBeTruthy();
    const goal = screen.getByRole('progressbar', { name: 'Meta diaria: 2 de 5 minutos' });
    expect(goal.getAttribute('aria-valuenow')).toBe('2');
    expect(screen.getByText('Nivel 2 · Principiante')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Experiencia hacia el nivel 3' })).toBeTruthy();
  });

  it('la semana marca los días practicados y el de hoy', () => {
    setup({ seed });
    const week = screen.getByRole('list', { name: /Esta semana practicaste/ });
    expect(week.getAttribute('aria-label')).toBe('Esta semana practicaste: lunes');
    const days = [...week.querySelectorAll('.week__day')];
    expect(days).toHaveLength(7);
    expect(days[0]?.getAttribute('data-practiced')).toBe('true');
    expect(days[0]?.getAttribute('data-today')).toBe('true');
    expect(days[1]?.getAttribute('data-future')).toBe('true');
  });

  it('una lección bloqueada explica por qué al pulsarla', () => {
    setup({ seed });
    fireEvent.click(within(node('u1-4')).getByRole('link'));
    // La prueba está abierta (saltar con prueba): pulsar la lección 3 de la unidad 2, en cambio, bloquea.
    fireEvent.click(within(node('u2-2')).getByRole('button'));
    expect(screen.getByTestId('explicacion').textContent).toContain('Termina la lección anterior');
  });

  it('la primera lección de una unidad bloqueada pide terminar la unidad anterior', () => {
    setup({ seed });
    fireEvent.click(within(node('u2-1')).getByRole('button'));
    expect(screen.getByTestId('explicacion').textContent).toContain('Termina la unidad anterior');
    expect(screen.queryByRole('button', { name: 'Abrir ajustes' })).toBeNull();
  });
});

describe('el camino · según la entrada', () => {
  it('terceras y acordes con micrófono sin la beta están bloqueadas por la entrada', () => {
    setup({ seed: { lessons: UP_TO_FIVE }, play: MIC });
    expect(stateOf('u6-1')).toBe('bloqueada-entrada');
    expect(stateOf('u5-4')).toBe('hecha');
    // Las lecciones siguientes siguen bloqueadas por avance (aún no se hizo la anterior).
    expect(stateOf('u6-2')).toBe('bloqueada');
  });

  it('pulsarla explica qué falta y ofrece abrir los ajustes', () => {
    const { onOpenSettings } = setup({ seed: { lessons: UP_TO_FIVE }, play: MIC });
    fireEvent.click(within(node('u6-1')).getByRole('button'));
    expect(screen.getByTestId('explicacion').textContent).toContain('piano MIDI o teclado del PC');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir ajustes' }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('con teclado del PC, o con la beta, esa lección está abierta', () => {
    cleanup();
    setup({ seed: { lessons: UP_TO_FIVE }, play: KEYBOARD });
    expect(stateOf('u6-1')).toBe('actual');
    cleanup();
    setup({ seed: { lessons: UP_TO_FIVE }, play: { sources: ['microfono'], polyphonicMic: true } });
    expect(stateOf('u6-1')).toBe('actual');
  });

  it('la unidad opcional se marca como tal', () => {
    setup({ seed: null });
    expect(document.querySelector('[data-unit="u6"] .unit__kicker')?.textContent).toBe(
      'Unidad 6 · Opcional',
    );
  });
});

describe('el camino · puntos débiles', () => {
  const miss: [number, number][] = [
    [0, 1000],
    [0, 1000],
    [0, 1000],
    [0, 1000],
    [0, 1000],
    [1, 1000],
    [0, 1000],
    [1, 1000],
  ];

  it('muestra las teclas más débiles y un enlace al repaso', () => {
    setup({ seed: { keys: { '62': miss, '65': miss } } });
    const card = screen.getByTestId('card-debiles');
    expect(within(card).getByText('Puntos débiles')).toBeTruthy();
    expect(within(card).getByText('Re4')).toBeTruthy();
    expect(within(card).getByText('Fa4')).toBeTruthy();
    expect(screen.getByTestId('practicar-debiles').getAttribute('href')).toBe(
      '#/leccion/repaso-debiles',
    );
  });

  it('sin teclas débiles pero con datos de lentitud, habla de lo más lento', () => {
    const slow = (ms: number): [number, number][] => Array.from({ length: 6 }, () => [1, ms]);
    setup({ seed: { keys: { '60': slow(800), '62': slow(1100), '64': slow(900) } } });
    expect(within(screen.getByTestId('card-debiles')).getByText('Lo más lento')).toBeTruthy();
  });
});

describe('el camino · sin almacenamiento', () => {
  it('avisa de que el progreso solo dura esta visita cuando no se pudo guardar', () => {
    const { progress } = setup({ seed: null, failSaves: true });
    expect(screen.queryByTestId('no-guarda')).toBeNull();
    expect(progress.getSnapshot().saved).toBe(true);
  });

  it('con una versión mayor guardada se avisa (no se sobrescribe)', () => {
    cleanup();
    const store = new FakeProgressStore({ version: PROGRESS_VERSION + 1 });
    const progress = new ProgressService(store, new FakeCalendar(TODAY));
    render(
      <CaminoScreen
        progress={progress}
        play={KEYBOARD}
        notation="latina"
        onOpenSettings={vi.fn()}
      />,
    );
    expect(screen.getByTestId('no-guarda').textContent).toContain('no se guarda');
  });
});
