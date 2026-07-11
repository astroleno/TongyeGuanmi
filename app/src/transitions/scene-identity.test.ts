import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const TRANSITIONS_ROOT = new URL('.', import.meta.url);
const FORBIDDEN_PRODUCTION_PATTERNS = [
  'cloneNode(',
  '.outerHTML',
  '<foreignObject',
  'createInkTargetTexture(',
  'targetElement:',
  'HERO_PATTERN_INK_TARGET_IMAGE',
  'PATTERN_STAR_MAP_INK_TARGET_IMAGE',
  "revealMode: 'ink-body'"
] as const;

function productionSources(directory: URL): URL[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '__fixtures__' || entry.name.includes('.test.')) {
      return [];
    }
    const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
    if (entry.isDirectory()) {
      return productionSources(child);
    }
    return /\.(?:ts|tsx|js)$/.test(entry.name) ? [child] : [];
  });
}

describe('R4 transition Scene identity source contract', () => {
  it('forbids transition-owned endpoint renderers and target captures', () => {
    const violations = productionSources(TRANSITIONS_ROOT).flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return FORBIDDEN_PRODUCTION_PATTERNS.flatMap((pattern) =>
        source.includes(pattern)
          ? [`${relative(join(TRANSITIONS_ROOT.pathname), file.pathname)}: ${pattern}`]
          : []
      );
    });

    expect(violations).toEqual([]);
  });
});
