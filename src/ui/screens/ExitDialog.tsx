import { useEffect, useRef } from 'react';
import { GameButton } from '../game/GameButton';

/**
 * «¿Salir de la lección?»: aparece al pulsar la X con la ronda a medias. La ronda queda en pausa
 * mientras tanto. El foco entra en «Seguir» (lo seguro) y `Esc` equivale a seguir.
 */
export function ExitDialog({
  onContinue,
  onExit,
}: {
  readonly onContinue: () => void;
  readonly onExit: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onContinue();
      } else if (event.key === 'Tab') {
        // El foco no sale del diálogo con el tabulador.
        const buttons = dialogRef.current?.querySelectorAll<HTMLElement>('button');
        const first = buttons?.[0];
        const last = buttons?.[buttons.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onContinue]);

  return (
    <div className="exit-backdrop" data-testid="exit-backdrop">
      <div
        ref={dialogRef}
        className="exit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-title"
        aria-describedby="exit-text"
        data-testid="exit-dialog"
      >
        <h2 id="exit-title" className="exit-dialog__title">
          ¿Salir de la lección?
        </h2>
        <p id="exit-text" className="exit-dialog__text">
          Si sales ahora, esta ronda no se guarda.
        </p>
        <div className="exit-dialog__actions">
          <GameButton autoFocus onClick={onContinue} data-testid="exit-continue">
            Seguir
          </GameButton>
          <GameButton variant="secondary" onClick={onExit} data-testid="exit-leave">
            Salir sin guardar
          </GameButton>
        </div>
      </div>
    </div>
  );
}
