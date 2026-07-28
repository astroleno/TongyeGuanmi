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

  it('keeps the iOS CJK baseline order for sans and traditional-serif fallbacks', () => {
    expect(styles).toContain('--font-title: "Tongye Title", "SF Pro Display", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;');
    expect(styles).toContain('--font-sans: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "SF Pro Display", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;');
    expect(styles).toContain('--font-traditional: "Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", ui-serif, serif;');
    expect(styles).toContain('--diagnosis-cta-border-active: rgba(37, 39, 25, .48);');
    expect(styles).toContain('font-synthesis: none');
    expect(styles).not.toMatch(/font-family:\s*\n?\s*Inter\b/);
    expect(styles).not.toContain('"SF Pro Text"');
  });
});
