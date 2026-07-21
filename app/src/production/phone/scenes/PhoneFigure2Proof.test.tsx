import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PhoneFigure2Proof } from './PhoneFigure2Proof';

describe('PhoneFigure2Proof', () => {
  it('keeps one canonical compound article and three internal panels', () => {
    const markup = renderToStaticMarkup(createElement(PhoneFigure2Proof, {
      active: true,
      reducedMotion: false
    }));
    expect(markup.match(/data-r4-scene="figure2-proof"/g)).toHaveLength(1);
    expect(markup.match(/data-r4-proof-compound="true"/g)).toHaveLength(1);
    expect(markup.match(/data-r4-proof-panel=/g)).toHaveLength(3);
  });
});
