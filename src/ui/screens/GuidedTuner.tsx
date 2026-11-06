import type { GuidedView } from '@/core/application/tuner-service';
import { LOW_TO_HIGH } from '@/core/domain/guided-tuning';
import { openStringName } from '@/core/domain/instrument';
import type { GuitarString } from '@/core/domain/instrument';
import type { NotationMode } from '@/core/domain/note';
import type { StringMarks } from '@/core/domain/string-board';
import { GameButton, GameLink } from '../game/GameButton';
import { caminoOf, hrefOf } from '../router/routes';
import { formatCents } from './tuner-messages';

/** «la cuerda 5 (La)». */
const stringLabel = (string: GuitarString, notation: NotationMode): string =>
  `cuerda ${string} (${openStringName(string, notation)})`;

/** Lo que dice la pasada al terminar: el título y la frase de debajo. */
export function guidedSummaryText(
  view: GuidedView,
  notation: NotationMode,
): { readonly title: string; readonly text: string } {
  if (view.complete && view.lap === 2) {
    return {
      title: 'Todo en su sitio',
      text: 'Ya puedes tocar. Si alguna suena rara, vuelve a afinarla.',
    };
  }
  if (view.complete) {
    return {
      title: 'Las 6 cuerdas, afinadas',
      text: 'Al tensar unas, otras se mueven. Repasa las 6 una vez más.',
    };
  }
  const missing = view.missing.map((string) => stringLabel(string, notation)).join(', ');
  return { title: 'Faltan cuerdas por afinar', text: `Faltan: ${missing}.` };
}

/** Lo que se anuncia al lector de pantalla cuando la guía avanza o termina (un solo aviso por paso). */
export function guidedAnnouncement(
  view: GuidedView | null,
  previous: GuidedView | null,
  marks: StringMarks,
  notation: NotationMode,
): string {
  if (view === null) return '';
  if (view.finished) {
    return view.complete ? guidedSummaryText(view, notation).title : 'Faltan cuerdas por afinar';
  }
  const current = view.queue[view.index];
  if (current === undefined) return '';
  const here = `Sigue la ${stringLabel(current, notation)}`;
  if (previous === null || previous.finished || previous.lap !== view.lap) {
    return `Modo guiado. ${here}`;
  }
  const before = previous.queue[previous.index];
  if (before === undefined || before === current) return '';
  const name = openStringName(before, notation);
  return marks[before] === 'afinada'
    ? `${name} afinada. ${here}`
    : `Pasas a la cuerda ${current}. ${here}`;
}

/** La cabecera de la guía: en qué cuerda va, los seis pasos y los controles. */
export function GuidedSteps({
  view,
  onSkip,
  onPause,
  onResume,
  onExit,
}: {
  readonly view: GuidedView;
  readonly onSkip: () => void;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onExit: () => void;
}) {
  return (
    <div className="tuner__guide" data-testid="tuner-guide">
      <div className="tuner__steps">
        <p className="tuner__steps-title" data-testid="tuner-guide-step">
          Cuerda {view.index + 1} de {view.queue.length} · vuelta {view.lap}
        </p>
        <ol className="tuner__steps-bar" aria-hidden="true">
          {view.queue.map((string, position) => (
            <li
              key={string}
              data-state={
                position < view.index ? 'hecha' : position === view.index ? 'actual' : 'pendiente'
              }
            />
          ))}
        </ol>
      </div>
      <div className="tuner__guide-actions">
        <GameButton onClick={onSkip} data-testid="guided-skip">
          Siguiente cuerda
        </GameButton>
        <GameButton
          variant="secondary"
          onClick={view.paused ? onResume : onPause}
          data-testid="guided-pause"
        >
          {view.paused ? 'Seguir' : 'Pausar'}
        </GameButton>
        <GameButton variant="secondary" onClick={onExit} data-testid="guided-exit">
          Salir de la guía
        </GameButton>
      </div>
      <p className="tuner__muted">
        Pasa sola cuando la cuerda queda afinada 1,5 s. Toca una clavija para saltar a otra. Esc
        sale de la guía.
      </p>
    </div>
  );
}

/** La pantalla final de la guía: cómo quedó cada cuerda y qué hacer ahora. */
export function GuidedSummary({
  view,
  marks,
  notation,
  onRepeat,
  onContinue,
  onExit,
}: {
  readonly view: GuidedView;
  readonly marks: StringMarks;
  readonly notation: NotationMode;
  readonly onRepeat: () => void;
  readonly onContinue: () => void;
  readonly onExit: () => void;
}) {
  const { title, text } = guidedSummaryText(view, notation);
  return (
    <div className="tuner__summary" data-testid="tuner-summary" data-complete={view.complete}>
      <h2 className="tuner__summary-title" data-testid="tuner-summary-title">
        {title}
      </h2>
      <p className="tuner__summary-text">{text}</p>
      <ul className="tuner__summary-list" aria-label="Cómo quedó cada cuerda">
        {LOW_TO_HIGH.map((string) => {
          const tuned = marks[string] === 'afinada';
          const cents = view.finals[string];
          return (
            <li key={string} data-tuned={tuned}>
              <span>Cuerda {string}</span>
              <span>{openStringName(string, notation)}</span>
              <span>{tuned && cents !== undefined ? `${formatCents(cents)} cents` : '—'}</span>
              <span className="tuner__summary-mark">{tuned ? '✓ afinada' : 'falta'}</span>
            </li>
          );
        })}
      </ul>
      <div className="tuner__guide-actions">
        {view.complete && view.lap === 1 ? (
          <>
            <GameButton onClick={onRepeat} data-testid="guided-repeat">
              Repasar las 6
            </GameButton>
            <GameLink
              variant="secondary"
              href={hrefOf(caminoOf('guitarra'))}
              data-testid="guided-lessons"
            >
              Ir a las lecciones
            </GameLink>
            <GameButton variant="secondary" onClick={onExit} data-testid="guided-exit">
              Seguir afinando
            </GameButton>
          </>
        ) : view.complete ? (
          <>
            <GameLink href={hrefOf(caminoOf('guitarra'))} data-testid="guided-lessons">
              Ir a las lecciones
            </GameLink>
            <GameButton variant="secondary" onClick={onExit} data-testid="guided-exit">
              Seguir afinando
            </GameButton>
          </>
        ) : (
          <>
            <GameButton onClick={onContinue} data-testid="guided-continue">
              Seguir con las que faltan
            </GameButton>
            <GameButton variant="secondary" onClick={onExit} data-testid="guided-exit">
              Salir de la guía
            </GameButton>
          </>
        )}
      </div>
    </div>
  );
}
