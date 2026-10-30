import { useRef, useState, useSyncExternalStore } from 'react';
import type { ProgressService } from '@/core/application/progress-service';
import { INSTRUMENT_LABELS, noteLabel } from '@/core/domain/instrument';
import type { Instrument } from '@/core/domain/instrument';
import { MIN_SAMPLES, historyOf, keyNotes, keyStats } from '@/core/domain/key-stats';
import { findLesson, lessonsFor } from '@/core/domain/lessons';
import type { NotationMode } from '@/core/domain/note';
import { currentStreak, progressSummary } from '@/core/domain/progress';
import { reviewLessonId, selectReview } from '@/core/domain/review';
import { guitarNoteText } from '../practice/target-text';
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
/** Las notas de guitarra que más cuestan (con 5 intentos o más), de la más floja a la menos. */
function GuitarWeakNotes({
  keys,
  notation,
}: {
  readonly keys: ReturnType<typeof historyOf>;
  readonly notation: NotationMode;
}) {
  const weakest = keyStats(keys)
    .filter((stat) => stat.samples >= MIN_SAMPLES)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 5);
  if (weakest.length === 0) {
    return (
      <p className="card__sub" data-testid="guitarra-sin-datos">
        Aquí aparecen las notas que más te cuestan cuando llevas 5 intentos en cada una.
      </p>
    );
  }
  return (
    <ul className="weak" data-testid="guitarra-notas">
      {weakest.map((stat) => (
        <li key={stat.key} className="weak__item">
          <span className="weak__name">
            {guitarNoteText(keyNotes(stat.key)[0] ?? 40, notation)}
          </span>
          <span className="weak__value">{Math.round(stat.accuracy * 100)} % a la primera</span>
        </li>
      ))}
    </ul>
  );
}

export function ProgressScreen({
  progress,
  notation,
  instrument = 'piano',
}: {
  readonly progress: ProgressService;
  readonly notation: NotationMode;
  readonly instrument?: Instrument;
}) {
  const { state, saved } = useSyncExternalStore(progress.subscribe, progress.getSnapshot);
  const [confirming, setConfirming] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Las medias y la curva son del instrumento; el tiempo, los días y la experiencia son de todos.
  const history = state.history.filter(
    (entry) => (findLesson(entry.lesson)?.instrument ?? 'piano') === instrument,
  );
  const summary = progressSummary({ ...state, history });
  const level = pianistLevel(state.xp);
  const lessons = lessonsFor(instrument);
  const done = lessons.filter((lesson) => (state.lessons[lesson.id]?.stars ?? 0) >= 1).length;
  const streak = currentStreak(state, progress.today());
  const review = selectReview(state.keys, instrument);
  const ownKeys = historyOf(state.keys, instrument);
  const empty = history.length === 0 && Object.keys(ownKeys).length === 0;

  return (
    <div className="progreso" data-testid="progreso">
      <header className="progreso__head">
        <h1 id="progreso-titulo" tabIndex={-1} data-route-heading ref={headingRef}>
          Progreso
        </h1>
        <p className="progreso__sub">
          {instrument === 'guitarra' ? `${INSTRUMENT_LABELS[instrument]}: ` : ''}
          {done} de {lessons.length} lecciones hechas
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
          <p className="kpi__label">Tu nivel</p>
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
            {instrument === 'guitarra' ? 'Notas que más cuestan' : 'Mapa de tu teclado'}
          </h2>
          {instrument === 'guitarra' ? (
            <GuitarWeakNotes keys={ownKeys} notation={notation} />
          ) : (
            <>
              <p className="card__sub">Acierto a la primera por tecla (desde 5 intentos)</p>
              <KeyHeatmap history={state.keys} notation={notation} />
            </>
          )}
          {review !== null ? (
            <div className="progreso__cta">
              <p>
                {review.reason === 'debiles'
                  ? instrument === 'guitarra'
                    ? 'Tu nota más floja es '
                    : 'Tu tecla más floja es '
                  : 'La más lenta es '}
                <strong>
                  {noteLabel(keyNotes(review.keys[0]?.key ?? '60')[0] ?? 60, notation, instrument)}
                </strong>
                . Tres minutos al día suben tu precisión.
              </p>
              <GameLink variant="secondary" href={hrefOf(lessonRoute(reviewLessonId(instrument)))}>
                Practicar 3 min
              </GameLink>
            </div>
          ) : null}
        </section>

        <section className="card" aria-labelledby="progreso-precision">
          <h2 id="progreso-precision" className="card__title">
            Precisión por lección
          </h2>
          <AccuracyChart entries={history.slice(-CHART_LESSONS)} />
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
