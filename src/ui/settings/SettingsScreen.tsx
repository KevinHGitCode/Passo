import { useSyncExternalStore } from 'react';
import type { InputManager } from '@/core/application/input-manager';
import type { PianoSetupService } from '@/core/application/piano-setup-service';
import type { PreferencesService } from '@/core/application/preferences-service';
import { EXERCISE_MODES, levelsOf } from '@/core/domain/curriculum';
import type { ExerciseMode } from '@/core/domain/curriculum';
import { INSTRUMENTS, INSTRUMENT_LABELS } from '@/core/domain/instrument';
import type { Instrument } from '@/core/domain/instrument';
import type { InputSource } from '@/core/domain/note-event';
import { REFERENCE_A4_HZ } from '@/core/domain/pitch';
import { INPUT_CHOICES, THEME_CHOICES } from '@/core/domain/preferences';
import type { ThemeChoice } from '@/core/domain/preferences';
import { MAX_REFERENCE_HZ, MIN_REFERENCE_HZ } from '@/core/domain/tuner';
import type { InputMonitor } from '@/core/ports/input-monitor';
import type { NoteInput } from '@/core/ports/note-input';
import { useInputStatus, useMonitor } from '../practice/hooks';
import { AJUSTES, CAMINO, ajustesOf, hrefOf, navigate } from '../router/routes';
import { describeInputStatus } from '../status/describe-status';
import { Icon } from '../game/icons';
import type { IconName } from '../game/icons';
import { SettingRow, SettingsCard, SwitchRow } from './parts';
import { PianoKeyboardSettings } from './PianoSettings';
import './settings.css';
import { PageHeader } from '../shell/PageHeader';
import { MicGate } from '../listen/MicGate';

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
  /** De qué instrumento son los ajustes que se ven (los dos tienen los suyos). */
  readonly instrument: Instrument;
  readonly preferences: PreferencesService;
  /** La prueba del micrófono con el piano (los ajustes del piano). */
  readonly pianoSetup: PianoSetupService;
  /** El micrófono es una de las entradas con las que se toca ahora. */
  readonly micIsInput: boolean;
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
export function SettingsButton({
  current = false,
  instrument,
}: {
  readonly current?: boolean;
  /** Los ajustes del instrumento con el que se está; sin él, los del elegido. */
  readonly instrument?: Instrument;
}) {
  return (
    <a
      className="gear"
      href={hrefOf(instrument === undefined ? AJUSTES : ajustesOf(instrument))}
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

type Prefs = ReturnType<PreferencesService['getSnapshot']>;

const INSTRUMENT_ICON: Readonly<Record<Instrument, IconName>> = {
  piano: 'piano',
  guitarra: 'guitar',
};

/** Piano · «Cómo toco»: la entrada y, con el micrófono, las varias notas (beta). */
function PianoInputCard({
  prefs,
  preferences,
  inputs,
  inputManager,
  microphone,
}: {
  readonly prefs: Prefs;
  readonly preferences: PreferencesService;
  readonly inputs: readonly NoteInput[];
  readonly inputManager: InputManager | undefined;
  readonly microphone: (NoteInput & InputMonitor) | undefined;
}) {
  const available = INPUT_CHOICES.map((source) => inputs.find((input) => input.source === source));
  return (
    <SettingsCard icon="mic" title="Cómo toco" hint="Con qué le dices a Passo las notas que tocas.">
      {inputManager === undefined && (
        <p className="settings-group__note" data-testid="input-dev-note">
          Modo de desarrollo: las entradas vienen de la dirección (<code>?pc</code>,{' '}
          <code>?midi</code>).
        </p>
      )}
      <div className="set-choices" role="radiogroup" aria-label="Entrada">
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
      </div>
      {prefs.input === 'microfono' && (
        <SwitchRow
          checked={prefs.polyphonicMic}
          onToggle={() => preferences.update({ polyphonicMic: !prefs.polyphonicMic })}
          testId="polyphonic-switch"
          label={
            <>
              Oír varias notas a la vez <span className="beta">BETA</span>
            </>
          }
          hint="Para terceras y acordes con el micrófono. Pon el piano cerca; en la mano izquierda solo comprueba que las notas suenan."
        />
      )}
    </SettingsCard>
  );
}

/** Piano · «Qué practico»: el ejercicio y su nivel (lo de la práctica libre y los repasos). */
function PianoPracticeCard({
  prefs,
  preferences,
}: {
  readonly prefs: Prefs;
  readonly preferences: PreferencesService;
}) {
  const groupsBlocked = prefs.input === 'microfono' && !prefs.polyphonicMic;
  const levels = levelsOf(prefs.mode);
  return (
    <SettingsCard
      icon="target"
      title="Qué practico"
      hint="El ejercicio y el nivel de la práctica libre."
    >
      <SettingRow
        stacked
        label="Ejercicio"
        hint={
          groupsBlocked ? (
            <span id="mode-blocked" data-testid="mode-blocked">
              Terceras y acordes necesitan el teclado del PC o un piano MIDI. Con el micrófono,
              activa «Oír varias notas a la vez» (beta).
            </span>
          ) : undefined
        }
      >
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
      </SettingRow>
      <SettingRow label="Nivel" stacked>
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
      </SettingRow>
    </SettingsCard>
  );
}

/** Guitarra · «Cómo toco»: la guitarra solo se oye con el micrófono; aquí se ve su estado y se activa. */
function GuitarInputCard({
  microphone,
}: {
  readonly microphone: (NoteInput & InputMonitor) | undefined;
}) {
  const status = useInputStatus(microphone);
  const snapshot = useMonitor(microphone);
  const view = microphone
    ? describeInputStatus('microfono', status ?? microphone.getStatus(), snapshot)
    : null;
  const on = status?.kind === 'conectado';
  return (
    <SettingsCard icon="mic" title="Cómo toco" hint="La guitarra se oye siempre con el micrófono.">
      {microphone && !on ? (
        <MicGate
          compact
          status={status}
          onActivate={() => void microphone.start()}
          purpose="Actívalo aquí o al entrar a una lección, al afinador o a una canción."
          testId="guitar-mic"
          buttonTestId="guitar-mic-activate"
        />
      ) : (
        <SettingRow label="Micrófono" hint="Toca cerca de él y en una sala tranquila.">
          {view && (
            <span className="set-status" data-tone={view.tone} data-testid="guitar-mic-status">
              {view.short === 'Micrófono' ? 'Activo' : view.short}
            </span>
          )}
        </SettingRow>
      )}
    </SettingsCard>
  );
}

/** Guitarra · «Afinador»: el La₄ con el que mide (440 Hz por omisión, de 430 a 450). */
function GuitarTunerCard({
  prefs,
  preferences,
}: {
  readonly prefs: Prefs;
  readonly preferences: PreferencesService;
}) {
  const hz = prefs.tunerReferenceHz;
  const set = (next: number) => preferences.update({ tunerReferenceHz: next });
  return (
    <SettingsCard icon="tuner" title="Afinador" hint="Con qué referencia mide las cuerdas.">
      <SettingRow
        label="La₄ de referencia"
        hint="Casi todo el mundo afina a 440 Hz. Cámbialo solo si tocas con un instrumento que ya está afinado distinto."
      >
        <div className="stepper" role="group" aria-label="La₄ de referencia">
          <button
            type="button"
            className="stepper__button"
            aria-label="Bajar un hercio"
            disabled={hz <= MIN_REFERENCE_HZ}
            onClick={() => set(hz - 1)}
            data-testid="tuner-ref-down"
          >
            −
          </button>
          <span className="stepper__value" data-testid="tuner-ref-value">
            {hz} Hz
          </span>
          <button
            type="button"
            className="stepper__button"
            aria-label="Subir un hercio"
            disabled={hz >= MAX_REFERENCE_HZ}
            onClick={() => set(hz + 1)}
            data-testid="tuner-ref-up"
          >
            +
          </button>
        </div>
        {hz !== REFERENCE_A4_HZ && (
          <button
            type="button"
            className="link-button"
            onClick={() => set(REFERENCE_A4_HZ)}
            data-testid="tuner-ref-reset"
          >
            Volver a {REFERENCE_A4_HZ}
          </button>
        )}
      </SettingRow>
    </SettingsCard>
  );
}

/** «Apariencia»: lo común a los dos instrumentos (notación y tema) y, en piano, la ayuda de la tecla. */
function ViewCard({
  prefs,
  preferences,
  instrument,
}: {
  readonly prefs: Prefs;
  readonly preferences: PreferencesService;
  readonly instrument: Instrument;
}) {
  return (
    <SettingsCard
      icon="gear"
      title="Apariencia"
      hint="Vale para toda la app, con cualquier instrumento."
    >
      <SettingRow label="Nombres de las notas">
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
      </SettingRow>
      <SettingRow label="Tema">
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
      </SettingRow>
      {instrument === 'piano' && (
        <SwitchRow
          checked={prefs.help}
          onToggle={() => preferences.update({ help: !prefs.help })}
          testId="help-switch"
          label="Ayuda: mostrar la tecla"
          hint="Ilumina en el teclado la tecla que toca."
        />
      )}
    </SettingsCard>
  );
}

/**
 * La página de ajustes. Cada instrumento tiene los suyos (las pestañas cambian de uno a otro); lo que cambia
 * se guarda al momento en las preferencias.
 */
export function SettingsScreen({
  instrument,
  preferences,
  pianoSetup,
  micIsInput,
  inputs,
  inputManager,
  microphone,
}: SettingsScreenProps) {
  const prefs = useSyncExternalStore(preferences.subscribe, preferences.getSnapshot);

  return (
    <div className="settings-page" data-testid="settings-panel" data-instrument={instrument}>
      <PageHeader
        id="ajustes-titulo"
        title="Ajustes"
        lead="Lo que cambies se guarda solo."
        actions={
          <button
            type="button"
            className="button button--ghost"
            onClick={leaveSettings}
            data-testid="settings-close"
          >
            ← Volver
          </button>
        }
      />
      <nav className="settings-tabs" aria-label="Ajustes de">
        {INSTRUMENTS.map((id) => (
          <a
            key={id}
            className="settings-tab"
            href={hrefOf(ajustesOf(id))}
            aria-current={id === instrument ? 'page' : undefined}
            data-testid={`settings-tab-${id}`}
          >
            <Icon name={INSTRUMENT_ICON[id]} size={20} />
            {INSTRUMENT_LABELS[id]}
          </a>
        ))}
      </nav>
      <div className="settings-page__body">
        {instrument === 'piano' ? (
          <>
            <PianoKeyboardSettings
              setup={pianoSetup}
              preferences={preferences}
              notation={prefs.notation}
              microphone={microphone}
              micIsInput={micIsInput}
            />
            <div className="settings-col">
              <PianoInputCard
                prefs={prefs}
                preferences={preferences}
                inputs={inputs}
                inputManager={inputManager}
                microphone={microphone}
              />
              <ViewCard prefs={prefs} preferences={preferences} instrument={instrument} />
            </div>
            <div className="settings-col">
              <PianoPracticeCard prefs={prefs} preferences={preferences} />
            </div>
          </>
        ) : (
          <>
            <div className="settings-col">
              <GuitarInputCard microphone={microphone} />
              <GuitarTunerCard prefs={prefs} preferences={preferences} />
            </div>
            <div className="settings-col">
              <ViewCard prefs={prefs} preferences={preferences} instrument={instrument} />
            </div>
          </>
        )}
        <div className="settings-reset">
          <div className="set-row__text">
            <span className="set-row__label">Restablecer ajustes</span>
            <span className="set-row__hint">
              Vuelve todo a como venía. Tu progreso no se borra.
            </span>
          </div>
          <button
            type="button"
            className="button button--ghost settings-page__reset"
            onClick={() => preferences.reset()}
            data-testid="settings-reset"
          >
            Restablecer
          </button>
        </div>
      </div>
    </div>
  );
}
