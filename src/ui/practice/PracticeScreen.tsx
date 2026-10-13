import type { ReactNode } from 'react';
import { useState } from 'react';
import type { PracticeSession, SessionSnapshot } from '@/core/application/practice-session';
import type { RoundSummary } from '@/core/domain/exercise';
import { noteName, octaveOf, pitchName } from '@/core/domain/note';
import type { Midi, NotationMode } from '@/core/domain/note';
import { windowAround } from '../keyboard/geometry';
import { PianoKeyboard } from '../keyboard/piano-keyboard';
import type { ThemeChoice } from '../theme/use-theme';
import { feedbackMessage, formatSeconds } from './feedback-message';
import type { FeedbackMessage } from './feedback-message';
import { useIsNarrow, useRecentFeedback, useSessionSnapshot } from './hooks';
import { buildKeyVisuals } from './key-visuals';
import { SettingsBar } from './SettingsBar';
import './practice.css';

/** Rango del teclado en pantalla: Do3 a Do6 (el nivel 1 usa Do4–Sol4). */
export const KEYBOARD_FROM = 48;
export const KEYBOARD_TO = 84;

export interface PracticeScreenProps {
  readonly session: PracticeSession;
  readonly theme: ThemeChoice;
  readonly onCycleTheme: () => void;
  /** Zona de estado de entradas y sonido (se coloca bajo la cabecera). */
  readonly statusZone?: ReactNode | undefined;
  /** Ayuda al teclado del PC para el nivel actual. */
  readonly pcKeysHint?: string | undefined;
}

function Icon({ tone }: { readonly tone: FeedbackMessage['tone'] }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" className="feedback__icon">
      {tone === 'error' ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M5 12.5l4.5 4.5L19 7.5" />}
    </svg>
  );
}

function liveMessage(snapshot: SessionSnapshot): string {
  const { exercise, feedback, notation } = snapshot;
  if (snapshot.phase === 'pausada') return 'Ronda en pausa';
  if (!exercise) return '';
  const target = noteName(exercise.target, notation);
  if (!feedback) return `Toca ${target}`;
  const message = feedbackMessage(feedback.outcome, notation);
  if (feedback.outcome.kind === 'acierto') return `${message.title} Ahora toca ${target}`;
  if (feedback.outcome.kind === 'error')
    return `${message.title}. ${message.detail}. Intenta de nuevo`;
  return `${message.title} ${message.detail}`;
}

function Summary({
  summary,
  notation,
  onAgain,
}: {
  readonly summary: RoundSummary;
  readonly notation: NotationMode;
  readonly onAgain: () => void;
}) {
  const percent = Math.round(summary.accuracy * 100);
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
          <dt>Nota más lenta</dt>
          <dd>
            {summary.slowest ? noteName(summary.slowest.midi, notation) : '—'}
            {summary.slowest && <small> · {formatSeconds(summary.slowest.reactionMs)}</small>}
          </dd>
        </div>
        <div className="stat">
          <dt>Nota más fallada</dt>
          <dd>
            {summary.mostMissed ? noteName(summary.mostMissed.midi, notation) : 'Ninguna'}
            {summary.mostMissed && (
              <small>
                {' '}
                · {summary.mostMissed.errors}{' '}
                {summary.mostMissed.errors === 1 ? 'error' : 'errores'}
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

export function PracticeScreen({
  session,
  theme,
  onCycleTheme,
  statusZone,
  pcKeysHint,
}: PracticeScreenProps) {
  const snapshot = useSessionSnapshot(session);
  const recent = useRecentFeedback(snapshot.feedback);
  const narrow = useIsNarrow();
  const [help, setHelp] = useState(true);

  const { exercise, notation, phase } = snapshot;
  const target = exercise?.target ?? null;
  const roundSize = exercise?.config.roundSize ?? 0;
  const message = recent ? feedbackMessage(recent.outcome, notation) : null;

  const visuals = buildKeyVisuals({
    target: phase === 'en-curso' ? target : null,
    help,
    pressed: snapshot.pressed,
    feedback: recent,
  });
  const labelFor = (midi: Midi): string | undefined => {
    const showAll = help && phase !== 'inactiva';
    if (!showAll && !visuals.get(midi)?.feedback) return undefined;
    return midi % 12 === 0 ? noteName(midi, notation) : pitchName(midi, notation);
  };
  const viewWindow = narrow ? windowAround(target ?? 60, KEYBOARD_FROM, KEYBOARD_TO, 2) : undefined;

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
        <SettingsBar
          notation={notation}
          onNotation={(value) => session.setNotation(value)}
          help={help}
          onHelp={setHelp}
          theme={theme}
          onCycleTheme={onCycleTheme}
        />
      </header>

      {statusZone}

      <section className="board" aria-label="Práctica: toca esta nota">
        {phase === 'inactiva' && (
          <div className="welcome" data-testid="welcome">
            <h2 className="welcome__title">Toca la nota que aparece</h2>
            <p className="welcome__text">
              No avanzas hasta acertar. Nivel 1: de Do4 a Sol4, con la mano derecha.
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

        {(phase === 'en-curso' || phase === 'pausada') && exercise && target !== null && (
          <>
            <div className="target" data-testid="target">
              <span className="target__label">Toca esta nota</span>
              <span className="target__name" data-testid="target-note" data-midi={target}>
                {pitchName(target, notation)}
                <span className="target__octave">{octaveOf(target)}</span>
              </span>
              <span className="target__hint">
                {help ? 'La tecla azul del teclado' : 'Búscala en el teclado'}
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
                  Notas {snapshot.hits}/{roundSize}
                </span>
                <span aria-hidden="true"> · </span>
                <span>Errores {snapshot.errors}</span>
              </span>
            </div>

            <div className="stage" data-testid="stage">
              {phase === 'pausada' ? (
                <div className="paused" role="alert">
                  <strong>Ronda en pausa</strong>
                  <span>
                    {snapshot.pauseReason === 'desconexion'
                      ? 'Se desconectó el piano. Vuelve a conectarlo para seguir.'
                      : 'Pulsa continuar cuando quieras.'}
                  </span>
                  <button type="button" className="button" onClick={() => session.resume()}>
                    Continuar
                  </button>
                </div>
              ) : message && recent ? (
                <div
                  className={`feedback feedback--${message.tone}`}
                  key={recent.id}
                  data-testid="feedback"
                  data-tone={message.tone}
                >
                  <Icon tone={message.tone} />
                  <div>
                    <p className="feedback__title">{message.title}</p>
                    <p className="feedback__detail">{message.detail}</p>
                  </div>
                </div>
              ) : (
                <p className="stage__idle">Esperando tu nota…</p>
              )}
            </div>
          </>
        )}

        {phase === 'completada' && exercise && (
          <Summary
            summary={
              snapshot.feedback?.outcome.kind === 'ronda-completa'
                ? snapshot.feedback.outcome.summary
                : {
                    totalTargets: 0,
                    firstTryCorrect: 0,
                    errors: 0,
                    accuracy: 0,
                    slowest: null,
                    mostMissed: null,
                  }
            }
            notation={notation}
            onAgain={() => session.start()}
          />
        )}

        <div className="keyboard-wrap">
          <PianoKeyboard
            from={KEYBOARD_FROM}
            to={KEYBOARD_TO}
            visuals={visuals}
            labelFor={labelFor}
            viewWindow={viewWindow}
            ariaLabel={
              target !== null && phase === 'en-curso'
                ? `Teclado de piano de ${noteName(KEYBOARD_FROM, notation)} a ${noteName(KEYBOARD_TO, notation)}. Nota a tocar: ${noteName(target, notation)}`
                : `Teclado de piano de ${noteName(KEYBOARD_FROM, notation)} a ${noteName(KEYBOARD_TO, notation)}`
            }
          />
        </div>
        {pcKeysHint && <p className="pc-hint">{pcKeysHint}</p>}
      </section>

      <div className="sr-only" role="status" aria-live="polite" data-testid="live">
        {liveMessage(snapshot)}
      </div>
    </main>
  );
}
