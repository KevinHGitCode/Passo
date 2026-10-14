import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { KEYBOARD_NOTE_MAP } from '../../src/adapters/keyboard/keyboard-map';

export const F2_EVIDENCE_DIR = join('evidencias', 'fase-2');
export const F2_CAPTURES_DIR = join(F2_EVIDENCE_DIR, 'capturas');

export function ensureF2Dirs(): void {
  mkdirSync(F2_CAPTURES_DIR, { recursive: true });
}

export async function f2Capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(F2_CAPTURES_DIR, `${name}.png`) });
}

const CODE_FOR_MIDI = new Map<number, string>(
  Object.entries(KEYBOARD_NOTE_MAP).map(([code, midi]) => [midi, code]),
);

export function codeFor(midi: number): string {
  const code = CODE_FOR_MIDI.get(midi);
  if (code === undefined) throw new Error(`El teclado del PC no tiene la nota ${midi}`);
  return code;
}

/** Notas del objetivo que se ve en pantalla, de grave a agudo. */
export async function targetMidis(page: Page): Promise<number[]> {
  const value = await page.getByTestId('target-note').getAttribute('data-midis');
  if (value === null) throw new Error('No hay objetivo en pantalla');
  return value.split(',').map(Number);
}

export async function down(page: Page, midi: number): Promise<void> {
  await page.keyboard.down(codeFor(midi));
}

export async function up(page: Page, midi: number): Promise<void> {
  await page.keyboard.up(codeFor(midi));
}

export async function releaseAll(page: Page, midis: readonly number[]): Promise<void> {
  for (const midi of midis) await up(page, midi);
}

/** Toca el objetivo actual (todas las notas a la vez) y suelta. Devuelve las notas tocadas. */
export async function playTarget(page: Page): Promise<number[]> {
  const midis = await targetMidis(page);
  for (const midi of midis) await down(page, midi);
  await releaseAll(page, midis);
  return midis;
}

/** Una tecla blanca del mapa que NO está en el objetivo (la más cercana por encima de la nota más grave). */
export function extraNote(target: readonly number[]): number {
  const white = Object.values(KEYBOARD_NOTE_MAP)
    .filter((midi) => ![1, 3, 6, 8, 10].includes(midi % 12) && !target.includes(midi))
    .sort((a, b) => Math.abs(a - (target[0] ?? 60)) - Math.abs(b - (target[0] ?? 60)));
  const found = white[0];
  if (found === undefined) throw new Error('No hay nota de más disponible');
  return found;
}

export async function keyboardTop(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (document.querySelector('[data-testid=piano]') as Element).getBoundingClientRect().top +
      window.scrollY,
  );
}
