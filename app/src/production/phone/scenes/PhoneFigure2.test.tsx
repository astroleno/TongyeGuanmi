import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PhoneFigure2 } from './PhoneFigure2';
import type { PhoneLeafReportPort } from '../../phone-story/presentation';

const reports = {} as PhoneLeafReportPort;

describe('PhoneFigure2', () => {
  it('adapts the one canonical Figure2 root and media pair', () => {
    const markup = renderToStaticMarkup(createElement(PhoneFigure2, {
      reports
    }));
    expect(markup.match(/data-r4-scene="figure2-animation"/g)).toHaveLength(1);
    expect(markup.match(/data-media-key="figure2-pair-motion"/g)).toHaveLength(1);
    expect(markup.match(/data-figure2-packed-alpha-canvas="true"/g)).toHaveLength(1);
    expect(markup).toContain('preload="auto"');
    expect(markup).not.toContain('poster');
  });
});
