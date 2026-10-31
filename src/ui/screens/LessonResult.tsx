import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { LessonFlow, LessonOutcome } from '@/core/application/lesson-flow';
import type { ProgressService } from '@/core/application/progress-service';
import type { NotationMode } from '@/core/domain/note';
import { reviewLessonId, selectReview } from '@/core/domain/review';
import { MIN_ACCURACY, STAR_3_ACCURACY } from '@/core/domain/scoring';
import { GameButton, GameLink } from '../game/GameButton';
import { Icon } from '../game/icons';
import { ProgressRing } from '../game/ProgressRing';
import { Stars } from '../game/Stars';
import { formatSeconds } from '../practice/feedback-message';
import { countLabel, guitarNoteText, notesText } from '../practice/target-text';
import { caminoOf, hrefOf, lessonRoute } from '../router/routes';

/** El texto del botón de repetir: con 2 estrellas anima a la 3.ª; el nombre accesible dice «estrella». */
function retryLabel(nextStar: number | null, dynamic: boolean, spoken: boolean): string {
  if (nextStar === null || nextStar <= 1 || dynamic) return 'Repetir';
  return spoken ? `Repetir para la ${nextStar}.ª estrella` : `Repetir para la ${nextStar}.ª ★`;
}

function clock(ms: number): string {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function title(outcome: LessonOutcome): string {
  if (outcome.lesson.dynamic) return '¡Repaso hecho!';
  return outcome.score.stars === 0 ? 'Todavía no: repítela' : '¡Lección completa!';
}

/** Lo que se dice una sola vez al terminar: estrellas, experiencia y racha, para lectores de pantalla. */
function announcement(outcome: LessonOutcome): string {
  const { score, gains } = outcome;
  const parts = [
    outcome.lesson.dynamic ? '' : `Conseguiste ${score.stars} de 3 estrellas.`,
    `Precisión ${Math.round(score.accuracy * 100)} %.`,
    `Ritmo ${Math.round(score.notesPerMinute)} notas por minuto.`,
    `Ganaste ${gains.xp} puntos de experiencia.`,
    gains.streak > 0 ? `Racha de ${gains.streak} ${gains.streak === 1 ? 'día' : 'días'}.` : '',
    gains.levelAfter > gains.levelBefore ? `Subiste al nivel ${gains.levelAfter}.` : '',
  ];
  return parts.filter(Boolean).join(' ');
}

/** El resultado de una lección: estrellas, marcas, lo que más costó y qué hacer ahora. */
export function LessonResult({
  outcome,
  flow,
  progress,
  notation,
}: {
  readonly outcome: LessonOutcome;
  readonly flow: LessonFlow;
  readonly progress: ProgressService;
  readonly notation: NotationMode;
}) {
  const { lesson, score, gains } = outcome;
  // Al llegar el resultado el foco va al título (se anuncia «¡Lección completa!»).
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);
  const { state, saved } = useSyncExternalStore(progress.subscribe, progress.getSnapshot);
  const percent = Math.round(score.accuracy * 100);
  const missed = score.summary.mostMissed;
  const slowest = score.summary.slowest;
  // Solo se ofrece repasar cuando de verdad hay teclas débiles (no por ser «las más lentas»).
  const review =
    selectReview(state.keys, lesson.instrument)?.reason === 'debiles' && !lesson.dynamic;
  const nextStar = score.stars >= 3 ? null : score.stars + 1;
  // Sin llegar al 70 % lo que toca es repetir: esa es la acción principal.
  const failed = score.stars === 0 && !lesson.dynamic;
  const wasBest = gains.bestRhythm && gains.previousPlays > 0;

  return (
    <section className="result game" data-testid="result" aria-labelledby="resultado-titulo">
      <div className="result__stars">
        {lesson.dynamic ? (
          <span className="result__badge" aria-hidden="true">
            <Icon name="review" size={64} />
          </span>
        ) : (
          <Stars value={score.stars} size="lg" />
        )}
      </div>
      <h1
        id="resultado-titulo"
        className="result__title"
        aria-describedby="resultado-resumen"
        tabIndex={-1}
        data-route-heading
        ref={headingRef}
      >
        {title(outcome)}
      </h1>
      <p className="result__lesson">{lesson.title}</p>
      <p className="sr-only" id="resultado-resumen">
        {announcement(outcome)}
      </p>

      <div className="result__cards">
        <section className="result-card result-card--ok" aria-label="Precisión">
          <h2 className="result-card__head">Precisión</h2>
          <div className="result-card__body result-card__body--ring">
            <ProgressRing value={score.accuracy} label={`Precisión ${percent} %`} />
            <div>
              <p className="result-card__value" data-testid="result-accuracy">
                {percent} %
              </p>
              {score.stars === 0 && !lesson.dynamic ? (
                <p className="result-card__note" data-testid="need-pass">
                  Necesitas {Math.round(MIN_ACCURACY * 100)} % para pasar
                </p>
              ) : score.stars < 3 && !lesson.dynamic ? (
                <p className="result-card__note">
                  Para la 3.ª estrella: {Math.round(STAR_3_ACCURACY[lesson.kind] * 100)} %
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="result-card result-card--accent" aria-label="Ritmo">
          <h2 className="result-card__head">Ritmo</h2>
          <div className="result-card__body">
            <p className="result-card__value" data-testid="result-rhythm">
              {Math.round(score.notesPerMinute)} <small>notas/min</small>
            </p>
            {wasBest ? (
              <p className="result-card__note result-card__note--good">
                <Icon name="bolt" size={16} /> Tu mejor marca
              </p>
            ) : score.rhythmGoal !== null && !score.rhythmMet && !lesson.dynamic ? (
              <p className="result-card__note">Para la 3.ª ★: {Math.round(score.rhythmGoal)}</p>
            ) : null}
          </div>
        </section>

        <section className="result-card" aria-label="Tiempo">
          <h2 className="result-card__head">Tiempo</h2>
          <div className="result-card__body">
            <p className="result-card__value" data-testid="result-time">
              {clock(score.activeMs)}
            </p>
            <p className="result-card__note">
              {score.summary.totalTargets} {countLabel(lesson.mode).toLowerCase()} ·{' '}
              {score.summary.errors} {score.summary.errors === 1 ? 'error' : 'errores'}
            </p>
          </div>
        </section>

        <section className="result-card result-card--xp" aria-label="Experiencia">
          <h2 className="result-card__head">Experiencia</h2>
          <div className="result-card__body">
            <p className="result-card__value" data-testid="result-xp">
              <Icon name="bolt" size={26} /> +{gains.xp}
            </p>
            <p className="result-card__note">
              {gains.streak > 0
                ? `Racha de ${gains.streak} ${gains.streak === 1 ? 'día' : 'días'}`
                : 'La racha sube al completar una lección'}
            </p>
            {gains.levelAfter > gains.levelBefore ? (
              <p className="result-card__note result-card__note--good" data-testid="level-up">
                ¡Subiste al nivel {gains.levelAfter}!
              </p>
            ) : null}
          </div>
        </section>
      </div>

      {lesson.kind === 'prueba' &&
      !score.withoutHelp &&
      score.accuracy >= STAR_3_ACCURACY.prueba ? (
        <p className="result__tip" data-testid="tip-help">
          La 3.ª estrella de una prueba se consigue sin ayuda: apágala en Ajustes y repítela.
        </p>
      ) : null}

      <section className="result__hard" aria-label="Lo que más costó" data-testid="result-hard">
        <span className="result__hard-icon" aria-hidden="true">
          <Icon name="target" size={28} />
        </span>
        <div className="result__hard-text">
          <h2 className="result__hard-title">
            {missed
              ? `Lo que más costó: ${
                  lesson.instrument === 'guitarra'
                    ? guitarNoteText(missed.notes[0], notation)
                    : notesText(missed.notes, notation)
                }`
              : 'Nada se te atragantó'}
          </h2>
          <p>
            {missed
              ? `Fallaste ${missed.errors} ${missed.errors === 1 ? 'vez' : 'veces'}${
                  slowest ? ` y la más lenta tardó ${formatSeconds(slowest.reactionMs)}` : ''
                }.`
              : slowest
                ? `La más lenta tardó ${formatSeconds(slowest.reactionMs)}.`
                : 'Sin fallos en esta ronda.'}
          </p>
        </div>
      </section>

      {!saved ? (
        <p className="result__unsaved" role="status" data-testid="no-guarda">
          Este resultado no se ha podido guardar: tu navegador no deja guardar datos (¿ventana
          privada?). Se pierde al cerrar la pestaña.
        </p>
      ) : null}

      <footer className="result__actions">
        <GameButton
          variant={failed ? 'primary' : 'secondary'}
          onClick={() => flow.retry()}
          data-testid="result-retry"
          aria-label={retryLabel(nextStar, lesson.dynamic === true, true)}
        >
          {retryLabel(nextStar, lesson.dynamic === true, false)}
        </GameButton>
        {review ? (
          <GameLink
            variant="secondary"
            href={hrefOf(lessonRoute(reviewLessonId(lesson.instrument)))}
            data-testid="result-review"
          >
            Repasar tus puntos débiles
          </GameLink>
        ) : null}
        <GameLink
          variant={failed ? 'secondary' : 'primary'}
          href={hrefOf(caminoOf(lesson.instrument))}
          data-testid="result-continue"
        >
          {failed ? 'Volver al camino' : 'Continuar'}
        </GameLink>
      </footer>
    </section>
  );
}
