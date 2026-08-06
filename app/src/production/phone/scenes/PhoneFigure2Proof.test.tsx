import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import * as proofModule from './PhoneFigure2Proof';
import { PhoneFigure2Proof } from './PhoneFigure2Proof';
import type { PresentationToken } from '../phone-story/machine';

const phoneFigure2ProofStaticPresentationFrame = (
  proofModule as typeof proofModule & Readonly<{
    phoneFigure2ProofStaticPresentationFrame?: (
      token: PresentationToken,
      frameSequence: number,
      observedAt: number
    ) => Readonly<unknown>;
  }>
).phoneFigure2ProofStaticPresentationFrame;

const phoneFigure2ProofPresentationTokenKindAccepted = (
  proofModule as typeof proofModule & Readonly<{
    phoneFigure2ProofPresentationTokenKindAccepted?: (
      kind: PresentationToken['kind']
    ) => boolean;
  }>
).phoneFigure2ProofPresentationTokenKindAccepted;

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

  it('[Figure2↔Proof reduced cutover] exposes only the original immutable token as a static post-paint leaf frame', () => {
    const token: PresentationToken = {
      authorityId: 'proof-authority',
      sessionId: 'proof-session',
      generation: 5,
      leg: 0,
      revision: 9,
      subject: 'grade-a:proof',
      kind: 'static-poster'
    };

    expect(phoneFigure2ProofStaticPresentationFrame).toBeTypeOf('function');
    if (!phoneFigure2ProofStaticPresentationFrame) return;
    expect(phoneFigure2ProofStaticPresentationFrame(token, 1, 84)).toEqual({
      token,
      frameSequence: 1,
      observedAt: 84,
      origin: 'leaf-static-poster'
    });
  });

  it('[P0 Proof reverse] accepts the normal dom-reading token as a leaf-owned post-paint bind', () => {
    expect(phoneFigure2ProofPresentationTokenKindAccepted).toBeTypeOf('function');
    if (!phoneFigure2ProofPresentationTokenKindAccepted) return;
    expect(phoneFigure2ProofPresentationTokenKindAccepted('dom-reading')).toBe(true);
    expect(phoneFigure2ProofPresentationTokenKindAccepted('static-poster')).toBe(true);
    expect(phoneFigure2ProofPresentationTokenKindAccepted('packed-canvas-frame')).toBe(false);
  });
});
