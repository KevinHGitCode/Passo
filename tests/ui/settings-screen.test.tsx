// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { InputManager } from '@/core/application/input-manager';
import { bindInputsToPreferences } from '@/core/application/input-sync';
import { PracticeSession } from '@/core/application/practice-session';
import { PreferencesService } from '@/core/application/preferences-service';
import { bindSessionToPreferences } from '@/core/application/preferences-sync';
import { createSeededRng } from '@/core/domain/rng';
import { SettingsScreen } from '@/ui/settings/SettingsScreen';
import { useTheme } from '@/ui/theme/use-theme';
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
  function Page() {
    useTheme(preferences);
    return (
      <SettingsScreen
        preferences={preferences}
        inputs={inputs}
        inputManager={manager}
        microphone={undefined}
      />
    );
  }
  render(<Page />);
  return { mic, midi, pc, preferences, session, manager };
}

const KEYBOARD = { version: 1, input: 'teclado-pc' };

describe('página de ajustes · encabezado', () => {
  it('es una página con su título y un botón para volver', () => {
    setup();
    expect(screen.getByRole('heading', { level: 1, name: 'Ajustes' })).toBeTruthy();
    expect(screen.getByTestId('settings-close').textContent).toBe('Volver');
    // No es una ventana emergente: ni diálogo ni fondo que tape lo demás.
    expect(screen.getByTestId('settings-panel').getAttribute('role')).toBeNull();
    expect(document.querySelector('.settings-backdrop')).toBeNull();
  });

  it('ya no lleva los controles sueltos de la cabecera ni avisos de pausa', () => {
    setup();
    expect(screen.queryByTestId('settings-pause-note')).toBeNull();
    expect(screen.queryByTestId('lesson-note')).toBeNull();
  });
});

describe('página de ajustes · entrada', () => {
  it('muestra las tres entradas con la elegida marcada y su estado', () => {
    setup();
    expect((screen.getByTestId('input-microfono') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('input-midi') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId('input-teclado-pc') as HTMLInputElement).checked).toBe(false);
    expect(screen.getByTestId('input-status').textContent).toContain('Micrófono apagado');
  });

  it('elegir otra entrada la enciende y apaga las demás (exclusivas)', () => {
    const { pc, mic, manager, preferences } = setup();
    fireEvent.click(screen.getByTestId('input-teclado-pc'));
    expect(preferences.getSnapshot().input).toBe('teclado-pc');
    expect(manager?.getSnapshot().selected).toBe('teclado-pc');
    expect(pc.getStatus().kind).toBe('conectado');
    expect(mic.getStatus().kind).toBe('inactivo');
    expect(screen.getByTestId('input-status').textContent).toBe('Activo');
  });

  it('elegir el micrófono no lo enciende: lo hace la persona desde su botón', () => {
    const { mic } = setup({ stored: KEYBOARD });
    fireEvent.click(screen.getByTestId('input-microfono'));
    expect(mic.startCalls).toBe(0);
  });

  it('en modo de desarrollo las entradas no se pueden cambiar y lo explica', () => {
    setup({ dev: true });
    expect(screen.getByTestId('input-dev-note').textContent).toContain('?pc');
    expect((screen.getByTestId('input-midi') as HTMLInputElement).disabled).toBe(true);
  });
});

describe('página de ajustes · ejercicio', () => {
  it('con el micrófono solo hay notas: terceras y acordes están desactivados y se explica por qué', () => {
    setup();
    expect((screen.getByTestId('mode-notas') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('mode-terceras') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByTestId('mode-acordes') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByTestId('mode-blocked').textContent).toContain('beta');
  });

  it('con el micrófono aparece «Oír varias notas a la vez (beta)»; activarlo habilita terceras y acordes', () => {
    const { session, preferences } = setup();
    const toggle = screen.getByTestId('polyphonic-switch');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(toggle.textContent).toContain('BETA');
    fireEvent.click(toggle);
    expect(preferences.getSnapshot().polyphonicMic).toBe(true);
    expect((screen.getByTestId('mode-terceras') as HTMLInputElement).disabled).toBe(false);
    expect(screen.queryByTestId('mode-blocked')).toBeNull();
    fireEvent.click(screen.getByTestId('mode-acordes'));
    expect(session.getSnapshot().mode).toBe('acordes');
  });

  it('apagar la beta con acordes elegidos vuelve a notas', () => {
    const { session } = setup({
      stored: { version: 1, input: 'microfono', polyphonicMic: true, mode: 'acordes' },
    });
    expect(session.getSnapshot().mode).toBe('acordes');
    fireEvent.click(screen.getByTestId('polyphonic-switch'));
    expect(session.getSnapshot().mode).toBe('notas');
  });

  it('con otra entrada no se ofrece la beta del micrófono', () => {
    setup({ stored: KEYBOARD });
    expect(screen.queryByTestId('polyphonic-switch')).toBeNull();
  });

  it('con el teclado del PC se puede elegir modo y nivel, y la sesión lo recibe', () => {
    const { session, preferences } = setup({ stored: KEYBOARD });
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

  it('cambiar de ejercicio con una ronda en curso empieza otra', () => {
    const { session } = setup({ stored: KEYBOARD });
    act(() => session.start());
    fireEvent.click(screen.getByTestId('mode-acordes'));
    expect(session.getSnapshot()).toMatchObject({ mode: 'acordes', hits: 0 });
    expect(session.getSnapshot().exercise?.target.notes).toHaveLength(3);
  });

  it('pasar al micrófono desde acordes vuelve a notas', () => {
    const { session } = setup({
      stored: { version: 1, input: 'teclado-pc', mode: 'acordes' },
    });
    fireEvent.click(screen.getByTestId('input-microfono'));
    expect(session.getSnapshot().mode).toBe('notas');
    expect((screen.getByTestId('mode-acordes') as HTMLInputElement).disabled).toBe(true);
  });
});

describe('página de ajustes · apariencia', () => {
  it('la notación cambia los nombres en la sesión y se guarda', () => {
    const { session, preferences } = setup();
    fireEvent.click(screen.getByLabelText('C D E'));
    expect(session.getSnapshot().notation).toBe('americana');
    expect(preferences.getSnapshot().notation).toBe('americana');
  });

  it('el interruptor de ayuda llega a la sesión y a las preferencias', () => {
    const { session, preferences } = setup();
    const toggle = screen.getByTestId('help-switch');
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(session.getSnapshot().help).toBe(false);
    expect(preferences.getSnapshot().help).toBe(false);
  });

  it('el tema se aplica a la página y se guarda', () => {
    const { preferences } = setup();
    fireEvent.click(screen.getByTestId('theme-oscuro'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('oscuro');
    expect(preferences.getSnapshot().theme).toBe('oscuro');
    fireEvent.click(screen.getByTestId('theme-auto'));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('restablecer vuelve a los valores de fábrica', () => {
    const { session, preferences } = setup({
      stored: {
        version: 1,
        input: 'teclado-pc',
        notation: 'americana',
        help: false,
        theme: 'claro',
      },
    });
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
