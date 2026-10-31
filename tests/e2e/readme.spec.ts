import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { codeFor, extraNote, playTarget, targetMidis } from './fase2-helpers';
import { FAKE_MIC_SCRIPT, micNote, targetNote } from './mic-helpers';
import { chooseInput, samples, seedProgress, today } from './fase3-helpers';
import { chooseGuitar } from './guitar-helpers';

/**
 * Las capturas del README (`docs/img/`). No es una prueba de la aplicación: solo se ejecuta al pedirlo
 * (`README_SHOTS=1 npx playwright test tests/e2e/readme.spec.ts`), para que `npm run e2e` no reescriba las
 * imágenes cada vez. Todo el audio es simulado (el mismo micrófono falso de las pruebas).
 */
test.skip(
  process.env['README_SHOTS'] !== '1',
  'Solo para regenerar las capturas del README (README_SHOTS=1)',
);

const IMG_DIR = join('docs', 'img');
test.beforeAll(() => mkdirSync(IMG_DIR, { recursive: true }));

const shot = (page: Page, name: string) => page.screenshot({ path: join(IMG_DIR, `${name}.png`) });
const progressBar = (page: Page) => page.getByTestId('lesson-progress');

/** Un progreso con vida: lecciones hechas, racha, minutos de hoy y teclas con aciertos y fallos. */
async function seedPianoProgress(page: Page): Promise<void> {
  const white = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76];
  const keys: Record<string, [number, number][]> = {};
  white.forEach((midi, i) => {
    keys[String(midi)] = samples(6 + ((i * 3) % 7), (i * 5) % 6 === 0 ? 4 : i % 3);
  });
  await seedProgress(page, {
    xp: 640,
    streak: { count: 6, last: today() },
    lessons: { 'u1-1': 3, 'u1-2': 3, 'u1-3': 2, 'u1-4': 3, 'u2-1': 2 },
    keys,
    daily: { [today()]: { ms: 3.5 * 60_000, lessons: 2 } },
    history: [
      { lesson: 'u1-1', accuracy: 800, rhythm: 190 },
      { lesson: 'u1-2', accuracy: 900, rhythm: 210 },
      { lesson: 'u1-3', accuracy: 840, rhythm: 220 },
      { lesson: 'u1-4', accuracy: 950, rhythm: 260 },
      { lesson: 'u2-1', accuracy: 880, rhythm: 240 },
    ],
  });
}

async function seedGuitarProgress(page: Page): Promise<void> {
  await seedProgress(page, {
    xp: 220,
    streak: { count: 6, last: today() },
    lessons: { 'g1-1': 3, 'g1-2': 2, 'g1-3': 2 },
    keys: { 'g:64': samples(5, 3), 'g:59': samples(8, 1), 'g:55': samples(6, 4) },
    daily: { [today()]: { ms: 2 * 60_000, lessons: 1 } },
    history: [
      { lesson: 'g1-1', accuracy: 900, rhythm: 0 },
      { lesson: 'g1-2', accuracy: 820, rhythm: 0 },
      { lesson: 'g1-3', accuracy: 860, rhythm: 0 },
    ],
  });
}

/** Progreso de piano y de guitarra a la vez (para el móvil, que enseña los dos). */
async function seedBothProgress(page: Page): Promise<void> {
  const white = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76];
  const keys: Record<string, [number, number][]> = {
    'g:64': samples(5, 3),
    'g:59': samples(8, 1),
    'g:55': samples(6, 4),
  };
  white.forEach((midi, i) => {
    keys[String(midi)] = samples(6 + ((i * 3) % 7), (i * 5) % 6 === 0 ? 4 : i % 3);
  });
  await seedProgress(page, {
    xp: 640,
    streak: { count: 6, last: today() },
    lessons: {
      'u1-1': 3,
      'u1-2': 3,
      'u1-3': 2,
      'u1-4': 3,
      'u2-1': 2,
      'g1-1': 3,
      'g1-2': 2,
      'g1-3': 2,
    },
    keys,
    daily: { [today()]: { ms: 3.5 * 60_000, lessons: 2 } },
    history: [
      { lesson: 'u1-1', accuracy: 800, rhythm: 190 },
      { lesson: 'u1-2', accuracy: 900, rhythm: 210 },
      { lesson: 'g1-1', accuracy: 900, rhythm: 0 },
      { lesson: 'u1-4', accuracy: 950, rhythm: 260 },
      { lesson: 'g1-3', accuracy: 860, rhythm: 0 },
    ],
  });
}

async function listening(page: Page): Promise<void> {
  await page.getByTestId('activate-mic').click();
  await expect(page.getByTestId('listen')).toHaveAttribute('data-phase', 'escuchando', {
    timeout: 8000,
  });
}

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

test.describe('escritorio', () => {
  test('piano: camino, ventana de la lección, lección, resultado y progreso', async ({ page }) => {
    await chooseInput(page, 'teclado-pc');
    await seedPianoProgress(page);
    await page.goto('/?seed=7#/');
    await expect(page.getByTestId('node-u2-2')).toHaveAttribute('data-state', 'actual');
    await page.waitForTimeout(600);
    await shot(page, 'camino');

    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForTimeout(300);
    await shot(page, 'camino-claro');
    await page.emulateMedia({ colorScheme: 'dark' });

    await page.getByTestId('instrument-chip').click();
    await expect(page.getByTestId('instrument-list')).toBeVisible();
    await shot(page, 'instrumentos');
    await page.keyboard.press('Escape');

    await page.getByTestId('node-u2-2').getByRole('link').click();
    await expect(page.getByTestId('start-dialog')).toBeVisible();
    await page.waitForTimeout(300);
    await shot(page, 'ventana-leccion');
    await page.getByTestId('start-lesson').click();

    await page.getByTestId('start').click();
    await expect(page.getByTestId('target')).toContainText('Toca esta nota');
    for (let hits = 1; hits <= 3; hits++) {
      await page.waitForTimeout(800);
      await playTarget(page);
      await expect(progressBar(page)).toHaveAttribute('aria-valuenow', String(hits));
    }
    await page.waitForTimeout(900);
    await shot(page, 'leccion');

    // Un fallo y el resto bien: 3 estrellas.
    const target = await targetMidis(page);
    await page.keyboard.press(codeFor(extraNote(target)));
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-tone', 'error');
    await page.waitForTimeout(500);
    await shot(page, 'leccion-error');
    for (let hits = 4; hits <= 10; hits++) {
      await page.waitForTimeout(800);
      await playTarget(page);
      if (hits < 10) await expect(progressBar(page)).toHaveAttribute('aria-valuenow', String(hits));
    }
    await expect(page.getByTestId('result')).toBeVisible();
    await page.waitForTimeout(900);
    await shot(page, 'resultado');

    await page.goto('/?seed=7#/progreso');
    await expect(page.getByRole('heading', { level: 1, name: 'Progreso' })).toBeVisible();
    await page.waitForTimeout(500);
    await shot(page, 'progreso');
  });

  test('piano por micrófono (simulado): la escucha en vivo', async ({ page }) => {
    await page.addInitScript(FAKE_MIC_SCRIPT);
    await chooseInput(page, 'microfono');
    await page.goto('/?seed=7#/leccion/u1-1');
    await listening(page);
    await page.getByTestId('start').click();
    for (let hits = 1; hits <= 3; hits++) {
      await micNote(page, await targetNote(page), { ms: 450 });
      await expect(progressBar(page)).toHaveAttribute('aria-valuenow', String(hits), {
        timeout: 6000,
      });
      await waitForQuiet(page);
    }
    await micNote(page, await targetNote(page), { ms: 1500 });
    await page.waitForTimeout(500);
    await shot(page, 'leccion-microfono');
  });

  test('acordes en la práctica libre: mano, cascada y dedos', async ({ page }) => {
    await page.goto('/?seed=5&pc&mic=off&modo=acordes&nivel=4#/practica');
    await expect(page.getByTestId('welcome')).toBeVisible();
    await page.getByTestId('start').click();
    await expect(page.locator('.key--target')).toHaveCount(3);
    await page.waitForTimeout(1100);
    await shot(page, 'acordes');
  });

  test('guitarra: camino, lección con mástil y afinador', async ({ page }) => {
    await page.addInitScript(FAKE_MIC_SCRIPT);
    await chooseGuitar(page);
    await seedGuitarProgress(page);
    await page.goto('/?seed=7#/guitarra');
    await expect(page.locator('html')).toHaveAttribute('data-instrument', 'guitarra');
    await expect(page.getByTestId('node-g1-4')).toHaveAttribute('data-state', 'actual');
    await page.waitForTimeout(600);
    await shot(page, 'guitarra-camino');

    await page.goto('/?seed=7#/leccion/g2-1');
    await listening(page);
    await page.getByTestId('start').click();
    await expect(page.getByTestId('fretboard').locator('[data-kind="now"]')).toHaveCount(1);
    for (let hits = 1; hits <= 2; hits++) {
      await micNote(page, await targetNote(page), { ms: 450 });
      await expect(progressBar(page)).toHaveAttribute('aria-valuenow', String(hits), {
        timeout: 6000,
      });
      await waitForQuiet(page);
    }
    await page.waitForTimeout(1200);
    await shot(page, 'guitarra-leccion');
  });

  test('guitarra: el afinador', async ({ page }) => {
    await page.addInitScript(FAKE_MIC_SCRIPT);
    await chooseGuitar(page);
    await page.goto('/?seed=7#/afinador');
    await page.getByTestId('tuner-activate').click();
    await expect(page.getByTestId('tuner-mic')).toHaveCount(0, { timeout: 8000 });
    await page.getByTestId('tuner-string-6').click();
    await micNote(page, 40, { ms: 2200, cents: -25 });
    await expect(page.getByTestId('tuner-reading')).toContainText('Grave', { timeout: 8000 });
    await page.waitForTimeout(300);
    await shot(page, 'afinador');
  });
});

test.describe('móvil', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  test('piano y guitarra en el móvil', async ({ page }) => {
    await page.addInitScript(FAKE_MIC_SCRIPT);
    await chooseInput(page, 'microfono');
    await seedBothProgress(page);
    await page.goto('/?seed=7#/');
    await expect(page.getByTestId('node-u2-2')).toHaveAttribute('data-state', 'actual');
    await page.waitForTimeout(600);
    await shot(page, 'movil-camino');

    await page.getByTestId('node-u2-2').getByRole('link').click();
    await expect(page.getByTestId('start-dialog')).toBeVisible();
    await page.waitForTimeout(300);
    await shot(page, 'movil-ventana');
    await page.getByTestId('start-cancel').click();

    await page.goto('/?seed=7#/leccion/u1-1');
    await listening(page);
    await page.getByTestId('start').click();
    for (let hits = 1; hits <= 2; hits++) {
      await micNote(page, await targetNote(page), { ms: 450 });
      await expect(progressBar(page)).toHaveAttribute('aria-valuenow', String(hits), {
        timeout: 6000,
      });
      await waitForQuiet(page);
    }
    await page.waitForTimeout(900);
    await shot(page, 'movil-leccion');

    await page.goto('/?seed=7#/guitarra');
    await expect(page.locator('html')).toHaveAttribute('data-instrument', 'guitarra');
    await expect(page.getByTestId('node-g1-4')).toHaveAttribute('data-state', 'actual');
    await page.waitForTimeout(600);
    await shot(page, 'movil-guitarra');
  });
});
