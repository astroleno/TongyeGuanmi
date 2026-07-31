import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as brandModule from './PhoneBrand';
import { BRAND_COPY } from '..';
import { PhoneBrand, phoneBrandFrame } from './PhoneBrand';
import type { PresentationToken } from '../../../production/phone/phone-story/machine';

const source = readFileSync(
  new URL('./PhoneBrand.tsx', import.meta.url),
  'utf8'
);

const phoneBrandStaticPresentationFrame = (
  brandModule as typeof brandModule & Readonly<{
    phoneBrandStaticPresentationFrame?: (
      token: PresentationToken,
      frameSequence: number,
      observedAt: number
    ) => Readonly<{
      token: PresentationToken;
      frameSequence: number;
      observedAt: number;
      origin: 'leaf-static-poster';
    }>;
  }>
).phoneBrandStaticPresentationFrame;

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

  it('[Proof↔Brand reduced cutover] exposes the original native Brand token as its static post-paint leaf frame', () => {
    const token: PresentationToken = {
      authorityId: 'brand-authority',
      sessionId: 'brand-session',
      generation: 8,
      leg: 0,
      revision: 13,
      subject: 'native:brand',
      kind: 'static-poster'
    };

    expect(phoneBrandStaticPresentationFrame).toBeTypeOf('function');
    if (!phoneBrandStaticPresentationFrame) return;
    const frame = phoneBrandStaticPresentationFrame(token, 1, 84);
    expect(frame).toEqual({
      token,
      frameSequence: 1,
      observedAt: 84,
      origin: 'leaf-static-poster'
    });
    expect(frame.token).toBe(token);
  });

  it('[Proof↔Brand reduced cutover] owns one cancelable double-post-paint binding and no generic proof writer', () => {
    expect(source).toContain('cancelPhoneBrandStaticPresentationFrames');
    expect(source).toMatch(
      /binding\.paintFrame = window\.requestAnimationFrame\([\s\S]*?binding\.proofFrame = window\.requestAnimationFrame\(/
    );
    expect(source).toContain('presentationBindingRef.current !== binding');
    expect(source).toContain('releaseStaticPresentation(token);');
    for (const legacyWriter of [
      'reportRenderedFrame(',
      'presentationProofToken(',
      'proofForRenderedFrame(',
      'reportPresentationProof(',
      'reportProgress(',
      'reportAnimationComplete('
    ]) {
      expect(source).not.toContain(legacyWriter);
    }
  });
});
