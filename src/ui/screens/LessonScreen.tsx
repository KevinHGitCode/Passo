import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { LessonFlow, LessonOutcome } from '@/core/application/lesson-flow';
import type { PracticeSession } from '@/core/application/practice-session';
import type { ProgressService } from '@/core/application/progress-service';
import type { Lesson, PlayContext } from '@/core/domain/lessons';
import { playBlock } from '@/core/domain/lessons';
import { currentStreak } from '@/core/domain/progress';
import type { InputMonitor } from '@/core/ports/input-monitor';
import type { NoteInput } from '@/core/ports/note-input';
import { AnswerBar } from '../game/AnswerBar';
import type { AnswerTone } from '../game/AnswerBar';
import { GameButton, GameLink } from '../game/GameButton';
import { Icon } from '../game/icons';
import { ListeningStrip } from '../listen/ListeningStrip';
import { hintText } from '../listen/listen-messages';
import { MicPanel } from '../listen/MicPanel';
import { liveMessage, pauseText, useBoardModel } from '../practice/board-model';
import type { BoardModel } from '../practice/board-model';
import type { FeedbackMessage } from '../practice/feedback-message';
import { useInputStatus } from '../practice/hooks';
import { PracticeKeyboard } from '../practice/PracticeKeyboard';
import { TargetName } from '../practice/TargetName';
import { countLabel, pcKeysText, promptText, targetDetail } from '../practice/target-text';
import { CAMINO, hrefOf, navigate } from '../router/routes';
import { ExitDialog } from './ExitDialog';
import { inputName, lessonKindText, liveStats, thirdStarGoalText } from './lesson-live';
import { LessonResult } from './LessonResult';
import './lesson.css';

export interface LessonScreenProps {
  readonly lessonId: string;
  readonly flow: LessonFlow;
  readonly session: PracticeSession;
  readonly progress: ProgressService;
  /** Con qué se puede tocar ahora (decide si la lección se puede empezar). */
  readonly play: PlayContext;
  readonly microphone?: (NoteInput & InputMonitor) | undefined;
  /** Hay otra entrada (teclado del PC, MIDI): se puede empezar sin micrófono. */
  readonly canStartWithoutMic: boolean;
  /** El piano MIDI, si existe (para avisar cuando está desconectado). */
  readonly midi?: NoteInput | undefined;
  /** El botón del engranaje (lo coloca el marco). */
  readonly gear: ReactNode;
  readonly onOpenSettings: () => void;
}

const TONE_OF: Readonly<Record<FeedbackMessage['tone'], AnswerTone>> = {
  ok: 'ok',
  done: 'ok',
  error: 'error',
  partial: 'partial',
  neutral: 'partial',
};

function LessonMissing({ lessonId }: { readonly lessonId: string }) {
  return (
    <section className="lesson lesson--missing" aria-labelledby="leccion-titulo">
      <h1 id="leccion-titulo" tabIndex={-1} data-route-heading>
        No encuentro esa lección
      </h1>
      <p>
        {lessonId === 'repaso-debiles'
          ? 'Todavía no hay nada que repasar: practica unas cuantas lecciones y aquí aparecerá lo que más te cuesta.'
          : 'Puede que el enlace esté mal escrito.'}
      </p>
      <GameLink href={hrefOf(CAMINO)}>Volver al camino</GameLink>
    </section>
  );
}

/** Lo que se ve antes de empezar: qué se va a tocar, la meta y cómo empezar (o por qué no se puede). */
function LessonIntro({
  lesson,
  board,
  play,
  microphone,
  canStartWithoutMic,
  midiConnected,
  onBegin,
  onOpenSettings,
}: {
  readonly lesson: Lesson;
  readonly board: BoardModel;
  readonly play: PlayContext;
  readonly microphone: (NoteInput & InputMonitor) | undefined;
  readonly canStartWithoutMic: boolean;
  readonly midiConnected: boolean;
  readonly onBegin: () => void;
  readonly onOpenSettings: () => void;
}) {
  const { snapshot, micStatus, monitor } = board;
  const source = play.sources.length === 1 ? (play.sources[0] ?? null) : null;
  const blocked = playBlock(lesson, play);
  const needsMic = source === 'microfono' && microphone !== undefined && micStatus !== null;
  return (
    <div className="lesson-intro" data-testid="lesson-intro">
      <p className="lesson-intro__kind">{lessonKindText(lesson)}</p>
      {/* El título ya está arriba (encabezado de la pantalla): aquí es solo visual. */}
      <p className="lesson-intro__title" aria-hidden="true">
        {lesson.title}
      </p>
      <p className="lesson-intro__text">
        {lesson.roundSize} {countLabel(lesson.mode).toLowerCase()} · 3.ª estrella:{' '}
        {thirdStarGoalText(lesson, source)}
      </p>
      {blocked !== null ? (
        <div className="lesson-intro__block" data-testid="lesson-blocked">
          <p>
            Esta lección necesita piano MIDI o teclado del PC, o la beta «Oír varias notas a la vez»
            del micrófono.
          </p>
          <div className="lesson-intro__actions">
            <GameButton onClick={onOpenSettings}>Abrir ajustes</GameButton>
            <GameLink variant="secondary" href={hrefOf(CAMINO)}>
              Volver al camino
            </GameLink>
          </div>
        </div>
      ) : needsMic ? (
        <MicPanel
          status={micStatus}
          monitor={monitor}
          notation={snapshot.notation}
          onActivate={() => void microphone.start()}
          onStartRound={onBegin}
          canStartWithoutMic={canStartWithoutMic}
        />
      ) : source === 'midi' && !midiConnected ? (
        <div className="lesson-intro__block" data-testid="lesson-midi-missing">
          <p>No encuentro tu piano. Conéctalo por USB y pulsa «Empezar».</p>
          <div className="lesson-intro__actions">
            <GameButton variant="secondary" onClick={onOpenSettings}>
              Abrir ajustes
            </GameButton>
          </div>
        </div>
      ) : (
        <div className="lesson-intro__actions">
          <GameButton size="lg" onClick={onBegin} data-testid="start">
            Empezar
          </GameButton>
        </div>
      )}
    </div>
  );
}

/** El objetivo de ahora en grande (con los mismos `data-testid` que la práctica libre). */
function LessonTarget({ board }: { readonly board: BoardModel }) {
  const { snapshot, targetNotes, mode } = board;
  const { exercise, notation, help, errors } = snapshot;
  if (!exercise || targetNotes === null) return null;
  return (
    <div className="lesson-target target" data-testid="target">
      <span className="target__label">{promptText(mode)}</span>
      <TargetName notes={targetNotes} held={exercise.held} notation={notation} />
      <span className="target__hint" data-testid="target-detail">
        {targetDetail(exercise.target, notation) ||
          (help ? 'La tecla resaltada del teclado' : 'Búscala en el teclado')}
      </span>
      <span className="lesson-target__errors" data-testid="counters">
        <span className="sr-only">
          {countLabel(mode)} {snapshot.hits}/{board.roundSize} ·{' '}
        </span>
        Errores {errors}
      </span>
    </div>
  );
}

/** La barra de abajo: pausa, respuesta a lo último que tocaste o la espera. */
function LessonFooter({
  board,
  microphone,
  session,
}: {
  readonly board: BoardModel;
  readonly microphone: (NoteInput & InputMonitor) | undefined;
  readonly session: PracticeSession;
}) {
  const { snapshot, recent, message, micReady, targetNotes } = board;
  if (snapshot.phase === 'pausada') {
    return (
      <AnswerBar
        tone="partial"
        title="Ronda en pausa"
        detail={pauseText(snapshot)}
        data-testid="paused"
        actions={
          snapshot.pausedSource === 'microfono' && microphone ? (
            <GameButton
              variant="secondary"
              onClick={() => void microphone.start()}
              data-testid="reactivate-mic"
            >
              Reactivar
            </GameButton>
          ) : (
            <GameButton variant="secondary" onClick={() => session.resume()}>
              Continuar
            </GameButton>
          )
        }
      />
    );
  }
  if (message && recent) {
    return (
      <AnswerBar
        key={recent.id}
        tone={TONE_OF[message.tone]}
        title={message.title}
        detail={message.detail}
        data-testid="feedback"
        data-tone={message.tone}
        data-id={recent.id}
      />
    );
  }
  if (snapshot.phase !== 'en-curso' || targetNotes === null) return null;
  const many = targetNotes.length > 1;
  return (
    <p className="lesson__idle" data-testid="stage-idle">
      {snapshot.transposition !== null
        ? 'Parece que tu teclado está transpuesto. Revisa «Transpose» en el piano.'
        : micReady
          ? many
            ? 'Escuchando tu acorde…'
            : 'Escuchando tu nota…'
          : 'Esperando tu nota…'}
    </p>
  );
}

function LessonView({
  lesson,
  status,
  outcome,
  ...props
}: LessonScreenProps & {
  readonly lesson: Lesson;
  readonly status: 'lista' | 'en-curso' | 'resultado';
  readonly outcome: LessonOutcome | null;
}) {
  const { flow, session, progress, play, microphone, canStartWithoutMic, gear, onOpenSettings } =
    props;
  const board = useBoardModel(session, microphone);
  const { snapshot, micStatus, monitor } = board;
  const { exercise, phase } = snapshot;
  const midiStatus = useInputStatus(props.midi);
  const [confirming, setConfirming] = useState(false);
  const stageRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const source = play.sources.length === 1 ? (play.sources[0] ?? null) : null;
  const stats = liveStats(exercise?.attempts ?? [], snapshot.hits);
  const state = useSyncExternalStore(progress.subscribe, progress.getSnapshot).state;
  const streak = currentStreak(state, progress.today());

  // Al entrar en la lección el foco va a su título (un lector de pantalla anuncia dónde estás).
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  // Al cambiar de estado el botón pulsado desaparece y el foco se perdería: lo llevamos al escenario.
  const previousStatus = useRef(status);
  useEffect(() => {
    if (previousStatus.current === status) return;
    previousStatus.current = status;
    if (document.activeElement === null || document.activeElement === document.body) {
      stageRef.current?.focus({ preventScroll: true });
    }
  }, [status]);

  // Si la entrada deja de servir para esta lección (p. ej. se apaga la beta), la ronda se descarta.
  const blocked = playBlock(lesson, play) !== null;
  useEffect(() => {
    if (blocked) flow.abandonRound();
  }, [blocked, flow]);

  const requestExit = useCallback(() => {
    if (status === 'en-curso' && snapshot.hits > 0) {
      session.pause();
      setConfirming(true);
    } else {
      navigate(CAMINO);
    }
  }, [status, snapshot.hits, session]);
  const keepGoing = useCallback(() => {
    setConfirming(false);
    session.resume();
  }, [session]);

  if (status === 'resultado' && outcome !== null) {
    return (
      <LessonResult
        outcome={outcome}
        flow={flow}
        progress={progress}
        notation={snapshot.notation}
      />
    );
  }

  const roundSize = lesson.roundSize;
  const midiConnected = midiStatus?.kind === 'conectado';
  return (
    <div className="lesson game" data-testid="lesson" data-status={status} data-lesson={lesson.id}>
      <header className="lesson__top">
        <button
          type="button"
          className="lesson__exit"
          aria-label="Salir de la lección"
          onClick={requestExit}
          data-testid="lesson-exit"
        >
          <Icon name="cross" size={22} />
        </button>
        <div
          className="lesson__segments"
          role="progressbar"
          aria-label={`${countLabel(lesson.mode)}: ${snapshot.hits} de ${roundSize}`}
          aria-valuemin={0}
          aria-valuemax={roundSize}
          aria-valuenow={snapshot.hits}
          data-testid="lesson-progress"
        >
          {Array.from({ length: roundSize }, (_, i) => (
            <span key={i} className="lesson__segment" data-done={i < snapshot.hits} />
          ))}
        </div>
        <span className="chip chip--input" data-testid="input-chip">
          {inputName(source)}
        </span>
        <span className="chip chip--streak" title="Días seguidos">
          <Icon name="flame" size={18} />
          <span>{streak}</span>
          <span className="sr-only"> días de racha</span>
        </span>
        {gear}
      </header>

      <section className="lesson__stats" aria-label="Tus marcas">
        <h1 className="lesson__name" tabIndex={-1} data-route-heading ref={headingRef}>
          {lesson.title}
        </h1>
        <p className="lesson__stat" data-testid="stat-accuracy">
          <span className="lesson__stat-label">Precisión</span>
          <strong>{stats.accuracy === null ? '—' : `${Math.round(stats.accuracy * 100)} %`}</strong>
        </p>
        <p className="lesson__stat" data-testid="stat-rhythm">
          <span className="lesson__stat-label">Ritmo</span>
          <strong>{stats.notesPerMinute === null ? '—' : Math.round(stats.notesPerMinute)}</strong>
          <span className="lesson__stat-unit">notas/min</span>
        </p>
        <p className="lesson__stat lesson__stat--goal" data-testid="stat-goal">
          <span className="lesson__stat-label">3.ª ★</span>
          <strong>{thirdStarGoalText(lesson, source)}</strong>
        </p>
      </section>

      <section
        className="lesson__stage stage-dark"
        aria-label={`Lección: ${lesson.title}`}
        tabIndex={-1}
        ref={stageRef}
        data-phase={monitor.phase}
      >
        {status === 'lista' ? (
          <LessonIntro
            lesson={lesson}
            board={board}
            play={play}
            microphone={microphone}
            canStartWithoutMic={canStartWithoutMic}
            midiConnected={midiConnected}
            onBegin={() => flow.begin()}
            onOpenSettings={onOpenSettings}
          />
        ) : (
          <LessonTarget board={board} />
        )}
        {microphone && micStatus ? (
          <ListeningStrip status={micStatus} monitor={monitor} notation={snapshot.notation} />
        ) : null}
        <PracticeKeyboard board={board} />
        {source === 'teclado-pc' && microphone === undefined ? (
          <p className="pc-hint" data-testid="pc-hint">
            {pcKeysText(lesson.pool[0]?.hand ?? 'derecha')}
          </p>
        ) : null}
      </section>

      <footer className="lesson__answer">
        {status === 'en-curso' || phase === 'pausada' ? (
          <LessonFooter board={board} microphone={microphone} session={session} />
        ) : null}
      </footer>

      <div className="sr-only" role="status" aria-live="polite" data-testid="live">
        {monitor.hint ? hintText(monitor.hint) : liveMessage(snapshot)}
      </div>

      {confirming ? <ExitDialog onContinue={keepGoing} onExit={() => navigate(CAMINO)} /> : null}
    </div>
  );
}

/**
 * Una lección. Al entrar la prepara (queda «lista»: no arranca sola) y al salir la suelta sin guardar.
 * Lo que se ve depende del estado del flujo: la presentación, la ronda o el resultado.
 */
export function LessonScreen(props: LessonScreenProps) {
  const { lessonId, flow } = props;
  useEffect(() => {
    flow.prepare(lessonId);
    return () => flow.leave();
  }, [flow, lessonId]);
  const snapshot = useSyncExternalStore(flow.subscribe, flow.getSnapshot);

  if (snapshot.lessonId !== lessonId || snapshot.lesson === null || snapshot.status === 'libre') {
    // Un instante antes de que el efecto la prepare no hay que enseñar «no existe».
    return flow.canOpen(lessonId) ? null : <LessonMissing lessonId={lessonId} />;
  }
  return (
    <LessonView
      {...props}
      lesson={snapshot.lesson}
      status={snapshot.status}
      outcome={snapshot.outcome}
    />
  );
}
