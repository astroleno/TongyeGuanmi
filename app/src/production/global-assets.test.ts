import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const indexHtml = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

describe('production global assets', () => {
  it('references canonical favicon and title font sources instead of inline placeholders', () => {
    expect(indexHtml).toContain('href="../assets/favicon.svg"');
    expect(indexHtml).toContain('href="../assets/fonts/qiji-title-subset.ttf"');
    expect(indexHtml).not.toContain('data:image/svg+xml');
    expect(styles).toContain('@font-face');
    expect(styles).toContain('../../assets/fonts/qiji-title-subset.ttf');
  });

  it('defines shared title, sans, and traditional-serif tokens without Inter-first drift', () => {
    expect(styles).toContain('--font-title:');
    expect(styles).toContain('--font-sans:');
    expect(styles).toContain('--font-traditional:');
    expect(styles).toContain('font-synthesis: none');
    expect(styles).not.toMatch(/font-family:\s*\n?\s*Inter\b/);
  });
});
