import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react';
import type { InputManager } from '@/core/application/input-manager';
import type { PreferencesService } from '@/core/application/preferences-service';
import { EXERCISE_MODES, levelsOf } from '@/core/domain/curriculum';
import type { ExerciseMode } from '@/core/domain/curriculum';
import type { InputSource } from '@/core/domain/note-event';
import { INPUT_CHOICES, THEME_CHOICES } from '@/core/domain/preferences';
import type { ThemeChoice } from '@/core/domain/preferences';
import type { InputMonitor } from '@/core/ports/input-monitor';
import type { NoteInput } from '@/core/ports/note-input';
import { useIsNarrow, useMonitor } from '../practice/hooks';
import { describeInputStatus } from '../status/describe-status';
import './settings.css';

export const SETTINGS_PANEL_ID = 'settings-panel';
const NARROW_MAX_WIDTH = 899;

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

export interface SettingsPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly preferences: PreferencesService;
  /** Todas las entradas que existen. */
  readonly inputs: readonly NoteInput[];
  /** Sin gestor (modo de desarrollo) la entrada no se puede cambiar desde aquí. */
  readonly inputManager?: InputManager | undefined;
  readonly microphone?: (NoteInput & InputMonitor) | undefined;
  /** Hay una ronda en pausa mientras los ajustes están abiertos: se avisa. */
  readonly roundPaused?: boolean | undefined;
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

/** Botón del engranaje, en la cabecera. `Ctrl+,` hace lo mismo. */
export function SettingsButton({
  open,
  onToggle,
  buttonRef,
}: {
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly buttonRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      type="button"
      ref={buttonRef}
      className="gear"
      aria-expanded={open}
      aria-controls={SETTINGS_PANEL_ID}
      aria-keyshortcuts="Control+,"
      title="Ajustes (Ctrl+,)"
      onClick={onToggle}
      data-testid="settings-button"
    >
      <GearIcon />
      <span>Ajustes</span>
    </button>
  );
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

/** En pantallas estrechas el panel es modal: el foco no sale de él con el tabulador. */
function trapTab(event: ReactKeyboardEvent<HTMLElement>): void {
  if (event.key !== 'Tab') return;
  const focusable = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ),
  ];
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return;
  // El título recibe el foco al abrir (tabindex −1): Mayús+Tab desde él también debe quedarse dentro.
  const active = document.activeElement as HTMLElement | null;
  if (event.shiftKey && (active === first || active === null || !focusable.includes(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * Ajustes: entrada, ejercicio y apariencia. Va **encima** del tablero (no lo empuja); en pantallas
 * estrechas es modal. Todo lo que cambia se guarda en las preferencias.
 */
export function SettingsPanel({
  open,
  onClose,
  preferences,
  inputs,
  inputManager,
  microphone,
  roundPaused = false,
}: SettingsPanelProps) {
  const prefs = useSyncExternalStore(preferences.subscribe, preferences.getSnapshot);
  const narrow = useIsNarrow(NARROW_MAX_WIDTH);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (open) headingRef.current?.focus({ preventScroll: true });
  }, [open]);

  if (!open) return null;

  const groupsBlocked = prefs.input === 'microfono' && !prefs.polyphonicMic;
  const levels = levelsOf(prefs.mode);
  const available = INPUT_CHOICES.map((source) => inputs.find((input) => input.source === source));

  return (
    <>
      {narrow && <div className="settings-backdrop" onClick={onClose} aria-hidden="true" />}
      <aside
        id={SETTINGS_PANEL_ID}
        className="settings-panel"
        role="dialog"
        aria-modal={narrow}
        aria-labelledby="settings-title"
        data-testid="settings-panel"
        onKeyDown={narrow ? trapTab : undefined}
      >
        <header className="settings-panel__head">
          <h2 id="settings-title" tabIndex={-1} ref={headingRef}>
            Ajustes
          </h2>
          <button
            type="button"
            className="button button--ghost"
            onClick={onClose}
            data-testid="settings-close"
          >
            Cerrar
          </button>
        </header>
        {roundPaused && (
          <p className="settings-panel__note" data-testid="settings-pause-note">
            La ronda está en pausa mientras los ajustes están abiertos.
          </p>
        )}

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
          className="button button--ghost settings-panel__reset"
          onClick={() => preferences.reset()}
          data-testid="settings-reset"
        >
          Restablecer ajustes
        </button>
      </aside>
    </>
  );
}
