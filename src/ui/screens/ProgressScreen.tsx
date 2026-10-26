import { useRef, useState, useSyncExternalStore } from 'react';
import type { ProgressService } from '@/core/application/progress-service';
import { LESSONS } from '@/core/domain/lessons';
import type { NotationMode } from '@/core/domain/note';
import { currentStreak, progressSummary } from '@/core/domain/progress';
import { REVIEW_LESSON_ID, selectReview } from '@/core/domain/review';
import { noteName } from '@/core/domain/note';
import { pianistLevel } from '@/core/domain/scoring';
import { GameButton, GameLink } from '../game/GameButton';
import { Icon } from '../game/icons';
import { CAMINO, hrefOf, lessonRoute } from '../router/routes';
import { AccuracyChart } from './AccuracyChart';
import { KeyHeatmap } from './KeyHeatmap';
import './progress.css';

const CHART_LESSONS = 12;

/** «5 h 40», «12 min», «45 s»: el tiempo practicado en palabras cortas. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds} s`;
  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} h` : `${hours} h ${String(minutes).padStart(2, '0')}`;
}

/** Lo que llevas: nivel, medias, el mapa de tu teclado y cómo evoluciona tu precisión. */
export function ProgressScreen({
  progress,
  notation,
}: {
  readonly progress: ProgressService;
  readonly notation: NotationMode;
}) {
  const { state, saved } = useSyncExternalStore(progress.subscribe, progress.getSnapshot);
  const [confirming, setConfirming] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const summary = progressSummary(state);
  const level = pianistLevel(state.xp);
  const done = LESSONS.filter((lesson) => (state.lessons[lesson.id]?.stars ?? 0) >= 1).length;
  const streak = currentStreak(state, progress.today());
  const review = selectReview(state.keys);
  const empty = state.history.length === 0 && Object.keys(state.keys).length === 0;

  return (
    <div className="progreso" data-testid="progreso">
      <header className="progreso__head">
        <h1 id="progreso-titulo" tabIndex={-1} data-route-heading ref={headingRef}>
          Progreso
        </h1>
        <p className="progreso__sub">
          {done} de {LESSONS.length} lecciones hechas
          {streak > 0 ? ` · racha de ${streak} ${streak === 1 ? 'día' : 'días'}` : ''}
        </p>
      </header>

      {!saved ? (
        <p className="progreso__warn" role="status" data-testid="no-guarda">
          Aquí no se guarda tu progreso: solo dura mientras tengas esta pestaña abierta.
        </p>
      ) : null}

      <section className="progreso__kpis" aria-label="Resumen">
        <div className="kpi kpi--level">
          <p className="kpi__label">Nivel de pianista</p>
          <p className="kpi__big">
            {level.level} · {level.name}
          </p>
          {level.xpForNext !== null ? (
            <div
              className="bar"
              role="progressbar"
              aria-label={`Experiencia hacia el nivel ${level.level + 1}`}
              aria-valuemin={0}
              aria-valuemax={level.xpForNext}
              aria-valuenow={level.xpIntoLevel}
            >
              <div
                className="bar__fill bar__fill--xp"
                style={{ width: `${(level.xpIntoLevel / level.xpForNext) * 100}%` }}
              />
            </div>
          ) : null}
          <p className="kpi__note">
            {state.xp.toLocaleString('es')} XP
            {level.xpForNext !== null
              ? ` · ${level.xpForNext - level.xpIntoLevel} para el nivel ${level.level + 1}`
              : ''}
          </p>
        </div>
        <div className="kpi">
          <p className="kpi__label">Precisión media</p>
          <p className="kpi__big kpi__big--ok" data-testid="kpi-accuracy">
            {summary.accuracy === null ? '—' : `${Math.round(summary.accuracy * 100)} %`}
          </p>
          <p className="kpi__note">
            {summary.lessons > 0 ? `Últimas ${summary.lessons} lecciones` : 'Sin lecciones todavía'}
          </p>
        </div>
        <div className="kpi">
          <p className="kpi__label">Ritmo medio</p>
          <p className="kpi__big kpi__big--accent" data-testid="kpi-rhythm">
            {summary.notesPerMinute === null ? '—' : Math.round(summary.notesPerMinute)}
            {summary.notesPerMinute === null ? null : <small> notas/min</small>}
          </p>
          <p className="kpi__note">
            {summary.lessons > 0 ? `Últimas ${summary.lessons} lecciones` : 'Sin lecciones todavía'}
          </p>
        </div>
        <div className="kpi">
          <p className="kpi__label">Tiempo practicado</p>
          <p className="kpi__big" data-testid="kpi-time">
            {summary.totalMs === 0 ? '—' : formatDuration(summary.totalMs)}
          </p>
          <p className="kpi__note">
            {summary.practiceDays} {summary.practiceDays === 1 ? 'día' : 'días'} con práctica
          </p>
        </div>
      </section>

      {empty ? (
        <section className="card progreso__empty" data-testid="progreso-vacio">
          <h2 className="card__title">Todavía no hay datos</h2>
          <p>
            Aquí verás qué teclas te salen mejor, cómo sube tu precisión y cuánto has practicado.
            Empieza por tu primera lección.
          </p>
          <GameLink href={hrefOf(CAMINO)}>Ir al camino</GameLink>
        </section>
      ) : null}

      <div className="progreso__grid">
        <section className="card" aria-labelledby="progreso-teclado">
          <h2 id="progreso-teclado" className="card__title">
            Mapa de tu teclado
          </h2>
          <p className="card__sub">Acierto a la primera por tecla (desde 5 intentos)</p>
          <KeyHeatmap history={state.keys} notation={notation} />
          {review !== null ? (
            <div className="progreso__cta">
              <p>
                {review.reason === 'debiles' ? 'Tu tecla más floja es ' : 'La más lenta es '}
                <strong>{noteName(Number(review.keys[0]?.key ?? 60), notation)}</strong>. Tres
                minutos al día suben tu precisión.
              </p>
              <GameLink variant="secondary" href={hrefOf(lessonRoute(REVIEW_LESSON_ID))}>
                Practicar 3 min
              </GameLink>
            </div>
          ) : null}
        </section>

        <section className="card" aria-labelledby="progreso-precision">
          <h2 id="progreso-precision" className="card__title">
            Precisión por lección
          </h2>
          <AccuracyChart entries={state.history.slice(-CHART_LESSONS)} />
        </section>
      </div>

      <footer className="progreso__foot">
        {confirming ? (
          <div
            className="progreso__confirm"
            role="group"
            aria-label="Confirmar borrado"
            data-testid="confirmar-borrado"
          >
            <p>
              <Icon name="cross" size={18} /> ¿Seguro? Se borran las estrellas, la racha y las
              estadísticas de este navegador.
            </p>
            <div className="progreso__confirm-actions">
              <GameButton
                variant="secondary"
                onClick={() => {
                  progress.reset();
                  setConfirming(false);
                  // El botón pulsado desaparece: el foco pasa al título (se anuncia dónde estás).
                  headingRef.current?.focus({ preventScroll: true });
                }}
                data-testid="borrar-si"
              >
                Sí, borrar
              </GameButton>
              <GameButton variant="secondary" onClick={() => setConfirming(false)}>
                Cancelar
              </GameButton>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="progreso__reset"
            onClick={() => setConfirming(true)}
            data-testid="borrar"
          >
            Borrar mi progreso
          </button>
        )}
      </footer>
    </div>
  );
}
