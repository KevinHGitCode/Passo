import { useEffect } from 'react';
import { AJUSTES, navigate } from '../router/routes';
import { leaveSettings } from './SettingsScreen';

/** `Ctrl+,` abre los ajustes (y, estando en ellos, vuelve a donde se estaba). */
export function useSettingsShortcut(inSettings: boolean): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && !event.altKey && !event.metaKey && event.key === ',') {
        event.preventDefault();
        if (inSettings) leaveSettings();
        else navigate(AJUSTES);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [inSettings]);
}
