import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent } from 'react';
import type { GuidedView, TunerService, TunerSnapshot } from '@/core/application/tuner-service';
import { openStringName } from '@/core/domain/instrument';
import type { GuitarString } from '@/core/domain/instrument';
import type { NotationMode } from '@/core/domain/note';
import { REFERENCE_A4_HZ } from '@/core/domain/pitch';
import { MAX_REFERENCE_HZ, MIN_REFERENCE_HZ, stringFrequency } from '@/core/domain/tuner';
import { SILENT_MONITOR } from '@/core/ports/input-monitor';
import type { InputMonitor, MonitorSnapshot } from '@/core/ports/input-monitor';
import type { InputStatus, NoteInput } from '@/core/ports/note-input';
import { GameButton } from '../game/GameButton';
import { hintText } from '../listen/listen-messages';
import { useInputStatus } from '../practice/hooks';
import { GuidedSteps, GuidedSummary, guidedAnnouncement } from './GuidedTuner';
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
import { PageHeader } from '../shell/PageHeader';
import { TunerDial } from './TunerDial';
import { MicGate } from '../listen/MicGate';

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

/**
 * Lo único que el afinador necesita del monitor del micrófono: la fase y el aviso. El monitor emite unas 15
 * veces por segundo (el nivel); así la pantalla no se redibuja con cada una.
 */
type MonitorSlice = Pick<MonitorSnapshot, 'phase' | 'hint'> & { readonly loud: boolean };

function useMonitorSlice(monitor: InputMonitor | undefined): MonitorSlice {
  const cache = useRef<MonitorSlice>({ phase: 'apagado', hint: null, loud: false });
  const subscribe = useCallback(
    (onChange: () => void) => (monitor ? monitor.subscribeMonitor(onChange) : () => undefined),
    [monitor],
  );
  const getSnapshot = useCallback(() => {
    const current = monitor ? monitor.getMonitor() : SILENT_MONITOR;
    const last = cache.current;
    // «Alto»: el nivel pasa el umbral de sonido (se oye algo aunque no se distinga la nota).
    const loud = current.level > 0 && current.level >= current.gateLevel;
    if (last.phase === current.phase && last.hint === current.hint && last.loud === loud)
      return last;
    cache.current = { phase: current.phase, hint: current.hint, loud };
    return cache.current;
  }, [monitor]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Un estado debe mantenerse este tiempo antes de anunciarse (la mediana oscila cerca de los límites). */
const ANNOUNCE_AFTER_MS = 700;
/** Cada cuánto se mira si alguna cuerda afinada ya pasó a «revisar». */
const REFRESH_MS = 30_000;

export function TunerScreen({ tuner, microphone, notation }: TunerScreenProps) {
  const snapshot: TunerSnapshot = useSyncExternalStore(tuner.subscribe, tuner.getSnapshot);
  const status = useInputStatus(microphone);
  const monitor = useMonitorSlice(microphone);
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
  // Con la guía en marcha, «afinada» ya lo dice el aviso de la guía («Mi afinada. Sigue la cuerda 5»).
  const guideRunning = snapshot.guided !== null && !snapshot.guided.finished;
  const liveText = snapshot.tone
    ? `Suena la nota de referencia, cuerda ${snapshot.string}`
    : statusText && !(guideRunning && snapshot.status === 'afinada')
      ? `${statusText}, cuerda ${snapshot.string}`
      : '';
  const tone = tunerTone(snapshot);
  const chip = tunerChipText(snapshot);
  const guided = snapshot.guided;
  // Cambiar el La₄ mueve todas las cuentas: no mientras la guía o la nota de referencia están en marcha.
  const refLocked = guided !== null || snapshot.tone;

  // Al empezar la guía, llegar a su pantalla final o salir de ella, el botón pulsado desaparece y el foco se
  // perdería (y con él Esc y las teclas rápidas): pasa a la cuerda elegida.
  const guideStage = guided === null ? 'fuera' : guided.finished ? 'final' : 'en-marcha';
  const previousStage = useRef(guideStage);
  useEffect(() => {
    if (previousStage.current === guideStage) return;
    previousStage.current = guideStage;
    if (document.activeElement === null || document.activeElement === document.body) {
      groupRef.current?.querySelector<HTMLElement>('input:checked')?.focus({ preventScroll: true });
    }
  }, [guideStage]);

  // La guía avisa una sola vez por paso: «Re afinada. Sigue la cuerda 3 (Sol)». No mueve el foco.
  const [guideNote, setGuideNote] = useState('');
  const previousGuide = useRef<GuidedView | null>(null);
  useEffect(() => {
    setGuideNote(guidedAnnouncement(guided, previousGuide.current, snapshot.strings, notation));
    previousGuide.current = guided;
    // Solo al empezar, avanzar o terminar la guía (no con cada cambio de marcas).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guided?.index, guided?.finished, guided?.lap, guided === null]);

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
      groupRef.current?.querySelector<HTMLElement>('input:checked')?.focus({ preventScroll: true });
    }
    hadMicMessage.current = false;
  }, [message]);

  const hint = tunerHint(snapshot, {
    name,
    listening,
    weakHint: monitor.hint === 'debil' ? hintText(monitor.hint) : null,
    loud: monitor.loud,
  });

  const target = stringFrequency(snapshot.string, { referenceHz: snapshot.referenceHz });
  const heard = snapshot.cents === null ? null : target * 2 ** (snapshot.cents / 1200);

  const selectString = useCallback((string: GuitarString) => tuner.selectString(string), [tuner]);

  const toggleReference = () => {
    if (snapshot.tone) tuner.stopReference();
    else tuner.playReference();
  };

  // Atajos de una sola tecla: solo con el foco dentro del afinador (no en toda la página).
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    if (event.key === 'Escape' && snapshot.guided !== null) {
      event.preventDefault();
      tuner.exitGuided();
      return;
    }
    if (event.key === 'r' || event.key === 'R') {
      if (!snapshot.canReference) return;
      event.preventDefault();
      if (!event.repeat) toggleReference();
      return;
    }
    if (!/^[1-6]$/.test(event.key)) return;
    const string = Number(event.key) as GuitarString;
    tuner.selectString(string);
    groupRef.current?.querySelector<HTMLElement>(`input[value="${string}"]`)?.focus();
  };

  // El micrófono nunca arranca solo: sin él no hay nada que afinar, así que lo único que se ofrece es activarlo.
  if (microphone !== undefined && (status === null || status.kind !== 'conectado')) {
    return (
      <div className="tuner" data-testid="tuner">
        <PageHeader
          id="afinador-titulo"
          title="Afinador"
          lead="Afinación estándar: Mi · La · Re · Sol · Si · Mi."
        />
        <MicGate
          status={status}
          onActivate={() => void microphone.start()}
          purpose="Así oigo la cuerda y te digo si hay que apretarla o aflojarla."
          testId="tuner-mic"
          buttonTestId="tuner-activate"
        />
      </div>
    );
  }

  return (
    <div className="tuner" data-testid="tuner" onKeyDown={onKeyDown}>
      <PageHeader
        id="afinador-titulo"
        title="Afinador"
        lead="Afinación estándar: Mi · La · Re · Sol · Si · Mi. Toca cualquier cuerda al aire y te digo si hay que apretarla o aflojarla."
      />

      <div className="tuner__ref" role="group" aria-label="La₄ de referencia">
        <span className="tuner__ref-label">La₄ =</span>
        <button
          type="button"
          className="tuner__ref-btn"
          aria-label="Bajar el La₄ un hercio"
          disabled={refLocked || snapshot.referenceHz <= MIN_REFERENCE_HZ}
          onClick={() => tuner.setReferenceHz(snapshot.referenceHz - 1)}
          data-testid="tuner-ref-down"
        >
          −
        </button>
        <output className="tuner__ref-value" aria-live="polite" data-testid="tuner-ref-value">
          <span className="sr-only">La₄ </span>
          {snapshot.referenceHz} Hz
        </output>
        <button
          type="button"
          className="tuner__ref-btn"
          aria-label="Subir el La₄ un hercio"
          disabled={refLocked || snapshot.referenceHz >= MAX_REFERENCE_HZ}
          onClick={() => tuner.setReferenceHz(snapshot.referenceHz + 1)}
          data-testid="tuner-ref-up"
        >
          +
        </button>
        {snapshot.referenceHz !== REFERENCE_A4_HZ ? (
          <button
            type="button"
            className="link-button"
            disabled={refLocked}
            onClick={() => tuner.setReferenceHz(REFERENCE_A4_HZ)}
            data-testid="tuner-ref-reset"
          >
            Volver a {REFERENCE_A4_HZ}
          </button>
        ) : null}
        {refLocked ? (
          <span className="tuner__muted">Se cambia con la guía y la nota paradas.</span>
        ) : null}
      </div>

      <div className="tuner__cols">
        <section
          className="tuner__card tuner__card--clavijero stage-dark"
          aria-labelledby="tuner-clavijero"
        >
          <h2 className="tuner__kicker" id="tuner-clavijero">
            Clavijero
          </h2>
          <p className="tuner__muted">
            Esquema de la cabeza de la guitarra: fíate del número. Toca una clavija para elegir la
            cuerda.
          </p>
          <Headstock
            status={snapshot.status}
            string={snapshot.string}
            strings={snapshot.strings}
            guided={snapshot.guided}
            notation={notation}
            onSelect={selectString}
            groupRef={groupRef}
          />
          <button
            type="button"
            className="tuner__auto"
            aria-pressed={snapshot.auto}
            disabled={guided !== null}
            onClick={() => tuner.setAuto(!snapshot.auto)}
            data-testid="tuner-auto"
          >
            {snapshot.auto
              ? 'Automático: detecto la cuerda que tocas'
              : `Cuerda ${snapshot.string} fijada · volver a automático`}
          </button>
          <p className="tuner__legend" aria-hidden="true">
            <span>○ sin afinar</span>
            <span>↑ súbela</span>
            <span>↓ bájala</span>
            <span>✓ afinada</span>
            <span>↻ revisar</span>
            {guided && !guided.finished ? <span>→ siguiente</span> : null}
          </p>
        </section>

        <section
          className="tuner__card tuner__panel stage-dark"
          aria-label={
            guided?.finished ? 'Resumen de la guía' : `Cuerda ${snapshot.string}, ${name}`
          }
          data-tone={tone}
          data-status={snapshot.status}
        >
          {guided && !guided.finished ? (
            <GuidedSteps
              view={guided}
              onSkip={() => tuner.skipGuided()}
              onPause={() => tuner.pauseGuided()}
              onResume={() => tuner.resumeGuided()}
              onExit={() => tuner.exitGuided()}
            />
          ) : null}
          {guided?.finished ? (
            <GuidedSummary
              view={guided}
              marks={snapshot.strings}
              notation={notation}
              onRepeat={() => tuner.repeatGuided()}
              onContinue={() => tuner.continueGuided()}
              onExit={() => tuner.exitGuided()}
            />
          ) : (
            <>
              <div className="tuner__gauge" data-dial={message === null}>
                <p className="tuner__target" data-testid="tuner-target">
                  <span className="tuner__kicker">
                    Cuerda {snapshot.string}
                    {role ? ` · ${role}` : ''}
                  </span>
                  <span className="tuner__name">{name}</span>
                </p>
                {message === null ? (
                  <>
                    <TunerDial cents={snapshot.cents} stale={snapshot.stale} />
                    <p className="tuner__ends" aria-hidden="true">
                      <span>♭ Grave</span>
                      <span>Aguda ♯</span>
                    </p>
                  </>
                ) : null}
              </div>
              {message !== null ? (
                <div className="tuner__mic" role="status" data-testid="tuner-mic">
                  <p>{message}</p>
                  {status === null || status.kind !== 'conectado' ? (
                    <GameButton
                      onClick={() => void microphone?.start()}
                      data-testid="tuner-activate"
                    >
                      Activar micrófono
                    </GameButton>
                  ) : null}
                </div>
              ) : (
                <>
                  <p className="tuner__read" aria-hidden="true">
                    <b
                      data-testid="tuner-cents"
                      data-idle={snapshot.cents === null}
                      data-stale={snapshot.stale}
                    >
                      {snapshot.cents === null ? '—' : formatCents(snapshot.cents)}
                    </b>
                    {snapshot.cents === null ? null : <span>cents</span>}
                    {chip ? (
                      <em data-testid="tuner-reading" data-status={snapshot.status}>
                        {chip}
                      </em>
                    ) : null}
                  </p>
                  <p className="tuner__hz" aria-hidden="true">
                    Meta {formatHz(target)} Hz
                    {heard === null ? '' : ` · oigo ${formatHz(heard)} Hz`}
                    {snapshot.referenceHz === REFERENCE_A4_HZ
                      ? ''
                      : ` · La₄ ${snapshot.referenceHz}`}
                  </p>
                  <p className="tuner__hint" data-tone={tone} data-testid="tuner-hint">
                    {hint.icon ? <HintGlyph icon={hint.icon} /> : null}
                    <span>{hint.text}</span>
                  </p>
                </>
              )}
              <div className="tuner__acts">
                {snapshot.canReference ? (
                  <GameButton
                    onClick={toggleReference}
                    aria-keyshortcuts="r"
                    data-testid="tuner-reference"
                    data-playing={snapshot.tone}
                  >
                    <HintGlyph icon="sound" />
                    {snapshot.tone ? 'Detener la nota' : 'Escuchar la nota'}
                  </GameButton>
                ) : null}
                {guided === null ? (
                  <GameButton
                    variant="secondary"
                    onClick={() => tuner.startGuided()}
                    data-testid="tuner-guided-start"
                  >
                    Afinar las 6
                  </GameButton>
                ) : null}
                {snapshot.canReference ? (
                  <span className="tuner__muted">Úsala como guía: no sustituye al medidor.</span>
                ) : null}
              </div>
            </>
          )}
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

      <div className="sr-only" role="status" aria-live="polite" data-testid="tuner-guide-live">
        {guideNote}
      </div>
      {/* Solo cambios de estado: nunca los cents (el monitor emite ~15 veces por segundo). */}
      <div className="sr-only" role="status" aria-live="polite" data-testid="tuner-live">
        {announced}
      </div>
    </div>
  );
}
