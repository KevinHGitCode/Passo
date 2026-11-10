import type { ReactNode } from 'react';
import type { InputStatus } from '@/core/ports/note-input';
import { GameButton } from '../game/GameButton';
import { Icon } from '../game/icons';
import './mic-gate.css';

interface GateView {
  readonly title: string;
  readonly body: ReactNode;
  /** El texto del botón; `null` si en este estado no hay nada que pulsar. */
  readonly action: string | null;
  readonly tone: 'idle' | 'waiting' | 'problem';
}

const PRIVACY = 'El audio se analiza aquí: no se graba ni se envía.';

function gateView(status: InputStatus | null, purpose: string): GateView {
  switch (status?.kind) {
    case 'iniciando':
      return {
        title: 'Esperando tu permiso…',
        body: 'Elige «Permitir» en el aviso del navegador.',
        action: null,
        tone: 'waiting',
      };
    case 'permiso-denegado':
      return {
        title: 'El micrófono está bloqueado',
        body: (
          <ol className="mic-gate__steps">
            <li>Pulsa el candado junto a la dirección de la página.</li>
            <li>Elige «Micrófono» y cambia a «Permitir».</li>
            <li>Pulsa «Reintentar».</li>
          </ol>
        ),
        action: 'Reintentar',
        tone: 'problem',
      };
    case 'sin-dispositivo':
      return status.reason === 'ocupado'
        ? {
            title: 'Otra aplicación usa el micrófono',
            body: 'Ciérrala y vuelve a intentarlo.',
            action: 'Reintentar',
            tone: 'problem',
          }
        : {
            title: 'No encuentro ningún micrófono',
            body: 'Conecta uno o revisa los ajustes de sonido de tu equipo.',
            action: 'Buscar de nuevo',
            tone: 'problem',
          };
    case 'desconectado':
      return {
        title: 'Se perdió el micrófono',
        body: 'Vuelve a conectarlo y actívalo otra vez.',
        action: 'Reactivar',
        tone: 'problem',
      };
    case 'sin-soporte':
      return {
        title: 'Este navegador no permite usar el micrófono',
        body: 'Abre Passo en Chrome o Edge.',
        action: null,
        tone: 'problem',
      };
    default:
      return {
        title: 'Activa el micrófono',
        body: `${purpose} ${PRIVACY}`,
        action: 'Activar micrófono',
        tone: 'idle',
      };
  }
}

/**
 * La puerta del micrófono: lo que se ve en cualquier pantalla que necesita oírte mientras el micrófono no está
 * encendido. Nunca arranca solo; explica para qué es, pide el permiso y, si algo falla, dice cómo arreglarlo.
 * Es la misma tarjeta en el afinador, los acordes, las canciones y los ajustes.
 */
export function MicGate({
  status,
  onActivate,
  purpose,
  testId,
  buttonTestId,
  compact = false,
}: {
  readonly status: InputStatus | null;
  readonly onActivate: () => void;
  /** Para qué se usa aquí, en una frase («Así oigo los acordes que tocas.»). */
  readonly purpose: string;
  readonly testId: string;
  readonly buttonTestId: string;
  /** Dentro de otra tarjeta (los ajustes): sin marco propio y alineada a la izquierda. */
  readonly compact?: boolean;
}) {
  const view = gateView(status, purpose);
  return (
    <section
      className={compact ? 'mic-gate mic-gate--compact' : 'mic-gate'}
      data-tone={view.tone}
      data-testid={testId}
      role="status"
    >
      <span className="mic-gate__icon" aria-hidden="true">
        <Icon name="mic" size={compact ? 22 : 30} />
      </span>
      <div className="mic-gate__text">
        <h2 className="mic-gate__title">{view.title}</h2>
        {typeof view.body === 'string' ? <p className="mic-gate__body">{view.body}</p> : view.body}
      </div>
      {view.action === null ? null : (
        <GameButton onClick={onActivate} data-testid={buttonTestId}>
          {view.action}
        </GameButton>
      )}
    </section>
  );
}
