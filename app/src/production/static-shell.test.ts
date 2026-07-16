import { describe, expect, it } from 'vitest';
import copyReference from '../../../docs/react-refactor/inventory/copy-reference.json';
import { renderStaticStoryShell, STATIC_COPY_OMISSIONS } from '../../build/static-shell';

describe('crawlable static story shell', () => {
  const html = renderStaticStoryShell(copyReference);

  it('contains every non-legacy copy baseline item before JavaScript runs', () => {
    for (const section of copyReference.sections) {
      if ('legacyOnly' in section && section.legacyOnly) {
        continue;
      }
      for (const item of section.normalizedText) {
        if (STATIC_COPY_OMISSIONS.has(item)) {
          continue;
        }
        expect(html).toContain(item);
      }
    }
  });

  it('omits the retired sectional prefixes from the static fallback', () => {
    for (const item of STATIC_COPY_OMISSIONS) {
      expect(html).not.toContain(item);
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

  it('renders the canonical footer and filing link once in no-JS output', () => {
    expect(html.match(/data-site-footer="true"/g)).toHaveLength(1);
    expect(html.match(/© 上海同野观幂科技有限公司/g)).toHaveLength(1);
    expect(html.match(/AI Transformation &amp; Capability Building/g)).toHaveLength(1);
    expect(html.match(/服务备案号 沪ICP备2024086119号-3/g)).toHaveLength(1);
    expect(html.match(/沪公网安备 31011502406697号/g)).toHaveLength(2);
    expect(html).toContain('href="https://beian.miit.gov.cn/"');
    expect(html).toContain('href="https://www.beian.gov.cn/portal/registerSystemInfo?recordcode=31011502406697"');
    expect(html).toContain('aria-label="沪公网安备 31011502406697号（新窗口打开）"');
  });
});
