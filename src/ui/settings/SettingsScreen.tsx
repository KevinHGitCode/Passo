import { useSyncExternalStore } from 'react';
import type { InputManager } from '@/core/application/input-manager';
import type { PreferencesService } from '@/core/application/preferences-service';
import { EXERCISE_MODES, levelsOf } from '@/core/domain/curriculum';
import type { ExerciseMode } from '@/core/domain/curriculum';
import type { InputSource } from '@/core/domain/note-event';
import { INPUT_CHOICES, THEME_CHOICES } from '@/core/domain/preferences';
import type { ThemeChoice } from '@/core/domain/preferences';
import type { InputMonitor } from '@/core/ports/input-monitor';
import type { NoteInput } from '@/core/ports/note-input';
import { useMonitor } from '../practice/hooks';
import { AJUSTES, CAMINO, hrefOf, navigate } from '../router/routes';
import { describeInputStatus } from '../status/describe-status';
import './settings.css';

const INPUT_TEXT: Readonly<Record<InputSource, { title: string; hint: string }>> = {
  microfono: { title: 'Micrófono', hint: 'Oye tu piano o teclado' },
  midi: { title: 'Piano MIDI', hint: 'Teclado con cable USB' },
  'teclado-pc': { title: 'Teclado del PC', hint: 'Para probar, sin piano' },
};

const MODE_TEXT: Readonly<Record<ExerciseMode, string>> = {
  notas: 'Notas',
  terceras: 'Terceras',
  acordes: 'Acordes',
};

const THEME_TEXT: Readonly<Record<ThemeChoice, string>> = {
  auto: 'Automático',
  claro: 'Claro',
  oscuro: 'Oscuro',
};

export interface SettingsScreenProps {
  readonly preferences: PreferencesService;
  /** Todas las entradas que existen. */
  readonly inputs: readonly NoteInput[];
  /** Sin gestor (modo de desarrollo) la entrada no se puede cambiar desde aquí. */
  readonly inputManager?: InputManager | undefined;
  readonly microphone?: (NoteInput & InputMonitor) | undefined;
}

function GearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/** El engranaje de la cabecera: lleva a la página de ajustes (`Ctrl+,` hace lo mismo). */
export function SettingsButton({ current = false }: { readonly current?: boolean }) {
  return (
    <a
      className="gear"
      href={hrefOf(AJUSTES)}
      aria-current={current ? 'page' : undefined}
      aria-keyshortcuts="Control+,"
      title="Ajustes (Ctrl+,)"
      data-testid="settings-button"
    >
      <GearIcon />
      <span>Ajustes</span>
    </a>
  );
}

/** Vuelve a la pantalla de la que se vino (o al camino si se entró directamente a los ajustes). */
export function leaveSettings(): void {
  if (window.history.length > 1) window.history.back();
  else navigate(CAMINO);
}

function InputChoice({
  input,
  checked,
  disabled,
  onSelect,
  monitor,
}: {
  readonly input: NoteInput;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onSelect: () => void;
  readonly monitor: InputMonitor | undefined;
}) {
  const status = useSyncExternalStore(
    (onChange) => input.subscribeStatus(onChange),
    () => input.getStatus(),
  );
  const snapshot = useMonitor(input.source === 'microfono' ? monitor : undefined);
  const view = describeInputStatus(
    input.source,
    status,
    input.source === 'microfono' ? snapshot : undefined,
  );
  const text = INPUT_TEXT[input.source];
  return (
    <label className="choice" data-checked={checked}>
      <input
        type="radio"
        name="input"
        value={input.source}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        data-testid={`input-${input.source}`}
      />
      <span className="choice__body">
        <span className="choice__title">{text.title}</span>
        <span className="choice__hint">{text.hint}</span>
        {checked && (
          <span className="choice__status" data-tone={view.tone} data-testid="input-status">
            {view.short === text.title ? 'Activo' : view.short}
          </span>
        )}
      </span>
    </label>
  );
}

/**
 * La página de ajustes: entrada, ejercicio y apariencia. Todo lo que cambia se guarda en las preferencias.
 */
export function SettingsScreen({
  preferences,
  inputs,
  inputManager,
  microphone,
}: SettingsScreenProps) {
  const prefs = useSyncExternalStore(preferences.subscribe, preferences.getSnapshot);
  const groupsBlocked = prefs.input === 'microfono' && !prefs.polyphonicMic;
  const levels = levelsOf(prefs.mode);
  const available = INPUT_CHOICES.map((source) => inputs.find((input) => input.source === source));

  return (
    <div className="settings-page" data-testid="settings-panel">
      <header className="settings-page__head">
        <h1 id="ajustes-titulo" tabIndex={-1} data-route-heading>
          Ajustes
        </h1>
        <button
          type="button"
          className="button button--ghost"
          onClick={leaveSettings}
          data-testid="settings-close"
        >
          Volver
        </button>
      </header>
      <div className="settings-page__body">
        <fieldset className="settings-group">
          <legend>Cómo toco</legend>
          {inputManager === undefined && (
            <p className="settings-group__note" data-testid="input-dev-note">
              Modo de desarrollo: las entradas vienen de la dirección (<code>?pc</code>,{' '}
              <code>?midi</code>).
            </p>
          )}
          {available.map((input) =>
            input ? (
              <InputChoice
                key={input.source}
                input={input}
                checked={prefs.input === input.source}
                disabled={inputManager === undefined}
                onSelect={() => preferences.update({ input: input.source })}
                monitor={microphone}
              />
            ) : null,
          )}
          {prefs.input === 'microfono' && (
            <>
              <button
                type="button"
                role="switch"
                aria-checked={prefs.polyphonicMic}
                aria-describedby="polyphonic-note"
                className="switch"
                onClick={() => preferences.update({ polyphonicMic: !prefs.polyphonicMic })}
                data-testid="polyphonic-switch"
              >
                <span className="switch__track" aria-hidden="true">
                  <span className="switch__thumb" />
                </span>
                <span>
                  Oír varias notas a la vez <span className="beta">BETA</span>
                </span>
              </button>
              <p id="polyphonic-note" className="settings-group__note">
                Para terceras y acordes con el micrófono. Pon el piano cerca; en la mano izquierda
                solo comprueba que las notas suenan.
              </p>
            </>
          )}
        </fieldset>

        <fieldset className="settings-group">
          <legend>Qué practico</legend>
          <div className="segmented segmented--wrap" role="radiogroup" aria-label="Ejercicio">
            {EXERCISE_MODES.map((mode) => {
              const blocked = groupsBlocked && mode !== 'notas';
              return (
                <label key={mode} className="segmented__option">
                  <input
                    type="radio"
                    name="mode"
                    value={mode}
                    checked={prefs.mode === mode}
                    disabled={blocked}
                    aria-describedby={blocked ? 'mode-blocked' : undefined}
                    onChange={() => preferences.update({ mode })}
                    data-testid={`mode-${mode}`}
                  />
                  <span>{MODE_TEXT[mode]}</span>
                </label>
              );
            })}
          </div>
          {groupsBlocked && (
            <p id="mode-blocked" className="settings-group__note" data-testid="mode-blocked">
              Terceras y acordes necesitan el teclado del PC o un piano MIDI. Con el micrófono,
              activa «Oír varias notas a la vez» (beta).
            </p>
          )}
          <div className="levels" role="radiogroup" aria-label="Nivel">
            {levels.map((def) => (
              <label
                key={def.level}
                className="choice choice--compact"
                data-checked={prefs.levels[prefs.mode] === def.level}
              >
                <input
                  type="radio"
                  name="level"
                  value={def.level}
                  checked={prefs.levels[prefs.mode] === def.level}
                  onChange={() => preferences.update({ levels: { [prefs.mode]: def.level } })}
                  data-testid={`level-${def.level}`}
                />
                <span className="choice__body">
                  <span className="choice__title">Nivel {def.level}</span>
                  <span className="choice__hint">{def.title}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="settings-group">
          <legend>Cómo lo veo</legend>
          <div className="segmented" role="radiogroup" aria-label="Notación de las notas">
            {(
              [
                ['latina', 'Do Re Mi'],
                ['americana', 'C D E'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="segmented__option">
                <input
                  type="radio"
                  name="notation"
                  value={value}
                  checked={prefs.notation === value}
                  onChange={() => preferences.update({ notation: value })}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.help}
            className="switch"
            onClick={() => preferences.update({ help: !prefs.help })}
            data-testid="help-switch"
          >
            <span className="switch__track" aria-hidden="true">
              <span className="switch__thumb" />
            </span>
            <span>Ayuda: mostrar la tecla</span>
          </button>
          <div className="segmented segmented--wrap" role="radiogroup" aria-label="Tema">
            {THEME_CHOICES.map((value) => (
              <label key={value} className="segmented__option">
                <input
                  type="radio"
                  name="theme"
                  value={value}
                  checked={prefs.theme === value}
                  onChange={() => preferences.update({ theme: value })}
                  data-testid={`theme-${value}`}
                />
                <span>{THEME_TEXT[value]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <button
          type="button"
          className="button button--ghost settings-page__reset"
          onClick={() => preferences.reset()}
          data-testid="settings-reset"
        >
          Restablecer ajustes
        </button>
      </div>
    </div>
  );
}
