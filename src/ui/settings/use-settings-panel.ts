import { useCallback, useEffect, useRef, useState } from 'react';
import type { PracticeSession } from '@/core/application/practice-session';

export interface SettingsPanelControl {
  readonly open: boolean;
  readonly toggle: () => void;
  readonly close: () => void;
}

/**
 * Abrir los ajustes pausa la ronda y cerrarlos la reanuda (solo si la pausó el panel: una pausa
 * por pérdida de la entrada o una pausa manual previa no se tocan). `Ctrl+,` abre y cierra; `Esc` cierra.
 */
export function useSettingsPanel(session: PracticeSession): SettingsPanelControl {
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const pausedByPanel = useRef(false);

  const show = useCallback(() => {
    if (session.getSnapshot().phase === 'en-curso') {
      session.pause();
      pausedByPanel.current = true;
    }
    openRef.current = true;
    setOpen(true);
  }, [session]);

  const close = useCallback(() => {
    openRef.current = false;
    setOpen(false);
    if (!pausedByPanel.current) return;
    pausedByPanel.current = false;
    const { phase, pauseReason } = session.getSnapshot();
    if (phase === 'pausada' && pauseReason === 'manual') session.resume();
  }, [session]);

  const toggle = useCallback(() => (openRef.current ? close() : show()), [close, show]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && !event.altKey && !event.metaKey && event.key === ',') {
        event.preventDefault();
        toggle();
      } else if (event.key === 'Escape' && openRef.current) {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle, close]);

  return { open, toggle, close };
}
