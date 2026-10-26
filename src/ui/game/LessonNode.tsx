import './game.css';
import type { LessonKind } from '@/core/domain/lessons';
import { Icon } from './icons';
import type { IconName } from './icons';
import { Stars } from './Stars';
import type { StarCount } from './Stars';

/**
 * Estado de un nodo del camino. `bloqueada-entrada` es distinto de `bloqueada`: la lección está abierta
 * por avance, pero la entrada elegida no puede tocarla (terceras y acordes con micrófono sin la beta).
 */
export type NodeState = 'hecha' | 'actual' | 'abierta' | 'bloqueada' | 'bloqueada-entrada';

export interface LessonNodeProps {
  readonly state: NodeState;
  readonly kind: LessonKind;
  readonly title: string;
  readonly stars: StarCount;
  /** Dirección de la lección (nodos abiertos). */
  readonly href?: string | undefined;
  /** Lo que explica un nodo bloqueado al pulsarlo (abre Ajustes, dice qué falta…). */
  readonly onExplain?: (() => void) | undefined;
  /** Texto que explica el bloqueo para lectores de pantalla. */
  readonly reason?: string | undefined;
  /** Texto del globo sobre el nodo actual («Empezar»). */
  readonly bubble?: string | undefined;
  readonly 'data-testid'?: string;
}

function iconOf(state: NodeState, kind: LessonKind): IconName {
  if (state === 'hecha') return 'check';
  if (state === 'bloqueada') return 'lock';
  if (state === 'bloqueada-entrada') return 'keys';
  if (kind === 'repaso') return 'review';
  if (kind === 'prueba') return 'trophy';
  return 'play';
}

const STATE_TEXT: Readonly<Record<NodeState, string>> = {
  hecha: 'hecha',
  actual: 'siguiente',
  abierta: 'abierta',
  bloqueada: 'bloqueada',
  'bloqueada-entrada': 'no disponible con tu entrada',
};

/** Un nodo del camino: círculo grande con su icono, sus estrellas y su nombre. */
export function LessonNode({
  state,
  kind,
  title,
  stars,
  href,
  onExplain,
  reason,
  bubble,
  ...rest
}: LessonNodeProps) {
  const locked = state === 'bloqueada' || state === 'bloqueada-entrada';
  const className = `game-node game-node--${state} game-node--${kind}`;
  const name = `${title}, ${STATE_TEXT[state]}${locked && reason ? `. ${reason}` : ''}`;
  const circle = (
    <span className="game-node__circle">
      <Icon name={iconOf(state, kind)} size={30} />
    </span>
  );
  return (
    <div className={className} data-state={state} data-kind={kind} {...rest}>
      {bubble && state === 'actual' ? <span className="game-node__bubble">{bubble}</span> : null}
      {locked ? (
        <button
          type="button"
          className="game-node__target"
          aria-disabled="true"
          aria-label={name}
          onClick={onExplain}
        >
          {circle}
        </button>
      ) : (
        <a className="game-node__target" href={href} aria-label={name}>
          {circle}
        </a>
      )}
      {state === 'hecha' ? (
        <Stars value={stars} size="sm" />
      ) : (
        <span className="game-node__title">{title}</span>
      )}
    </div>
  );
}
