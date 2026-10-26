import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';
import type { ProgressService } from '@/core/application/progress-service';
import { LESSONS, UNITS, currentLesson, lessonAccessMap, playBlock } from '@/core/domain/lessons';
import type { Lesson, PlayContext, Unit } from '@/core/domain/lessons';
import { noteName } from '@/core/domain/note';
import type { NotationMode } from '@/core/domain/note';
import {
  DAILY_GOAL_MINUTES,
  currentStreak,
  minutesOn,
  starsOf,
  weekActivity,
} from '@/core/domain/progress';
import type { Progress } from '@/core/domain/progress';
import { REVIEW_LESSON_ID, selectReview } from '@/core/domain/review';
import { pianistLevel } from '@/core/domain/scoring';
import { GameButton, GameLink } from '../game/GameButton';
import { Icon } from '../game/icons';
import { LessonNode } from '../game/LessonNode';
import type { NodeState } from '../game/LessonNode';
import type { StarCount } from '../game/Stars';
import { hrefOf, lessonRoute } from '../router/routes';
import { inputName } from './lesson-live';
import './camino.css';

/** Cuánto se desvía cada nodo a un lado (en píxeles): una ola suave. */
const SHIFTS = [0, 52, 78, 52, 0, -52, -78, -52] as const;

const WEEKDAY_INITIALS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;
const WEEKDAY_NAMES = [
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
  'domingo',
] as const;

const REASON_BEFORE = 'Termina la lección anterior para abrir esta.';
const REASON_UNIT =
  'Termina la unidad anterior, o aprueba su prueba con 2 estrellas, para abrir esta.';
const REASON_INPUT =
  'Necesita piano MIDI o teclado del PC, o la beta «Oír varias notas a la vez» del micrófono.';

export interface CaminoScreenProps {
  readonly progress: ProgressService;
  /** Con qué se puede tocar ahora (decide qué lecciones están disponibles). */
  readonly play: PlayContext;
  readonly notation: NotationMode;
  /** Abre el panel de ajustes (lo piden los nodos bloqueados por la entrada). */
  readonly onOpenSettings: () => void;
}

interface Explanation {
  readonly text: string;
  readonly settings: boolean;
  /** La entrada con la que se explicó: si cambia, la explicación ya no vale. */
  readonly play: PlayContext;
}

function nodeStateOf(
  lesson: Lesson,
  access: ReturnType<typeof lessonAccessMap>,
  current: Lesson | null,
  play: PlayContext,
): NodeState {
  const access_ = access.get(lesson.id);
  if (access_ === 'hecha') return 'hecha';
  if (access_ === 'bloqueada') return 'bloqueada';
  if (playBlock(lesson, play) !== null) return 'bloqueada-entrada';
  return lesson.id === current?.id ? 'actual' : 'abierta';
}

function Chips({
  streak,
  today,
  xp,
  minutes,
}: {
  readonly streak: number;
  readonly today: boolean;
  readonly xp: number;
  /** Minutos practicados hoy (para la meta del día en pantallas estrechas). */
  readonly minutes: number;
}) {
  return (
    <>
      <span className="chip chip--streak">
        <Icon name="flame" size={18} />
        <span>
          {streak > 0
            ? `${streak} ${streak === 1 ? 'día' : 'días'}`
            : today
              ? 'Hoy ya está'
              : 'Empieza hoy'}
        </span>
      </span>
      <span className="chip chip--xp">
        <Icon name="bolt" size={18} />
        <span>{xp.toLocaleString('es')} XP</span>
      </span>
      <span className="chip chip--goal" data-testid="chip-meta">
        <span>
          {Math.min(DAILY_GOAL_MINUTES, Math.floor(minutes))} / {DAILY_GOAL_MINUTES} min hoy
        </span>
      </span>
    </>
  );
}

function SideCards({
  state,
  today,
  notation,
}: {
  readonly state: Progress;
  readonly today: string;
  readonly notation: NotationMode;
}) {
  const streak = currentStreak(state, today);
  const week = weekActivity(state, today);
  const minutes = minutesOn(state, today);
  const level = pianistLevel(state.xp);
  const review = selectReview(state.keys);
  const practicedToday = week.some((day) => day.today && day.practiced);
  return (
    <>
      <section className="card" aria-labelledby="card-racha">
        <h2 id="card-racha" className="card__title">
          Racha
        </h2>
        <p className="card__big">
          <Icon name="flame" size={28} />
          <span>
            {streak > 0
              ? `${streak} ${streak === 1 ? 'día' : 'días'} seguidos`
              : practicedToday
                ? 'Hoy ya está'
                : 'Empieza hoy'}
          </span>
        </p>
        <ol
          className="week"
          aria-label={`Esta semana practicaste: ${
            week
              .map((day, i) => (day.practiced ? WEEKDAY_NAMES[i] : null))
              .filter(Boolean)
              .join(', ') || 'ningún día todavía'
          }`}
        >
          {week.map((day, i) => (
            <li
              key={day.day}
              className="week__day"
              data-practiced={day.practiced}
              data-today={day.today}
              data-future={day.future}
            >
              <span className="week__dot" aria-hidden="true" />
              <span className="week__label" aria-hidden="true">
                {WEEKDAY_INITIALS[i]}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="card" aria-labelledby="card-meta">
        <h2 id="card-meta" className="card__title">
          Meta de hoy
        </h2>
        <div
          className="bar"
          role="progressbar"
          aria-label={`Meta diaria: ${Math.floor(minutes)} de ${DAILY_GOAL_MINUTES} minutos`}
          aria-valuemin={0}
          aria-valuemax={DAILY_GOAL_MINUTES}
          aria-valuenow={Math.min(DAILY_GOAL_MINUTES, Math.floor(minutes))}
        >
          <div
            className="bar__fill"
            style={{ width: `${Math.min(100, (minutes / DAILY_GOAL_MINUTES) * 100)}%` }}
          />
        </div>
        <p className="card__note">
          {Math.min(DAILY_GOAL_MINUTES, Math.floor(minutes))} / {DAILY_GOAL_MINUTES} min
        </p>
      </section>

      <section className="card" aria-labelledby="card-nivel">
        <h2 id="card-nivel" className="card__title">
          Tu nivel
        </h2>
        <p className="card__big card__big--text">
          Nivel {level.level} · {level.name}
        </p>
        {level.xpForNext !== null ? (
          <>
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
            <p className="card__note">
              {level.xpIntoLevel} / {level.xpForNext} XP
            </p>
          </>
        ) : null}
      </section>

      {review !== null ? (
        <section className="card" aria-labelledby="card-debiles" data-testid="card-debiles">
          <h2 id="card-debiles" className="card__title">
            {review.reason === 'debiles' ? 'Puntos débiles' : 'Lo más lento'}
          </h2>
          <ul className="weak">
            {review.keys.map((stat) => (
              <li key={stat.key} className="weak__item">
                <span className="weak__name">{noteName(Number(stat.key), notation)}</span>
                <span className="weak__value">{Math.round(stat.accuracy * 100)} %</span>
              </li>
            ))}
          </ul>
          <GameLink
            variant="secondary"
            block
            href={hrefOf(lessonRoute(REVIEW_LESSON_ID))}
            data-testid="practicar-debiles"
          >
            Practicar 3 min
          </GameLink>
        </section>
      ) : null}
    </>
  );
}

function UnitSection({
  unit,
  state,
  access,
  current,
  play,
  firstVisit,
  onExplain,
}: {
  readonly unit: Unit;
  readonly state: Progress;
  readonly access: ReturnType<typeof lessonAccessMap>;
  readonly current: Lesson | null;
  readonly play: PlayContext;
  readonly firstVisit: boolean;
  readonly onExplain: (text: string, settings: boolean) => void;
}) {
  const stars = starsOf(state);
  const done = unit.lessons.filter((lesson) => stars(lesson.id) >= 1).length;
  return (
    <li className="unit" data-unit={unit.id}>
      <section aria-labelledby={`unit-${unit.id}`}>
        <header className="unit__banner">
          <div className="unit__text">
            <p className="unit__kicker">
              Unidad {unit.number}
              {unit.optional ? ' · Opcional' : ''}
            </p>
            <h2 id={`unit-${unit.id}`} className="unit__title">
              {unit.title}
            </h2>
            <p className="unit__summary">{unit.summary}</p>
          </div>
          <p className="unit__count">
            <span aria-hidden="true">
              {done}/{unit.lessons.length}
            </span>
            <span className="sr-only">
              {done} de {unit.lessons.length} lecciones hechas
            </span>
          </p>
        </header>
        <ol className="path">
          {unit.lessons.map((lesson, index) => {
            const nodeState = nodeStateOf(lesson, access, current, play);
            const globalIndex = LESSONS.indexOf(lesson);
            const shift = SHIFTS[globalIndex % SHIFTS.length] ?? 0;
            const reason =
              nodeState === 'bloqueada-entrada'
                ? REASON_INPUT
                : nodeState === 'bloqueada'
                  ? index === 0
                    ? REASON_UNIT
                    : REASON_BEFORE
                  : undefined;
            return (
              <li
                key={lesson.id}
                className="path__item"
                style={{ '--shift': `${shift}px` } as CSSProperties}
              >
                <LessonNode
                  state={nodeState}
                  kind={lesson.kind}
                  title={lesson.title}
                  stars={stars(lesson.id) as StarCount}
                  href={hrefOf(lessonRoute(lesson.id))}
                  reason={reason}
                  bubble={firstVisit && lesson.id === 'u1-1' ? 'Empieza aquí' : 'Empezar'}
                  onExplain={
                    reason ? () => onExplain(reason, nodeState === 'bloqueada-entrada') : undefined
                  }
                  data-testid={`node-${lesson.id}`}
                />
              </li>
            );
          })}
        </ol>
      </section>
    </li>
  );
}

/** El camino de aprendizaje: unidades con sus lecciones, y a un lado la racha, la meta y lo débil. */
export function CaminoScreen({ progress, play, notation, onOpenSettings }: CaminoScreenProps) {
  const { state, saved } = useSyncExternalStore(progress.subscribe, progress.getSnapshot);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const noteRef = useRef<HTMLDivElement>(null);
  const today = progress.today();
  const access = lessonAccessMap(starsOf(state));
  const current = currentLesson(access, starsOf(state));
  const firstVisit = Object.keys(state.lessons).length === 0;
  const streak = currentStreak(state, today);
  const practicedToday = (state.daily[today]?.lessons ?? 0) > 0;
  const source = play.sources.length === 1 ? (play.sources[0] ?? null) : null;

  // Al abrir el camino se centra tu lección (con 30 lecciones, si no, siempre empezarías arriba).
  useEffect(() => {
    document.querySelector('.game-node--actual')?.scrollIntoView?.({ block: 'center' });
  }, []);

  // La explicación de un bloqueo se ve aunque esté lejos del nodo (y caduca si cambia la entrada).
  useEffect(() => {
    if (explanation) noteRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [explanation]);

  return (
    <div className="camino" data-testid="camino">
      <div className="camino__main">
        <h1 id="camino-titulo" tabIndex={-1} data-route-heading>
          Aprender
        </h1>
        <p className="camino__input" data-testid="camino-entrada">
          Tocas con: <strong>{inputName(source)}</strong>{' '}
          <button type="button" className="link-button" onClick={onOpenSettings}>
            Cambiar
          </button>
        </p>
        <div className="camino__chips">
          <Chips
            streak={streak}
            today={practicedToday}
            xp={state.xp}
            minutes={minutesOn(state, today)}
          />
        </div>
        {!saved ? (
          <p className="camino__warn" role="status" data-testid="no-guarda">
            Aquí no se guarda tu progreso: solo dura mientras tengas esta pestaña abierta.
          </p>
        ) : null}
        {explanation && explanation.play === play ? (
          <div className="camino__note" role="status" data-testid="explicacion" ref={noteRef}>
            <p>{explanation.text}</p>
            {explanation.settings ? (
              <GameButton variant="secondary" onClick={onOpenSettings}>
                Abrir ajustes
              </GameButton>
            ) : null}
          </div>
        ) : null}
        <ol className="units">
          {UNITS.map((unit) => (
            <UnitSection
              key={unit.id}
              unit={unit}
              state={state}
              access={access}
              current={current}
              play={play}
              firstVisit={firstVisit}
              onExplain={(text, settings) => setExplanation({ text, settings, play })}
            />
          ))}
        </ol>
      </div>
      <aside className="camino__side" aria-label="Tu día">
        <SideCards state={state} today={today} notation={notation} />
      </aside>
    </div>
  );
}
