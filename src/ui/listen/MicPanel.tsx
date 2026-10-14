import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import type { NotationMode } from '@/core/domain/note';
import type { MonitorSnapshot } from '@/core/ports/input-monitor';
import type { InputStatus } from '@/core/ports/note-input';
import { checkMessage } from './listen-messages';

export interface MicPanelProps {
  readonly status: InputStatus;
  readonly monitor: MonitorSnapshot;
  readonly notation: NotationMode;
  readonly onActivate: () => void;
  readonly onStartRound: () => void;
  /** Hay otra entrada (teclado del PC, MIDI): se puede empezar sin micrófono. */
  readonly canStartWithoutMic: boolean;
}

/** Panel de bienvenida con micrófono: explica, pide permiso, mide el ruido y comprueba el Do central. */
export function MicPanel({
  status,
  monitor,
  notation,
  onActivate,
  onStartRound,
  canStartWithoutMic,
}: MicPanelProps) {
  const ready = status.kind === 'conectado' && monitor.phase === 'escuchando';
  const check = checkMessage(monitor.heard?.midi ?? null, notation);
  const state = status.kind === 'conectado' ? monitor.phase : status.kind;

  // Al cambiar de estado el botón pulsado desaparece: el foco pasa al título (que se anuncia).
  const titleRef = useRef<HTMLHeadingElement>(null);
  const previousState = useRef(state);
  useEffect(() => {
    if (previousState.current === state) return;
    previousState.current = state;
    const active = document.activeElement;
    if (active === null || active === document.body) {
      titleRef.current?.focus({ preventScroll: true });
    }
  }, [state]);

  let title = 'Passo escucha tu piano';
  let body: ReactNode = (
    <>
      <p className="mic-panel__text">
        Passo oye tu piano con el micrófono del portátil. El audio se analiza aquí: no se graba ni
        se envía. Cuando el navegador pregunte, elige «Permitir». Pon el portátil a unos 50 cm del
        teclado; el piano debe sonar por sus altavoces (sin auriculares).
      </p>
      <button
        type="button"
        className="button button--primary button--big"
        onClick={onActivate}
        data-testid="activate-mic"
      >
        Activar micrófono
      </button>
    </>
  );

  if (status.kind === 'iniciando') {
    title = 'Esperando tu permiso…';
    body = <p className="mic-panel__text">Elige «Permitir» en el aviso del navegador.</p>;
  } else if (status.kind === 'permiso-denegado') {
    title = 'El micrófono está bloqueado';
    body = (
      <>
        <ol className="mic-panel__steps">
          <li>Pulsa el candado junto a la dirección de la página.</li>
          <li>Elige «Micrófono» y cambia a «Permitir».</li>
          <li>Pulsa «Reintentar». (En Windows: Configuración › Privacidad › Micrófono.)</li>
        </ol>
        <button
          type="button"
          className="button button--primary"
          onClick={onActivate}
          data-testid="retry-mic"
        >
          Reintentar
        </button>
      </>
    );
  } else if (status.kind === 'sin-dispositivo') {
    title =
      status.reason === 'ocupado'
        ? 'Otra aplicación usa el micrófono'
        : 'No encuentro ningún micrófono';
    body = (
      <>
        <p className="mic-panel__text">
          {status.reason === 'ocupado'
            ? 'Ciérrala y reintenta.'
            : 'Conecta un micrófono o revisa «Sonido» en Windows.'}
        </p>
        <button
          type="button"
          className="button button--primary"
          onClick={onActivate}
          data-testid="retry-mic"
        >
          Buscar de nuevo
        </button>
      </>
    );
  } else if (status.kind === 'sin-soporte') {
    title = 'Este navegador no permite usar el micrófono';
    body = <p className="mic-panel__text">Usa Chrome o Edge para que Passo pueda oír tu piano.</p>;
  } else if (status.kind === 'desconectado') {
    title = 'Se perdió el micrófono';
    body = (
      <button
        type="button"
        className="button button--primary"
        onClick={onActivate}
        data-testid="retry-mic"
      >
        Reactivar
      </button>
    );
  } else if (status.kind === 'conectado' && monitor.phase === 'calibrando') {
    title = 'Guarda silencio un momento…';
    body = (
      <>
        <p className="mic-panel__text">Estoy midiendo el ruido de la habitación.</p>
        <div
          className="progress"
          role="progressbar"
          aria-label="Midiendo el ruido de la habitación"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(monitor.calibration * 100)}
        >
          <div className="progress__fill" style={{ width: `${monitor.calibration * 100}%` }} />
        </div>
      </>
    );
  } else if (status.kind === 'conectado' && monitor.phase === 'suspendido') {
    title = 'Escucha en pausa';
    body = <p className="mic-panel__text">Vuelve a esta pestaña para seguir escuchando.</p>;
  } else if (ready) {
    title = 'Te escucho';
    body = (
      <>
        <p className={`check check--${check.tone}`} data-testid="mic-check" role="status">
          {check.text}
        </p>
        <button
          type="button"
          className="button button--primary button--big"
          onClick={onStartRound}
          data-testid="start"
        >
          Empezar
        </button>
      </>
    );
  }

  return (
    <div className="welcome mic-panel" data-testid="mic-panel" data-state={state}>
      <h2 className="welcome__title" tabIndex={-1} ref={titleRef}>
        {title}
      </h2>
      {body}
      {!ready && canStartWithoutMic && (
        <button type="button" className="button" onClick={onStartRound} data-testid="start">
          Empezar sin micrófono
        </button>
      )}
    </div>
  );
}
