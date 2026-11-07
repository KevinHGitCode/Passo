import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { chooseGuitar } from './guitar-helpers';
import { FAKE_MIC_SCRIPT, micNote, micStrum } from './mic-helpers';

const CAPTURES_DIR = join('evidencias', 'acordes', 'capturas');

test.beforeAll(() => mkdirSync(CAPTURES_DIR, { recursive: true }));

const capture = (page: Page, name: string) =>
  page.screenshot({ path: join(CAPTURES_DIR, `${name}.png`) });

async function openChords(page: Page): Promise<void> {
  await page.addInitScript(FAKE_MIC_SCRIPT);
  await chooseGuitar(page);
  await page.goto('/?seed=7#/acordes');
  await expect(page.getByTestId('chords-activate')).toBeVisible();
  await page.getByTestId('chords-activate').click();
  await expect(page.getByTestId('chords-calibrating')).toHaveCount(0, { timeout: 10_000 });
}

test('Acordes · está en la navegación y pide activar el micrófono antes de nada', async ({
  page,
}) => {
  await chooseGuitar(page);
  await page.goto('/?seed=7#/guitarra');
  await page.getByRole('link', { name: 'Acordes' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Acordes' })).toBeVisible();
  await expect(page.getByTestId('chords-activate')).toBeVisible();
  await expect(page.getByTestId('chords-mode-rasgueo')).toHaveCount(0);
});

test('Acordes · rasgueo completo: reconoce el acorde y cuenta los golpes', async ({ page }) => {
  await openChords(page);
  await expect(page.getByTestId('chord-empty')).toBeVisible();
  await micStrum(page, [43, 47, 50, 55, 59, 67]);
  await expect(page.getByTestId('chord-symbol')).toHaveText('G', { timeout: 8000 });
  await expect(page.getByTestId('chord-name')).toHaveText('Sol mayor');
  await expect(page.getByTestId('chord-strokes').locator('li')).toHaveCount(1);
  await capture(page, '01-rasgueo-sol');

  await page.waitForTimeout(1800);
  await micStrum(page, [50, 57, 60, 66]);
  await expect(page.getByTestId('chord-symbol')).toHaveText('D7', { timeout: 8000 });
  await capture(page, '02-rasgueo-re7');
});

test('Acordes · cuerda por cuerda: empareja las notas con el acorde y marca la desafinada', async ({
  page,
}) => {
  await openChords(page);
  await page.getByTestId('chords-mode-cuerda').check();
  await expect(page.getByTestId('chord-played-empty')).toBeVisible();
  for (const [midi, cents] of [
    [43, 0],
    [47, -35],
    [50, 0],
    [55, 0],
  ] as const) {
    await micNote(page, midi, { ms: 1200, amp: 0.3, cents });
    await page.waitForTimeout(1700);
  }
  await expect(page.getByTestId('chord-symbol')).toHaveText('G', { timeout: 8000 });
  await expect(page.getByTestId('chord-played').locator('li')).toHaveCount(4);
  await expect(page.locator('[data-status="desafinada"]')).toHaveCount(1);
  await expect(page.locator('[data-status="desafinada"]')).toContainText('Si');
  await capture(page, '03-cuerda-por-cuerda');
  await page.getByTestId('chords-clear').click();
  await expect(page.getByTestId('chord-played-empty')).toBeVisible();
});
