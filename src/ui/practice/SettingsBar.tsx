import type { NotationMode } from '@/core/domain/note';
import type { ThemeChoice } from '../theme/use-theme';

export interface SettingsBarProps {
  readonly notation: NotationMode;
  readonly onNotation: (notation: NotationMode) => void;
  readonly help: boolean;
  readonly onHelp: (help: boolean) => void;
  readonly theme: ThemeChoice;
  readonly onCycleTheme: () => void;
}

const NOTATIONS: readonly { value: NotationMode; label: string }[] = [
  { value: 'latina', label: 'Do Re Mi' },
  { value: 'americana', label: 'C D E' },
];

const THEME_LABEL: Record<ThemeChoice, string> = {
  auto: 'Automático',
  claro: 'Claro',
  oscuro: 'Oscuro',
};

export function SettingsBar({
  notation,
  onNotation,
  help,
  onHelp,
  theme,
  onCycleTheme,
}: SettingsBarProps) {
  return (
    <div className="settings">
      <fieldset className="segmented">
        <legend className="sr-only">Notación de las notas</legend>
        {NOTATIONS.map((option) => (
          <label key={option.value} className="segmented__option">
            <input
              type="radio"
              name="notation"
              value={option.value}
              checked={notation === option.value}
              onChange={() => onNotation(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>

      <button
        type="button"
        role="switch"
        aria-checked={help}
        className="switch"
        onClick={() => onHelp(!help)}
        data-testid="help-switch"
      >
        <span className="switch__track" aria-hidden="true">
          <span className="switch__thumb" />
        </span>
        <span>Ayuda: mostrar la tecla</span>
      </button>

      <button type="button" className="button button--ghost" onClick={onCycleTheme}>
        Tema: {THEME_LABEL[theme]}
      </button>
    </div>
  );
}
