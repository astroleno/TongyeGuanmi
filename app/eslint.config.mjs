import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import storyContracts from './eslint-rules/story-contracts.mjs';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['*.config.{js,mjs,ts}', 'eslint-rules/**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: ['src/**/*.{ts,tsx}', 'e2e/**/*.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    plugins: {
      'story-contracts': storyContracts
    },
    rules: {
      'story-contracts/no-scene-global-input-listeners': 'error',
      'story-contracts/no-machine-context-visual-fields': 'error'
    }
  }
];
