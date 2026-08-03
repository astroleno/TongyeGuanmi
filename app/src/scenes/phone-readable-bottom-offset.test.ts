import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readableBottomOffset = /var\(\s*--portrait-readable-bottom-offset\s*,\s*0px\s*\)/;

describe('phone readable bottom offset contract', () => {
  it.each([
    ['Hero', 'src/scenes/hero/phone/PhoneHero.css'],
    ['Pattern', 'src/scenes/pattern/phone/PhonePattern.css'],
    ['Star Map', 'src/scenes/star-map/phone/PhoneStarMap.css']
  ])('%s keeps a local zero fallback when the shared offset is absent', (_scene, file) => {
    const css = readFileSync(resolve(process.cwd(), file), 'utf8');
    expect(css).toMatch(readableBottomOffset);
  });
});
