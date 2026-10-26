import './game.css';
import type { ReactNode } from 'react';
import { Icon } from './icons';
import type { IconName } from './icons';

export type AnswerTone = 'ok' | 'partial' | 'error';

const ICONS: Readonly<Record<AnswerTone, IconName>> = {
  ok: 'check',
  partial: 'play',
  error: 'cross',
};

/**
 * La barra de respuesta (abajo, como en Duolingo): dice qué pasó con lo último que tocaste.
 * Cada tono lleva icono y texto además del color. No anuncia nada por sí sola: la zona
 * `aria-live` de la pantalla ya lo hace.
 */
export function AnswerBar({
  tone,
  title,
  detail,
  actions,
  ...rest
}: {
  readonly tone: AnswerTone;
  readonly title: string;
  readonly detail?: string | undefined;
  readonly actions?: ReactNode;
  readonly 'data-testid'?: string;
}) {
  return (
    <div className={`game-answer game-answer--${tone}`} data-tone={tone} {...rest}>
      <span className="game-answer__icon">
        <Icon name={ICONS[tone]} size={20} />
      </span>
      <div className="game-answer__text">
        <p className="game-answer__title">{title}</p>
        {detail ? <p className="game-answer__detail">{detail}</p> : null}
      </div>
      {actions ? <div className="game-answer__actions">{actions}</div> : null}
    </div>
  );
}
