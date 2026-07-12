import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SITE_META } from '../content/site-meta';
import { SiteFooter } from './SiteFooter';

describe('SiteFooter', () => {
  it('renders canonical company, tagline, and filing metadata exactly once', () => {
    expect(SITE_META.footer).toEqual({
      company: '© 上海同野观幂科技有限公司',
      tagline: 'AI Transformation & Capability Building',
      filingText: '服务备案号 沪ICP备2024086119号-3',
      filingUrl: 'https://beian.miit.gov.cn/'
    });

    const markup = renderToStaticMarkup(createElement(SiteFooter));
    const visibleMarkup = markup.replaceAll('&amp;', '&');
    for (const text of [
      SITE_META.footer.company,
      SITE_META.footer.tagline,
      SITE_META.footer.filingText
    ]) {
      expect(visibleMarkup.split(text)).toHaveLength(2);
    }
    expect(markup).toContain('data-site-footer="true"');
    expect(markup).toContain(`href="${SITE_META.footer.filingUrl}"`);
  });
});
