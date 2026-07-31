import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { PresentationToken } from '../../../production/phone/phone-story/machine';
import { hashForScene, sceneFromHash } from '../../../production/navigation';
import * as educationModule from './PhoneEducation';
import {
  PHONE_EDUCATION_INPUT_POLICY,
  PhoneEducation
} from './PhoneEducation';

const source = readFileSync(new URL('./PhoneEducation.tsx', import.meta.url), 'utf8');
const phoneEducationStaticPresentationFrame = (
  educationModule as typeof educationModule & Readonly<{
    phoneEducationStaticPresentationFrame?: (
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
).phoneEducationStaticPresentationFrame;

describe('PhoneEducation', () => {
  it('keeps one canonical Education article in native document flow', () => {
    const markup = renderToStaticMarkup(createElement(PhoneEducation, {
      active: true,
      reducedMotion: false
    }));

    expect(markup).toContain('id="education"');
    expect(markup.match(/data-r4-scene="education"/g)).toHaveLength(1);
    expect(markup.match(/data-reading-scrollport="true"/g)).toHaveLength(1);
    expect(markup).toContain('data-phone-input-owner="native-document"');
    expect(markup).not.toContain('tabindex="-1"');
  });

  it('keeps wheel, touch, keyboard, and focus with the reading document', () => {
    expect(PHONE_EDUCATION_INPUT_POLICY).toEqual({
      wheel: 'native',
      touch: 'native',
      keyboard: 'native',
      focus: 'native'
    });
  });

  it('uses the shared Education hash rather than a phone-only navigation map', () => {
    expect(hashForScene('education')).toBe('#education');
    expect(sceneFromHash('#education')).toBe('education');
  });

  it('keeps the authored intro and programme as two native full-viewport acts', () => {
    const stylesheet = readFileSync(new URL('./PhoneEducation.css', import.meta.url), 'utf8');

    expect(stylesheet).toContain('min-block-size: 200svh');
    expect(stylesheet).toContain('min-block-size: 200dvh');
    expect(stylesheet).toContain('min-block-size: 100svh');
    expect(stylesheet).toContain('min-block-size: 100dvh');
    expect(stylesheet).toContain('gap: 0');
    expect(stylesheet).toContain('overflow: visible');
    expect(stylesheet).not.toContain('overflow-y: auto');
    expect(stylesheet).not.toContain('data-phone-ph-education-layer');
    expect(stylesheet).not.toContain('z-index: 4');
    expect(stylesheet).not.toContain('position: fixed');
  });

  it('[Lab↔PH↔Education reduced cutover] returns the original Education static token only as a leaf post-paint fact', () => {
    const token: PresentationToken = {
      authorityId: 'group67-authority',
      sessionId: 'lab-education-reduced',
      generation: 21,
      leg: 0,
      revision: 34,
      subject: 'native:education',
      kind: 'static-poster'
    };

    expect(phoneEducationStaticPresentationFrame).toBeTypeOf('function');
    if (!phoneEducationStaticPresentationFrame) return;
    const frame = phoneEducationStaticPresentationFrame(token, 1, 72);
    expect(frame).toEqual({
      token,
      frameSequence: 1,
      observedAt: 72,
      origin: 'leaf-static-poster'
    });
    expect(frame.token).toBe(token);
  });

  it('[Lab↔PH↔Education reduced cutover] owns one cancellable double-post-paint binding and no generic proof writer', () => {
    expect(source).toContain('cancelPhoneEducationStaticPresentationFrames');
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
