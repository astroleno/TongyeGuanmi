import { describe, expect, it } from 'vitest';
import copyReference from '../../../docs/react-refactor/inventory/copy-reference.json';
import { renderStaticStoryShell } from '../../build/static-shell';

describe('crawlable static story shell', () => {
  const html = renderStaticStoryShell(copyReference);

  it('contains every non-legacy copy baseline item before JavaScript runs', () => {
    for (const section of copyReference.sections) {
      if ('legacyOnly' in section && section.legacyOnly) {
        continue;
      }
      for (const item of section.normalizedText) {
        expect(html).toContain(item);
      }
    }
  });

  it('keeps canonical public anchors and explicitly retires philosophy', () => {
    for (const anchor of ['home', 'method', 'services', 'education', 'contact']) {
      expect(html).toContain(`href="#${anchor}"`);
      expect(html).toContain(`id="${anchor}"`);
    }
    expect(html).not.toContain('id="philosophy"');
    expect(html.match(/<h1>/g)).toHaveLength(1);
  });

  it('does not hide or inert no-JS正文', () => {
    expect(html).not.toMatch(/\binert\b/);
    expect(html).not.toMatch(/visibility\s*:\s*hidden|opacity\s*:\s*0/);
  });
});
