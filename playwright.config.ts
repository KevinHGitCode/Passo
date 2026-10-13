import { defineConfig } from '@playwright/test';

const PORT = 5180;

/**
 * Prueba funcional en un navegador real: usa el Edge instalado (no descarga navegadores)
 * sobre la versión compilada de la app, y graba video de cada prueba.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 120_000,
  outputDir: 'test-results',
  use: {
    channel: 'msedge',
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 800 },
    colorScheme: 'dark',
    locale: 'es-CO',
    permissions: ['midi'],
    video:
      process.env['E2E_VIDEO'] === 'off'
        ? 'off'
        : { mode: 'on', size: { width: 1280, height: 800 } },
  },
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
