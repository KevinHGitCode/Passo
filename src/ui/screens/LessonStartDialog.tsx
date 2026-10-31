import { useEffect, useRef } from 'react';
import type { Lesson } from '@/core/domain/lessons';
import type { InputSource } from '@/core/domain/note-event';
import { GameButton, GameLink } from '../game/GameButton';
import { Stars } from '../game/Stars';
import type { StarCount } from '../game/Stars';
import { useDialogKeys } from '../game/use-dialog-keys';
import { hrefOf, lessonRoute } from '../router/routes';
import { countLabel } from '../practice/target-text';
import { lessonKindText, thirdStarGoalText } from './lesson-live';

/**
 * La ventanita que sale al tocar una lección del camino: qué se va a tocar, cuánto hay que acertar y un
 * «Empezar» (o «Repetir» si ya está hecha). Solo la lección se abre desde aquí: no se entra de golpe. El
 * foco entra en «Empezar» y `Esc` o «Ahora no» la cierran sin cambiar nada.
 */
export function LessonStartDialog({
  lesson,
  stars,
  done,
  source,
  onClose,
}: {
  readonly lesson: Lesson;
  readonly stars: StarCount;
  /** La lección ya está hecha (≥ 1 estrella): el botón dice «Repetir». */
  readonly done: boolean;
  readonly source: InputSource | null;
  readonly onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogKeys(dialogRef, onClose);
  // React solo enfoca solo botones y campos: el enlace «Empezar» recibe el foco a mano.
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('[data-testid="start-lesson"]')?.focus();
  }, []);
  return (
    <div
      className="start-backdrop"
      data-testid="start-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="start-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="start-title"
        aria-describedby="start-text"
        data-testid="start-dialog"
        data-lesson={lesson.id}
        data-kind={lesson.kind}
      >
        <p className="start-dialog__kind">{lessonKindText(lesson)}</p>
        <h2 id="start-title" className="start-dialog__title">
          {lesson.title}
        </h2>
        <Stars value={stars} size="md" />
        <p id="start-text" className="start-dialog__text">
          {lesson.roundSize} {countLabel(lesson.mode).toLowerCase()} · Para pasar: 70 % · 3.ª
          estrella: {thirdStarGoalText(lesson, source)}
        </p>
        <div className="start-dialog__actions">
          <GameLink size="lg" href={hrefOf(lessonRoute(lesson.id))} data-testid="start-lesson">
            {done ? 'Repetir' : 'Empezar'}
          </GameLink>
          <GameButton variant="secondary" onClick={onClose} data-testid="start-cancel">
            Ahora no
          </GameButton>
        </div>
      </div>
    </div>
  );
}
