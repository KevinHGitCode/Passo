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
        ...['window', 'document', 'navigator', 'performance', 'localStorage', 'sessionStorage'].map(
          (name) => ({ name, message: 'El núcleo no usa APIs del navegador: usa un puerto.' }),
        ),
      ],
    },
  },
);
