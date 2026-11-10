import { useEffect } from 'react';
import type { Instrument } from '@/core/domain/instrument';
import { AJUSTES, ajustesOf, navigate } from '../router/routes';
import { leaveSettings } from './SettingsScreen';

/** `Ctrl+,` abre los ajustes del instrumento con el que se está (y, estando en ellos, vuelve a donde se estaba). */
export function useSettingsShortcut(inSettings: boolean, instrument?: Instrument): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && !event.altKey && !event.metaKey && event.key === ',') {
        event.preventDefault();
        if (inSettings) leaveSettings();
        else navigate(instrument === undefined ? AJUSTES : ajustesOf(instrument));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [inSettings, instrument]);
}
