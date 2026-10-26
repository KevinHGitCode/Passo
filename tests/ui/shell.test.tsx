// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { InputManager } from '@/core/application/input-manager';
import { bindInputsToPreferences } from '@/core/application/input-sync';
import { LessonFlow } from '@/core/application/lesson-flow';
import { PracticeSession } from '@/core/application/practice-session';
import { PreferencesService } from '@/core/application/preferences-service';
import { bindSessionToPreferences } from '@/core/application/preferences-sync';
import { ProgressService } from '@/core/application/progress-service';
import { createSeededRng } from '@/core/domain/rng';
import { Shell } from '@/ui/shell/Shell';
import { FakeAudioControl } from '../fakes/fake-audio-control';
import { FakeCalendar } from '../fakes/fake-calendar';
import { FakeClock } from '../fakes/fake-clock';
import { FakeNoteInput } from '../fakes/fake-note-input';
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
  const mic = new FakeNoteInput('microfono');
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
      progress={progress}
      lessonFlow={lessonFlow}
    />,
  );
  const go = (hash: string) =>
    act(() => {
      window.location.hash = hash;
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  return { session, preferences, lessonFlow, progress, pc, go };
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
    go('#/leccion/u1-1');
    expect(current()).toEqual(['Aprender']);
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
