import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

export const F3_EVIDENCE_DIR = join('evidencias', 'fase-3');
export const F3_CAPTURES_DIR = join(F3_EVIDENCE_DIR, 'capturas');

export function ensureF3Dirs(): void {
  mkdirSync(F3_CAPTURES_DIR, { recursive: true });
}

export async function f3Capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(F3_CAPTURES_DIR, `${name}.png`) });
}

/** El día local de esta máquina como `AAAA-MM-DD` (la página usa el mismo reloj). */
export function today(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Deja guardada la entrada elegida antes de que cargue la página (solo la primera vez). */
export async function chooseInput(
  page: Page,
  input: 'microfono' | 'midi' | 'teclado-pc',
): Promise<void> {
  await page.addInitScript((value) => {
    if (!window.localStorage.getItem('passo.preferencias')) {
      window.localStorage.setItem(
        'passo.preferencias',
        JSON.stringify({ version: 1, input: value }),
      );
    }
  }, input);
}

export interface SeedProgress {
  xp?: number;
  streak?: { count: number; last: string };
  /** Estrellas por lección. */
  lessons?: Record<string, number>;
  /** Muestras por tecla: `[1|0, ms]`. */
  keys?: Record<string, [number, number][]>;
  daily?: Record<string, { ms: number; lessons: number }>;
  history?: { lesson: string; accuracy: number; rhythm: number }[];
}

/** Siembra un progreso antes de cargar la página (solo si todavía no hay uno guardado). */
export async function seedProgress(page: Page, seed: SeedProgress): Promise<void> {
  const day = today();
  const value = {
    version: 1,
    xp: seed.xp ?? 0,
    streak: seed.streak
      ? { ...seed.streak, restWeek: null }
      : { count: 0, last: null, restWeek: null },
    lessons: Object.fromEntries(
      Object.entries(seed.lessons ?? {}).map(([id, stars]) => [
        id,
        { stars, accuracy: 900, rhythm: 200, plays: 1, day },
      ]),
    ),
    keys: seed.keys ?? {},
    daily: seed.daily ?? {},
    history: (seed.history ?? []).map((entry) => ({ day, ...entry })),
  };
  // Se siembra una sola vez por pestaña: si la prueba borra el progreso, recargar no lo vuelve a sembrar.
  await page.addInitScript((json) => {
    if (!window.sessionStorage.getItem('passo.e2e.sembrado')) {
      window.sessionStorage.setItem('passo.e2e.sembrado', '1');
      window.localStorage.setItem('passo.progreso', json);
    }
  }, JSON.stringify(value));
}

/** Las lecciones de las unidades 1 a 5 hechas con una estrella. */
export function upToUnitFive(): Record<string, number> {
  const sizes: Record<string, number> = { u1: 4, u2: 4, u3: 6, u4: 6, u5: 4 };
  const lessons: Record<string, number> = {};
  for (const [unit, count] of Object.entries(sizes)) {
    for (let n = 1; n <= count; n++) lessons[`${unit}-${n}`] = 1;
  }
  return lessons;
}

/** Muestras de una tecla: `ok` aciertos y `miss` fallos (los fallos más antiguos). */
export function samples(ok: number, miss: number, ms = 1500): [number, number][] {
  return [
    ...Array.from({ length: miss }, (): [number, number] => [0, ms]),
    ...Array.from({ length: ok }, (): [number, number] => [1, ms]),
  ];
}

export async function noHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
}

export async function fitsInViewport(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      document.documentElement.scrollHeight <= document.documentElement.clientHeight &&
      document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
}
