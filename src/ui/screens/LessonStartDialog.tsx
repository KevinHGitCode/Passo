import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Lesson } from '@/core/domain/lessons';
import type { InputSource } from '@/core/domain/note-event';
import { GameButton, GameLink } from '../game/GameButton';
import { Stars } from '../game/Stars';
import type { StarCount } from '../game/Stars';
import { useDialogKeys } from '../game/use-dialog-keys';
import { hrefOf, lessonRoute } from '../router/routes';
import { countLabel } from '../practice/target-text';
import { lessonKindText, thirdStarGoalText } from './lesson-live';

/** El % va pegado a su número (si no, en pantallas estrechas se parte la línea entre los dos). */
const NBSP = '\u00a0';

const MARGIN = 8;
const GAP = 14;
const MAX_WIDTH = 340;

/**
 * El globo que sale al tocar una lección del camino, pegado al nodo y señalándolo con una flecha: qué se va a
 * tocar, cuánto hay que acertar y un «Empezar» (o «Repetir» si ya está hecha). Solo la lección se abre desde
 * aquí: no se entra de golpe. El foco entra en «Empezar» y `Esc`, «Ahora no» o pulsar fuera la cierran sin
 * cambiar nada. Se coloca debajo del nodo dentro de su contenedor posicionado (así se mueve con el
 * desplazamiento de la página).
 */
export function LessonStartDialog({
  lesson,
  stars,
  done,
  source,
  anchor,
  onClose,
}: {
  readonly lesson: Lesson;
  readonly stars: StarCount;
  /** La lección ya está hecha (≥ 1 estrella): el botón dice «Repetir». */
  readonly done: boolean;
  readonly source: InputSource | null;
  /** El nodo desde el que se abrió: el globo se coloca debajo de él y lo señala. */
  readonly anchor: HTMLElement | null;
  readonly onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogKeys(dialogRef, onClose);

  // Debajo del nodo, centrado en él pero sin salirse del contenedor; la flecha apunta al centro del nodo.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const host = dialog?.offsetParent;
    if (!dialog || !(host instanceof HTMLElement) || !anchor) return;
    const place = () => {
      const hostBox = host.getBoundingClientRect();
      const box = anchor.getBoundingClientRect();
      // Por debajo de todo el nodo (también de sus estrellas), no solo del círculo.
      const bottom = (anchor.closest('.path__item') ?? anchor).getBoundingClientRect().bottom;
      if (hostBox.width === 0) return;
      const width = Math.min(MAX_WIDTH, hostBox.width - 2 * MARGIN);
      const center = box.left + box.width / 2 - hostBox.left;
      const left = Math.max(MARGIN, Math.min(center - width / 2, hostBox.width - width - MARGIN));
      dialog.style.width = `${width}px`;
      dialog.style.left = `${left}px`;
      dialog.style.top = `${Math.max(box.bottom, bottom) - hostBox.top + GAP}px`;
      dialog.style.setProperty(
        '--arrow-x',
        `${Math.max(22, Math.min(center - left, width - 22))}px`,
      );
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [anchor]);

  // Si el globo queda fuera de la pantalla, se desplaza lo justo para verlo entero.
  useEffect(() => {
    dialogRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, []);
  // React solo enfoca solo botones y campos: el enlace «Empezar» recibe el foco a mano.
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('[data-testid="start-lesson"]')?.focus();
  }, []);
  return (
    <>
      <div
        className="start-backdrop"
        data-testid="start-backdrop"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      />
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
          {lesson.roundSize} {countLabel(lesson.mode).toLowerCase()} · Para pasar: 70{NBSP}% · 3.ª
          estrella: {thirdStarGoalText(lesson, source).replaceAll(' %', `${NBSP}%`)}
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
    </>
  );
}
