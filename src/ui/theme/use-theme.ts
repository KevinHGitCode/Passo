import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { PreferencesService } from '@/core/application/preferences-service';
import { THEME_CHOICES } from '@/core/domain/preferences';
import type { ThemeChoice } from '@/core/domain/preferences';

export type { ThemeChoice };

function apply(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

/** Aplica el tema guardado antes del primer pintado (evita el parpadeo claro → oscuro). */
export function initTheme(choice: ThemeChoice): void {
  apply(choice);
}

/** Tema claro/oscuro/automático; se recuerda con el resto de las preferencias. */
export function useTheme(preferences: PreferencesService): readonly [ThemeChoice, () => void] {
  const { theme } = useSyncExternalStore(preferences.subscribe, preferences.getSnapshot);

  useEffect(() => {
    apply(theme);
  }, [theme]);

  const cycle = useCallback(() => {
    const next = THEME_CHOICES[(THEME_CHOICES.indexOf(theme) + 1) % THEME_CHOICES.length] ?? 'auto';
    preferences.update({ theme: next });
  }, [theme, preferences]);

  return [theme, cycle];
}
