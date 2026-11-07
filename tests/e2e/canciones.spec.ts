import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { chooseGuitar } from './guitar-helpers';
import { noHorizontalScroll } from './fase3-helpers';
import { FAKE_MIC_SCRIPT, micNote } from './mic-helpers';

const CAPTURES_DIR = join('evidencias', 'canciones', 'capturas');

test.beforeAll(() => mkdirSync(CAPTURES_DIR, { recursive: true }));

const capture = (page: Page, name: string) =>
  page.screenshot({ path: join(CAPTURES_DIR, `${name}.png`) });

async function openSong(page: Page, id: string): Promise<void> {
  await page.addInitScript(FAKE_MIC_SCRIPT);
  await chooseGuitar(page);
  await page.goto('/?seed=7#/canciones');
  await page.getByTestId(`song-${id}`).click();
  await expect(page.getByTestId('song-activate')).toBeVisible();
  await page.getByTestId('song-activate').click();
  await expect(page.getByTestId('song-now')).toBeVisible({ timeout: 8000 });
  // El micrófono mide primero el ruido de la sala; hasta entonces no oye notas.
  await expect(page.getByTestId('song-calibrating')).toHaveCount(0, { timeout: 10_000 });
}

test('Canciones · la lista tiene cuatro canciones y se llega desde la navegación', async ({
  page,
}) => {
  await chooseGuitar(page);
  await page.goto('/?seed=7#/guitarra');
  await page.getByRole('link', { name: 'Canciones' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Canciones' })).toBeVisible();
  await expect(page.locator('.songs__card')).toHaveCount(4);
  await expect(page.getByTestId('song-cumpleanos-feliz')).toBeVisible();
  await capture(page, '01-lista');
});

test('Canciones · una melodía va paso a paso y dice si vas a tiempo o lento', async ({ page }) => {
  await openSong(page, 'cumpleanos-feliz');
  // Primero: nada hasta activar el micrófono; luego el primer paso (Sol, cuerda 3 al aire).
  await expect(page.getByTestId('song-now')).toContainText('Sol');
  await expect(page.getByTestId('song-now')).toContainText('Cuerda 3');
  await capture(page, '02-primer-paso');

  // Sol3 (55) → el tiempo empieza a contar; el siguiente paso es otro Sol.
  await micNote(page, 55, { ms: 500 });
  await expect(page.locator('.song__chip[data-state="actual"]')).toContainText('Sol');
  await page.waitForTimeout(900);
  // El segundo Sol llegó mucho después de lo debido (0,2 s a este tempo): lento.
  await micNote(page, 55, { ms: 500 });
  await expect(page.getByTestId('song-feedback')).toContainText(/lento/i, { timeout: 8000 });
  await capture(page, '03-feedback-lento');

  // Una nota equivocada no avanza y lo dice.
  await page.waitForTimeout(900);
  await micNote(page, 62, { ms: 600 });
  await expect(page.getByTestId('song-wrong')).toBeVisible({ timeout: 8000 });
});

test('Canciones · se puede escuchar la canción antes de tocarla y detenerla', async ({ page }) => {
  await page.addInitScript(FAKE_MIC_SCRIPT);
  await chooseGuitar(page);
  await page.goto('/?seed=7#/cancion/cumpleanos-feliz');
  // Se oye aunque el micrófono todavía no esté activado.
  await page.getByTestId('song-preview').click();
  await expect(page.getByText(/Escuchando… paso/)).toBeVisible();
  await expect(page.getByTestId('song-preview')).toContainText('Detener');
  await capture(page, '06-escuchando');
  await page.waitForTimeout(1500);
  await expect(page.getByText(/Escuchando… paso [2-9]/)).toBeVisible();
  await page.getByTestId('song-preview').click();
  await expect(page.getByTestId('song-preview')).toContainText('Escuchar la canción');

  // Ya con el micrófono: también ahí, con la tarjeta siguiendo el paso que suena.
  await page.getByTestId('song-activate').click();
  await expect(page.getByTestId('song-calibrating')).toHaveCount(0, { timeout: 10_000 });
  await page.getByTestId('song-preview').click();
  await expect(page.getByTestId('song-now')).toBeVisible();
  await expect(page.locator('.song__chip[data-playing="true"]')).toHaveCount(1);
  await capture(page, '07-escuchando-con-microfono');
  await page.getByTestId('song-preview').click();
  await expect(page.locator('.song__chip[data-playing="true"]')).toHaveCount(0);
});

test('Canciones · el rasgueo marca el cambio de acorde', async ({ page }) => {
  await openSong(page, 'de-colores');
  await expect(page.getByTestId('song-now')).toContainText('G');
  await expect(page.getByTestId('song-now')).toContainText('↓ ↓↑ ↑↓↑');
  await micNote(page, 43, { ms: 600 });
  await expect(page.getByTestId('song-now')).toContainText('C', { timeout: 8000 });
  await page.waitForTimeout(1500);
  // El cambio a C debía llegar a los 3,4 s; llega antes: «adelantado».
  await micNote(page, 48, { ms: 600 });
  await expect(page.getByTestId('song-feedback')).toContainText(/cambio|antes/i, { timeout: 8000 });
  await capture(page, '04-rasgueo');
});

test('Canciones · en el móvil cabe sin desplazarse de lado', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openSong(page, 'cumpleanos-feliz');
  expect(await noHorizontalScroll(page)).toBe(true);
  await capture(page, '05-movil');
});
