import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent } from 'react';
import type { TunerService, TunerSnapshot } from '@/core/application/tuner-service';
import { openStringName } from '@/core/domain/instrument';
import type { GuitarString } from '@/core/domain/instrument';
import type { NotationMode } from '@/core/domain/note';
import { FAR_CENTS, IN_TUNE_CENTS, NEAR_CENTS, stringFrequency } from '@/core/domain/tuner';
import type { InputMonitor } from '@/core/ports/input-monitor';
import type { InputStatus, NoteInput } from '@/core/ports/note-input';
import { GameButton } from '../game/GameButton';
import { hintText } from '../listen/listen-messages';
import { useInputStatus, useMonitor } from '../practice/hooks';
import { Headstock } from './Headstock';
import {
  TUNING_TIPS,
  formatCents,
  formatHz,
  stringRole,
  tunerChipText,
  tunerHint,
  tunerStatusText,
  tunerTone,
} from './tuner-messages';
import type { HintIcon } from './tuner-messages';
import './tuner.css';

export { tunerStatusText } from './tuner-messages';

export interface TunerScreenProps {
  readonly tuner: TunerService;
  readonly microphone: (NoteInput & InputMonitor) | undefined;
  readonly notation: NotationMode;
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

const SPAN = FAR_CENTS * 2;
/** Un valor en cents como porcentaje del ancho de la regla (que va de −50 a +50). */
const percent = (cents: number): string => `${(cents * 100) / SPAN}%`;

/** La regla: de −50 a +50 cents, con la zona verde de ±5 y la ámbar («casi») de ±5 a ±15. */
function Ruler({ cents }: { readonly cents: number | null }) {
  const clamped = cents === null ? 0 : Math.max(-FAR_CENTS, Math.min(FAR_CENTS, cents));
  const position = 50 + (clamped / FAR_CENTS) * 50;
  const near = percent(NEAR_CENTS - IN_TUNE_CENTS);
  return (
    <div className="tuner__ruler" aria-hidden="true" data-testid="tuner-needle">
      <span className="tuner__near" style={{ left: percent(SPAN / 2 - NEAR_CENTS), width: near }} />
      <span
        className="tuner__near"
        style={{ left: percent(SPAN / 2 + IN_TUNE_CENTS), width: near }}
      />
      <span
        className="tuner__zone"
        style={{ left: percent(SPAN / 2 - IN_TUNE_CENTS), width: percent(IN_TUNE_CENTS * 2) }}
      />
      <span className="tuner__ticks" />
      <span className="tuner__major" />
      <span className="tuner__mid" />
      <span className="tuner__needle" style={{ left: `${position}%` }} data-idle={cents === null} />
      {[-50, -25, 0, 25, 50].map((value) => (
        <span key={value} className="tuner__label" style={{ left: `${50 + value}%` }}>
          {formatCents(value)}
        </span>
      ))}
    </div>
  );
}

function HintGlyph({ icon }: { readonly icon: HintIcon }) {
  const path =
    icon === 'up'
      ? 'M12 19V5M6 11l6-6 6 6'
      : icon === 'down'
        ? 'M12 5v14M6 13l6 6 6-6'
        : icon === 'check'
          ? 'M5 12l5 5 9-10'
          : icon === 'wait'
            ? 'M5 12h14'
            : icon === 'sound'
              ? 'M4 9v6h4l5 4V5L8 9H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11'
              : 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4';
  return (
    <svg className="tuner__glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={path} />
    </svg>
  );
}

/** Un estado debe mantenerse este tiempo antes de anunciarse (la mediana oscila cerca de los límites). */
const ANNOUNCE_AFTER_MS = 700;
/** Cada cuánto se mira si alguna cuerda afinada ya pasó a «revisar». */
const REFRESH_MS = 30_000;

export function TunerScreen({ tuner, microphone, notation }: TunerScreenProps) {
  const snapshot: TunerSnapshot = useSyncExternalStore(tuner.subscribe, tuner.getSnapshot);
  const status = useInputStatus(microphone);
  const monitor = useMonitor(microphone);
  const groupRef = useRef<HTMLDivElement>(null);
  const hadMicMessage = useRef(false);
  const [announced, setAnnounced] = useState('');

  useEffect(() => {
    tuner.open();
    return () => tuner.close();
  }, [tuner]);

  useEffect(() => {
    const id = window.setInterval(() => tuner.refresh(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [tuner]);

  const listening = status?.kind === 'conectado' && monitor.phase === 'escuchando';
  const message = micMessage(
    status,
    status?.kind === 'conectado' && monitor.phase !== 'escuchando',
  );
  const name = openStringName(snapshot.string, notation);
  const role = stringRole(snapshot.string);
  const statusText = tunerStatusText(snapshot);
  const liveText = snapshot.tone
    ? `Suena la nota de referencia, cuerda ${snapshot.string}`
    : statusText
      ? `${statusText}, cuerda ${snapshot.string}`
      : '';
  const tone = tunerTone(snapshot);
  const chip = tunerChipText(snapshot);

  // Solo se anuncia un estado que se mantiene un momento: así no se repite al oscilar cerca de un límite.
  useEffect(() => {
    const timer = window.setTimeout(() => setAnnounced(liveText), liveText ? ANNOUNCE_AFTER_MS : 0);
    return () => window.clearTimeout(timer);
  }, [liveText]);

  // Al conectarse el micrófono el botón «Activar» desaparece: el foco pasa a la cuerda elegida.
  useEffect(() => {
    if (message !== null) {
      hadMicMessage.current = true;
      return;
    }
    if (hadMicMessage.current && document.activeElement === document.body) {
      groupRef.current?.querySelector<HTMLElement>('input:checked')?.focus();
    }
    hadMicMessage.current = false;
  }, [message]);

  const hint = tunerHint(snapshot, {
    name,
    listening,
    weakHint: monitor.hint === 'debil' ? hintText(monitor.hint) : null,
  });

  const target = stringFrequency(snapshot.string, { referenceHz: snapshot.referenceHz });
  const heard = snapshot.cents === null ? null : target * 2 ** (snapshot.cents / 1200);

  const toggleReference = () => {
    if (snapshot.tone) tuner.stopReference();
    else tuner.playReference();
  };

  // Atajos de una sola tecla: solo con el foco dentro del afinador (no en toda la página).
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    if (event.key === 'r' || event.key === 'R') {
      if (!snapshot.canReference) return;
      event.preventDefault();
      toggleReference();
      return;
    }
    if (!/^[1-6]$/.test(event.key)) return;
    const string = Number(event.key) as GuitarString;
    tuner.selectString(string);
    groupRef.current?.querySelector<HTMLElement>(`input[value="${string}"]`)?.focus();
  };

  return (
    <div className="tuner" data-testid="tuner" onKeyDown={onKeyDown}>
      <h1 id="afinador-titulo" tabIndex={-1} data-route-heading>
        Afinador
      </h1>
      <p className="tuner__lead">
        Afinación estándar: Mi · La · Re · Sol · Si · Mi. Elige una cuerda y tócala al aire.
      </p>

      <div className="tuner__cols">
        <section className="tuner__card stage-dark" aria-labelledby="tuner-clavijero">
          <h2 className="tuner__kicker" id="tuner-clavijero">
            Clavijero
          </h2>
          <p className="tuner__muted">
            Esquema de la cabeza de la guitarra: fíate del número. Toca una clavija para elegir la
            cuerda.
          </p>
          <Headstock
            snapshot={snapshot}
            notation={notation}
            onSelect={(string) => tuner.selectString(string)}
            groupRef={groupRef}
          />
          <p className="tuner__legend">
            <span>○ sin afinar</span>
            <span>↑ súbela</span>
            <span>↓ bájala</span>
            <span>✓ afinada</span>
            <span>↻ revisar</span>
          </p>
        </section>

        <section
          className="tuner__card tuner__panel stage-dark"
          aria-label={`Cuerda ${snapshot.string}, ${name}`}
          data-tone={tone}
          data-status={snapshot.status}
        >
          <p className="tuner__target" data-testid="tuner-target">
            <span className="tuner__kicker">
              Cuerda {snapshot.string}
              {role ? ` · ${role}` : ''}
            </span>
            <span className="tuner__name">{name}</span>
          </p>
          {message !== null ? (
            <div className="tuner__mic" role="status" data-testid="tuner-mic">
              <p>{message}</p>
              {status === null || status.kind !== 'conectado' ? (
                <GameButton onClick={() => void microphone?.start()} data-testid="tuner-activate">
                  Activar micrófono
                </GameButton>
              ) : null}
            </div>
          ) : (
            <>
              <p className="tuner__hz" aria-hidden="true">
                Meta {formatHz(target)} Hz{heard === null ? '' : ` · oigo ${formatHz(heard)} Hz`}
              </p>
              <Ruler cents={snapshot.cents} />
              <p className="tuner__ends" aria-hidden="true">
                <span>♭ Grave</span>
                <span>Aguda ♯</span>
              </p>
              <p className="tuner__read" aria-hidden="true">
                <b data-testid="tuner-cents" data-idle={snapshot.cents === null}>
                  {snapshot.cents === null ? '–' : formatCents(snapshot.cents)}
                </b>
                <span>cents</span>
                {chip ? (
                  <em data-testid="tuner-reading" data-status={snapshot.status}>
                    {chip}
                  </em>
                ) : null}
              </p>
              <p className="tuner__hint" data-tone={tone} data-testid="tuner-hint">
                {hint.icon ? <HintGlyph icon={hint.icon} /> : null}
                <span>{hint.text}</span>
              </p>
            </>
          )}
          {snapshot.canReference ? (
            <div className="tuner__acts">
              <GameButton
                onClick={toggleReference}
                aria-keyshortcuts="r"
                data-testid="tuner-reference"
                data-playing={snapshot.tone}
              >
                <HintGlyph icon="sound" />
                {snapshot.tone ? 'Detener la nota' : 'Escuchar la nota'}
              </GameButton>
              <span className="tuner__muted">Úsala como guía: no sustituye al medidor.</span>
            </div>
          ) : null}
          <p className="tuner__muted">
            Afina siempre subiendo: si te pasas, afloja bien y vuelve a subir. Toca solo esa cuerda
            y silencia las demás.
          </p>
          <details className="tuner__tips">
            <summary>Cómo afinar bien</summary>
            <ul>
              {TUNING_TIPS.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </details>
        </section>
      </div>

      {/* Solo cambios de estado: nunca los cents (el monitor emite ~15 veces por segundo). */}
      <div className="sr-only" role="status" aria-live="polite" data-testid="tuner-live">
        {announced}
      </div>
    </div>
  );
}
