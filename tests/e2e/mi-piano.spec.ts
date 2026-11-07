import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { chooseInput, noHorizontalScroll } from './fase3-helpers';
import { FAKE_MIC_SCRIPT, micNote } from './mic-helpers';

const CAPTURES_DIR = join('evidencias', 'mi-piano', 'capturas');

test.beforeAll(() => mkdirSync(CAPTURES_DIR, { recursive: true }));

const capture = (page: Page, name: string) =>
  page.screenshot({ path: join(CAPTURES_DIR, `${name}.png`) });

test('Mi piano · las teclas y el nombre del Do central se eligen y se recuerdan', async ({
  page,
}) => {
  await chooseInput(page, 'teclado-pc');
  await page.goto('/?seed=7#/piano');
  await page.getByRole('link', { name: 'Mi piano' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Mi piano' })).toBeVisible();
  // Por omisión: 61 teclas (5 octavas), de Do2 a Do7, con el Do central como Do4.
  await expect(page.getByTestId('piano-range')).toContainText('Do2');
  await expect(page.getByTestId('piano-range')).toContainText('Do7');
  await expect(page.getByTestId('piano-naming-example')).toContainText('Do4');
  // Con el nombre de Yamaha el mismo Do central se escribe Do3 (y el rango baja una octava).
  await page.getByTestId('piano-naming-yamaha').check();
  await expect(page.getByTestId('piano-naming-example')).toContainText('Do3');
  await expect(page.getByTestId('piano-range')).toContainText('Do1');
  await capture(page, '01-parametros');
  // Con MIDI o el teclado del PC no hace falta probar el micrófono.
  await expect(page.getByText(/no hace falta/)).toBeVisible();
  // Se recuerda al recargar.
  await page.reload();
  await expect(page.getByTestId('piano-naming-yamaha')).toBeChecked();
  await expect(page.getByTestId('piano-range')).toContainText('Do1');
  await page.getByTestId('piano-keys-88').check();
  await expect(page.getByTestId('piano-range')).toContainText('7 octavas');
});

test('Mi piano · la prueba del micrófono detecta una octava de más y la corrige', async ({
  page,
}) => {
  await page.addInitScript(FAKE_MIC_SCRIPT);
  await chooseInput(page, 'microfono');
  await page.goto('/?seed=7#/mi-piano');
  await page.getByTestId('mipiano-activate').click();
  await expect(page.getByTestId('mipiano-start')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('mipiano-start').click();
  await expect(page.getByTestId('mipiano-probe')).toBeVisible();

  // La primera nota (el bajo) se salta; la segunda (Do3) y la tercera (Mi3) «suenan» una octava arriba.
  await page.getByTestId('mipiano-skip').click();
  await expect(page.getByTestId('mipiano-ask')).toContainText('Do3');
  await micNote(page, 60, { ms: 700 });
  await expect(page.getByTestId('mipiano-ask')).toContainText('Mi3', { timeout: 8000 });
  await page.waitForTimeout(1600);
  await micNote(page, 64, { ms: 700 });
  await expect(page.getByTestId('mipiano-ask')).toContainText('Sol3', { timeout: 8000 });
  await capture(page, '02-probando');
  // El resto se salta.
  for (let n = 0; n < 7; n++) await page.getByTestId('mipiano-skip').click();
  await expect(page.getByTestId('mipiano-result')).toContainText('se puede corregir');
  await expect(page.getByTestId('mipiano-result')).toContainText('una octava más aguda');
  await capture(page, '03-resultado');
  await page.getByTestId('mipiano-save').click();
  await expect(page.getByTestId('mipiano-saved')).toContainText('Corrección guardada');
  await page.getByTestId('mipiano-clear').click();
  await expect(page.getByTestId('mipiano-saved')).toHaveCount(0);
});

test('Mi piano · en el móvil cabe sin desplazarse de lado', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await chooseInput(page, 'teclado-pc');
  await page.goto('/?seed=7#/mi-piano');
  await expect(page.getByTestId('mipiano')).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
  await capture(page, '04-movil');
});
