// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { InputManager } from '@/core/application/input-manager';
import { bindInputsToPreferences } from '@/core/application/input-sync';
import { LessonFlow } from '@/core/application/lesson-flow';
import { PracticeSession } from '@/core/application/practice-session';
import { PreferencesService } from '@/core/application/preferences-service';
import { bindSessionToPreferences } from '@/core/application/preferences-sync';
import { ProgressService } from '@/core/application/progress-service';
import { TunerService } from '@/core/application/tuner-service';
import { createSeededRng } from '@/core/domain/rng';
import { Shell } from '@/ui/shell/Shell';
import { FakeAudioControl } from '../fakes/fake-audio-control';
import { FakeCalendar } from '../fakes/fake-calendar';
import { FakeClock } from '../fakes/fake-clock';
import { FakeMicInput } from '../fakes/fake-mic-input';
import { FakeNoteInput } from '../fakes/fake-note-input';
import { FakePitch } from '../fakes/fake-pitch';
import { FakePreferencesStore } from '../fakes/fake-preferences-store';
import { FakeProgressStore } from '../fakes/fake-progress-store';

const NARROW_QUERY = /max-width:\s*899px/;

function mockViewport(narrow: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: narrow && NARROW_QUERY.test(query),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  cleanup();
  window.location.hash = '';
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-instrument');
  // @ts-expect-error: se restaura el entorno de jsdom (sin matchMedia)
  delete window.matchMedia;
});
beforeEach(() => {
  window.location.hash = '';
  // @ts-expect-error: jsdom no trae matchMedia
  delete window.matchMedia;
});

function setup(options: { hash?: string; narrow?: boolean; stored?: unknown } = {}) {
  if (options.narrow !== undefined) mockViewport(options.narrow);
  window.location.hash = options.hash ?? '';
  const mic = new FakeMicInput();
  const pc = new FakeNoteInput('teclado-pc');
  const inputs = [mic, pc];
  const preferences = new PreferencesService(
    new FakePreferencesStore(options.stored ?? { version: 1, input: 'teclado-pc' }),
  );
  const session = new PracticeSession({
    inputs,
    audio: { noteOn: () => undefined, noteOff: () => undefined },
    clock: new FakeClock(0),
    rng: createSeededRng(3),
  });
  const progress = new ProgressService(new FakeProgressStore(), new FakeCalendar());
  const lessonFlow = new LessonFlow({
    session,
    progress,
    playContext: () => ({ sources: ['teclado-pc'], polyphonicMic: false }),
  });
  bindSessionToPreferences(session, preferences, {
    exercise: true,
    override: { isActive: lessonFlow.isActive, subscribe: lessonFlow.subscribe },
  });
  const manager = new InputManager(inputs, preferences.getSnapshot().input);
  bindInputsToPreferences(manager, session, preferences);
  render(
    <Shell
      session={session}
      preferences={preferences}
      inputs={inputs}
      inputManager={manager}
      audio={new FakeAudioControl()}
      microphone={mic}
      progress={progress}
      lessonFlow={lessonFlow}
      tuner={new TunerService({ pitch: new FakePitch(), clock: new FakeClock(0) })}
    />,
  );
  const go = (hash: string) =>
    act(() => {
      window.location.hash = hash;
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  return { session, preferences, lessonFlow, progress, pc, mic, go };
}

describe('el marco del juego', () => {
  it('sin hash muestra el camino dentro del marco con su navegación', () => {
    setup();
    expect(screen.getByTestId('game-shell')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Aprender' })).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(nav.querySelectorAll('a')).toHaveLength(3);
    expect(document.title).toBe('Aprender · Passo');
  });

  it('marca la pantalla actual con aria-current', () => {
    const { go } = setup();
    const current = () =>
      [...document.querySelectorAll('[aria-current="page"]')].map((el) => el.textContent);
    expect(current()).toEqual(['Aprender']);
    go('#/progreso');
    expect(current()).toEqual(['Progreso']);
    // Una lección ocupa toda la pantalla: no hay barra de navegación.
    go('#/leccion/u1-1');
    expect(current()).toEqual([]);
    expect(screen.queryByRole('navigation', { name: 'Principal' })).toBeNull();
  });

  it('cada enlace lleva a su dirección', () => {
    setup();
    const hrefs = [
      ...screen.getByRole('navigation', { name: 'Principal' }).querySelectorAll('a'),
    ].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['#/', '#/progreso', '#/practica']);
  });

  it('en pantallas estrechas la navegación pasa abajo y los ajustes a la cabecera', () => {
    setup({ narrow: true });
    expect(screen.getByTestId('game-nav-bottom')).toBeTruthy();
    expect(screen.queryByTestId('game-nav')).toBeNull();
    expect(document.querySelector('.game-top [data-testid="settings-button"]')).toBeTruthy();
  });

  it('en pantallas anchas la navegación es una barra lateral con los ajustes al pie', () => {
    setup({ narrow: false });
    expect(screen.getByTestId('game-nav')).toBeTruthy();
    expect(screen.queryByTestId('game-nav-bottom')).toBeNull();
    expect(document.querySelector('.game-side__foot [data-testid="settings-button"]')).toBeTruthy();
  });

  it('el título de la página cambia con la pantalla y el foco va al encabezado nuevo', () => {
    const { go } = setup();
    go('#/progreso');
    expect(document.title).toBe('Progreso · Passo');
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { level: 1, name: 'Progreso' }),
    );
    go('#/leccion/u1-1');
    expect(document.title).toBe('Lección · Passo');
    expect(document.activeElement?.tagName).toBe('H1');
  });

  it('al cargar la página el foco no se mueve solo', () => {
    setup({ hash: '#/progreso' });
    expect(document.activeElement).toBe(document.body);
  });

  it('una dirección desconocida lleva al camino', () => {
    setup({ hash: '#/resultado' });
    expect(screen.getByRole('heading', { level: 1, name: 'Aprender' })).toBeTruthy();
  });
});

describe('ajustes dentro del marco', () => {
  it('el engranaje abre el panel de ajustes y devuelve el foco al cerrar', () => {
    setup();
    fireEvent.click(screen.getByTestId('settings-button'));
    expect(screen.getByTestId('settings-panel')).toBeTruthy();
    fireEvent.click(screen.getByTestId('settings-close'));
    expect(document.activeElement).toBe(screen.getByTestId('settings-button'));
  });

  it('en una lección el panel no deja cambiar el ejercicio ni el nivel', () => {
    const { lessonFlow } = setup({ hash: '#/' });
    act(() => lessonFlow.prepare('u1-1'));
    fireEvent.click(screen.getByTestId('settings-button'));
    expect(screen.getByTestId('lesson-note')).toBeTruthy();
    expect(screen.queryByTestId('mode-notas')).toBeNull();
    expect(screen.queryByTestId('level-1')).toBeNull();
  });

  it('fuera de una lección sí se elige ejercicio y nivel', () => {
    setup();
    fireEvent.click(screen.getByTestId('settings-button'));
    expect(screen.queryByTestId('lesson-note')).toBeNull();
    expect(screen.getByTestId('mode-notas')).toBeTruthy();
  });
});

describe('la práctica libre', () => {
  it('#/practica muestra la pantalla de siempre, sin el marco', () => {
    setup({ hash: '#/practica' });
    expect(screen.queryByTestId('game-shell')).toBeNull();
    expect(screen.getByTestId('welcome')).toBeTruthy();
    expect(document.title).toBe('Práctica libre · Passo');
  });

  it('la marca «Passo» vuelve al camino', () => {
    setup({ hash: '#/practica' });
    const link = screen.getByRole('link', { name: 'Passo' });
    expect(link.getAttribute('href')).toBe('#/');
  });

  it('al salir de la práctica libre con una ronda en curso, la sesión vuelve a la bienvenida', () => {
    const { session, go } = setup({ hash: '#/practica' });
    act(() => session.start());
    expect(session.getSnapshot().phase).toBe('en-curso');
    go('#/');
    expect(session.getSnapshot().phase).toBe('inactiva');
  });

  it('salir de una lección a la práctica libre restaura el ejercicio de las preferencias', () => {
    const { session, lessonFlow, go, preferences } = setup({
      hash: '#/',
      stored: { version: 1, input: 'teclado-pc', mode: 'terceras', levels: { terceras: 2 } },
    });
    act(() => lessonFlow.prepare('u1-1'));
    expect(lessonFlow.getSnapshot().status).toBe('lista');
    go('#/practica');
    expect(lessonFlow.getSnapshot().status).toBe('libre');
    expect(session.getSnapshot()).toMatchObject({ mode: 'terceras', level: 2, phase: 'inactiva' });
    expect(preferences.getSnapshot().mode).toBe('terceras');
  });
});

describe('el micrófono solo escucha donde hay pantalla que lo use', () => {
  /** Paradas del micrófono desde que se montó la pantalla (el gestor de entradas ya apaga las no elegidas). */
  const stopsAfter = (mic: { stops: number }) => {
    const base = mic.stops;
    return () => mic.stops - base;
  };

  it('al salir de una lección se apaga', () => {
    const { mic, go } = setup({ hash: '#/leccion/u1-1' });
    const stops = stopsAfter(mic);
    go('#/');
    expect(stops()).toBe(1);
  });

  it('al salir de la práctica libre se apaga', () => {
    const { mic, go } = setup({ hash: '#/practica' });
    const stops = stopsAfter(mic);
    go('#/progreso');
    expect(stops()).toBe(1);
  });

  it('pasar de una lección a otra no lo apaga', () => {
    const { mic, go } = setup({ hash: '#/leccion/u1-1' });
    const stops = stopsAfter(mic);
    go('#/leccion/u1-2');
    expect(stops()).toBe(0);
  });

  it('entre el camino y el progreso no hace falta apagarlo (ya está apagado)', () => {
    const { mic, go } = setup({ hash: '#/' });
    const stops = stopsAfter(mic);
    go('#/progreso');
    go('#/');
    expect(stops()).toBe(0);
  });
});

describe('accesibilidad del marco', () => {
  it('hay un «Saltar al contenido» que lleva el foco al contenido', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Saltar al contenido' }));
    expect(document.activeElement?.id).toBe('contenido');
  });

  it('también en la lección (pantalla completa)', () => {
    setup({ hash: '#/leccion/u1-1' });
    fireEvent.click(screen.getByRole('button', { name: 'Saltar al contenido' }));
    expect(document.activeElement?.id).toBe('contenido');
  });

  it('en una lección los ajustes avisan de que cambiar de entrada reinicia', () => {
    const { lessonFlow } = setup({ hash: '#/' });
    act(() => lessonFlow.prepare('u1-1'));
    fireEvent.click(screen.getByTestId('settings-button'));
    expect(screen.getByTestId('lesson-input-note').textContent).toContain('vuelve a empezar');
  });

  it('fuera de una lección ese aviso no sale', () => {
    setup();
    fireEvent.click(screen.getByTestId('settings-button'));
    expect(screen.queryByTestId('lesson-input-note')).toBeNull();
  });

  it('cada pantalla nueva empieza arriba del todo, salvo el camino (que centra tu lección)', () => {
    const { go } = setup();
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    go('#/progreso');
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    scrollTo.mockClear();
    go('#/');
    expect(scrollTo).not.toHaveBeenCalled();
  });
});

describe('el instrumento en el marco', () => {
  const GUITAR = { version: 1, input: 'microfono', instrument: 'guitarra' };
  const PIANO = { version: 1, input: 'microfono', instrument: 'piano' };

  it('con guitarra marca la raíz, ofrece el afinador en vez de la práctica libre y enseña el camino de guitarra', () => {
    setup({ stored: GUITAR });
    expect(document.documentElement.dataset['instrument']).toBe('guitarra');
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(within(nav).getByText('Afinador')).toBeTruthy();
    expect(within(nav).queryByText('Práctica libre')).toBeNull();
    expect(screen.getByTestId('instrument-chip').getAttribute('aria-label')).toBe(
      'Instrumento: Guitarra. Cambiar',
    );
    expect(screen.getByTestId('node-g1-1')).toBeTruthy();
    expect(screen.queryByTestId('node-u1-1')).toBeNull();
  });

  it('en piano la raíz lo dice y la navegación tiene la práctica libre', () => {
    setup({ stored: PIANO });
    expect(document.documentElement.dataset['instrument']).toBe('piano');
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(within(nav).getByText('Práctica libre')).toBeTruthy();
    expect(within(nav).queryByText('Afinador')).toBeNull();
    expect(screen.getByTestId('node-u1-1')).toBeTruthy();
  });

  it('elegir guitarra en el chip cambia el camino, el color y la navegación', () => {
    setup({ stored: PIANO });
    fireEvent.click(screen.getByTestId('instrument-chip'));
    fireEvent.click(screen.getByTestId('instrument-guitarra'));
    expect(screen.getByTestId('node-g1-1')).toBeTruthy();
    expect(document.documentElement.dataset['instrument']).toBe('guitarra');
    expect(
      within(screen.getByRole('navigation', { name: 'Principal' })).getByText('Afinador'),
    ).toBeTruthy();
  });

  it('en móvil el chip va en la cabecera junto a la marca', () => {
    setup({ stored: GUITAR, narrow: true });
    const header = document.querySelector('.game-top');
    expect(header?.querySelector('[data-testid="instrument-chip"]')).toBeTruthy();
    expect(within(screen.getByTestId('game-nav-bottom')).getByText('Afinador')).toBeTruthy();
  });

  it('#/afinador abre el afinador y se ve de guitarra aunque se haya elegido piano', () => {
    const { go } = setup({ stored: PIANO });
    go('#/afinador');
    expect(screen.getByRole('heading', { level: 1, name: 'Afinador' })).toBeTruthy();
    expect(document.documentElement.dataset['instrument']).toBe('guitarra');
    expect(document.title).toBe('Afinador · Passo');
  });

  it('elegir piano estando en el afinador vuelve al camino', () => {
    const { go } = setup({ stored: GUITAR });
    go('#/afinador');
    fireEvent.click(screen.getByTestId('instrument-chip'));
    fireEvent.click(screen.getByTestId('instrument-piano'));
    expect(window.location.hash).toBe('#/');
  });

  it('una lección de guitarra se ve de guitarra aunque se haya elegido piano', () => {
    const { go } = setup({ stored: PIANO });
    go('#/leccion/g1-1');
    expect(document.documentElement.dataset['instrument']).toBe('guitarra');
    expect(screen.getByTestId('instrument-tag')).toBeTruthy();
  });

  it('la práctica libre avisa de que es de piano cuando está elegida la guitarra', () => {
    const { go } = setup({ stored: GUITAR });
    go('#/practica');
    expect(screen.getByTestId('practica-aviso').textContent).toContain('es de piano');
    go('#/');
    expect(screen.queryByTestId('practica-aviso')).toBeNull();
  });

  it('con piano elegido la práctica libre no avisa de nada', () => {
    const { go } = setup({ stored: PIANO });
    go('#/practica');
    expect(screen.queryByTestId('practica-aviso')).toBeNull();
  });

  it('el afinador apaga el micrófono al salir', () => {
    const { go, mic } = setup({ stored: GUITAR, hash: '#/afinador' });
    const before = mic.stops;
    go('#/');
    expect(mic.stops).toBeGreaterThan(before);
  });
});
