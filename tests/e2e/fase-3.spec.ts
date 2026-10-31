import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { FAKE_MIC_SCRIPT, micNote, targetNote } from './mic-helpers';
import { codeFor, extraNote, playTarget, targetMidis } from './fase2-helpers';
import {
  F3_EVIDENCE_DIR,
  chooseInput,
  ensureF3Dirs,
  f3Capture,
  fitsInViewport,
  noHorizontalScroll,
  samples,
  seedProgress,
  today,
  upToUnitFive,
} from './fase3-helpers';

test.beforeAll(() => ensureF3Dirs());

async function saveVideo(page: Page, fileName: string): Promise<void> {
  const video = page.video();
  await page.close();
  await video?.saveAs(join(F3_EVIDENCE_DIR, fileName));
}

const progressBar = (page: Page) => page.getByTestId('lesson-progress');

/**
 * Toca bien un objetivo y espera a que la barra de la lección avance. Con `total`, el último objetivo
 * lleva al resultado (la barra desaparece).
 */
async function solve(page: Page, expectedHits: number, total?: number): Promise<void> {
  await playTarget(page);
  if (expectedHits === total) {
    await expect(page.getByTestId('result')).toBeVisible();
  } else {
    await expect(progressBar(page)).toHaveAttribute('aria-valuenow', String(expectedHits));
  }
}

/** Se equivoca una vez con una nota de más (no avanza la barra). */
async function slip(page: Page): Promise<void> {
  const target = await targetMidis(page);
  await page.keyboard.press(codeFor(extraNote(target)));
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-tone', 'error');
}

test('Fase 3 · primera visita: el camino sin datos invita a empezar (claro y oscuro)', async ({
  page,
}) => {
  await chooseInput(page, 'teclado-pc');
  await page.goto('/?seed=7#/');
  await expect(page.getByRole('heading', { level: 1, name: 'Aprender' })).toBeVisible();
  await expect(page).toHaveTitle('Aprender · Passo');
  await expect(page.getByTestId('game-nav').getByRole('link')).toHaveCount(3);
  await expect(page.locator('.unit')).toHaveCount(6);
  await expect(page.getByTestId('node-u1-1')).toHaveAttribute('data-state', 'actual');
  await expect(page.getByTestId('node-u1-1')).toContainText('Empieza aquí');
  await expect(page.getByTestId('node-u1-2')).toHaveAttribute('data-state', 'bloqueada');
  await expect(page.locator('.camino__side').getByText('Empieza hoy')).toBeVisible();
  await expect(page.getByTestId('card-debiles')).toHaveCount(0);
  await page.emulateMedia({ colorScheme: 'dark' });
  await f3Capture(page, '01-camino-primera-visita-oscuro');
  await page.emulateMedia({ colorScheme: 'light' });
  await f3Capture(page, '02-camino-primera-visita-claro');
});

test('Fase 3 · una lección de principio a fin: se guarda, desbloquea la siguiente y sobrevive a recargar (video)', async ({
  page,
}) => {
  await chooseInput(page, 'teclado-pc');
  await page.goto('/?seed=7#/');
  await page.getByTestId('node-u1-1').getByRole('link').click();
  // Tocar la lección abre una ventana; la lección empieza con «Empezar».
  await expect(page.getByTestId('start-dialog')).toContainText('Do · Re · Mi');
  await page.getByTestId('start-lesson').click();
  await expect(page).toHaveURL(/#\/leccion\/u1-1$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Do · Re · Mi' })).toBeFocused();
  await expect(page.getByTestId('lesson-intro')).toContainText('Lección nueva');
  await expect(page.getByTestId('lesson-intro')).toContainText('10 notas');
  await expect(page.getByTestId('input-chip')).toHaveText('Teclado del PC');
  await expect(page.getByTestId('game-nav')).toHaveCount(0);
  await page.waitForTimeout(700);
  await f3Capture(page, '03-leccion-lista');

  await page.getByTestId('start').click();
  await expect(page.getByTestId('target')).toContainText('Toca esta nota');
  await expect(page.getByTestId('target-detail')).toContainText('mano derecha');
  await expect(progressBar(page)).toHaveAttribute('aria-valuenow', '0');
  await solve(page, 1);
  await solve(page, 2);
  await page.waitForTimeout(500);
  await f3Capture(page, '04-leccion-en-curso');

  await test.step('Un error: la barra se pone roja y no avanza', async () => {
    await slip(page);
    await expect(page.getByTestId('counters')).toContainText('Errores 1');
    await expect(progressBar(page)).toHaveAttribute('aria-valuenow', '2');
    await page.waitForTimeout(500);
    await f3Capture(page, '05-leccion-error');
  });

  for (let hits = 3; hits <= 10; hits++) await solve(page, hits, 10);

  await test.step('Resultado: 3 estrellas (un fallo de 10 deja 90 %), experiencia y lo que más costó', async () => {
    await expect(page.getByTestId('result')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: '¡Lección completa!' })).toBeFocused();
    await expect(page.getByRole('img', { name: '3 de 3 estrellas' })).toBeVisible();
    await expect(page.getByTestId('result-accuracy')).toHaveText('90 %');
    // 9 objetivos a la primera (90) + 1 a la segunda (5) + 3 estrellas nuevas (30).
    await expect(page.getByTestId('result-xp')).toContainText('+125');
    await expect(page.getByTestId('result-hard')).toContainText('Lo que más costó');
    await expect(page.getByTestId('result-retry')).toHaveText('Repetir');
    await page.waitForTimeout(600);
    await f3Capture(page, '06-resultado');
  });

  await test.step('Continuar: la lección queda hecha y la siguiente es la actual', async () => {
    await page.getByTestId('result-continue').click();
    await expect(page).toHaveURL(/#\/piano$/);
    await expect(page.getByTestId('node-u1-1')).toHaveAttribute('data-state', 'hecha');
    await expect(page.getByTestId('node-u1-1').getByRole('img')).toHaveAccessibleName(
      '3 de 3 estrellas',
    );
    await expect(page.getByTestId('node-u1-2')).toHaveAttribute('data-state', 'actual');
    await expect(page.getByText('1 día seguidos')).toBeVisible();
    await page.waitForTimeout(500);
    await f3Capture(page, '07-camino-con-progreso');
  });

  await test.step('Recargar: el progreso sigue ahí', async () => {
    await page.reload();
    await expect(page.getByTestId('node-u1-1')).toHaveAttribute('data-state', 'hecha');
    await expect(page.getByTestId('node-u1-2')).toHaveAttribute('data-state', 'actual');
    const saved = await page.evaluate(() => window.localStorage.getItem('passo.progreso'));
    expect(saved).toContain('"u1-1"');
    expect(JSON.parse(saved ?? '{}').xp).toBe(125);
  });
  await saveVideo(page, '01-leccion-completa.webm');
});

test('Fase 3 · salir a media lección pregunta y no guarda nada', async ({ page }) => {
  await chooseInput(page, 'teclado-pc');
  await page.goto('/?seed=7#/leccion/u1-1');
  await page.getByTestId('start').click();
  await solve(page, 1);
  await solve(page, 2);

  await page.getByTestId('lesson-exit').click();
  await expect(page.getByTestId('exit-dialog')).toBeVisible();
  await expect(page.getByTestId('exit-continue')).toBeFocused();
  await expect(page.getByTestId('paused')).toContainText('Ronda en pausa');
  await f3Capture(page, '08-salir-pregunta');

  await page.getByTestId('exit-continue').click();
  await expect(page.getByTestId('exit-dialog')).toHaveCount(0);
  await solve(page, 3);

  await page.getByTestId('lesson-exit').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('exit-dialog')).toHaveCount(0);

  await page.getByTestId('lesson-exit').click();
  await page.getByTestId('exit-leave').click();
  await expect(page).toHaveURL(/#\/piano$/);
  await expect(page.getByTestId('camino')).toBeVisible();
  await expect(page.getByTestId('node-u1-1')).toHaveAttribute('data-state', 'actual');
  expect(await page.evaluate(() => window.localStorage.getItem('passo.progreso'))).toBeNull();
});

test('Fase 3 · el camino se desbloquea por avance y «saltar con prueba» abre la unidad siguiente', async ({
  page,
}) => {
  await chooseInput(page, 'teclado-pc');
  await seedProgress(page, { lessons: { 'u1-1': 3, 'u1-2': 1 } });
  await page.goto('/?seed=7#/');
  await expect(page.getByTestId('node-u1-1')).toHaveAttribute('data-state', 'hecha');
  await expect(page.getByTestId('node-u1-2')).toHaveAttribute('data-state', 'hecha');
  await expect(page.getByTestId('node-u1-3')).toHaveAttribute('data-state', 'actual');
  // La prueba de la unidad está abierta desde el principio de la unidad.
  await expect(page.getByTestId('node-u1-4')).toHaveAttribute('data-state', 'abierta');
  await expect(page.getByTestId('node-u2-1')).toHaveAttribute('data-state', 'bloqueada');

  // Un nodo bloqueado explica al pulsarlo (Playwright lo ve «deshabilitado» por aria-disabled).
  await page.getByTestId('node-u2-1').getByRole('button').click({ force: true });
  await expect(page.getByTestId('explicacion')).toContainText('Termina la unidad anterior');
});

test('Fase 3 · terceras y acordes con micrófono sin la beta quedan bloqueados y explican por qué', async ({
  page,
}) => {
  await page.addInitScript(FAKE_MIC_SCRIPT);
  await seedProgress(page, { lessons: upToUnitFive() });
  await page.goto('/?seed=7#/');
  await expect(page.getByTestId('node-u5-4')).toHaveAttribute('data-state', 'hecha');
  await expect(page.getByTestId('node-u6-1')).toHaveAttribute('data-state', 'bloqueada-entrada');
  await expect(page.locator('[data-unit="u6"] .unit__kicker')).toHaveText('Unidad 6 · Opcional');

  await page.getByTestId('node-u6-1').getByRole('button').click({ force: true });
  await expect(page.getByTestId('explicacion')).toContainText('piano MIDI o teclado del PC');
  await f3Capture(page, '09-camino-bloqueo-por-entrada');
  await page.getByRole('button', { name: 'Abrir ajustes' }).click();
  await expect(page.getByTestId('settings-panel')).toBeVisible();
  await page.getByTestId('settings-close').click();

  await page.goto('/?seed=7#/leccion/u6-1');
  await expect(page.getByTestId('lesson-blocked')).toContainText('piano MIDI o teclado del PC');
  await expect(page.getByTestId('start')).toHaveCount(0);
});

test('Fase 3 · una lección por micrófono (simulado): activar, calibrar y tocar (video)', async ({
  page,
}) => {
  await page.addInitScript(FAKE_MIC_SCRIPT);
  await page.goto('/?seed=7#/leccion/u1-1');
  await expect(page.getByTestId('lesson-intro')).toBeVisible();
  await expect(page.getByTestId('input-chip')).toHaveText('Micrófono');
  await expect(page.getByTestId('activate-mic')).toBeVisible();
  await expect(page.getByTestId('start')).toHaveCount(0);
  await f3Capture(page, '10-leccion-microfono-activar');

  await page.getByTestId('activate-mic').click();
  await expect(page.getByTestId('listen')).toHaveAttribute('data-phase', 'escuchando', {
    timeout: 8000,
  });
  await page.getByTestId('start').click();
  await expect(page.getByTestId('target')).toBeVisible();
  await expect(page.getByTestId('stage-idle')).toContainText('Escuchando tu nota');

  for (let hits = 1; hits <= 3; hits++) {
    const midi = await targetNote(page);
    await micNote(page, midi, { ms: 450 });
    await expect(progressBar(page)).toHaveAttribute('aria-valuenow', String(hits), {
      timeout: 5000,
    });
    // Espera a que se calle el micrófono antes de la siguiente nota.
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
  await f3Capture(page, '11-leccion-microfono-en-curso');
  await saveVideo(page, '02-leccion-microfono.webm');
});

test('Fase 3 · el progreso: mapa del teclado, curva de precisión, cifras y borrado con confirmación', async ({
  page,
}) => {
  await chooseInput(page, 'teclado-pc');
  await seedProgress(page, {
    xp: 1240,
    streak: { count: 7, last: today() },
    lessons: { 'u1-1': 3, 'u1-2': 2, 'u1-3': 3, 'u1-4': 1, 'u2-1': 2 },
    history: [
      { lesson: 'u1-1', accuracy: 760, rhythm: 180 },
      { lesson: 'u1-2', accuracy: 820, rhythm: 200 },
      { lesson: 'u1-3', accuracy: 880, rhythm: 220 },
      { lesson: 'u1-4', accuracy: 860, rhythm: 240 },
      { lesson: 'u2-1', accuracy: 920, rhythm: 260 },
      { lesson: 'u2-2', accuracy: 940, rhythm: 280 },
    ],
    keys: {
      '60': samples(8, 0, 800),
      '62': samples(2, 6, 1900),
      '64': samples(7, 1, 1000),
      '65': samples(1, 7, 2100),
    },
    daily: { [today(-1)]: { ms: 420_000, lessons: 3 }, [today()]: { ms: 200_000, lessons: 2 } },
  });
  await page.goto('/?seed=7#/');
  await page.getByTestId('game-nav').getByRole('link', { name: 'Progreso' }).click();
  await expect(page).toHaveURL(/#\/piano\/progreso$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Progreso' })).toBeFocused();
  await expect(page).toHaveTitle('Progreso · Passo');
  await expect(page.getByTestId('kpi-accuracy')).toHaveText(/^\d+ %$/);
  await expect(page.getByTestId('kpi-time')).toHaveText('10 min');
  await expect(page.getByTestId('heat-60')).toHaveAttribute('data-level', 'fuerte');
  await expect(page.getByTestId('heat-62')).toHaveAttribute('data-level', 'debil');
  await expect(page.getByTestId('heat-65')).toHaveAttribute('data-level', 'debil');
  await expect(page.getByTestId('heat-67')).toHaveAttribute('data-level', 'sin-datos');
  await expect(page.getByTestId('chart').locator('.chart__dot')).toHaveCount(6);
  await page.waitForTimeout(500);
  await f3Capture(page, '12-progreso');

  await page.getByTestId('borrar').click();
  await expect(page.getByTestId('confirmar-borrado')).toContainText('¿Seguro?');
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByTestId('kpi-time')).toHaveText('10 min');
  await page.getByTestId('borrar').click();
  await page.getByTestId('borrar-si').click();
  await expect(page.getByTestId('progreso-vacio')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('progreso-vacio')).toBeVisible();
  await f3Capture(page, '13-progreso-vacio');
});

test('Fase 3 · practicar tus puntos débiles: una lección armada con lo que más cuesta', async ({
  page,
}) => {
  await chooseInput(page, 'teclado-pc');
  await seedProgress(page, {
    xp: 300,
    lessons: { 'u1-1': 2, 'u1-2': 2 },
    keys: { '62': samples(2, 6), '65': samples(1, 7), '60': samples(8, 0) },
  });
  await page.goto('/?seed=7#/');
  const card = page.getByTestId('card-debiles');
  await expect(card).toContainText('Puntos débiles');
  await expect(card).toContainText('Fa4');
  await f3Capture(page, '14-camino-puntos-debiles');

  await page.getByTestId('practicar-debiles').click();
  await expect(page).toHaveURL(/#\/leccion\/repaso-debiles$/);
  await expect(page.getByTestId('lesson-intro')).toContainText('Repaso');
  await expect(page.getByTestId('lesson-intro')).toContainText('14 notas');
  await page.getByTestId('start').click();
  for (let hits = 1; hits <= 14; hits++) await solve(page, hits, 14);

  await expect(page.getByRole('heading', { level: 1, name: '¡Repaso hecho!' })).toBeVisible();
  // Un repaso da la mitad de experiencia y no deja estrellas.
  await expect(page.getByTestId('result-xp')).toContainText('+70');
  await expect(page.getByRole('img', { name: /de 3 estrellas/ })).toHaveCount(0);
  const saved = JSON.parse(
    (await page.evaluate(() => window.localStorage.getItem('passo.progreso'))) ?? '{}',
  );
  expect(Object.keys(saved.lessons)).toEqual(['u1-1', 'u1-2']);
  expect(saved.xp).toBe(370);
});

test('Fase 3 · la práctica libre sigue a un clic y la marca «Passo» vuelve al camino', async ({
  page,
}) => {
  await chooseInput(page, 'teclado-pc');
  await page.goto('/?seed=7#/');
  await page.getByTestId('game-nav').getByRole('link', { name: 'Práctica libre' }).click();
  await expect(page).toHaveURL(/#\/practica$/);
  await expect(page.getByTestId('welcome')).toBeVisible();
  await expect(page).toHaveTitle('Práctica libre · Passo');
  await page.getByTestId('start').click();
  await expect(page.getByTestId('target')).toBeVisible();
  await page.getByRole('link', { name: 'Passo' }).click();
  await expect(page).toHaveURL(/#\/piano$/);
  await expect(page.getByTestId('camino')).toBeVisible();
  // Al volver al camino la ronda libre se descarta: la práctica vuelve a la bienvenida.
  await page.getByTestId('game-nav').getByRole('link', { name: 'Práctica libre' }).click();
  await expect(page.getByTestId('welcome')).toBeVisible();
});

test('Fase 3 · en un móvil el camino, la lección y el progreso caben sin desplazamiento horizontal', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await chooseInput(page, 'teclado-pc');
  await seedProgress(page, {
    xp: 1240,
    streak: { count: 7, last: today() },
    lessons: { 'u1-1': 3, 'u1-2': 2 },
    keys: { '62': samples(2, 6), '60': samples(8, 0) },
    history: [
      { lesson: 'u1-1', accuracy: 800, rhythm: 200 },
      { lesson: 'u1-2', accuracy: 900, rhythm: 240 },
    ],
    daily: { [today()]: { ms: 200_000, lessons: 2 } },
  });

  await page.goto('/?seed=7#/');
  await expect(page.getByTestId('game-nav-bottom')).toBeVisible();
  await expect(page.getByTestId('game-nav')).toHaveCount(0);
  await expect(page.getByTestId('chip-meta')).toBeVisible();
  await expect(page.getByTestId('card-debiles')).toBeHidden();
  expect(await noHorizontalScroll(page)).toBe(true);
  await f3Capture(page, '15-movil-camino');

  await page.getByTestId('game-nav-bottom').getByRole('link', { name: 'Progreso' }).click();
  await expect(page.getByTestId('progreso')).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
  await f3Capture(page, '16-movil-progreso');

  await page.goto('/?seed=7#/leccion/u1-3');
  await expect(page.getByTestId('lesson-intro')).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
  await page.getByTestId('start').click();
  await solve(page, 1);
  await solve(page, 2);
  await slip(page);
  expect(await fitsInViewport(page)).toBe(true);
  await f3Capture(page, '17-movil-leccion');
});

test('Fase 3 · a 1366×650 la lección cabe entera sin desplazarse (antes, durante y después)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 650 });
  await chooseInput(page, 'teclado-pc');
  await page.goto('/?seed=7#/leccion/u1-1');
  await expect(page.getByTestId('lesson-intro')).toBeVisible();
  expect(await fitsInViewport(page)).toBe(true);
  await f3Capture(page, '18-1366x650-lista');

  await page.getByTestId('start').click();
  await solve(page, 1);
  expect(await fitsInViewport(page)).toBe(true);
  await slip(page);
  expect(await fitsInViewport(page)).toBe(true);
  await f3Capture(page, '19-1366x650-error');

  for (let hits = 2; hits <= 10; hits++) await solve(page, hits, 10);
  await expect(page.getByTestId('result')).toBeVisible();
  expect(await fitsInViewport(page)).toBe(true);
  await f3Capture(page, '20-1366x650-resultado');
});

test('Fase 3 · lo guardado dañado o de una versión nueva no rompe nada', async ({ page }) => {
  await chooseInput(page, 'teclado-pc');
  await page.addInitScript(() => {
    if (!window.localStorage.getItem('passo.progreso')) {
      window.localStorage.setItem('passo.progreso', '{"version":1,"xp":');
    }
  });
  await page.goto('/?seed=7#/');
  await expect(page.getByTestId('camino')).toBeVisible();
  await expect(page.getByTestId('node-u1-1')).toHaveAttribute('data-state', 'actual');
  // La copia dañada queda aparte para no perderla.
  expect(await page.evaluate(() => window.localStorage.getItem('passo.progreso.corrupto'))).toBe(
    '{"version":1,"xp":',
  );

  const future = await page.context().newPage();
  await future.addInitScript(() =>
    window.localStorage.setItem('passo.progreso', '{"version":99,"datos":"de otra versión"}'),
  );
  await future.goto('/?seed=7#/');
  await expect(future.getByTestId('no-guarda')).toBeVisible();
  await expect(future.getByTestId('node-u1-1')).toHaveAttribute('data-state', 'actual');
  expect(await future.evaluate(() => window.localStorage.getItem('passo.progreso'))).toBe(
    '{"version":99,"datos":"de otra versión"}',
  );
});
