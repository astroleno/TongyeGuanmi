import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import * as figure2Module from './PhoneFigure2';
import { PhoneFigure2 } from './PhoneFigure2';
import type { PresentationToken } from '../phone-story/machine';

const phoneFigure2StaticPresentationFrame = (
  figure2Module as typeof figure2Module & Readonly<{
    phoneFigure2StaticPresentationFrame?: (
      token: PresentationToken,
      frameSequence: number,
      observedAt: number
    ) => Readonly<unknown>;
  }>
).phoneFigure2StaticPresentationFrame;

describe('PhoneFigure2', () => {
  it('adapts the one canonical Figure2 root and media pair', () => {
    const markup = renderToStaticMarkup(createElement(PhoneFigure2, {
      active: true,
      reducedMotion: false
    }));
    expect(markup.match(/data-r4-scene="figure2-animation"/g)).toHaveLength(1);
    expect(markup.match(/data-media-key="figure2-pair-motion"/g)).toHaveLength(1);
    expect(markup.match(/data-figure2-packed-alpha-canvas="true"/g)).toHaveLength(1);
    expect(markup).toContain('preload="auto"');
    expect(markup).not.toContain('poster');
  });

  it('[Method↔Figure2 reduced cutover] exposes only the original immutable token as a static leaf frame', () => {
    const token: PresentationToken = {
      authorityId: 'figure2-authority',
      sessionId: 'figure2-session',
      generation: 3,
      leg: 0,
      revision: 7,
      subject: 'grade-a:figure2',
      kind: 'static-poster'
    };

    expect(phoneFigure2StaticPresentationFrame).toBeTypeOf('function');
    if (!phoneFigure2StaticPresentationFrame) return;
    expect(phoneFigure2StaticPresentationFrame(token, 1, 84)).toEqual({
      token,
      frameSequence: 1,
      observedAt: 84,
      origin: 'leaf-static-poster'
    });
  });
});
