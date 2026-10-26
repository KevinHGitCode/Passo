import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import type { PracticeSession } from '@/core/application/practice-session';
import { findLevel } from '@/core/domain/curriculum';
import type { ExerciseMode } from '@/core/domain/curriculum';
import type { RoundSummary } from '@/core/domain/exercise';
import { octaveOf, pitchName } from '@/core/domain/note';
import type { InputMonitor } from '@/core/ports/input-monitor';
import type { NoteInput } from '@/core/ports/note-input';
import type { NotationMode } from '@/core/domain/note';
import type { Hand } from '@/core/domain/target';
import { hintText } from '../listen/listen-messages';
import { ListeningStrip } from '../listen/ListeningStrip';
import { MicPanel } from '../listen/MicPanel';
import { liveMessage, pauseText, transpositionText, useBoardModel } from './board-model';
import { formatSeconds } from './feedback-message';
import type { FeedbackMessage } from './feedback-message';
import { PracticeKeyboard } from './PracticeKeyboard';
import { countLabel, notesText, promptText, targetDetail } from './target-text';
import './practice.css';

export interface PracticeScreenProps {
  readonly session: PracticeSession;
  /** Si se indica, la marca «Passo» de la cabecera es un enlace a esa dirección (volver al camino). */
  readonly brandHref?: string | undefined;
  /** Acciones de la cabecera (el engranaje de los ajustes). */
  readonly headerActions?: ReactNode;
  /** Zona de estado de entradas y sonido (se coloca bajo la cabecera). */
  readonly statusZone?: ReactNode | undefined;
  /** El teclado del PC es una entrada activa: se muestra qué teclas tocar. */
  readonly showPcKeys?: boolean | undefined;
  /** Entrada por micrófono (escucha activa), con su monitor de nivel y nota oída. */
  readonly microphone?: (NoteInput & InputMonitor) | undefined;
  /** Hay otra entrada (teclado del PC, MIDI): se puede empezar sin micrófono. */
  readonly canStartWithoutMic?: boolean | undefined;
}

function Icon({ tone }: { readonly tone: FeedbackMessage['tone'] }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" className="feedback__icon">
      {tone === 'error' ? (
        <path d="M6 6l12 12M18 6L6 18" />
      ) : tone === 'partial' ? (
        <path d="M6.5 12h.01M12 12h.01M17.5 12h.01" />
      ) : tone === 'neutral' ? (
        <path d="M9.5 9a2.5 2.5 0 1 1 3.6 2.2c-.8.5-1.1 1-1.1 2M12 17v.01" />
      ) : (
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      )}
    </svg>
  );
}

function Summary({
  summary,
  notation,
  mode,
  onAgain,
}: {
  readonly summary: RoundSummary;
  readonly notation: NotationMode;
  readonly mode: ExerciseMode;
  readonly onAgain: () => void;
}) {
  const percent = Math.round(summary.accuracy * 100);
  // En terceras y acordes el nombre del objetivo es largo: el dato va debajo, no a su lado.
  const separator = mode === 'notas' ? ' · ' : '';
  return (
    <section className="summary" aria-labelledby="summary-title" data-testid="summary">
      <h2 id="summary-title" className="summary__title">
        ¡Ronda completa!
      </h2>
      <dl className="summary__grid">
        <div className="stat stat--ok">
          <dt>A la primera</dt>
          <dd>
            {summary.firstTryCorrect}/{summary.totalTargets}
            <small> · {percent} %</small>
          </dd>
        </div>
        <div className="stat stat--err">
          <dt>Errores</dt>
          <dd>{summary.errors}</dd>
        </div>
        <div className="stat">
          <dt>{mode === 'notas' ? 'Nota más lenta' : 'Más lento'}</dt>
          <dd className={mode === 'notas' ? undefined : 'stat__names'}>
            {summary.slowest ? notesText(summary.slowest.notes, notation) : '—'}
            {summary.slowest && (
              <small>
                {separator}
                {formatSeconds(summary.slowest.reactionMs)}
              </small>
            )}
          </dd>
        </div>
        <div className="stat">
          <dt>{mode === 'notas' ? 'Nota más fallada' : 'Más fallado'}</dt>
          <dd className={mode === 'notas' ? undefined : 'stat__names'}>
            {summary.mostMissed
              ? notesText(summary.mostMissed.notes, notation)
              : mode === 'notas'
                ? 'Ninguna'
                : 'Ninguno'}
            {summary.mostMissed && (
              <small>
                {separator}
                {summary.mostMissed.errors} {summary.mostMissed.errors === 1 ? 'error' : 'errores'}
              </small>
            )}
          </dd>
        </div>
      </dl>
      <button type="button" className="button button--primary" onClick={onAgain}>
        Otra ronda
      </button>
    </section>
  );
}

/** Teclas del PC que hacen de piano: la fila de arriba (mano derecha) y la de abajo (mano izquierda). */
function pcKeysText(hand: Hand): string {
  return hand === 'izquierda'
    ? 'Teclado del PC: Z X C V B N M = Do3 Re3 Mi3 Fa3 Sol3 La3 Si3 · A S D F = Do4 Re4 Mi4 Fa4'
    : 'Teclado del PC: A S D F G H J K L ; = Do4 Re4 Mi4 Fa4 Sol4 La4 Si4 Do5 Re5 Mi5';
}

function welcomeTitle(mode: ExerciseMode): string {
  if (mode === 'terceras') return 'Toca la tercera que aparece';
  if (mode === 'acordes') return 'Toca el acorde que aparece';
  return 'Toca la nota que aparece';
}

const WELCOME_LEGEND =
  ' Los dedos van del 1 (pulgar) al 5 (meñique). Lo punteado sobre el teclado es lo que viene después.';

function welcomeText(mode: ExerciseMode, level: number): string {
  if (mode === 'terceras') {
    return `Dos teclas a la vez: una nota y la que está dos pasos más arriba. Nivel ${level}: ${levelTitle(mode, level)}.${WELCOME_LEGEND}`;
  }
  if (mode === 'acordes') {
    return `Tres teclas a la vez. Nivel ${level}: ${levelTitle(mode, level)}.${WELCOME_LEGEND}`;
  }
  return `No avanzas hasta acertar. Nivel 1: de Do4 a Sol4, con la mano derecha.${WELCOME_LEGEND}`;
}

function levelTitle(mode: ExerciseMode, level: number): string {
  return findLevel(mode, level)?.title ?? '';
}

export function PracticeScreen({
  session,
  brandHref,
  headerActions,
  statusZone,
  showPcKeys = false,
  microphone,
  canStartWithoutMic = true,
}: PracticeScreenProps) {
  const board = useBoardModel(session, microphone);
  const boardRef = useRef<HTMLElement>(null);
  const { snapshot, recent, message, micStatus, monitor, micReady, targetNotes, mode, roundSize } =
    board;
  const { exercise, notation, phase, help } = snapshot;

  // Al cambiar de fase el botón pulsado desaparece y el foco se perdería: lo llevamos al tablero.
  const previousPhase = useRef(phase);
  useEffect(() => {
    if (previousPhase.current === phase) return;
    previousPhase.current = phase;
    if (document.activeElement === null || document.activeElement === document.body) {
      boardRef.current?.focus({ preventScroll: true });
    }
  }, [phase]);

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            ♪
          </span>
          <h1 className="brand__name">
            {brandHref ? (
              <a className="brand__link" href={brandHref} title="Volver al camino">
                Passo
              </a>
            ) : (
              'Passo'
            )}
          </h1>
          <span className="brand__tag">toca, corrige, avanza</span>
        </div>
        {statusZone}
        {headerActions}
      </header>

      <section
        className="board"
        aria-label={`Práctica: ${promptText(mode).toLowerCase()}`}
        tabIndex={-1}
        ref={boardRef}
        data-phase={monitor.phase}
      >
        <div className="board__top">
          {phase === 'inactiva' && microphone && micStatus && (
            <MicPanel
              status={micStatus}
              monitor={monitor}
              notation={notation}
              onActivate={() => void microphone.start()}
              onStartRound={() => session.start()}
              canStartWithoutMic={canStartWithoutMic}
            />
          )}

          {phase === 'inactiva' && !microphone && (
            <div className="welcome" data-testid="welcome">
              <h2 className="welcome__title">{welcomeTitle(snapshot.mode)}</h2>
              <p className="welcome__text">{welcomeText(snapshot.mode, snapshot.level)}</p>
              <p className="welcome__note">
                Do4 es el Do central. Algunos pianos lo rotulan «C3» o «Do3»: es la misma tecla.
              </p>
              <button
                type="button"
                className="button button--primary button--big"
                onClick={() => session.start()}
                data-testid="start"
              >
                Empezar
              </button>
            </div>
          )}

          {(phase === 'en-curso' || phase === 'pausada') && exercise && targetNotes !== null && (
            <>
              <div className="target" data-testid="target">
                <span className="target__label">{promptText(mode)}</span>
                {targetNotes.length === 1 ? (
                  <span
                    className="target__name"
                    data-testid="target-note"
                    data-midi={targetNotes[0]}
                    data-midis={targetNotes[0]}
                  >
                    {pitchName(targetNotes[0], notation)}
                    <span className="target__octave">{octaveOf(targetNotes[0])}</span>
                  </span>
                ) : (
                  <span
                    className="target__name target__name--group"
                    data-testid="target-note"
                    data-midi={targetNotes[0]}
                    data-midis={targetNotes.join(',')}
                  >
                    {targetNotes.map((note) => (
                      <span
                        key={note}
                        className="target__chip"
                        data-held={exercise.held.includes(note)}
                      >
                        {pitchName(note, notation)}
                        <span className="target__octave">{octaveOf(note)}</span>
                        {exercise.held.includes(note) && <span className="sr-only"> (tocada)</span>}
                      </span>
                    ))}
                  </span>
                )}
                <span className="target__hint target__hint--keep" data-testid="target-detail">
                  {targetDetail(exercise.target, notation) ||
                    (help ? 'La tecla resaltada del teclado' : 'Búscala en el teclado')}
                </span>
                <div
                  className="progress"
                  role="progressbar"
                  aria-label="Progreso de la ronda"
                  aria-valuemin={0}
                  aria-valuemax={roundSize}
                  aria-valuenow={snapshot.hits}
                >
                  <div
                    className="progress__fill"
                    style={{ width: `${(snapshot.hits / roundSize) * 100}%` }}
                  />
                </div>
                <span className="target__count" data-testid="counters">
                  <span>
                    {countLabel(mode)} {snapshot.hits}/{roundSize}
                  </span>
                  <span aria-hidden="true"> · </span>
                  <span>Errores {snapshot.errors}</span>
                </span>
              </div>

              <div className="stage" data-testid="stage">
                {phase === 'pausada' ? (
                  <div className="paused">
                    <strong>Ronda en pausa</strong>
                    <span>{pauseText(snapshot)}</span>
                    {snapshot.pausedSource === 'microfono' && microphone ? (
                      <button
                        type="button"
                        className="button"
                        onClick={() => void microphone.start()}
                        data-testid="reactivate-mic"
                      >
                        Reactivar
                      </button>
                    ) : (
                      <button type="button" className="button" onClick={() => session.resume()}>
                        Continuar
                      </button>
                    )}
                  </div>
                ) : message && recent ? (
                  <div
                    className={`feedback feedback--${message.tone}`}
                    key={recent.id}
                    data-testid="feedback"
                    data-tone={message.tone}
                    data-id={recent.id}
                  >
                    <Icon tone={message.tone} />
                    <div>
                      <p className="feedback__title">{message.title}</p>
                      <p className="feedback__detail">{message.detail}</p>
                    </div>
                  </div>
                ) : (
                  <p className="stage__idle" data-testid="stage-idle">
                    {snapshot.transposition !== null
                      ? transpositionText(snapshot.transposition)
                      : micReady
                        ? targetNotes.length > 1
                          ? 'Escuchando tu acorde…'
                          : 'Escuchando tu nota…'
                        : 'Esperando tu nota…'}
                  </p>
                )}
              </div>
            </>
          )}

          {phase === 'completada' && exercise && snapshot.summary && (
            <Summary
              summary={snapshot.summary}
              notation={notation}
              mode={mode}
              onAgain={() => session.start()}
            />
          )}
        </div>

        {microphone && micStatus && (
          <ListeningStrip status={micStatus} monitor={monitor} notation={notation} />
        )}

        <PracticeKeyboard board={board} />
        {!microphone && showPcKeys && (
          <p className="pc-hint" data-testid="pc-hint">
            {pcKeysText(findLevel(snapshot.mode, snapshot.level)?.hand ?? 'derecha')}
          </p>
        )}
      </section>

      <div className="sr-only" role="status" aria-live="polite" data-testid="live">
        {monitor.hint ? hintText(monitor.hint) : liveMessage(snapshot)}
      </div>
    </main>
  );
}
