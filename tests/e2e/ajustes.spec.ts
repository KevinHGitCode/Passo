import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { chooseInput, noHorizontalScroll } from './fase3-helpers';

const CAPTURES_DIR = join('evidencias', 'ajustes', 'capturas');

test.beforeAll(() => mkdirSync(CAPTURES_DIR, { recursive: true }));

const capture = (page: Page, name: string) =>
  page.screenshot({ path: join(CAPTURES_DIR, `${name}.png`) });

test('Ajustes · son una página: el engranaje lleva a #/ajustes y «Volver» regresa', async ({
  page,
}) => {
  await chooseInput(page, 'teclado-pc');
  await page.goto('/?seed=7#/piano');
  await page.getByTestId('settings-button').click();
  await expect(page).toHaveURL(/#\/ajustes$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Ajustes' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // La navegación sigue a la vista y el engranaje marca que estás ahí.
  await expect(page.getByTestId('game-nav')).toBeVisible();
  await expect(page.getByTestId('settings-button')).toHaveAttribute('aria-current', 'page');
  await capture(page, '01-ajustes');
  await page.getByTestId('theme-claro').check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'claro');
  await page.getByTestId('settings-close').click();
  await expect(page).toHaveURL(/#\/piano$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Aprender' })).toBeVisible();
});

test('Ajustes · se llega directo por la dirección y Ctrl+, también', async ({ page }) => {
  await chooseInput(page, 'teclado-pc');
  await page.goto('/?seed=7#/ajustes');
  await expect(page.getByRole('heading', { level: 1, name: 'Ajustes' })).toBeVisible();
  await page.goto('/?seed=7#/piano');
  await page.keyboard.press('Control+Comma');
  await expect(page).toHaveURL(/#\/ajustes$/);
});

test('Ajustes · en el móvil cabe sin desplazarse de lado', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await chooseInput(page, 'teclado-pc');
  await page.goto('/?seed=7#/ajustes');
  await expect(page.getByTestId('settings-panel')).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
  await capture(page, '02-movil');
});
