import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { chooseGuitar } from './guitar-helpers';
import { noHorizontalScroll } from './fase3-helpers';
import { FAKE_MIC_SCRIPT, micNote } from './mic-helpers';

const EVIDENCE_DIR = join('evidencias', 'afinador');
const CAPTURES_DIR = join(EVIDENCE_DIR, 'capturas');

test.beforeAll(() => mkdirSync(CAPTURES_DIR, { recursive: true }));

const capture = (page: Page, name: string) =>
  page.screenshot({ path: join(CAPTURES_DIR, `${name}.png`) });

async function saveVideo(page: Page, fileName: string): Promise<void> {
  const video = page.video();
  await page.close();
  await video?.saveAs(join(EVIDENCE_DIR, fileName));
}

const peg = (page: Page, string: number) => page.getByTestId(`tuner-string-${string}`);
const reading = (page: Page) => page.getByTestId('tuner-reading');

/** Abre el afinador con el micrófono simulado ya activado. */
async function openTuner(page: Page): Promise<void> {
  await page.addInitScript(FAKE_MIC_SCRIPT);
  await chooseGuitar(page);
  await page.goto('/?seed=7#/afinador');
  await activate(page);
}

/** El micrófono nunca arranca solo: hay que pulsar «Activar micrófono». */
async function activate(page: Page): Promise<void> {
  await page.getByTestId('tuner-activate').click();
  await expect(page.getByTestId('tuner-mic')).toHaveCount(0, { timeout: 8000 });
}

test('Afinador · el clavijero recuerda cada cuerda y se maneja con el teclado (video)', async ({
  page,
}) => {
  await page.addInitScript(FAKE_MIC_SCRIPT);
  await chooseGuitar(page);
  await page.goto('/?seed=7#/afinador');
  // Al entrar solo se ofrece activar el micrófono: ni clavijero ni medidor.
  await expect(page.getByTestId('tuner-activate')).toBeVisible();
  await expect(page.getByTestId('tuner-string-6')).toHaveCount(0);
  await capture(page, '01-activar');
  await activate(page);
  const group = page.getByRole('radiogroup', { name: 'Cuerda que afinas' });
  await expect(group).toBeVisible();
  // El orden del teclado es de la 6 a la 1.
  await expect(group.locator('input')).toHaveCount(6);
  expect(
    await group
      .locator('input')
      .evaluateAll((all) => all.map((i) => (i as HTMLInputElement).value)),
  ).toEqual(['6', '5', '4', '3', '2', '1']);
  await peg(page, 6).click();
  await expect(page.getByTestId('tuner-target')).toContainText('Cuerda 6');

  await micNote(page, 40, { ms: 2200, cents: -22 });
  await expect(reading(page)).toContainText('Grave', { timeout: 8000 });
  await expect(peg(page, 6)).toHaveAttribute('data-mark', 'sube');
  await expect(peg(page, 6)).toContainText('grave: súbela');
  await expect(page.getByTestId('tuner-hint')).toContainText('Aprieta');
  await capture(page, '02-grave-sube');
  await expect(page.getByTestId('tuner-live')).toHaveText('', { timeout: 10_000 });

  await micNote(page, 40, { ms: 3500 });
  await expect(reading(page)).toHaveText('Afinada', { timeout: 9000 });
  await expect(peg(page, 6)).toHaveAttribute('data-mark', 'listo');
  await capture(page, '03-afinada');

  // Otra cuerda: la 6 se queda con su ✓.
  await peg(page, 5).click();
  await expect(peg(page, 5)).toHaveAttribute('data-mark', 'pend');
  await expect(peg(page, 6)).toHaveAttribute('data-mark', 'listo');
  await capture(page, '04-otra-cuerda-con-recuerdo');

  // Teclado: las flechas del grupo y las teclas 1–6 dentro del afinador.
  await page.getByRole('radio', { checked: true }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('tuner-target')).toContainText('Cuerda 4');
  await page.keyboard.press('2');
  await expect(page.getByTestId('tuner-target')).toContainText('Cuerda 2');
  await expect(page.getByRole('radio', { checked: true })).toBeFocused();
  await saveVideo(page, '01-clavijero.webm');
});

test('Afinador · «Escuchar la nota» suena, pausa la medición y la tecla R la enciende y apaga', async ({
  page,
}) => {
  await openTuner(page);
  await peg(page, 6).click();
  const button = page.getByTestId('tuner-reference');
  await expect(button).toHaveText('Escuchar la nota');
  await button.click();
  await expect(button).toHaveText('Detener la nota');
  await expect(button).toHaveAttribute('data-playing', 'true');
  await expect(page.getByTestId('tuner-hint')).toContainText('Suena la nota de referencia');
  // Mientras suena no se mide, aunque el micrófono oiga un Mi.
  await micNote(page, 40, { ms: 800 });
  await page.waitForTimeout(900);
  await expect(reading(page)).toHaveCount(0);
  await capture(page, '05-escuchar-la-nota');

  // La tecla R corta la nota y la vuelve a encender (con el foco dentro del afinador).
  await page.getByRole('radio', { checked: true }).focus();
  await page.keyboard.press('r');
  await expect(button).toHaveText('Escuchar la nota');
  await page.keyboard.press('r');
  await expect(button).toHaveText('Detener la nota');
  await page.keyboard.press('r');
  await expect(button).toHaveText('Escuchar la nota');

  // Terminada la referencia y su guarda, vuelve a medir con normalidad.
  await page.waitForTimeout(900);
  await micNote(page, 40, { ms: 2200, cents: -22 });
  await expect(reading(page)).toContainText('Grave', { timeout: 8000 });
});

test('Afinador · el modo guiado avanza solo, deja saltar y dice qué falta (video)', async ({
  page,
}) => {
  await openTuner(page);
  await page.getByTestId('tuner-guided-start').click();
  const step = page.getByTestId('tuner-guide-step');
  await expect(step).toHaveText('Paso 1 de 6 · vuelta 1');
  await expect(page.getByTestId('tuner-target')).toContainText('Cuerda 6');
  await expect(peg(page, 5)).toHaveAttribute('data-mark', 'sig');
  await capture(page, '06-guia-empieza');

  // La cuerda 6 afinada se queda en verde y la guía pasa sola a la 5, sin mover el foco.
  await micNote(page, 40, { ms: 3600 });
  await expect(step).toHaveText('Paso 2 de 6 · vuelta 1', { timeout: 9000 });
  await expect(page.getByTestId('tuner-target')).toContainText('Cuerda 5');
  await expect(peg(page, 6)).toHaveAttribute('data-mark', 'listo');
  await expect(page.getByTestId('tuner-guide-live')).toHaveText(
    'Mi afinada. Sigue la cuerda 5 (La)',
  );
  await capture(page, '07-guia-avanza');
  await page.waitForTimeout(1500);

  await micNote(page, 45, { ms: 3600 });
  await expect(step).toHaveText('Paso 3 de 6 · vuelta 1', { timeout: 9000 });
  await page.waitForTimeout(1200);

  // Saltarse el resto: la pantalla final dice cuáles faltan.
  for (let n = 0; n < 4; n++) await page.getByTestId('guided-skip').click();
  await expect(page.getByTestId('tuner-summary-title')).toHaveText('Faltan cuerdas por afinar');
  await expect(page.getByTestId('tuner-summary')).toContainText('Faltan: cuerda 4 (Re)');
  await capture(page, '08-guia-faltan');

  await page.getByTestId('guided-continue').click();
  await expect(step).toHaveText('Paso 1 de 4 · vuelta 1');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tuner-guide')).toHaveCount(0);
  await expect(page.getByTestId('tuner-guided-start')).toBeVisible();
  await saveVideo(page, '02-modo-guiado.webm');
});

test('Afinador · el La₄ se cambia, se recuerda al recargar y mueve la meta', async ({ page }) => {
  await openTuner(page);
  await peg(page, 1).click();
  await expect(page.getByTestId('tuner-ref-value')).toHaveText('La₄ 440 Hz');
  await page.getByTestId('tuner-ref-up').click();
  await page.getByTestId('tuner-ref-up').click();
  await expect(page.getByTestId('tuner-ref-value')).toHaveText('La₄ 442 Hz');
  await expect(page.getByTestId('tuner-ref-reset')).toBeVisible();
  await capture(page, '09-la4-442');

  await page.reload();
  await activate(page);
  await expect(page.getByTestId('tuner-ref-value')).toHaveText('La₄ 442 Hz');
  await page.getByTestId('tuner-ref-reset').click();
  await expect(page.getByTestId('tuner-ref-value')).toHaveText('La₄ 440 Hz');
  await page.reload();
  await activate(page);
  await expect(page.getByTestId('tuner-ref-value')).toHaveText('La₄ 440 Hz');
  await expect(page.getByTestId('tuner-ref-reset')).toHaveCount(0);
});

test('Afinador · en el móvil cabe sin desplazarse de lado y las clavijas se pulsan bien', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTuner(page);
  expect(await noHorizontalScroll(page)).toBe(true);
  for (let string = 1; string <= 6; string++) {
    const box = await peg(page, string).boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect((box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? 0) <= 390).toBe(true);
  }
  await peg(page, 4).click();
  await micNote(page, 50, { ms: 2200, cents: 20 });
  await expect(reading(page)).toContainText('Aguda', { timeout: 8000 });
  await expect(peg(page, 4)).toHaveAttribute('data-mark', 'baja');
  expect(await noHorizontalScroll(page)).toBe(true);
  await capture(page, '10-movil');
  await page.getByTestId('tuner-guided-start').click();
  await expect(page.getByTestId('tuner-guide')).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
  await capture(page, '11-movil-guia');
});
