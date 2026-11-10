import { useId } from 'react';
import type { ReactNode } from 'react';
import { Icon } from '../game/icons';
import type { IconName } from '../game/icons';

/** Una sección de los ajustes: una tarjeta con su icono, su título y una línea que dice para qué sirve. */
export function SettingsCard({
  icon,
  title,
  hint,
  wide = false,
  testId,
  children,
}: {
  readonly icon: IconName;
  readonly title: string;
  readonly hint?: string;
  /** Ocupa las dos columnas (el teclado necesita el ancho). */
  readonly wide?: boolean;
  readonly testId?: string;
  readonly children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      className={wide ? 'set-card set-card--wide' : 'set-card'}
      aria-labelledby={id}
      data-testid={testId}
    >
      <header className="set-card__head">
        <span className="set-card__icon" aria-hidden="true">
          <Icon name={icon} size={22} />
        </span>
        <div className="set-card__titles">
          <h2 id={id} className="set-card__title">
            {title}
          </h2>
          {hint === undefined ? null : <p className="set-card__hint">{hint}</p>}
        </div>
      </header>
      <div className="set-card__body">{children}</div>
    </section>
  );
}

/** Una fila de ajuste: qué es (y una pista) a la izquierda, el control a la derecha; apilada si el control es ancho. */
export function SettingRow({
  label,
  hint,
  stacked = false,
  children,
}: {
  readonly label: ReactNode;
  readonly hint?: ReactNode;
  readonly stacked?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <div className={stacked ? 'set-row set-row--stacked' : 'set-row'}>
      <div className="set-row__text">
        <span className="set-row__label">{label}</span>
        {hint === undefined ? null : <span className="set-row__hint">{hint}</span>}
      </div>
      <div className="set-row__control">{children}</div>
    </div>
  );
}

/** Un interruptor que ocupa toda la fila: el texto a la izquierda y la palanca a la derecha. */
export function SwitchRow({
  checked,
  onToggle,
  testId,
  label,
  hint,
}: {
  readonly checked: boolean;
  readonly onToggle: () => void;
  readonly testId: string;
  readonly label: ReactNode;
  readonly hint?: string;
}) {
  const hintId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={hint === undefined ? undefined : hintId}
      className="switch set-row set-switch"
      onClick={onToggle}
      data-testid={testId}
    >
      <span className="set-row__text">
        <span className="set-row__label">{label}</span>
        {hint === undefined ? null : (
          <span className="set-row__hint" id={hintId}>
            {hint}
          </span>
        )}
      </span>
      <span className="switch__track" aria-hidden="true">
        <span className="switch__thumb" />
      </span>
    </button>
  );
}
