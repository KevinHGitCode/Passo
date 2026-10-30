import { useEffect, useSyncExternalStore } from 'react';
import type { TunerService, TunerSnapshot } from '@/core/application/tuner-service';
import { GUITAR_STRINGS, openStringName } from '@/core/domain/instrument';
import type { GuitarString } from '@/core/domain/instrument';
import type { NotationMode } from '@/core/domain/note';
import { FAR_CENTS, IN_TUNE_CENTS } from '@/core/domain/tuner';
import type { InputMonitor } from '@/core/ports/input-monitor';
import type { InputStatus, NoteInput } from '@/core/ports/note-input';
import { GameButton } from '../game/GameButton';
import { useInputStatus, useMonitor } from '../practice/hooks';
import './tuner.css';

export interface TunerScreenProps {
  readonly tuner: TunerService;
  readonly microphone: (NoteInput & InputMonitor) | undefined;
  readonly notation: NotationMode;
}

/** Lo que se dice del estado de la cuerda, sin los cents (es lo único que anuncia el lector de pantalla). */
export function tunerStatusText(snapshot: TunerSnapshot): string {
  switch (snapshot.status) {
    case 'baja':
      return snapshot.far ? 'Muy grave' : 'Grave';
    case 'alta':
      return snapshot.far ? 'Muy aguda' : 'Aguda';
    case 'casi':
      return 'Casi afinada';
    case 'afinada':
      return 'Afinada';
    case 'sin-sonido':
      return '';
  }
}

function micMessage(status: InputStatus | null, calibrating: boolean): string | null {
  if (status === null || status.kind === 'inactivo') return 'Activa el micrófono para que te oiga.';
  if (status.kind === 'iniciando') return 'Esperando tu permiso…';
  if (status.kind === 'permiso-denegado') return 'El navegador bloqueó el micrófono.';
  if (status.kind === 'sin-dispositivo') return 'No encuentro ningún micrófono.';
  if (status.kind === 'desconectado') return 'Se perdió el micrófono.';
  if (status.kind !== 'conectado') return 'El micrófono no está disponible.';
  return calibrating ? 'Guarda silencio un momento…' : null;
}

/** La aguja: de −50 a +50 cents; la banda del centro es la zona de «afinada». */
function Needle({ cents }: { readonly cents: number | null }) {
  const clamped = cents === null ? 0 : Math.max(-FAR_CENTS, Math.min(FAR_CENTS, cents));
  const position = 50 + (clamped / FAR_CENTS) * 50;
  return (
    <div className="tuner__meter" aria-hidden="true" data-testid="tuner-needle">
      <span
        className="tuner__zone"
        style={{ width: `${(IN_TUNE_CENTS * 2 * 100) / (FAR_CENTS * 2)}%` }}
      />
      <span className="tuner__tick" style={{ left: `${position}%` }} data-idle={cents === null} />
    </div>
  );
}

/**
 * El afinador de guitarra: eliges una cuerda, la tocas al aire y ves si está grave, aguda o afinada. Tú
 * eliges la cuerda para que una muy floja no se confunda con otra nota.
 */
export function TunerScreen({ tuner, microphone, notation }: TunerScreenProps) {
  const snapshot = useSyncExternalStore(tuner.subscribe, tuner.getSnapshot);
  const status = useInputStatus(microphone);
  const monitor = useMonitor(microphone);

  useEffect(() => {
    tuner.open();
    return () => tuner.close();
  }, [tuner]);

  const listening = status?.kind === 'conectado' && monitor.phase === 'escuchando';
  const message = micMessage(
    status,
    status?.kind === 'conectado' && monitor.phase !== 'escuchando',
  );
  const name = openStringName(snapshot.string, notation);
  const statusText = tunerStatusText(snapshot);
  const detail =
    snapshot.status === 'baja'
      ? 'Aprieta un poco la clavija.'
      : snapshot.status === 'alta'
        ? 'Afloja un poco la clavija.'
        : snapshot.status === 'casi'
          ? 'Casi: mantén la cuerda sonando.'
          : snapshot.status === 'afinada'
            ? 'Lista. Puedes pasar a la siguiente cuerda.'
            : listening
              ? `Toca la cuerda ${snapshot.string} (${name}) al aire y déjala sonar.`
              : '';

  return (
    <div className="tuner" data-testid="tuner">
      <h1 id="afinador-titulo" tabIndex={-1} data-route-heading>
        Afinador
      </h1>
      <p className="tuner__lead">
        Afinación estándar: Mi · La · Re · Sol · Si · Mi. Elige una cuerda y tócala al aire.
      </p>

      <div className="tuner__strings" role="group" aria-label="Cuerda que afinas">
        {GUITAR_STRINGS.map((string: GuitarString) => (
          <button
            key={string}
            type="button"
            className="tuner__string"
            aria-pressed={snapshot.string === string}
            onClick={() => tuner.selectString(string)}
            data-testid={`tuner-string-${string}`}
          >
            <span className="tuner__string-number">{string}</span>
            <span className="tuner__string-name">{openStringName(string, notation)}</span>
            <span className="sr-only">
              {string === 1 ? ' (la más aguda)' : string === 6 ? ' (la más grave)' : ''}
            </span>
          </button>
        ))}
      </div>

      <section
        className="tuner__panel stage-dark"
        aria-label={`Cuerda ${snapshot.string}, ${name}`}
      >
        <p className="tuner__target" data-testid="tuner-target">
          <span className="tuner__target-kicker">Cuerda {snapshot.string}</span>
          <span className="tuner__target-name">{name}</span>
        </p>
        {message !== null ? (
          <div className="tuner__mic" data-testid="tuner-mic">
            <p>{message}</p>
            {status === null || status.kind !== 'conectado' ? (
              <GameButton onClick={() => void microphone?.start()} data-testid="tuner-activate">
                Activar micrófono
              </GameButton>
            ) : null}
          </div>
        ) : (
          <>
            <Needle cents={snapshot.cents} />
            <p
              className="tuner__reading"
              data-status={snapshot.status}
              data-testid="tuner-reading"
              aria-hidden="true"
            >
              {statusText || '—'}
              {snapshot.cents !== null &&
              snapshot.status !== 'afinada' &&
              snapshot.status !== 'casi'
                ? ` · ${Math.abs(snapshot.cents)} cents`
                : ''}
            </p>
            <p className="tuner__detail">{detail}</p>
          </>
        )}
      </section>

      {/* Solo cambios de estado: nunca los cents (el monitor emite ~15 veces por segundo). */}
      <div className="sr-only" role="status" aria-live="polite" data-testid="tuner-live">
        {statusText ? `${statusText}, cuerda ${snapshot.string}` : ''}
      </div>
    </div>
  );
}
