import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import type { PracticeSession, SessionSnapshot } from '@/core/application/practice-session';
import { findLevel } from '@/core/domain/curriculum';
import type { ExerciseMode } from '@/core/domain/curriculum';
import type { RoundSummary } from '@/core/domain/exercise';
import { noteName, octaveOf, pitchName } from '@/core/domain/note';
import type { InputMonitor } from '@/core/ports/input-monitor';
import type { NoteInput } from '@/core/ports/note-input';
import type { Midi, NotationMode } from '@/core/domain/note';
import type { Hand } from '@/core/domain/target';
import { hintText } from '../listen/listen-messages';
import { ListeningStrip } from '../listen/ListeningStrip';
import { MicPanel } from '../listen/MicPanel';
import { windowAround } from '../keyboard/geometry';
import { PianoKeyboard } from '../keyboard/piano-keyboard';
import { feedbackMessage, formatSeconds } from './feedback-message';
import type { FeedbackMessage } from './feedback-message';
import {
  useInputStatus,
  useIsNarrow,
  useMonitor,
  useRecentFeedback,
  useSessionSnapshot,
} from './hooks';
import { buildKeyVisuals } from './key-visuals';
import { countLabel, notesText, promptText, targetDetail } from './target-text';
import './practice.css';

/** Rango del teclado en pantalla: Do3 a Do6 (el nivel 1 usa Do4–Sol4). */
export const KEYBOARD_FROM = 48;
export const KEYBOARD_TO = 84;

/** En pantallas estrechas se muestran 9 teclas blancas (de Do a Re de la octava siguiente). */
const NARROW_SPAN_SEMITONES = 14;
const NARROW_MAX_WIDTH = 899;

export interface PracticeScreenProps {
  readonly session: PracticeSession;
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
      ) : tone === 'neutral' ? (
        <path d="M9.5 9a2.5 2.5 0 1 1 3.6 2.2c-.8.5-1.1 1-1.1 2M12 17v.01" />
      ) : (
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      )}
    </svg>
  );
}

/** Texto para lectores de pantalla. Incluye el nº de errores para que dos errores iguales se anuncien. */
function liveMessage(snapshot: SessionSnapshot): string {
  const { exercise, feedback, notation } = snapshot;
  if (snapshot.phase === 'pausada') return `Ronda en pausa. ${pauseText(snapshot)}`;
  if (!exercise) return '';
  const target = notesText(exercise.target.notes, notation);
  if (!feedback) return `Toca ${target}`;
  const message = feedbackMessage(feedback.outcome, notation);
  if (feedback.outcome.kind === 'acierto') return `${message.title} Ahora toca ${target}`;
  if (feedback.outcome.kind === 'dudoso') return `${message.title}. ${message.detail}`;
  if (feedback.outcome.kind === 'error') {
    return `${message.title}, error ${snapshot.errors}. ${message.detail}. Intenta de nuevo`;
  }
  return `${message.title} ${message.detail}`;
}

function pauseText(snapshot: SessionSnapshot): string {
  if (snapshot.pauseReason !== 'desconexion') return 'Pulsa continuar cuando quieras.';
  return snapshot.pausedSource === 'microfono'
    ? 'Se perdió el micrófono. Reactívalo para seguir.'
    : 'Se desconectó el piano. Vuelve a conectarlo para seguir.';
}

function transpositionText(semitones: number): string {
  const count = Math.abs(semitones);
  const amount = count === 12 ? 'una octava' : `${count} ${count === 1 ? 'semitono' : 'semitonos'}`;
  return `Parece que tu teclado está transpuesto ${amount} (${semitones > 0 ? 'más agudo' : 'más grave'}). Revisa «Transpose» en el piano.`;
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

function welcomeText(mode: ExerciseMode, level: number): string {
  if (mode === 'terceras') {
    return `Dos teclas a la vez, sin saltarte ninguna. Nivel ${level}: ${levelTitle(mode, level)}.`;
  }
  if (mode === 'acordes') {
    return `Tres teclas a la vez. Nivel ${level}: ${levelTitle(mode, level)}.`;
  }
  return 'No avanzas hasta acertar. Nivel 1: de Do4 a Sol4, con la mano derecha.';
}

function levelTitle(mode: ExerciseMode, level: number): string {
  return findLevel(mode, level)?.title ?? '';
}

export function PracticeScreen({
  session,
  headerActions,
  statusZone,
  showPcKeys = false,
  microphone,
  canStartWithoutMic = true,
}: PracticeScreenProps) {
  const snapshot = useSessionSnapshot(session);
  const recent = useRecentFeedback(snapshot.feedback);
  const narrow = useIsNarrow(NARROW_MAX_WIDTH);
  const boardRef = useRef<HTMLElement>(null);
  const micStatus = useInputStatus(microphone);
  const monitor = useMonitor(microphone);
  const micReady = micStatus?.kind === 'conectado' && monitor.phase === 'escuchando';
  const micConnected = micStatus?.kind === 'conectado';

  const { exercise, notation, phase, help } = snapshot;
  const targetNotes = exercise?.target.notes ?? null;
  const mode = exercise?.config.mode ?? snapshot.mode;
  const roundSize = exercise?.config.roundSize ?? 0;
  const message = recent ? feedbackMessage(recent.outcome, notation) : null;

  // Al cambiar de fase el botón pulsado desaparece y el foco se perdería: lo llevamos al tablero.
  const previousPhase = useRef(phase);
  useEffect(() => {
    if (previousPhase.current === phase) return;
    previousPhase.current = phase;
    if (document.activeElement === null || document.activeElement === document.body) {
      boardRef.current?.focus({ preventScroll: true });
    }
  }, [phase]);

  // En la prueba rápida de la bienvenida se resalta el Do central.
  const onboardingTarget = phase === 'inactiva' && microphone && micReady ? [60] : [];
  const visuals = buildKeyVisuals({
    targets: phase === 'en-curso' ? (targetNotes ?? []) : onboardingTarget,
    heard: micConnected ? (monitor.heard?.midi ?? null) : null,
    help,
    pressed: snapshot.pressed,
    feedback: recent,
  });
  /**
   * Con ayuda: nombre en cada tecla blanca. Sin ayuda: solo los Do como punto de referencia.
   * Las teclas negras solo se rotulan cuando son parte de un resultado.
   */
  const labelFor = (midi: Midi): string | undefined => {
    const isC = midi % 12 === 0;
    const hasFeedback = visuals.get(midi)?.feedback !== undefined;
    const isBlack = [1, 3, 6, 8, 10].includes(midi % 12);
    if (hasFeedback || (isC && phase !== 'inactiva')) return noteName(midi, notation);
    if (help && phase !== 'inactiva' && !isBlack) return pitchName(midi, notation);
    return undefined;
  };
  const viewWindow = narrow
    ? windowAround(
        targetNotes?.[0] ?? 60,
        KEYBOARD_FROM,
        KEYBOARD_TO,
        NARROW_SPAN_SEMITONES,
        targetNotes?.[targetNotes.length - 1],
      )
    : undefined;

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            ♪
          </span>
          <h1 className="brand__name">Passo</h1>
          <span className="brand__tag">toca, corrige, avanza</span>
        </div>
        {headerActions}
      </header>

      {statusZone}

      <section
        className="board"
        aria-label="Práctica: toca esta nota"
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
                <span
                  className={
                    targetNotes.length === 1 ? 'target__hint' : 'target__hint target__hint--keep'
                  }
                  data-testid="target-detail"
                >
                  {targetNotes.length === 1
                    ? help
                      ? 'La tecla resaltada del teclado'
                      : 'Búscala en el teclado'
                    : targetDetail(exercise.target, notation)}
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
                        ? 'Escuchando tu nota…'
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

        <div className="keyboard-wrap">
          <PianoKeyboard
            from={KEYBOARD_FROM}
            to={KEYBOARD_TO}
            visuals={visuals}
            labelFor={labelFor}
            viewWindow={viewWindow}
            ariaLabel={
              targetNotes !== null && phase === 'en-curso'
                ? `Teclado de piano de ${noteName(KEYBOARD_FROM, notation)} a ${noteName(KEYBOARD_TO, notation)}. ${targetNotes.length === 1 ? 'Nota' : 'Notas'} a tocar: ${notesText(targetNotes, notation)}`
                : `Teclado de piano de ${noteName(KEYBOARD_FROM, notation)} a ${noteName(KEYBOARD_TO, notation)}`
            }
          />
        </div>
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
