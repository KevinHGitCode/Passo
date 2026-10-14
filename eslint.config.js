import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'test-results', 'playwright-report', 'evidencias'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  {
    // El núcleo no toca el navegador: el tiempo, el azar y la E/S entran por puertos.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...[
          'window',
          'document',
          'navigator',
          'performance',
          'localStorage',
          'sessionStorage',
          'AudioContext',
          'MediaStream',
          'setInterval',
          'setTimeout',
          'clearInterval',
          'clearTimeout',
          'requestAnimationFrame',
          'fetch',
          'WebSocket',
          'MediaRecorder',
        ].map((name) => ({ name, message: 'El núcleo no usa APIs del navegador: usa un puerto.' })),
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'El azar entra inyectado (Rng).' },
        { object: 'Date', property: 'now', message: 'El tiempo entra por el puerto Clock.' },
      ],
    },
  },
  {
    // Privacidad: el audio nunca sale del navegador. Ningún adaptador ni pantalla puede grabarlo ni enviarlo.
    files: ['src/adapters/**/*.ts', 'src/ui/**/*.{ts,tsx}', 'src/compose.ts', 'src/main.tsx'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...[
          'fetch',
          'XMLHttpRequest',
          'WebSocket',
          'EventSource',
          'MediaRecorder',
          'RTCPeerConnection',
          'BroadcastChannel',
        ].map((name) => ({
          name,
          message: 'Passo no graba ni envía audio: no se permiten red ni grabación.',
        })),
      ],
      'no-restricted-properties': [
        'error',
        ...['fetch', 'WebSocket', 'XMLHttpRequest', 'EventSource', 'MediaRecorder'].flatMap(
          (property) =>
            ['window', 'globalThis', 'self'].map((object) => ({
              object,
              property,
              message: 'Passo no graba ni envía audio: no se permiten red ni grabación.',
            })),
        ),
        {
          object: 'navigator',
          property: 'sendBeacon',
          message: 'Passo no graba ni envía audio: no se permiten red ni grabación.',
        },
      ],
    },
  },
);
