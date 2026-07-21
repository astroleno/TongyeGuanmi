import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BRAND_COPY } from '..';
import { PhoneBrand, phoneBrandFrame } from './PhoneBrand';

describe('PhoneBrand', () => {
  it('keeps one native document chapter and the canonical copy', () => {
    const markup = renderToStaticMarkup(createElement(PhoneBrand, {
      active: true,
      reducedMotion: false
    }));

    expect(markup).toContain('id="brand"');
    expect(markup).toContain('data-phone-reading="native-document"');
    expect(markup).toContain(BRAND_COPY[1]);
    expect(markup).toContain(BRAND_COPY[5]);
    expect(markup).not.toContain('<video');
  });

  it('keeps a readable stable receiver at both Proof → Brand endpoints', () => {
    expect(phoneBrandFrame(0)).toEqual({
      progress: 0,
      opacity: 0.96,
      y: 12
    });
    expect(phoneBrandFrame(1)).toEqual({
      progress: 1,
      opacity: 1,
      y: 0
    });
    expect(phoneBrandFrame(0, true)).toEqual(phoneBrandFrame(1));
  });
});
