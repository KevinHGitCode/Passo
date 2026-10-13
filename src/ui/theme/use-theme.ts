import { useCallback, useEffect, useState } from 'react';

export type ThemeChoice = 'auto' | 'claro' | 'oscuro';

const STORAGE_KEY = 'passo.tema';
const CHOICES: readonly ThemeChoice[] = ['auto', 'claro', 'oscuro'];

function readStored(): ThemeChoice {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return CHOICES.find((choice) => choice === value) ?? 'auto';
  } catch {
    return 'auto';
  }
}

function apply(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

/** Tema claro/oscuro/automático, recordado en el navegador (si se puede). */
export function useTheme(): readonly [ThemeChoice, () => void] {
  const [choice, setChoice] = useState<ThemeChoice>(readStored);

  useEffect(() => {
    apply(choice);
  }, [choice]);

  const cycle = useCallback(() => {
    setChoice((current) => {
      const next = CHOICES[(CHOICES.indexOf(current) + 1) % CHOICES.length] ?? 'auto';
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Sin almacenamiento disponible: el tema solo dura esta visita.
      }
      return next;
    });
  }, []);

  return [choice, cycle];
}
