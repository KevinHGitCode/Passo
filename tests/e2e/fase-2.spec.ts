import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { FAKE_MIDI_SCRIPT, beat, closeSettings, openSettings } from './helpers';
import { FAKE_MIC_SCRIPT } from './mic-helpers';
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
  await openSettings(page);
  await page.getByLabel('C D E').click();
  await closeSettings(page);
  await expect(page.getByTestId('target-detail')).toHaveText(/^(C|G) major · /);
  await f2Capture(page, '10-acorde-notacion-americana');
});

test('Fase 2 · las preferencias se recuerdan al recargar (notación, ayuda y tema)', async ({
  page,
}) => {
  await page.goto('/?seed=3&pc&mic=off');
  await openSettings(page);
  await page.getByLabel('C D E').click();
  await page.getByTestId('help-switch').click();
  await page.getByTestId('theme-claro').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'claro');
  await closeSettings(page);

  const saved = await page.evaluate(() => window.localStorage.getItem('passo.preferencias'));
  expect(JSON.parse(saved ?? '{}')).toMatchObject({
    version: 1,
    notation: 'americana',
    help: false,
    theme: 'claro',
    mode: 'notas',
  });

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'claro');
  await openSettings(page);
  await expect(page.getByLabel('C D E')).toBeChecked();
  await expect(page.getByTestId('help-switch')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('theme-claro')).toBeChecked();
  await closeSettings(page);
  await page.getByTestId('start').click();
  await expect(page.getByTestId('target-note')).toHaveText(/^[CDEFG]4$/);
  await expect(page.locator('.key--target')).toHaveCount(0);
  await beat(page, 600);
  await f2Capture(page, '11-preferencias-recordadas');
});

test('Fase 2 · el tema que se guardaba antes de las preferencias se conserva', async ({ page }) => {
  await page.addInitScript(() => {
    if (!window.localStorage.getItem('passo.preferencias')) {
      window.localStorage.setItem('passo.tema', 'oscuro');
    }
  });
  await page.goto('/?seed=3&pc&mic=off');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'oscuro');
  await openSettings(page);
  await page.getByLabel('C D E').click();
  const saved = await page.evaluate(() => window.localStorage.getItem('passo.preferencias'));
  expect(JSON.parse(saved ?? '{}')).toMatchObject({ theme: 'oscuro', notation: 'americana' });
});

test('Fase 2 · ?modo= fija el ejercicio de esta visita pero no lo guarda', async ({ page }) => {
  await page.goto('/?seed=3&pc&mic=off&modo=acordes&nivel=3');
  await expect(page.getByTestId('welcome')).toContainText('Toca el acorde que aparece');
  await openSettings(page);
  await page.getByLabel('C D E').click();
  const saved = await page.evaluate(() => window.localStorage.getItem('passo.preferencias'));
  expect(JSON.parse(saved ?? '{}')).toMatchObject({ mode: 'notas', notation: 'americana' });

  await page.goto('/?seed=3&pc&mic=off');
  await expect(page.getByTestId('welcome')).toContainText('Toca la nota que aparece');
});

test('Fase 2 · sin almacenamiento (ventana privada o bloqueado) la app sigue funcionando', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('bloqueado', 'SecurityError');
      },
    });
  });
  await page.goto('/?seed=3&pc&mic=off');
  await openSettings(page);
  await page.getByLabel('C D E').click();
  await closeSettings(page);
  await page.getByTestId('start').click();
  await expect(page.getByTestId('target-note')).toHaveText(/^[CDEFG]4$/);
});

/** Deja guardada la entrada elegida antes de que cargue la página (solo la primera vez). */
async function chooseInput(page: Page, input: 'microfono' | 'midi' | 'teclado-pc'): Promise<void> {
  await page.addInitScript((value) => {
    if (!window.localStorage.getItem('passo.preferencias')) {
      window.localStorage.setItem(
        'passo.preferencias',
        JSON.stringify({ version: 1, input: value }),
      );
    }
  }, input);
}

const micCalls = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __fakeMic: { calls: unknown[] } }).__fakeMic.calls.length,
  );

test('Fase 2 · por defecto escucha el micrófono, pero no se enciende solo hasta que lo activas', async ({
  page,
}) => {
  await page.addInitScript(FAKE_MIC_SCRIPT);
  await page.goto('/?seed=3');
  await expect(page.getByTestId('mic-panel')).toBeVisible();
  await expect(page.getByTestId('status-microfono')).toBeVisible();
  await expect(page.getByTestId('status-teclado-pc')).toHaveCount(0);
  await expect(page.getByTestId('status-midi')).toHaveCount(0);
  await page.waitForTimeout(1200);
  expect(await micCalls(page)).toBe(0);
  await page.keyboard.press('KeyA');
  await page.mouse.click(5, 5);
  await page.waitForTimeout(300);
  expect(await micCalls(page)).toBe(0);

  await page.getByTestId('activate-mic').click();
  await expect(page.getByTestId('mic-panel')).toHaveAttribute(
    'data-state',
    /calibrando|escuchando/,
  );
  expect(await micCalls(page)).toBe(1);
});

test('Fase 2 · con el teclado del PC elegido no aparece el micrófono ni se pide permiso (video)', async ({
  page,
}) => {
  await page.addInitScript(FAKE_MIC_SCRIPT);
  await chooseInput(page, 'teclado-pc');
  await page.goto('/?seed=7');
  await expect(page.getByTestId('welcome')).toBeVisible();
  await expect(page.getByTestId('mic-panel')).toHaveCount(0);
  await expect(page.getByTestId('status-teclado-pc')).toContainText('Teclado del PC');
  await expect(page.getByTestId('status-microfono')).toHaveCount(0);
  await expect(page.getByTestId('pc-hint')).toContainText('A S D F G');
  await beat(page, 800);
  await f2Capture(page, '12-entrada-teclado-del-pc');

  await page.getByTestId('start').click();
  for (let i = 0; i < 3; i++) {
    const notes = await targetMidis(page);
    await down(page, notes[0] as number);
    await releaseAll(page, notes);
  }
  await expect(page.getByTestId('counters')).toContainText('Notas 3/20');
  expect(await micCalls(page)).toBe(0);
  await saveVideo(page, 'entrada-teclado-del-pc.webm');
});

test('Fase 2 · con el piano MIDI elegido solo escucha el MIDI (el teclado del PC no cuenta)', async ({
  page,
}) => {
  await page.addInitScript(FAKE_MIC_SCRIPT);
  await page.addInitScript(FAKE_MIDI_SCRIPT);
  await chooseInput(page, 'midi');
  await page.goto('/?seed=7');
  await expect(page.getByTestId('mic-panel')).toHaveCount(0);
  await expect(page.getByTestId('status-midi')).toBeVisible();
  await expect(page.getByTestId('status-teclado-pc')).toHaveCount(0);
  await page.getByTestId('start').click();
  await expect(page.getByTestId('target')).toBeVisible();

  // El teclado del PC está apagado: pulsar teclas no hace nada.
  const target = (await targetMidis(page))[0] as number;
  await page.keyboard.down('KeyA');
  await page.keyboard.up('KeyA');
  await page.keyboard.down('KeyS');
  await page.keyboard.up('KeyS');
  await expect(page.getByTestId('counters')).toContainText('Notas 0/20');
  await expect(page.getByTestId('counters')).toContainText('Errores 0');
  expect(await micCalls(page)).toBe(0);
  expect(target).toBeGreaterThan(0);
});

test('Fase 2 · ajustes: elegir entrada y ejercicio desde el engranaje, con la ronda en pausa (video)', async ({
  page,
}) => {
  await page.addInitScript(FAKE_MIC_SCRIPT);
  await page.addInitScript(FAKE_MIDI_SCRIPT);
  await page.goto('/?seed=7');
  await expect(page.getByTestId('mic-panel')).toBeVisible();
  await beat(page, 700);
  await f2Capture(page, '13-ajustes-cerrados-microfono');

  await test.step('Con el micrófono solo hay notas: terceras y acordes están bloqueados', async () => {
    await openSettings(page);
    await expect(page.getByTestId('input-microfono')).toBeChecked();
    await expect(page.getByTestId('mode-terceras')).toBeDisabled();
    await expect(page.getByTestId('mode-acordes')).toBeDisabled();
    await expect(page.getByTestId('mode-blocked')).toContainText('beta');
    await beat(page, 800);
    await f2Capture(page, '14-ajustes-microfono');
  });

  await test.step('Elegir el teclado del PC: se enciende solo ese y el micrófono ni se toca', async () => {
    await page.getByTestId('input-teclado-pc').check();
    await expect(page.getByTestId('input-status')).toHaveText('Activo');
    await expect(page.getByTestId('mode-terceras')).toBeEnabled();
    expect(await micCalls(page)).toBe(0);
    await page.getByTestId('mode-terceras').check();
    await page.getByTestId('level-2').check();
    await beat(page, 800);
    await f2Capture(page, '15-ajustes-teclado-terceras');
    await closeSettings(page);
    await expect(page.getByTestId('mic-panel')).toHaveCount(0);
    await expect(page.getByTestId('welcome')).toContainText('Toca la tercera que aparece');
  });

  await test.step('Con la ronda en curso, los ajustes la pausan y Esc la reanuda', async () => {
    await page.getByTestId('start').click();
    const target = await targetMidis(page);
    await down(page, target[0] as number);
    await expect(feedback(page)).toContainText('Casi');
    await releaseAll(page, target);

    await page.keyboard.press('Control+Comma');
    await expect(page.getByTestId('settings-panel')).toBeVisible();
    await expect(page.locator('.paused')).toBeVisible();
    await expect(
      page.getByTestId('settings-panel').getByRole('heading', { name: 'Ajustes' }),
    ).toBeFocused();
    await beat(page, 700);
    await f2Capture(page, '16-ajustes-con-ronda-en-pausa');
    // En pausa las teclas no cuentan.
    await down(page, target[0] as number);
    await releaseAll(page, target);
    await expect(page.getByTestId('counters')).toContainText('Errores 0');
    await expect(page.getByTestId('counters')).toContainText('Terceras 0/12');

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('settings-panel')).toHaveCount(0);
    await expect(page.locator('.paused')).toHaveCount(0);
    await expect(page.getByTestId('settings-button')).toBeFocused();
    await playTarget(page);
    await expect(page.getByTestId('counters')).toContainText('Terceras 1/12');
  });

  await test.step('Cambiar a piano MIDI: el teclado del PC deja de contar', async () => {
    await openSettings(page);
    await page.getByTestId('input-midi').check();
    await expect(page.getByTestId('input-status')).toContainText('Yamaha');
    await closeSettings(page);
    await expect(page.getByTestId('status-midi')).toBeVisible();
    await expect(page.getByTestId('status-teclado-pc')).toHaveCount(0);
    const target = await targetMidis(page);
    await down(page, target[0] as number);
    await releaseAll(page, target);
    await expect(page.getByTestId('counters')).toContainText('Terceras 1/12');
    await expect(page.getByTestId('counters')).toContainText('Errores 0');
  });

  await test.step('Volver al micrófono: vuelve a las notas y sigue apagado hasta que lo actives', async () => {
    await openSettings(page);
    await page.getByTestId('input-microfono').check();
    await expect(page.getByTestId('mode-notas')).toBeChecked();
    await closeSettings(page);
    await expect(page.getByTestId('mic-panel')).toBeVisible();
    await expect(page.getByTestId('welcome')).toHaveCount(0);
    expect(await micCalls(page)).toBe(0);
    await beat(page, 700);
    await f2Capture(page, '17-de-vuelta-al-microfono');
  });
  await saveVideo(page, 'ajustes-engranaje.webm');
});

test('Fase 2 · ajustes: lo elegido se recuerda al recargar (entrada y ejercicio)', async ({
  page,
}) => {
  await page.goto('/?seed=7');
  await openSettings(page);
  await page.getByTestId('input-teclado-pc').check();
  await page.getByTestId('mode-acordes').check();
  await page.getByTestId('level-3').check();
  await closeSettings(page);

  await page.reload();
  await expect(page.getByTestId('welcome')).toContainText('Toca el acorde que aparece');
  await expect(page.getByTestId('status-teclado-pc')).toBeVisible();
  await openSettings(page);
  await expect(page.getByTestId('input-teclado-pc')).toBeChecked();
  await expect(page.getByTestId('mode-acordes')).toBeChecked();
  await expect(page.getByTestId('level-3')).toBeChecked();
  await page.getByTestId('settings-reset').click();
  await expect(page.getByTestId('input-microfono')).toBeChecked();
  await expect(page.getByTestId('mode-notas')).toBeChecked();
});

test('Fase 2 · ajustes en un móvil: panel modal que cierra con Esc y devuelve el foco', async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  await page.goto('/?seed=7&pc&mic=off');
  await openSettings(page);
  await expect(page.getByTestId('settings-panel')).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('.settings-backdrop')).toBeVisible();
  await beat(page, 600);
  await f2Capture(page, '18-ajustes-movil');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('settings-panel')).toHaveCount(0);
  await expect(page.getByTestId('settings-button')).toBeFocused();
  await openSettings(page);
  await page.locator('.settings-backdrop').click({ position: { x: 5, y: 400 } });
  await expect(page.getByTestId('settings-panel')).toHaveCount(0);
  await context.close();
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

        await openSettings(page);
        await expect(page.locator('.paused')).toBeVisible();
        tops[`${mode}${level}-ajustes`] = await keyboardTop(page);
        await closeSettings(page);

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
