import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Client code must never import Node-only server modules (SKILLS.md §C.4).
    files: ['src/components/**', 'src/features/**', 'src/hooks/**', 'src/stores/**', 'src/workers/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@server/*', '**/server/**'], message: 'Server modules are Node-only (SKILLS.md §C.4).' },
          ],
        },
      ],
    },
  },
  {
    // The detection worker is plain JavaScript served from /public. It runs in a worker scope, with MediaPipe's UMD global.
    files: ['public/workers/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        self: 'readonly',
        importScripts: 'readonly',
        Vision: 'readonly',
        Promise: 'readonly',
        Object: 'readonly',
        Boolean: 'readonly',
        String: 'readonly',
        Error: 'readonly',
      },
    },
  },
  {
    files: ['scripts/**'],
    rules: { 'no-console': 'off' },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    '.data/**',
    'public/mediapipe/**', // generated, vendored third-party runtime (scripts/setup-mediapipe.mjs)
    'playwright-report/**',
    'test-results/**',
  ]),
]);
