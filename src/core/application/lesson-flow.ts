import { findLesson, lessonConfig, playBlock } from '../domain/lessons';
import type { Lesson, PlayContext } from '../domain/lessons';
import type { RoundConfig } from '../domain/exercise';
import type { ResultGains } from '../domain/progress';
import { scoreLesson } from '../domain/scoring';
import type { LessonScore } from '../domain/scoring';
import type { Unsubscribe } from '../ports/note-input';
import type { ProgressService } from './progress-service';
import type { CompletedRound, PracticeSession } from './practice-session';

/**
 * Dónde está la persona respecto a una lección.
 * - `libre`: no hay lección (la práctica libre, el camino o el progreso).
 * - `lista`: la lección está preparada; falta pulsar «Empezar» (o activar la entrada).
 * - `en-curso`: la ronda de la lección está jugándose (o en pausa).
 * - `resultado`: la ronda terminó y ya está puntuada y guardada.
 */
export type LessonStatus = 'libre' | 'lista' | 'en-curso' | 'resultado';

export interface LessonOutcome {
  readonly lesson: Lesson;
  readonly score: LessonScore;
  readonly gains: ResultGains;
  /** Identifica la ronda: anotarla dos veces no suma dos veces. */
  readonly roundId: string;
}

export interface LessonFlowSnapshot {
  readonly status: LessonStatus;
  readonly lessonId: string | null;
  readonly outcome: LessonOutcome | null;
}

export interface LessonFlowDeps {
  readonly session: PracticeSession;
  readonly progress: ProgressService;
  /** Con qué entradas se puede tocar ahora y si la beta de varias notas está activa. */
  readonly playContext: () => PlayContext;
}

const FREE: LessonFlowSnapshot = { status: 'libre', lessonId: null, outcome: null };

/**
 * El flujo de una lección: la prepara en la sesión, nota cuándo empieza y cuándo termina su ronda, la
 * puntúa y guarda el resultado **una sola vez**. Vive entre la sesión de práctica y el progreso; ni
 * la interfaz ni la sesión conocen a la otra parte.
 *
 * Una ronda solo cuenta si se juega con la configuración de **esta** lección (se compara por
 * identidad): lo que se juegue en la práctica libre nunca se guarda como lección. Salir a media
 * lección no guarda nada.
 */
export class LessonFlow {
  private readonly session: PracticeSession;
  private readonly progress: ProgressService;
  private readonly playContext: () => PlayContext;
  private snapshot: LessonFlowSnapshot = FREE;
  private lesson: Lesson | null = null;
  private config: RoundConfig | null = null;
  private rounds = 0;
  private readonly listeners = new Set<() => void>();
  private readonly subscriptions: Unsubscribe[] = [];

  constructor(deps: LessonFlowDeps) {
    this.session = deps.session;
    this.progress = deps.progress;
    this.playContext = deps.playContext;
    this.subscriptions.push(this.session.subscribe(() => this.onSession()));
    this.subscriptions.push(this.session.subscribeRounds((round) => this.onRound(round)));
  }

  getSnapshot = (): LessonFlowSnapshot => this.snapshot;

  subscribe = (listener: () => void): Unsubscribe => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Hay una lección en marcha: las preferencias no deben cambiar el ejercicio. */
  isActive = (): boolean => this.snapshot.status !== 'libre';

  /**
   * Prepara una lección (queda `lista`). Es idempotente: pedir la que ya está preparada, en curso o
   * con su resultado a la vista no cambia nada (así vale desde un efecto aunque React lo repita).
   */
  prepare(lessonId: string): void {
    const lesson = findLesson(lessonId);
    if (lesson === null) {
      this.leave();
      return;
    }
    if (this.lesson?.id === lesson.id && this.snapshot.status !== 'libre') return;
    this.enter(lesson);
  }

  /** Empieza la ronda si la lección está lista y se puede tocar con la entrada actual. */
  begin(): boolean {
    if (this.lesson === null || this.snapshot.status !== 'lista') return false;
    if (playBlock(this.lesson, this.playContext()) !== null) return false;
    this.session.start();
    return true;
  }

  /** Vuelve a dejar la misma lección lista (para repetirla). */
  retry(): void {
    if (this.lesson !== null) this.enter(this.lesson);
  }

  /** Descarta la ronda en curso sin guardar (p. ej. la entrada ya no sirve para esta lección). */
  abandonRound(): void {
    if (this.snapshot.status === 'en-curso') this.session.reset();
  }

  /** Sale de la lección sin guardar nada. La sesión queda en la bienvenida. */
  leave(): void {
    if (this.snapshot.status === 'libre') return;
    this.lesson = null;
    this.config = null;
    // Primero se vacía la sesión y después se avisa: quien restaura el ejercicio de las
    // preferencias lo encuentra ya inactivo y no empieza una ronda nueva.
    this.session.reset();
    this.set(FREE);
  }

  dispose(): void {
    this.subscriptions.splice(0).forEach((unsubscribe) => unsubscribe());
    this.listeners.clear();
  }

  private enter(lesson: Lesson): void {
    this.lesson = lesson;
    this.config = lessonConfig(lesson);
    this.session.reset();
    this.session.configure(this.config);
    this.set({ status: 'lista', lessonId: lesson.id, outcome: null });
  }

  /** La sesión cambió: ¿empezó la ronda de la lección, o se abandonó (p. ej. al cambiar de entrada)? */
  private onSession(): void {
    if (this.lesson === null || this.config === null) return;
    const { phase, exercise } = this.session.getSnapshot();
    const ours = exercise?.config === this.config;
    if (this.snapshot.status === 'lista' && ours && (phase === 'en-curso' || phase === 'pausada')) {
      this.rounds += 1;
      this.set({ ...this.snapshot, status: 'en-curso' });
    } else if (this.snapshot.status === 'en-curso' && phase === 'inactiva') {
      this.set({ ...this.snapshot, status: 'lista' });
    }
  }

  private onRound(round: CompletedRound): void {
    if (this.lesson === null || this.snapshot.status !== 'en-curso') return;
    if (round.config !== this.config) return;
    const lesson = this.lesson;
    const score = scoreLesson(round.attempts, lesson);
    const roundId = `${lesson.id}#${this.rounds}`;
    const gains = this.progress.record({ lesson, score, attempts: round.attempts }, roundId);
    this.set({
      status: 'resultado',
      lessonId: lesson.id,
      outcome: { lesson, score, gains, roundId },
    });
  }

  private set(next: LessonFlowSnapshot): void {
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
}
