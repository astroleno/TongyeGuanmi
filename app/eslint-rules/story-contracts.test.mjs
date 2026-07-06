import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import storyContracts from './story-contracts.mjs';

const appRoot = process.cwd();

function createLinter(ruleName) {
  return new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
          parser: tseslint.parser,
          ecmaVersion: 'latest',
          sourceType: 'module',
          parserOptions: {
            ecmaFeatures: { jsx: true }
          }
        },
        plugins: {
          'story-contracts': storyContracts
        },
        rules: {
          [`story-contracts/${ruleName}`]: 'error'
        }
      }
    ]
  });
}

describe('story contract ESLint rules', () => {
  it('reports global input listeners inside scene modules', async () => {
    const eslint = createLinter('no-scene-global-input-listeners');
    const [result] = await eslint.lintText(
      `
        export function mount() {
          window.addEventListener('wheel', () => {});
        }
      `,
      { filePath: `${appRoot}/src/scenes/hero/Component.tsx` }
    );

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.message).toContain('Director');
  });

  it('allows global listeners outside scene modules for future Director code', async () => {
    const eslint = createLinter('no-scene-global-input-listeners');
    const [result] = await eslint.lintText(
      `
        export function bindDirector() {
          window.addEventListener('wheel', () => {});
        }
      `,
      { filePath: `${appRoot}/src/runtime/input-normalizer.ts` }
    );

    expect(result.messages).toHaveLength(0);
  });

  it('reports progress opacity and transform in machine context', async () => {
    const eslint = createLinter('no-machine-context-visual-fields');
    const [result] = await eslint.lintText(
      `
        export const machine = createMachine({
          context: {
            cursor: 'hero',
            progress: 0,
            opacity: 1,
            transform: 'none'
          }
        });
      `,
      { filePath: `${appRoot}/src/runtime/director.machine.ts` }
    );

    expect(result.messages.map((message) => message.message)).toEqual([
      expect.stringContaining('progress'),
      expect.stringContaining('opacity'),
      expect.stringContaining('transform')
    ]);
  });
});
