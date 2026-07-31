import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { hashForScene, sceneFromHash } from '../../../production/navigation';
import type { PresentationToken } from '../../../production/phone/phone-story/runtime';
import {
  PHONE_CONTACT_INPUT_POLICY,
  PhoneContact,
  phoneContactStaticPresentationFrame
} from './PhoneContact';

const source = readFileSync(new URL('./PhoneContact.tsx', import.meta.url), 'utf8');
const stylesheet = readFileSync(new URL('./PhoneContact.css', import.meta.url), 'utf8');

describe('PhoneContact', () => {
  it('forwards the immutable static-poster token only after Contact paints', () => {
    const token: PresentationToken = {
      authorityId: 'phone-story',
      sessionId: 'contact-static',
      generation: 4,
      revision: 9,
      subject: 'native:contact',
      kind: 'static-poster',
      leg: 0
    };

    expect(phoneContactStaticPresentationFrame(token, 1, 73.5)).toEqual({
      token,
      frameSequence: 1,
      observedAt: 73.5,
      origin: 'leaf-static-poster'
    });
    expect(source).toMatch(/presentPresentation\(token, report\)/);
    expect(source).toMatch(/requestAnimationFrame/);
    expect(source).toMatch(/disposePresentation\(token\)/);
  });

  it('owns one cancellable post-paint binding and no synthesized proof writer', () => {
    expect(source).toContain('cancelPhoneContactStaticPresentationFrames');
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

  it('keeps one canonical terminal article with keyboard-reachable actions', () => {
    const markup = renderToStaticMarkup(createElement(PhoneContact, {
      active: true,
      reducedMotion: false
    }));

    expect(markup).toContain('id="contact"');
    expect(markup.match(/data-r4-scene="contact"/g)).toHaveLength(1);
    expect(markup).toContain('约一次 AI 现场诊断');
    expect(markup).toContain('href="mailto:contact@example.com');
    expect(markup).toContain('href="#top"');
    expect(markup).toContain('data-phone-contact-state="terminal"');
    expect(markup).not.toContain('tabindex="-1"');
  });

  it('declares all CTA interaction paths as native pass-through', () => {
    expect(PHONE_CONTACT_INPUT_POLICY).toEqual({
      wheel: 'native',
      touch: 'native',
      keyboard: 'native',
      focus: 'native',
      pointer: 'native'
    });
    expect(source).not.toMatch(/addEventListener\(/);
    expect(stylesheet).toMatch(
      /\.phone-contact\s*>\s*\.r4-contact\s*\{[^}]*min-block-size:\s*100svh[^}]*min-block-size:\s*100dvh/s
    );
  });

  it('uses the shared Contact hash without importing prior visual scenes', () => {
    expect(hashForScene('contact')).toBe('#contact');
    expect(sceneFromHash('#contact')).toBe('contact');
    expect(source).not.toMatch(/ph-animation|crane-animation|prepare(?:Ph|Crane)/);
  });
});
