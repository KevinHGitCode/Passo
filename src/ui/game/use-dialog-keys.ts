import { useEffect } from 'react';
import type { RefObject } from 'react';

const FOCUSABLE = 'button, a[href]';

/**
 * Las teclas de una ventana modal: `Esc` la cierra y el tabulador da la vuelta dentro de ella (el foco no
 * llega a lo que hay detrás).
 */
export function useDialogKeys(
  dialogRef: RefObject<HTMLElement | null>,
  onEscape: () => void,
): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onEscape();
      } else if (event.key === 'Tab') {
        const items = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
        const first = items?.[0];
        const last = items?.[items.length - 1];
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
  }, [dialogRef, onEscape]);
}
