import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { FAKE_MIC_SCRIPT, micNote, targetNote } from './mic-helpers';
import { chooseInput, noHorizontalScroll, samples, seedProgress, today } from './fase3-helpers';
import { G_EVIDENCE_DIR, chooseGuitar, ensureGuitarDirs, guitarCapture } from './guitar-helpers';

test.beforeAll(() => ensureGuitarDirs());

async function saveVideo(page: Page, fileName: string): Promise<void> {
  const video = page.video();
  await page.close();
  await video?.saveAs(join(G_EVIDENCE_DIR, fileName));
}

const root = (page: Page) => page.locator('html');

/** Espera a que el micrófono se calle antes de la siguiente nota. */
async function waitForQuiet(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page
          .getByTestId('meter')
          .evaluate(
            (el) => Number(el.getAttribute('data-level')) < Number(el.getAttribute('data-gate')),
          ),
      { timeout: 10_000 },
    )
    .toBe(true);
}

test('Guitarra · el chip de instrumento: de piano a guitarra y de vuelta, y se recuerda', async ({
  page,
}) => {
  await chooseInput(page, 'teclado-pc');
  await page.goto('/?seed=7#/');
  await expect(root(page)).toHaveAttribute('data-instrument', 'piano');
  const chip = page.getByTestId('instrument-chip');
  await expect(chip).toHaveAttribute('aria-label', 'Instrumento: Piano. Cambiar');
  await expect(page.getByTestId('game-nav').getByText('Práctica libre')).toBeVisible();

  await chip.click();
  await expect(chip).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('instrument-list')).toBeVisible();
  await expect(page.getByTestId('instrument-piano')).toHaveAttribute('aria-current', 'true');
  await guitarCapture(page, '01-chip-lista-de-instrumentos');

  await page.getByTestId('instrument-guitarra').click();
  await expect(page.getByTestId('instrument-list')).toHaveCount(0);
  await expect(chip).toBeFocused();
  await expect(root(page)).toHaveAttribute('data-instrument', 'guitarra');
  await expect(chip).toHaveAttribute('aria-label', 'Instrumento: Guitarra. Cambiar');
  await expect(page.locator('.unit')).toHaveCount(3);
  await expect(page.getByTestId('node-g1-1')).toContainText('Mi · Si · Sol');
  await expect(page.getByTestId('game-nav').getByText('Afinador')).toBeVisible();
  await expect(page.getByTestId('game-nav').getByText('Práctica libre')).toHaveCount(0);
  await expect(page.getByTestId('card-afinar')).toBeVisible();
  // Con el teclado del PC la guitarra no se puede tocar: el camino lo explica.
  await expect(page.getByTestId('node-g1-1')).toHaveAttribute('data-state', 'bloqueada-entrada');
  await page.getByTestId('node-g1-1').getByRole('button').click({ force: true });
  await expect(page.getByTestId('explicacion')).toContainText(
    'La guitarra se toca con el micrófono',
  );
  await guitarCapture(page, '02-camino-de-guitarra');

  // Se recuerda al recargar.
  await page.reload();
  await expect(root(page)).toHaveAttribute('data-instrument', 'guitarra');
  await expect(page.locator('.unit')).toHaveCount(3);

  // Y se vuelve a piano con el mismo chip (Esc también cierra).
  await page.getByTestId('instrument-chip').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('instrument-list')).toHaveCount(0);
  await page.getByTestId('instrument-chip').click();
  await page.getByTestId('instrument-piano').click();
  await expect(root(page)).toHaveAttribute('data-instrument', 'piano');
  await expect(page.locator('.unit')).toHaveCount(6);
});

test('Guitarra · una lección por micrófono (simulado): se juzga el nombre de la nota (video)', async ({
  page,
}) => {
  await page.addInitScript(FAKE_MIC_SCRIPT);
  await chooseGuitar(page);
  await page.goto('/?seed=7#/leccion/g1-1');
  await expect(page.getByTestId('lesson-intro')).toBeVisible();
  await expect(page.getByTestId('instrument-tag')).toContainText('Guitarra');
  await expect(page.getByTestId('tip-guitar')).toBeVisible();
  await expect(page.getByTestId('tip-low')).toHaveCount(0);
  await guitarCapture(page, '03-leccion-guitarra-presentacion');

  await page.getByTestId('activate-mic').click();
  await expect(page.getByTestId('listen')).toHaveAttribute('data-phase', 'escuchando', {
    timeout: 8000,
  });
  await page.getByTestId('start').click();
  await expect(page.getByTestId('guitar-board')).toBeVisible();
  await expect(page.getByTestId('fretboard').locator('[data-kind="now"]')).toHaveCount(1);
  // El nombre va sin octava y la posición se explica con cuerda y traste.
  await expect(page.getByTestId('target-note')).toHaveText(/^(Mi|Si|Sol)$/);
  await expect(page.getByTestId('target-detail')).toContainText('Cuerda');
  await guitarCapture(page, '04-leccion-guitarra-en-curso');

  const progress = page.getByTestId('lesson-progress');
  for (let hits = 1; hits <= 3; hits++) {
    const midi = await targetNote(page);
    // La 2.ª nota suena una octava más grave: en guitarra vale (se juzga el nombre).
    await micNote(page, hits === 2 ? midi - 12 : midi, { ms: 450 });
    await expect(progress).toHaveAttribute('aria-valuenow', String(hits), { timeout: 6000 });
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-tone', 'ok');
    await waitForQuiet(page);
  }
  await guitarCapture(page, '05-leccion-guitarra-aciertos');
  await saveVideo(page, '01-leccion-guitarra.webm');
});

test('Guitarra · el afinador: grave y luego afinada (micrófono simulado, video)', async ({
  page,
}) => {
  await page.addInitScript(FAKE_MIC_SCRIPT);
  await chooseGuitar(page);
  await page.goto('/?seed=7#/afinador');
  await expect(page.getByRole('heading', { level: 1, name: 'Afinador' })).toBeVisible();
  await expect(root(page)).toHaveAttribute('data-instrument', 'guitarra');
  await expect(page.getByTestId('tuner-mic')).toContainText('Activa el micrófono');
  await guitarCapture(page, '06-afinador-activar');

  await page.getByTestId('tuner-activate').click();
  await expect(page.getByTestId('tuner-mic')).toHaveCount(0, { timeout: 8000 });
  await page.getByTestId('tuner-string-6').click();
  await expect(page.getByTestId('tuner-target')).toContainText('Mi');
  await expect(page.getByTestId('tuner-target')).toContainText('Cuerda 6');

  // Un Mi grave 25 cents bajo: sale «Grave» (sin irse al semitono vecino).
  await micNote(page, 40, { ms: 2200, cents: -25 });
  await expect(page.getByTestId('tuner-reading')).toContainText('Grave', { timeout: 8000 });
  await guitarCapture(page, '07-afinador-grave');
  await expect(page.getByTestId('tuner-live')).toHaveText('Grave, cuerda 6');
  // Se calla y vuelve a «sin sonido».
  await expect(page.getByTestId('tuner-live')).toHaveText('', { timeout: 10_000 });

  // El mismo Mi, afinado: tras sostenerlo sale «Afinada».
  await micNote(page, 40, { ms: 3500 });
  await expect(page.getByTestId('tuner-reading')).toHaveText('Afinada', { timeout: 9000 });
  await guitarCapture(page, '08-afinador-afinada');
  await saveVideo(page, '02-afinador.webm');
});

test('Guitarra · el progreso muestra las notas que más cuestan (sin mapa de teclado)', async ({
  page,
}) => {
  await chooseGuitar(page);
  await seedProgress(page, {
    xp: 300,
    streak: { count: 3, last: today() },
    lessons: { 'g1-1': 3, 'g1-2': 2, 'u1-1': 3 },
    keys: {
      'g:64': samples(2, 6),
      'g:59': samples(7, 1),
      '60': samples(8, 0),
    },
    history: [
      { lesson: 'g1-1', accuracy: 820, rhythm: 0 },
      { lesson: 'g1-2', accuracy: 900, rhythm: 0 },
      { lesson: 'u1-1', accuracy: 1000, rhythm: 250 },
    ],
  });
  await page.goto('/?seed=7#/progreso');
  await expect(page.getByText('Guitarra: 2 de 14 lecciones hechas')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Notas que más cuestan' })).toBeVisible();
  const rows = page.getByTestId('guitarra-notas').locator('li');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Mi');
  await expect(page.getByTestId('kpi-accuracy')).toHaveText('86 %');
  await expect(page.getByText('Mapa de tu teclado')).toHaveCount(0);
  await guitarCapture(page, '09-progreso-de-guitarra');
});

test('Guitarra · móvil 390×844: el chip abre una hoja, el camino y la lección caben sin desplazarse de lado', async ({
  page,
}) => {
  await page.addInitScript(FAKE_MIC_SCRIPT);
  await page.setViewportSize({ width: 390, height: 844 });
  await chooseInput(page, 'microfono');
  await page.goto('/?seed=7#/');
  const chip = page.getByTestId('instrument-chip');
  await expect(page.locator('.game-top').getByTestId('instrument-chip')).toBeVisible();
  await chip.click();
  const sheet = page.getByRole('dialog', { name: 'Mis instrumentos' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Cerrar' })).toBeVisible();
  await guitarCapture(page, '10-movil-hoja-de-instrumentos');
  await sheet.getByTestId('instrument-guitarra').click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId('node-g1-1')).toHaveAttribute('data-state', 'actual');
  expect(await noHorizontalScroll(page)).toBe(true);
  await expect(page.getByTestId('game-nav-bottom').getByText('Afinador')).toBeVisible();
  await guitarCapture(page, '11-movil-camino-de-guitarra');

  await page.goto('/?seed=7#/leccion/g1-1');
  await page.getByTestId('activate-mic').click();
  await expect(page.getByTestId('listen')).toHaveAttribute('data-phase', 'escuchando', {
    timeout: 8000,
  });
  await page.getByTestId('start').click();
  await expect(page.getByTestId('fretboard')).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
  // El mástil entero (con sus rótulos) está dentro de la pantalla.
  const box = await page.getByTestId('fretboard').boundingBox();
  expect(box).not.toBeNull();
  expect((box?.x ?? -1) >= 0).toBe(true);
  expect((box?.x ?? 0) + (box?.width ?? 0) <= 390).toBe(true);
  await guitarCapture(page, '12-movil-leccion-de-guitarra');
});
