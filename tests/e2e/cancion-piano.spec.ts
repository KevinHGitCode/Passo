import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { chooseInput, noHorizontalScroll } from './fase3-helpers';

const CAPTURES_DIR = join('evidencias', 'canciones-piano', 'capturas');

test.beforeAll(() => mkdirSync(CAPTURES_DIR, { recursive: true }));

const capture = (page: Page, name: string) =>
  page.screenshot({ path: join(CAPTURES_DIR, `${name}.png`) });

test('Canciones de piano · Golden Brown: la lista y las notas cayendo sobre el teclado', async ({
  page,
}) => {
  await chooseInput(page, 'teclado-pc');
  await page.goto('/?seed=7#/piano');
  await page.getByRole('link', { name: 'Canciones' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Canciones' })).toBeVisible();
  await expect(page.getByTestId('song-golden-brown')).toBeVisible();
  await expect(page.getByTestId('song-cumpleanos-feliz')).toHaveCount(0);
  await capture(page, '01-lista');

  await page.getByTestId('song-golden-brown').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Golden Brown' })).toBeVisible();
  await expect(page.getByTestId('piano')).toBeVisible();
  // Esperar: las notas llegan a su tecla y esperan (La2 es la primera).
  await expect(page.getByTestId('fall-0-45')).toBeVisible();
  await page.waitForTimeout(1200);
  await capture(page, '02-esperando');
});

test('Canciones de piano · a tempo: cuenta atrás, las notas caen solas y las que no se tocan se marcan', async ({
  page,
}) => {
  await chooseInput(page, 'teclado-pc');
  await page.goto('/?seed=7#/cancion/golden-brown');
  await page.getByTestId('piano-mode-tempo').check();
  await expect(page.getByTestId('piano-start')).toBeVisible();
  await page.getByTestId('piano-start').click();
  await expect(page.getByText(/Empieza en/)).toBeVisible();
  await capture(page, '03-cuenta-atras');
  // Sin tocar nada, las primeras notas pasan de largo y quedan marcadas como falladas.
  await expect(page.locator('.fall__mark--miss').first()).toBeVisible({ timeout: 9000 });
  await capture(page, '04-a-tempo');
});

test('Canciones de piano · en el móvil cabe sin desplazarse de lado', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await chooseInput(page, 'teclado-pc');
  await page.goto('/?seed=7#/cancion/golden-brown');
  await expect(page.getByTestId('piano')).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
  await capture(page, '05-movil');
});
