import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  FAKE_MIC_SCRIPT,
  MIC_EVIDENCE_DIR,
  NO_MEDIA_DEVICES_SCRIPT,
  ensureMicEvidenceDirs,
  keyboardTop,
  measureFeedbackLatency,
  micCapture,
  micEndTrack,
  micNoise,
  micNote,
  micSetMode,
  pause,
  targetNote,
} from './mic-helpers';

test.beforeAll(() => ensureMicEvidenceDirs());

/** Si una prueba falla, imprime los intentos que vio la app para poder diagnosticar. */
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === 'passed' || page.isClosed()) return;
  const attempts = await page.evaluate(
    () => (window as unknown as { __passoAttempts?: unknown[] }).__passoAttempts ?? [],
  );
  console.log('INTENTOS:', JSON.stringify(attempts));
});

async function saveVideo(page: Page, fileName: string): Promise<void> {
  const video = page.video();
  await page.close();
  await video?.saveAs(join(MIC_EVIDENCE_DIR, fileName));
}

/** Espera a que la escucha esté lista (calibración terminada). */
async function waitListening(page: Page): Promise<void> {
  await expect(page.getByTestId('listen')).toHaveAttribute('data-phase', 'escuchando', {
    timeout: 8000,
  });
}

async function activateMic(page: Page): Promise<void> {
  await page.getByTestId('activate-mic').click();
  await waitListening(page);
}

/** Toca la nota pedida con el micrófono simulado y espera a que la app la dé por buena. */
async function playTarget(page: Page, expectedCount: number, size = 20): Promise<void> {
  await micNote(page, await targetNote(page), { ms: 500 });
  if (expectedCount >= size) {
    await expect(page.getByTestId('summary')).toBeVisible();
    return;
  }
  await expect(page.getByTestId('counters')).toContainText(`Notas ${expectedCount}/${size}`);
  await pause(page, 650);
}

async function errorCount(page: Page): Promise<number> {
  const text = (await page.getByTestId('counters').textContent()) ?? '';
  return Number(/Errores (\d+)/.exec(text)?.[1] ?? -1);
}

test('Fase 1 · escucha activa con micrófono simulado: ronda completa (video principal)', async ({
  page,
}) => {
  await page.addInitScript(FAKE_MIC_SCRIPT);
  await page.goto('/?seed=7&debug');

  await test.step('El micrófono empieza apagado y nunca se pide solo', async () => {
    await expect(page.getByTestId('mic-panel')).toHaveAttribute('data-state', 'inactivo');
    await expect(page.getByTestId('mic-panel')).toContainText('no se graba ni se envía');
    expect(
      await page.evaluate(
        () => (window as unknown as { __fakeMic: { calls: unknown[] } }).__fakeMic.calls.length,
      ),
    ).toBe(0);
    await pause(page, 900);
    await micCapture(page, '01-microfono-apagado');
  });

  await test.step('Activar: pide el audio sin filtros, mide el ruido y queda escuchando', async () => {
    await page.getByTestId('activate-mic').click();
    await expect(page.getByTestId('mic-panel')).toHaveAttribute('data-state', 'calibrando');
    await pause(page, 500);
    await micCapture(page, '02-midiendo-ruido');
    await waitListening(page);
    const calls = await page.evaluate(
      () => (window as unknown as { __fakeMic: { calls: unknown[] } }).__fakeMic.calls,
    );
    expect(calls[0]).toEqual({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
      video: false,
    });
    await expect(page.getByTestId('status-microfono')).toContainText('Te escucho');
  });

  await test.step('Prueba rápida: octava distinta, teclado transpuesto y Do central', async () => {
    await micNote(page, 72, { ms: 700 });
    await expect(page.getByTestId('mic-check')).toContainText('una octava más arriba');
    await pause(page, 900);
    await micCapture(page, '03-prueba-octava-distinta');
    await pause(page, 600);
    await micNote(page, 62, { ms: 700 });
    await expect(page.getByTestId('mic-check')).toContainText('transpuesto');
    await pause(page, 900);
    await pause(page, 900);
    await micNote(page, 60, { ms: 900 });
    await expect(page.getByTestId('mic-check')).toContainText('✓ Te oigo bien: Do4');
    await expect(page.getByTestId('heard-note')).toContainText('Do4');
    await expect(page.locator('.key--heard')).toHaveCount(1);
    await pause(page, 500);
    await micCapture(page, '04-prueba-do-central-ok');
    await pause(page, 900);
  });

  await test.step('Empezar y tocar con el piano (simulado)', async () => {
    await page.getByTestId('start').click();
    await expect(page.getByTestId('target')).toBeVisible();
    await pause(page, 500);
    await micCapture(page, '05-ronda-escuchando');
    await playTarget(page, 1);
  });

  await test.step('Una nota equivocada se corrige diciendo «oí», no «tocaste»', async () => {
    const target = await targetNote(page);
    await micNote(page, target + 3, { ms: 600 });
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-tone', 'error', {
      timeout: 4000,
    });
    await expect(page.getByTestId('feedback')).toContainText('oí');
    await pause(page, 900);
    await micCapture(page, '06-error-oi-nota');
    await pause(page, 1200);
  });

  let count = 1;
  await test.step('Varias notas correctas seguidas', async () => {
    for (let i = 0; i < 6; i++) {
      await playTarget(page, count + 1);
      count += 1;
    }
  });

  await test.step('El ruido no cuenta como nota y avisa «no distingo la nota»', async () => {
    const errorsBefore = await errorCount(page);
    await micNoise(page, 1500, 0.3);
    await expect(page.getByTestId('listen-notice')).toContainText('no distingo la nota', {
      timeout: 4000,
    });
    await pause(page, 600);
    await micCapture(page, '07-ruido-no-es-nota');
    await pause(page, 1500);
    expect(await errorCount(page)).toBe(errorsBefore);
    await expect(page.getByTestId('counters')).toContainText(`Notas ${count}/20`);
  });

  await test.step('Dos teclas a la vez no cuentan como error', async () => {
    const errorsBefore = await errorCount(page);
    const target = await targetNote(page);
    await micNote(page, target, { ms: 900 });
    await micNote(page, target + 7, { ms: 900 });
    await pause(page, 1600);
    expect(await errorCount(page)).toBe(errorsBefore);
    await micCapture(page, '08-dos-teclas-no-es-error');
    await pause(page, 1200);
  });

  await test.step('Un toque suave también se oye', async () => {
    const target = await targetNote(page);
    await micNote(page, target, { ms: 600, amp: 0.03 });
    await expect(page.getByTestId('counters')).toContainText(`Notas ${count + 1}/20`, {
      timeout: 4000,
    });
    count += 1;
    await pause(page, 800);
  });

  await test.step('Completar la ronda de 20 notas', async () => {
    while (count < 20) {
      await playTarget(page, count + 1);
      count += 1;
    }
    await expect(page.getByTestId('summary')).toBeVisible();
    await pause(page, 1200);
    await micCapture(page, '09-resumen-de-ronda');
  });

  await test.step('Latencia: del sonido a la pantalla (10 notas)', async () => {
    await page.getByRole('button', { name: 'Otra ronda' }).click();
    const samples: number[] = [];
    for (let i = 0; i < 10; i++) {
      samples.push(await measureFeedbackLatency(page, await targetNote(page)));
      await pause(page, 900);
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const p50 = sorted[Math.ceil(0.5 * sorted.length) - 1] as number;
    const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1] as number;
    writeFileSync(
      join(MIC_EVIDENCE_DIR, 'latencia.json'),
      JSON.stringify(
        {
          muestras: samples.length,
          sonido_a_pantalla_p50_ms: Math.round(p50),
          sonido_a_pantalla_p95_ms: Math.round(p95),
          nota: 'Medido con un micrófono simulado: incluye detección, confirmación y pintado, pero no la latencia de entrada del micrófono real.',
        },
        null,
        2,
      ),
    );
    expect(p50).toBeLessThan(500);
  });

  await test.step('Si se pierde el micrófono, la ronda se pausa y se puede reactivar', async () => {
    await micEndTrack(page);
    await expect(page.locator('.paused')).toContainText('Se perdió el micrófono');
    await expect(page.getByTestId('status-microfono')).toContainText('Micrófono perdido');
    await pause(page, 900);
    await micCapture(page, '10-microfono-perdido-en-pausa');
    await page.getByTestId('reactivate-mic').click();
    await expect(page.locator('.paused')).toHaveCount(0);
    await waitListening(page);
    await micNote(page, await targetNote(page), { ms: 500 });
    await expect(page.getByTestId('counters')).toContainText(/Notas [1-9]\d?\/20/);
    await pause(page, 700);
  });

  await test.step('Con la pestaña oculta la escucha se suspende de forma visible', async () => {
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.getByTestId('listen-idle')).toContainText('Escucha en pausa');
    await pause(page, 700);
    await micCapture(page, '11-pestana-oculta');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitListening(page);
  });

  await test.step('Tema claro', async () => {
    await page.emulateMedia({ colorScheme: 'light' });
    await pause(page, 500);
    await micNote(page, await targetNote(page), { ms: 700 });
    await pause(page, 700);
    await micCapture(page, '12-tema-claro-escuchando');
    await page.emulateMedia({ colorScheme: 'dark' });
  });

  await saveVideo(page, 'video-funcional.webm');
});

test('Fase 1 · estados del micrófono: permiso denegado, sin micrófono, ocupado y sin soporte', async ({
  page,
}) => {
  await page.addInitScript(FAKE_MIC_SCRIPT);
  await page.goto('/?seed=3');

  await test.step('Permiso denegado: guía y reintento', async () => {
    await micSetMode(page, 'denied');
    await page.getByTestId('activate-mic').click();
    await expect(page.getByTestId('mic-panel')).toHaveAttribute('data-state', 'permiso-denegado');
    await expect(page.getByTestId('mic-panel').locator('li')).toHaveCount(3);
    await expect(page.getByTestId('status-microfono')).toContainText('Micrófono bloqueado');
    await micCapture(page, '20-permiso-denegado');
  });

  await test.step('Sin micrófono conectado', async () => {
    await micSetMode(page, 'notfound');
    await page.getByTestId('retry-mic').click();
    await expect(page.getByTestId('mic-panel')).toHaveAttribute('data-state', 'sin-dispositivo');
    await micCapture(page, '21-sin-microfono');
  });

  await test.step('Micrófono ocupado por otra aplicación', async () => {
    await micSetMode(page, 'busy');
    await page.getByTestId('retry-mic').click();
    await expect(page.getByTestId('mic-panel')).toContainText('Otra aplicación usa el micrófono');
    await micCapture(page, '22-microfono-ocupado');
  });

  await test.step('Al arreglarlo, reintentar funciona', async () => {
    await micSetMode(page, 'ok');
    await page.getByTestId('retry-mic').click();
    await waitListening(page);
  });
});

test('Fase 1 · navegador sin micrófono', async ({ page }) => {
  await page.addInitScript(NO_MEDIA_DEVICES_SCRIPT);
  await page.goto('/?seed=3');
  await page.getByTestId('activate-mic').click();
  await expect(page.getByTestId('mic-panel')).toHaveAttribute('data-state', 'sin-soporte');
  await expect(page.getByTestId('mic-panel')).toContainText('Chrome o Edge');
  await micCapture(page, '23-sin-soporte-microfono');
});

test('Fase 1 · el teclado no se mueve entre estados (estabilidad visual)', async ({ page }) => {
  await page.addInitScript(FAKE_MIC_SCRIPT);
  const tops: Record<string, number> = {};

  await page.goto('/?seed=7');
  tops['apagado'] = await keyboardTop(page);

  await micSetMode(page, 'denied');
  await page.getByTestId('activate-mic').click();
  await expect(page.getByTestId('mic-panel')).toHaveAttribute('data-state', 'permiso-denegado');
  tops['denegado'] = await keyboardTop(page);

  await micSetMode(page, 'notfound');
  await page.getByTestId('retry-mic').click();
  await expect(page.getByTestId('mic-panel')).toHaveAttribute('data-state', 'sin-dispositivo');
  tops['sin-dispositivo'] = await keyboardTop(page);

  await micSetMode(page, 'ok');
  await page.getByTestId('retry-mic').click();
  await expect(page.getByTestId('mic-panel')).toHaveAttribute('data-state', 'calibrando');
  tops['calibrando'] = await keyboardTop(page);
  await waitListening(page);
  tops['listo'] = await keyboardTop(page);

  await page.getByTestId('start').click();
  await expect(page.getByTestId('target')).toBeVisible();
  tops['ronda'] = await keyboardTop(page);

  await micNote(page, (await targetNote(page)) + 3, { ms: 500 });
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-tone', 'error', {
    timeout: 4000,
  });
  tops['error'] = await keyboardTop(page);

  await micEndTrack(page);
  await expect(page.locator('.paused')).toBeVisible();
  tops['pausa'] = await keyboardTop(page);

  writeFileSync(join(MIC_EVIDENCE_DIR, 'estabilidad-visual.json'), JSON.stringify(tops, null, 2));
  const reference = tops['apagado'] as number;
  for (const [state, top] of Object.entries(tops)) {
    expect(Math.abs(top - reference), `el teclado se movió en «${state}»`).toBeLessThanOrEqual(1);
  }
});

test('Fase 1 · móvil y daltonismo con escucha activa', async ({ browser }) => {
  const mobile = await browser.newContext({
    viewport: { width: 375, height: 812 },
    colorScheme: 'dark',
  });
  const phone = await mobile.newPage();
  await phone.addInitScript(FAKE_MIC_SCRIPT);
  await phone.goto('/?seed=7');
  await micCapture(phone, '30-movil-375-apagado');
  await activateMic(phone);
  await micCapture(phone, '31-movil-375-listo');
  await phone.getByTestId('start').click();
  await micNote(phone, await targetNote(phone), { ms: 600 });
  await expect(phone.getByTestId('feedback')).toBeVisible();
  await pause(phone, 500);
  await micCapture(phone, '32-movil-375-escuchando');
  await mobile.close();

  const wide = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const desktop = await wide.newPage();
  await desktop.addInitScript(FAKE_MIC_SCRIPT);
  await desktop.goto('/?seed=7');
  await activateMic(desktop);
  await desktop.getByTestId('start').click();
  await micNote(desktop, (await targetNote(desktop)) + 3, { ms: 700 });
  await expect(desktop.getByTestId('feedback')).toHaveAttribute('data-tone', 'error', {
    timeout: 4000,
  });
  const client = await wide.newCDPSession(desktop);
  for (const type of ['deuteranopia', 'achromatopsia'] as const) {
    await client.send('Emulation.setEmulatedVisionDeficiency', { type });
    await pause(desktop, 300);
    await micCapture(desktop, `33-daltonismo-${type}-escuchando`);
  }
  await client.send('Emulation.setEmulatedVisionDeficiency', { type: 'none' });
  await wide.close();
});

test('Fase 1 · en un portátil de poca altura (1366×650) todo se ve sin desplazarse', async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 650 } });
  const page = await context.newPage();
  await page.addInitScript(FAKE_MIC_SCRIPT);
  await page.goto('/?seed=7');
  await activateMic(page);
  await page.getByTestId('start').click();
  await micNote(page, await targetNote(page), { ms: 600 });
  await expect(page.getByTestId('feedback')).toBeVisible();
  const fits = await page.evaluate(() => {
    const bottom = (id: string) =>
      (document.querySelector('[data-testid=' + id + ']') as Element).getBoundingClientRect()
        .bottom;
    return { height: window.innerHeight, strip: bottom('listen'), piano: bottom('piano') };
  });
  await micCapture(page, '34-portatil-1366x650');
  expect(fits.strip).toBeLessThanOrEqual(fits.height);
  expect(fits.piano).toBeLessThanOrEqual(fits.height);
  await context.close();
});
