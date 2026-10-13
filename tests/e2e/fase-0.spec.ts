import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  DENIED_MIDI_SCRIPT,
  EMPTY_MIDI_SCRIPT,
  EVIDENCE_DIR,
  FAKE_MIDI_SCRIPT,
  NO_MIDI_SCRIPT,
  beat,
  capture,
  ensureEvidenceDirs,
  playCorrect,
  playWrong,
  targetMidi,
  tapKey,
} from './helpers';

test.beforeAll(() => ensureEvidenceDirs());

async function saveVideo(page: Page, fileName: string): Promise<void> {
  const video = page.video();
  await page.close();
  await video?.saveAs(join(EVIDENCE_DIR, fileName));
}

test('Fase 0 · ronda completa con el teclado del PC (video principal)', async ({ page }) => {
  await page.addInitScript(EMPTY_MIDI_SCRIPT);
  await page.goto('/?seed=7&debug');
  await expect(page.getByTestId('welcome')).toBeVisible();
  await expect(page.getByTestId('status-teclado-pc')).toContainText('Teclado del PC');
  await expect(page.getByTestId('status-midi')).toContainText('sin conectar');
  await beat(page, 900);
  await capture(page, '01-bienvenida-oscuro');

  await test.step('Empezar y ver la nota con la tecla iluminada', async () => {
    await page.getByTestId('start').click();
    await expect(page.getByTestId('target')).toBeVisible();
    await expect(page.getByTestId('status-audio')).toHaveAttribute('data-tone', 'ok');
    await expect(page.locator('.key--target')).toHaveCount(1);
    await beat(page, 900);
    await capture(page, '02-nota-con-ayuda');
  });

  await test.step('Un error no avanza y muestra la corrección', async () => {
    const before = await targetMidi(page);
    await playWrong(page);
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-tone', 'error');
    await expect(page.getByTestId('feedback')).toContainText('Incorrecto');
    await expect(page.locator('.key--expected')).toHaveCount(1);
    expect(await targetMidi(page)).toBe(before);
    await beat(page, 800);
    await capture(page, '03-error-con-correccion');
  });

  await test.step('Acertar avanza a la siguiente nota', async () => {
    await playCorrect(page);
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-tone', 'ok');
    await expect(page.getByTestId('counters')).toContainText('Notas 1/20');
    await beat(page, 500);
    await capture(page, '04-acierto');
  });

  await test.step('Completar las 20 notas con algunos errores', async () => {
    for (let index = 1; index < 20; index++) {
      if (index % 5 === 2) {
        await playWrong(page);
        await beat(page, 250);
      }
      await playCorrect(page);
      await beat(page, 180);
    }
    await expect(page.getByTestId('summary')).toBeVisible();
    await expect(page.getByTestId('summary')).toContainText('¡Ronda completa!');
    await beat(page, 1200);
    await capture(page, '05-resumen-de-ronda');
  });

  await test.step('Otra ronda en notación americana y sin ayuda', async () => {
    await page.getByRole('button', { name: 'Otra ronda' }).click();
    await page.getByLabel('C D E').check();
    await expect(page.getByTestId('target-note')).toHaveText(/^[CDEFG]4$/);
    await page.getByTestId('help-switch').click();
    await expect(page.locator('.key--target')).toHaveCount(0);
    await beat(page, 800);
    await capture(page, '06-sin-ayuda-notacion-americana');
    await playWrong(page);
    await expect(page.locator('.key--expected')).toHaveCount(1);
    await beat(page, 800);
    await capture(page, '07-sin-ayuda-error-revela-la-tecla');
    await playCorrect(page);
  });

  await test.step('Tema claro', async () => {
    await page.emulateMedia({ colorScheme: 'light' });
    await beat(page, 600);
    await capture(page, '08-tema-claro');
    await playWrong(page);
    await beat(page, 600);
    await capture(page, '09-tema-claro-error');
    await page.emulateMedia({ colorScheme: 'dark' });
  });

  await test.step('Latencia evento→pantalla medida en el navegador', async () => {
    const samples = await page.evaluate(
      () => (window as unknown as { __passoLatency?: number[] }).__passoLatency ?? [],
    );
    expect(samples.length).toBeGreaterThan(20);
    const sorted = [...samples].sort((a, b) => a - b);
    const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1] as number;
    const p50 = sorted[Math.ceil(0.5 * sorted.length) - 1] as number;
    writeFileSync(
      join(EVIDENCE_DIR, 'latencia.json'),
      JSON.stringify(
        {
          muestras: samples.length,
          p50_ms: +p50.toFixed(1),
          p95_ms: +p95.toFixed(1),
          max_ms: +Math.max(...samples).toFixed(1),
        },
        null,
        2,
      ),
    );
    expect(p95).toBeLessThan(50);
  });

  await saveVideo(page, 'video-funcional.webm');
});

test('Fase 0 · piano MIDI simulado: notas, desconexión y reanudación', async ({ page }) => {
  await page.addInitScript(FAKE_MIDI_SCRIPT);
  await page.goto('/?seed=11');
  await expect(page.getByTestId('status-midi')).toContainText('Yamaha PSR-E263 (simulado)');
  await expect(page.getByTestId('status-midi')).toHaveAttribute('data-tone', 'ok');
  await capture(page, '10-midi-conectado');
  await page.getByTestId('start').click();

  const send = (note: number, velocity = 90) =>
    page.evaluate(
      ([n, v]) =>
        (window as unknown as { __fakeMidi: { send(b: number[]): void } }).__fakeMidi.send([
          0x90,
          n as number,
          v as number,
        ]),
      [note, velocity],
    );

  await test.step('Una nota correcta por MIDI avanza', async () => {
    await send(await targetMidi(page));
    await expect(page.getByTestId('counters')).toContainText('Notas 1/20');
    await beat(page, 600);
  });

  await test.step('Una nota incorrecta por MIDI se corrige', async () => {
    const target = await targetMidi(page);
    await send(target === 60 ? 62 : 60);
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-tone', 'error');
    await beat(page, 700);
  });

  await test.step('Si se desconecta el piano, la ronda queda en pausa y no se pierde el progreso', async () => {
    await page.evaluate(() =>
      (window as unknown as { __fakeMidi: { unplug(): void } }).__fakeMidi.unplug(),
    );
    await expect(page.getByTestId('status-midi')).toHaveAttribute('data-tone', 'warn');
    await expect(page.locator('.paused')).toBeVisible();
    await beat(page, 800);
    await capture(page, '11-midi-desconectado-en-pausa');
    await send(await targetMidi(page));
    await expect(page.getByTestId('counters')).toContainText('Notas 1/20');
  });

  await test.step('Al volver a conectarlo, la ronda sigue donde estaba', async () => {
    await page.evaluate(() =>
      (window as unknown as { __fakeMidi: { plug(): void } }).__fakeMidi.plug(),
    );
    await expect(page.locator('.paused')).toHaveCount(0);
    await send(await targetMidi(page));
    await expect(page.getByTestId('counters')).toContainText('Notas 2/20');
    await beat(page, 600);
  });

  await saveVideo(page, 'video-midi-simulado.webm');
});

test('Fase 0 · estados sin piano: permiso denegado y navegador sin MIDI', async ({ page }) => {
  await page.addInitScript(DENIED_MIDI_SCRIPT);
  await page.goto('/?seed=3');
  await expect(page.getByTestId('status-midi')).toHaveAttribute('data-tone', 'warn');
  await expect(page.getByTestId('status-midi')).toContainText('bloqueó');
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  await capture(page, '12-permiso-midi-denegado');
  // El teclado del PC sigue funcionando.
  await page.getByTestId('start').click();
  await playCorrect(page);
  await expect(page.getByTestId('counters')).toContainText('Notas 1/20');
});

test('Fase 0 · navegador sin Web MIDI', async ({ page }) => {
  await page.addInitScript(NO_MIDI_SCRIPT);
  await page.goto('/?seed=3');
  await expect(page.getByTestId('status-midi')).toContainText('Chrome o Edge');
  await capture(page, '13-sin-soporte-midi');
});

test('Fase 0 · accesibilidad visual: daltonismo y móvil', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    colorScheme: 'dark',
    permissions: ['midi'],
  });
  const page = await context.newPage();
  await page.addInitScript(EMPTY_MIDI_SCRIPT);
  await page.goto('/?seed=7');
  await page.getByTestId('start').click();
  await beat(page, 300);
  await capture(page, '14-movil-375-objetivo');
  await playWrong(page);
  await beat(page, 400);
  await capture(page, '15-movil-375-error');
  await playCorrect(page);

  const wide = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    permissions: ['midi'],
  });
  const desktop = await wide.newPage();
  await desktop.addInitScript(EMPTY_MIDI_SCRIPT);
  await desktop.goto('/?seed=7');
  await desktop.getByTestId('start').click();
  await playWrong(desktop);
  await beat(desktop, 400);
  const client = await wide.newCDPSession(desktop);
  for (const type of ['deuteranopia', 'protanopia', 'achromatopsia'] as const) {
    await client.send('Emulation.setEmulatedVisionDeficiency', { type });
    await beat(desktop, 250);
    await capture(desktop, `16-daltonismo-${type}-error`);
  }
  await client.send('Emulation.setEmulatedVisionDeficiency', { type: 'none' });
  await tapKey(desktop, 'KeyA');
  await wide.close();
  await context.close();
});
