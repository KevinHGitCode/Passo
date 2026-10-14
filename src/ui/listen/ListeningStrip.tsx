import { noteName } from '@/core/domain/note';
import type { NotationMode } from '@/core/domain/note';
import type { MonitorSnapshot } from '@/core/ports/input-monitor';
import type { InputStatus } from '@/core/ports/note-input';
import { monitorNotice } from './listen-messages';

export interface ListeningStripProps {
  readonly status: InputStatus;
  readonly monitor: MonitorSnapshot;
  readonly notation: NotationMode;
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="listen__icon">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  );
}

function idleText(status: InputStatus, monitor: MonitorSnapshot): string {
  if (status.kind === 'inactivo') return 'Activa el micrófono para que te oiga.';
  if (status.kind === 'iniciando') return 'Esperando tu permiso…';
  if (status.kind !== 'conectado') return 'Micrófono no disponible.';
  if (monitor.phase === 'calibrando') return 'Guarda silencio un momento…';
  if (monitor.phase === 'suspendido') return 'Escucha en pausa: vuelve a esta pestaña.';
  return '';
}

/**
 * Tira de altura fija sobre el teclado: nivel de entrada y nota que se oye.
 * Nunca cambia de altura, así el teclado no se mueve entre estados.
 */
export function ListeningStrip({ status, monitor, notation }: ListeningStripProps) {
  const listening = status.kind === 'conectado' && monitor.phase === 'escuchando';
  const notice = listening ? monitorNotice(monitor) : null;
  const heard = monitor.heard ? noteName(monitor.heard.midi, notation) : '—';

  return (
    <div className="listen" data-testid="listen" data-phase={monitor.phase}>
      <MicIcon />
      {listening ? (
        <>
          <div className="meter" data-testid="meter" aria-hidden="true">
            <div
              className={`meter__fill${monitor.clipping ? ' meter__fill--clip' : ''}`}
              style={{ transform: `scaleX(${monitor.level})` }}
            />
            <div className="meter__gate" style={{ left: `${monitor.gateLevel * 100}%` }} />
          </div>
          <span className="listen__heard" data-testid="heard-note" aria-hidden="true">
            Oigo: {heard}
          </span>
          {notice && (
            <span className="listen__notice" data-testid="listen-notice" title={notice}>
              {notice}
            </span>
          )}
        </>
      ) : (
        <span className="listen__idle" data-testid="listen-idle">
          {idleText(status, monitor)}
        </span>
      )}
    </div>
  );
}
