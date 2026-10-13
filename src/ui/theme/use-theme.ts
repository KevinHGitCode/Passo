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

function store(choice: ThemeChoice): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Sin almacenamiento disponible: el tema solo dura esta visita.
  }
}

function apply(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

/** Aplica el tema guardado antes del primer pintado (evita el parpadeo claro → oscuro). */
export function initTheme(): void {
  apply(readStored());
}

/** Tema claro/oscuro/automático, recordado en el navegador (si se puede). */
export function useTheme(): readonly [ThemeChoice, () => void] {
  const [choice, setChoice] = useState<ThemeChoice>(readStored);

  useEffect(() => {
    apply(choice);
  }, [choice]);

  const cycle = useCallback(() => {
    const next = CHOICES[(CHOICES.indexOf(choice) + 1) % CHOICES.length] ?? 'auto';
    store(next);
    setChoice(next);
  }, [choice]);

  return [choice, cycle];
}
