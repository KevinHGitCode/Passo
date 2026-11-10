import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { PreferencesService } from '@/core/application/preferences-service';
import { THEME_CHOICES } from '@/core/domain/preferences';
import type { ThemeChoice } from '@/core/domain/preferences';

export type { ThemeChoice };

/** El color de la barra del navegador (móvil) con un tema elegido a mano: el `--surface` de tokens.css. */
const THEME_COLOR: Readonly<Record<Exclude<ThemeChoice, 'auto'>, string>> = {
  claro: '#ffffff',
  oscuro: '#171c25',
};

function apply(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
  // En automático mandan las dos etiquetas de index.html (una por esquema); a mano, una propia que gana.
  const own = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"][data-passo]');
  if (choice === 'auto') {
    own?.remove();
    return;
  }
  const meta = own ?? document.createElement('meta');
  meta.name = 'theme-color';
  meta.dataset['passo'] = '';
  meta.content = THEME_COLOR[choice];
  if (own === null) document.head.prepend(meta);
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
