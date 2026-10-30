import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

export const G_EVIDENCE_DIR = join('evidencias', 'guitarra-1');
export const G_CAPTURES_DIR = join(G_EVIDENCE_DIR, 'capturas');

export function ensureGuitarDirs(): void {
  mkdirSync(G_CAPTURES_DIR, { recursive: true });
}

export async function guitarCapture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(G_CAPTURES_DIR, `${name}.png`) });
}

/** Deja elegida la guitarra (y la entrada) antes de que cargue la página; solo la primera vez. */
export async function chooseGuitar(
  page: Page,
  input: 'microfono' | 'teclado-pc' = 'microfono',
): Promise<void> {
  await page.addInitScript((value) => {
    if (!window.localStorage.getItem('passo.preferencias')) {
      window.localStorage.setItem(
        'passo.preferencias',
        JSON.stringify({ version: 1, input: value, instrument: 'guitarra' }),
      );
    }
  }, input);
}
