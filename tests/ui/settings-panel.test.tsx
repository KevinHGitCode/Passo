// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { InputManager } from '@/core/application/input-manager';
import { bindInputsToPreferences } from '@/core/application/input-sync';
import { PracticeSession } from '@/core/application/practice-session';
import { PreferencesService } from '@/core/application/preferences-service';
import { bindSessionToPreferences } from '@/core/application/preferences-sync';
import { createSeededRng } from '@/core/domain/rng';
import { App } from '@/ui/App';
import { FakeAudioControl } from '../fakes/fake-audio-control';
import { FakeClock } from '../fakes/fake-clock';
import { FakeNoteInput } from '../fakes/fake-note-input';
import { FakePreferencesStore } from '../fakes/fake-preferences-store';

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
  // @ts-expect-error: se restaura el entorno de jsdom (sin matchMedia)
  delete window.matchMedia;
});
beforeEach(() => {
  // @ts-expect-error: jsdom no trae matchMedia
  delete window.matchMedia;
});

function setup(options: { stored?: unknown; dev?: boolean } = {}) {
  const mic = new FakeNoteInput('microfono');
  const midi = new FakeNoteInput('midi');
  const pc = new FakeNoteInput('teclado-pc');
  const inputs = [mic, midi, pc];
  const preferences = new PreferencesService(new FakePreferencesStore(options.stored ?? null));
  const session = new PracticeSession({
    inputs,
    audio: { noteOn: () => undefined, noteOff: () => undefined },
    clock: new FakeClock(0),
    rng: createSeededRng(3),
  });
  bindSessionToPreferences(session, preferences, { exercise: true });
  let manager: InputManager | undefined;
  if (!options.dev) {
    manager = new InputManager(inputs, preferences.getSnapshot().input);
    bindInputsToPreferences(manager, session, preferences);
  }
  render(
    <App
      session={session}
      preferences={preferences}
      inputs={inputs}
      inputManager={manager}
      audio={new FakeAudioControl()}
    />,
  );
  const openPanel = () => fireEvent.click(screen.getByTestId('settings-button'));
  return { mic, midi, pc, preferences, session, manager, openPanel };
}

const KEYBOARD = { version: 1, input: 'teclado-pc' };

describe('panel de ajustes · abrir y cerrar', () => {
  it('el engranaje abre el panel, mueve el foco a su título y avisa con aria-expanded', () => {
    const { openPanel } = setup();
    const button = screen.getByTestId('settings-button');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('settings-panel')).toBeNull();
    openPanel();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('settings-panel').getAttribute('role')).toBe('dialog');
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Ajustes' }));
  });

  it('cerrar devuelve el foco al engranaje', () => {
    const { openPanel } = setup();
    openPanel();
    fireEvent.click(screen.getByTestId('settings-close'));
    expect(screen.queryByTestId('settings-panel')).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('settings-button'));
  });

  it('Esc cierra y Ctrl+, abre y cierra', () => {
    setup();
    fireEvent.keyDown(window, { key: ',', ctrlKey: true });
    expect(screen.getByTestId('settings-panel')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('settings-panel')).toBeNull();
    fireEvent.keyDown(window, { key: ',', ctrlKey: true });
    fireEvent.keyDown(window, { key: ',', ctrlKey: true });
    expect(screen.queryByTestId('settings-panel')).toBeNull();
  });

  it('la coma sola no abre nada', () => {
    setup();
    fireEvent.keyDown(window, { key: ',' });
    expect(screen.queryByTestId('settings-panel')).toBeNull();
  });

  it('abrir pausa la ronda en curso y cerrar la reanuda', () => {
    const { session, openPanel } = setup({ stored: KEYBOARD });
    act(() => session.start());
    openPanel();
    expect(session.getSnapshot()).toMatchObject({ phase: 'pausada', pauseReason: 'manual' });
    fireEvent.click(screen.getByTestId('settings-close'));
    expect(session.getSnapshot().phase).toBe('en-curso');
  });

  it('si la ronda ya estaba en pausa (la pausó la persona), cerrar los ajustes no la reanuda', () => {
    const { session, openPanel } = setup({ stored: KEYBOARD });
    act(() => session.start());
    act(() => session.pause());
    openPanel();
    fireEvent.click(screen.getByTestId('settings-close'));
    expect(session.getSnapshot().phase).toBe('pausada');
  });

  it('sin ronda (bienvenida) abrir y cerrar no cambia nada', () => {
    const { session, openPanel } = setup();
    openPanel();
    fireEvent.click(screen.getByTestId('settings-close'));
    expect(session.getSnapshot().phase).toBe('inactiva');
  });

  it('la cabecera ya no lleva los controles sueltos: notación, ayuda y tema están en el panel', () => {
    setup();
    expect(screen.queryByTestId('help-switch')).toBeNull();
    expect(screen.queryByLabelText('C D E')).toBeNull();
  });
});

describe('panel de ajustes · entrada', () => {
  it('muestra las tres entradas con la elegida marcada y su estado', () => {
    const { openPanel } = setup();
    openPanel();
    expect((screen.getByTestId('input-microfono') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('input-midi') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId('input-teclado-pc') as HTMLInputElement).checked).toBe(false);
    expect(screen.getByTestId('input-status').textContent).toContain('Micrófono apagado');
  });

  it('elegir otra entrada la enciende y apaga las demás (exclusivas)', () => {
    const { openPanel, pc, mic, manager, preferences } = setup();
    openPanel();
    fireEvent.click(screen.getByTestId('input-teclado-pc'));
    expect(preferences.getSnapshot().input).toBe('teclado-pc');
    expect(manager?.getSnapshot().selected).toBe('teclado-pc');
    expect(pc.getStatus().kind).toBe('conectado');
    expect(mic.getStatus().kind).toBe('inactivo');
    expect(screen.getByTestId('input-status').textContent).toBe('Activo');
  });

  it('elegir el micrófono no lo enciende: lo hace la persona desde su botón', () => {
    const { openPanel, mic } = setup({ stored: KEYBOARD });
    openPanel();
    fireEvent.click(screen.getByTestId('input-microfono'));
    expect(mic.startCalls).toBe(0);
  });

  it('en modo de desarrollo las entradas no se pueden cambiar y lo explica', () => {
    const { openPanel } = setup({ dev: true });
    openPanel();
    expect(screen.getByTestId('input-dev-note').textContent).toContain('?pc');
    expect((screen.getByTestId('input-midi') as HTMLInputElement).disabled).toBe(true);
  });
});

describe('panel de ajustes · ejercicio', () => {
  it('con el micrófono solo hay notas: terceras y acordes están desactivados y se explica por qué', () => {
    const { openPanel } = setup();
    openPanel();
    expect((screen.getByTestId('mode-notas') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('mode-terceras') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByTestId('mode-acordes') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByTestId('mode-blocked').textContent).toContain('beta');
  });

  it('con el teclado del PC se puede elegir modo y nivel, y la sesión lo recibe', () => {
    const { openPanel, session, preferences } = setup({ stored: KEYBOARD });
    openPanel();
    fireEvent.click(screen.getByTestId('mode-terceras'));
    expect(session.getSnapshot()).toMatchObject({ mode: 'terceras', level: 1 });
    expect(
      within(screen.getByRole('radiogroup', { name: 'Nivel' })).getAllByRole('radio'),
    ).toHaveLength(3);
    fireEvent.click(screen.getByTestId('level-3'));
    expect(session.getSnapshot()).toMatchObject({ mode: 'terceras', level: 3 });
    expect(preferences.getSnapshot().levels.terceras).toBe(3);

    fireEvent.click(screen.getByTestId('mode-acordes'));
    expect(
      within(screen.getByRole('radiogroup', { name: 'Nivel' })).getAllByRole('radio'),
    ).toHaveLength(5);
    expect(session.getSnapshot()).toMatchObject({ mode: 'acordes', level: 1 });
    fireEvent.click(screen.getByTestId('mode-terceras'));
    expect(session.getSnapshot()).toMatchObject({ mode: 'terceras', level: 3 });
  });

  it('cambiar de ejercicio con una ronda en curso empieza otra, en pausa mientras el panel siga abierto', () => {
    const { openPanel, session } = setup({ stored: KEYBOARD });
    act(() => session.start());
    openPanel();
    fireEvent.click(screen.getByTestId('mode-acordes'));
    expect(session.getSnapshot()).toMatchObject({ mode: 'acordes', phase: 'pausada', hits: 0 });
    expect(session.getSnapshot().exercise?.target.notes).toHaveLength(3);
    fireEvent.click(screen.getByTestId('settings-close'));
    expect(session.getSnapshot().phase).toBe('en-curso');
  });

  it('pasar al micrófono desde acordes vuelve a notas', () => {
    const { openPanel, session } = setup({
      stored: { version: 1, input: 'teclado-pc', mode: 'acordes' },
    });
    openPanel();
    fireEvent.click(screen.getByTestId('input-microfono'));
    expect(session.getSnapshot().mode).toBe('notas');
    expect((screen.getByTestId('mode-acordes') as HTMLInputElement).disabled).toBe(true);
  });
});

describe('panel de ajustes · apariencia', () => {
  it('la notación cambia los nombres en la sesión y se guarda', () => {
    const { openPanel, session, preferences } = setup();
    openPanel();
    fireEvent.click(screen.getByLabelText('C D E'));
    expect(session.getSnapshot().notation).toBe('americana');
    expect(preferences.getSnapshot().notation).toBe('americana');
  });

  it('el interruptor de ayuda llega a la sesión y a las preferencias', () => {
    const { openPanel, session, preferences } = setup();
    openPanel();
    const toggle = screen.getByTestId('help-switch');
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(session.getSnapshot().help).toBe(false);
    expect(preferences.getSnapshot().help).toBe(false);
  });

  it('el tema se aplica a la página y se guarda', () => {
    const { openPanel, preferences } = setup();
    openPanel();
    fireEvent.click(screen.getByTestId('theme-oscuro'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('oscuro');
    expect(preferences.getSnapshot().theme).toBe('oscuro');
    fireEvent.click(screen.getByTestId('theme-auto'));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('restablecer vuelve a los valores de fábrica', () => {
    const { openPanel, session, preferences } = setup({
      stored: {
        version: 1,
        input: 'teclado-pc',
        notation: 'americana',
        help: false,
        theme: 'claro',
      },
    });
    openPanel();
    fireEvent.click(screen.getByTestId('settings-reset'));
    expect(preferences.getSnapshot()).toMatchObject({
      input: 'microfono',
      notation: 'latina',
      help: true,
      theme: 'auto',
    });
    expect(session.getSnapshot()).toMatchObject({ notation: 'latina', help: true });
  });
});

describe('panel de ajustes · pantalla estrecha', () => {
  function narrow() {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
  }

  it('es modal: aria-modal, fondo que cierra y el tabulador no sale del panel', () => {
    narrow();
    const { openPanel } = setup();
    openPanel();
    const panel = screen.getByTestId('settings-panel');
    expect(panel.getAttribute('aria-modal')).toBe('true');
    const buttons = panel.querySelectorAll<HTMLElement>('button, input:not([disabled])');
    const last = buttons[buttons.length - 1] as HTMLElement;
    last.focus();
    fireEvent.keyDown(panel, { key: 'Tab' });
    expect(document.activeElement).toBe(panel.querySelector('button, input:not([disabled])'));

    const backdrop = document.querySelector('.settings-backdrop') as HTMLElement;
    fireEvent.click(backdrop);
    expect(screen.queryByTestId('settings-panel')).toBeNull();
  });

  it('en pantalla ancha no hay fondo y no es modal', () => {
    const { openPanel } = setup();
    openPanel();
    expect(screen.getByTestId('settings-panel').getAttribute('aria-modal')).toBe('false');
    expect(document.querySelector('.settings-backdrop')).toBeNull();
  });
});
