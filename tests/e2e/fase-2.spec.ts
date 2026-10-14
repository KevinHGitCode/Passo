import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { beat } from './helpers';
import {
  F2_EVIDENCE_DIR,
  down,
  ensureF2Dirs,
  extraNote,
  f2Capture,
  keyboardTop,
  playTarget,
  releaseAll,
  targetMidis,
} from './fase2-helpers';

test.beforeAll(() => ensureF2Dirs());

async function saveVideo(page: Page, fileName: string): Promise<void> {
  const video = page.video();
  await page.close();
  await video?.saveAs(join(F2_EVIDENCE_DIR, fileName));
}

const feedback = (page: Page) => page.getByTestId('feedback');

test('Fase 2 · terceras: ronda completa con avance parcial, nota de más y resumen (video)', async ({
  page,
}) => {
  await page.goto('/?seed=7&pc&mic=off&modo=terceras&nivel=2');
  await expect(page.getByTestId('welcome')).toContainText('Toca la tercera que aparece');
  await expect(page.getByTestId('welcome')).toContainText('Las siete terceras');
  await beat(page, 800);
  await f2Capture(page, '01-terceras-bienvenida');

  await page.getByTestId('start').click();
  await expect(page.getByTestId('target')).toContainText('Toca esta tercera');
  await expect(page.getByTestId('target-detail')).toHaveText(/^mano derecha · dedos \d · \d$/);
  await expect(page.getByTestId('counters')).toContainText('Terceras 0/12');
  const first = await targetMidis(page);
  expect(first).toHaveLength(2);
  await expect(page.locator('.key--target')).toHaveCount(2);
  await beat(page, 900);
  await f2Capture(page, '02-tercera-objetivo');

  await test.step('Una nota sola es un avance: se marca y dice qué falta', async () => {
    await down(page, first[0] as number);
    await expect(feedback(page)).toContainText('Casi');
    await expect(feedback(page)).toContainText('Falta');
    await expect(page.locator('.target__chip[data-held="true"]')).toHaveCount(1);
    await expect(page.getByTestId('counters')).toContainText('Terceras 0/12');
    await expect(page.getByTestId('counters')).toContainText('Errores 0');
    await beat(page, 900);
    await f2Capture(page, '03-tercera-avance-parcial');
  });

  await test.step('Una nota de más es un error al instante y dice qué tocar', async () => {
    const extra = extraNote(first);
    await down(page, extra);
    await expect(feedback(page)).toHaveAttribute('data-tone', 'error');
    await expect(feedback(page)).toContainText('Sobró');
    await expect(page.getByTestId('counters')).toContainText('Errores 1');
    await beat(page, 900);
    await f2Capture(page, '04-tercera-nota-de-mas');
    await releaseAll(page, [extra]);
  });

  await test.step('Completar la tercera después del error sí avanza', async () => {
    await down(page, first[1] as number);
    await expect(page.getByTestId('counters')).toContainText('Terceras 1/12');
    await expect(feedback(page)).toHaveAttribute('data-tone', 'ok');
    await releaseAll(page, first);
  });

  await test.step('El resto de la ronda, tocando las dos notas a la vez', async () => {
    for (let i = 0; i < 11; i++) {
      await playTarget(page);
      await page.waitForTimeout(60);
    }
    await expect(page.getByTestId('summary')).toBeVisible();
    await expect(page.getByTestId('summary')).toContainText('11/12');
    await expect(page.getByTestId('summary')).toContainText('Más lento');
    await beat(page, 900);
    await f2Capture(page, '05-terceras-resumen');
  });
  await saveVideo(page, 'terceras-ronda-completa.webm');
});

test('Fase 2 · soltar una tecla quita la nota: tocarlas una tras otra no es una tercera', async ({
  page,
}) => {
  await page.goto('/?seed=11&pc&mic=off&modo=terceras&nivel=1');
  await page.getByTestId('start').click();
  const [low, high] = (await targetMidis(page)) as [number, number];
  await down(page, low);
  await releaseAll(page, [low]);
  await down(page, high);
  await expect(feedback(page)).toContainText('Falta');
  await expect(page.getByTestId('counters')).toContainText('Terceras 0/12');
  await down(page, low);
  await expect(page.getByTestId('counters')).toContainText('Terceras 1/12');
  await releaseAll(page, [low, high]);
});

test('Fase 2 · acordes de la mano derecha: nombre, dedos 1-3-5 y acordes mal armados (video)', async ({
  page,
}) => {
  await page.goto('/?seed=5&pc&mic=off&modo=acordes&nivel=4');
  await expect(page.getByTestId('welcome')).toContainText('Toca el acorde que aparece');
  await page.getByTestId('start').click();
  await expect(page.getByTestId('target-detail')).toHaveText(
    /^(Do|Re|Mi|Fa|Sol|La) (mayor|menor) · mano derecha · dedos 1 · 3 · 5$/,
  );
  const chord = await targetMidis(page);
  expect(chord).toHaveLength(3);
  await expect(page.locator('.key--target')).toHaveCount(3);
  await beat(page, 900);
  await f2Capture(page, '06-acorde-objetivo');

  await test.step('Dos de tres notas: falta una, no es error', async () => {
    await down(page, chord[0] as number);
    await down(page, chord[2] as number);
    await expect(feedback(page)).toContainText('Falta');
    await expect(page.getByTestId('counters')).toContainText('Errores 0');
    await beat(page, 700);
    await f2Capture(page, '07-acorde-falta-una');
  });

  await test.step('Un acorde mal armado cuenta un solo error aunque sobren varias notas', async () => {
    const wrongA = extraNote(chord);
    const wrongB = extraNote([...chord, wrongA]);
    await down(page, wrongA);
    await down(page, wrongB);
    await expect(feedback(page)).toHaveAttribute('data-tone', 'error');
    await expect(page.getByTestId('counters')).toContainText('Errores 1');
    await beat(page, 700);
    await f2Capture(page, '08-acorde-mal-armado');
    await releaseAll(page, [wrongA, wrongB]);
  });

  await test.step('Con la tercera nota, el acorde se completa', async () => {
    await down(page, chord[1] as number);
    await expect(page.getByTestId('counters')).toContainText('Acordes 1/12');
    await releaseAll(page, chord);
  });
  await saveVideo(page, 'acordes-mano-derecha.webm');
});

test('Fase 2 · acordes de la mano izquierda: dedos 5-3-1 con la fila Z X C V B N M', async ({
  page,
}) => {
  await page.goto('/?seed=9&pc&mic=off&modo=acordes&nivel=5');
  await expect(page.getByTestId('welcome')).toContainText('mano izquierda');
  await page.getByTestId('start').click();
  await expect(page.getByTestId('target-detail')).toHaveText(
    /^(Do|Re|Mi|Fa|Sol|La) (mayor|menor) · mano izquierda · dedos 5 · 3 · 1$/,
  );
  await f2Capture(page, '09-acorde-mano-izquierda');
  for (let i = 0; i < 12; i++) {
    const notes = await targetMidis(page);
    expect(notes[0]).toBeLessThan(60);
    await playTarget(page);
    await page.waitForTimeout(60);
  }
  await expect(page.getByTestId('summary')).toBeVisible();
  await expect(page.getByTestId('summary')).toContainText('12/12');
});

test('Fase 2 · con notación americana el acorde se llama «C major»', async ({ page }) => {
  await page.goto('/?seed=3&pc&mic=off&modo=acordes&nivel=1');
  await page.getByTestId('start').click();
  await page.getByLabel('C D E').click();
  await expect(page.getByTestId('target-detail')).toHaveText(/^(C|G) major · /);
  await f2Capture(page, '10-acorde-notacion-americana');
});

for (const size of [
  { width: 1280, height: 800 },
  { width: 1366, height: 650 },
]) {
  test.describe(`estabilidad ${size.width}×${size.height}`, () => {
    test.use({ viewport: size });

    test(`Fase 2 · el teclado no se mueve entre notas, terceras y acordes (${size.width}×${size.height})`, async ({
      page,
    }) => {
      const tops: Record<string, number> = {};

      await page.goto('/?seed=7&pc&mic=off');
      tops['notas-bienvenida'] = await keyboardTop(page);
      await page.getByTestId('start').click();
      await expect(page.getByTestId('target')).toBeVisible();
      tops['notas-ronda'] = await keyboardTop(page);

      for (const [mode, level] of [
        ['terceras', 2],
        ['acordes', 4],
        ['acordes', 5],
      ] as const) {
        await page.goto(`/?seed=7&pc&mic=off&modo=${mode}&nivel=${level}`);
        tops[`${mode}${level}-bienvenida`] = await keyboardTop(page);
        await page.getByTestId('start').click();
        await expect(page.getByTestId('target-detail')).toBeVisible();
        tops[`${mode}${level}-ronda`] = await keyboardTop(page);

        const notes = await targetMidis(page);
        await down(page, notes[0] as number);
        await expect(feedback(page)).toContainText('Casi');
        tops[`${mode}${level}-parcial`] = await keyboardTop(page);

        const extra = extraNote(notes);
        await down(page, extra);
        await expect(feedback(page)).toHaveAttribute('data-tone', 'error');
        tops[`${mode}${level}-error`] = await keyboardTop(page);
        await releaseAll(page, [notes[0] as number, extra]);

        for (let i = 0; i < 12; i++) {
          if (await page.getByTestId('summary').isVisible()) break;
          await playTarget(page);
          await page.waitForTimeout(40);
        }
        await expect(page.getByTestId('summary')).toBeVisible();
        tops[`${mode}${level}-resumen`] = await keyboardTop(page);
      }

      writeFileSync(
        join(F2_EVIDENCE_DIR, `estabilidad-visual-${size.width}x${size.height}.json`),
        JSON.stringify(tops, null, 2),
      );
      const reference = tops['notas-bienvenida'] as number;
      for (const [state, top] of Object.entries(tops)) {
        expect(Math.abs(top - reference), `el teclado se movió en «${state}»`).toBeLessThanOrEqual(
          1,
        );
      }
    });
  });
}
