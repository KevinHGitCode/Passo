import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { chooseInput, noHorizontalScroll } from './fase3-helpers';

const CAPTURES_DIR = join('evidencias', 'flujos', 'capturas');

test.beforeAll(() => mkdirSync(CAPTURES_DIR, { recursive: true }));

const capture = (page: Page, name: string) =>
  page.screenshot({ path: join(CAPTURES_DIR, `${name}.png`) });

test('Flujos · tocar una lección abre su ventana: «Ahora no» la cierra y «Empezar» entra', async ({
  page,
}) => {
  await chooseInput(page, 'teclado-pc');
  await page.goto('/?seed=7#/');
  const node = page.getByTestId('node-u1-1').getByRole('link');

  await node.click();
  const dialog = page.getByTestId('start-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Lección nueva');
  await expect(dialog).toContainText('Do · Re · Mi');
  await expect(page.getByTestId('start-lesson')).toBeFocused();
  await expect(page).not.toHaveURL(/leccion/);
  await capture(page, '01-ventana-de-la-leccion');

  await page.getByTestId('start-cancel').click();
  await expect(dialog).toHaveCount(0);
  await expect(node).toBeFocused();

  await node.click();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  await node.click();
  await page.getByTestId('start-lesson').click();
  await expect(page).toHaveURL(/#\/leccion\/u1-1$/);
  await expect(page.getByTestId('lesson-intro')).toBeVisible();
});

test('Flujos · la ventana de la lección en el móvil sube desde abajo y no desborda', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await chooseInput(page, 'teclado-pc');
  await page.goto('/?seed=7#/');
  await page.getByTestId('node-u1-1').getByRole('link').click();
  const dialog = page.getByTestId('start-dialog');
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  // La hoja va pegada al borde inferior y ocupa todo el ancho.
  expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(844);
  expect(Math.round(box?.width ?? 0)).toBe(390);
  expect(await noHorizontalScroll(page)).toBe(true);
  await capture(page, '02-ventana-movil');
});

test('Flujos · la X pregunta en cuanto la ronda empieza, aunque no haya aciertos', async ({
  page,
}) => {
  await chooseInput(page, 'teclado-pc');
  await page.goto('/?seed=7#/leccion/u1-1');

  // Antes de empezar no hay nada que perder: sale directo.
  await page.getByTestId('lesson-exit').click();
  await expect(page).toHaveURL(/#\/piano$/);

  await page.goto('/?seed=7#/leccion/u1-1');
  await page.getByTestId('start').click();
  await page.getByTestId('lesson-exit').click();
  await expect(page.getByTestId('exit-dialog')).toBeVisible();
  await expect(page.getByTestId('exit-continue')).toBeFocused();
  await expect(page).toHaveURL(/#\/leccion\/u1-1$/);
  await capture(page, '03-salir-pregunta');

  await page.getByTestId('exit-continue').click();
  await expect(page.getByTestId('exit-dialog')).toHaveCount(0);
  await page.getByTestId('lesson-exit').click();
  await page.getByTestId('exit-leave').click();
  await expect(page).toHaveURL(/#\/piano$/);
});

test('Flujos · la dirección dice el instrumento y «atrás» vuelve al anterior', async ({ page }) => {
  await chooseInput(page, 'teclado-pc');
  await page.goto('/?seed=7');
  // La dirección corta se completa sola, sin dejar una entrada de más en el historial.
  await expect(page).toHaveURL(/#\/piano$/);

  await page.getByTestId('instrument-chip').click();
  await page.getByTestId('instrument-guitarra').click();
  await expect(page).toHaveURL(/#\/guitarra$/);
  await expect(page.locator('html')).toHaveAttribute('data-instrument', 'guitarra');
  await capture(page, '04-url-guitarra');

  await page.getByTestId('game-nav').getByRole('link', { name: 'Progreso' }).click();
  await expect(page).toHaveURL(/#\/guitarra\/progreso$/);

  await page.getByTestId('instrument-chip').click();
  await page.getByTestId('instrument-piano').click();
  await expect(page).toHaveURL(/#\/piano\/progreso$/);

  await page.goBack();
  await expect(page).toHaveURL(/#\/guitarra\/progreso$/);
  await expect(page.locator('html')).toHaveAttribute('data-instrument', 'guitarra');
  await expect(page.getByTestId('instrument-chip')).toHaveAttribute(
    'aria-label',
    'Instrumento: Guitarra. Cambiar',
  );

  // Una dirección escrita a mano también sirve: abre ese instrumento y lo recuerda.
  await page.goto('/?seed=7#/piano');
  await expect(page.locator('html')).toHaveAttribute('data-instrument', 'piano');
  await page.reload();
  await expect(page).toHaveURL(/#\/piano$/);
});
