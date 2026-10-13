import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

export const EVIDENCE_DIR = join('evidencias', 'fase-0');
export const CAPTURES_DIR = join(EVIDENCE_DIR, 'capturas');

/** Teclas del PC que producen cada nota del nivel 1 (ver docs/convenciones.md). */
export const KEY_FOR_MIDI: Readonly<Record<number, string>> = {
  60: 'KeyA',
  62: 'KeyS',
  64: 'KeyD',
  65: 'KeyF',
  67: 'KeyG',
};

export function ensureEvidenceDirs(): void {
  mkdirSync(CAPTURES_DIR, { recursive: true });
}

export async function targetMidi(page: Page): Promise<number> {
  const value = await page.getByTestId('target-note').getAttribute('data-midi');
  if (value === null) throw new Error('No hay nota objetivo en pantalla');
  return Number(value);
}

export async function tapKey(page: Page, code: string): Promise<void> {
  await page.keyboard.down(code);
  await page.keyboard.up(code);
}

export async function playCorrect(page: Page): Promise<void> {
  await tapKey(page, KEY_FOR_MIDI[await targetMidi(page)] as string);
}

export async function playWrong(page: Page): Promise<number> {
  const target = await targetMidi(page);
  const wrong = Number(Object.keys(KEY_FOR_MIDI).find((midi) => Number(midi) !== target));
  await tapKey(page, KEY_FOR_MIDI[wrong] as string);
  return wrong;
}

export async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(CAPTURES_DIR, `${name}.png`) });
}

/** Pausa corta para que el video se pueda seguir a ojo. */
export function beat(page: Page, ms = 450): Promise<void> {
  return page.waitForTimeout(ms);
}

/** Instala un piano MIDI simulado (Yamaha PSR-E263) antes de que cargue la página. */
export const FAKE_MIDI_SCRIPT = `
(() => {
  const portListeners = new Set();
  const accessListeners = new Set();
  const port = {
    id: 'e263', name: 'Yamaha PSR-E263 (simulado)', type: 'input', state: 'connected',
    addEventListener(type, listener) { if (type === 'midimessage') portListeners.add(listener); },
    removeEventListener(type, listener) { portListeners.delete(listener); },
  };
  const ports = new Map([[port.id, port]]);
  const access = {
    inputs: { values: () => ports.values() },
    addEventListener(type, listener) { if (type === 'statechange') accessListeners.add(listener); },
    removeEventListener(type, listener) { accessListeners.delete(listener); },
  };
  window.__fakeMidi = {
    send(bytes) {
      const event = { data: new Uint8Array(bytes), timeStamp: performance.now() };
      portListeners.forEach((listener) => listener(event));
    },
    unplug() { port.state = 'disconnected'; accessListeners.forEach((l) => l({ port })); },
    plug() { port.state = 'connected'; accessListeners.forEach((l) => l({ port })); },
  };
  Object.defineProperty(navigator, 'requestMIDIAccess', {
    configurable: true, value: () => Promise.resolve(access),
  });
})();
`;

export const DENIED_MIDI_SCRIPT = `
Object.defineProperty(navigator, 'requestMIDIAccess', {
  configurable: true,
  value: () => Promise.reject(Object.assign(new Error('denegado'), { name: 'SecurityError' })),
});
`;

export const NO_MIDI_SCRIPT = `
Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: undefined });
`;

/** Web MIDI disponible pero sin ningún piano conectado (estado reproducible en cualquier equipo). */
export const EMPTY_MIDI_SCRIPT = `
(() => {
  const access = {
    inputs: { values: () => [][Symbol.iterator]() },
    addEventListener() {},
    removeEventListener() {},
  };
  Object.defineProperty(navigator, 'requestMIDIAccess', {
    configurable: true, value: () => Promise.resolve(access),
  });
})();
`;
