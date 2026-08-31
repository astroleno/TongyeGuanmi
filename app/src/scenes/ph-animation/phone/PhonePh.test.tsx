import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FakeElement,
  FakeVideo
} from '../../../transitions/__fixtures__/back-half.fixture';
import {
  applyPhonePhMediaFallback,
  parkPhonePhMedia,
  PhonePh,
  phonePhForegroundParallaxY,
  phonePhPresentationProgress
} from './PhonePh';
import { phRawProgressForFrame } from '..';
import { phonePhReverseMediaTime } from './PhonePh.reverse';
import type { PhoneLeafReportPort } from '../../../production/phone-story/presentation';

const source = readFileSync(new URL('./PhonePh.tsx', import.meta.url), 'utf8');
const motionSource = readFileSync(
  new URL('./PhonePh.motion.ts', import.meta.url),
  'utf8'
);
const reverseSource = readFileSync(
  new URL('./PhonePh.reverse.ts', import.meta.url),
  'utf8'
);
const css = readFileSync(new URL('./PhonePh.css', import.meta.url), 'utf8');

const reports = {
  registerMount() {}, reportPrepared() {}, reportFrame() {}, reportProgress() {},
  reportComplete() {}, reportFailure() {}
} satisfies PhoneLeafReportPort;

describe('PhonePh', () => {
  it('keeps one canonical PH visual/media owner', () => {
    const markup = renderToStaticMarkup(createElement(PhonePh, {
      reports
    }));

    expect(markup.match(/data-r4-scene="ph-animation"/g)).toHaveLength(1);
    expect(markup.match(/data-media-key="ph-figure-motion"/g)).toHaveLength(1);
    expect(markup).toContain('data-phone-scene="ph-animation"');
    expect(markup).toContain('preload="auto"');
  });

  it('uses stable reduced-motion endpoints in canonical order', () => {
    expect(phonePhPresentationProgress(0.49, true)).toBe(0);
    expect(phonePhPresentationProgress(0.5, true)).toBe(1);
    expect(phonePhPresentationProgress(0.75)).toBe(0.75);
  });

  it('keeps the presented media time aligned to the Figure2 phone camera', () => {
    expect(phRawProgressForFrame(0)).toBe(0);
    expect(phRawProgressForFrame(20)).toBeCloseTo(0.5, 2);
    expect(phRawProgressForFrame(45)).toBeCloseTo(1, 5);
    expect(phonePhForegroundParallaxY({ figureY: 135 })).toBe(135);
    expect(phonePhReverseMediaTime(0)).toBe(0);
    expect(phonePhReverseMediaTime(1)).toBe(1.5);
    expect(css).toContain('left: 61%');
    expect(css).toContain('--phone-ph-plate-width');
    expect(css).toContain('--phone-ph-front-width');
    expect(css).toContain('* .044');
    expect(css).toMatch(/\.ph-layer--front\s*\{[^}]*opacity: 1 !important;[^}]*filter: none;[^}]*mix-blend-mode: normal;/s);
    expect(css).toContain('-webkit-mask-image: none');
    expect(css).toContain('var(--phone-cinematic-stage-height, 100lvh) * .74');
    expect(css).toContain('object-position: 12% 50%');
    expect(css).toContain('* 1.65');
    expect(css).toContain('* .105');
    expect(css).toContain('* .245');
    expect(css).toContain('opacity: 1 !important');
    expect(css).toContain('.ph-layer-stack::before');
    expect(css).toContain('background: #d9d0b9');
    expect(css).toContain('var(--phone-ph-island-source)');
    expect(css).toContain('.phone-ph .ph-edge-light');
    expect(css).toContain('background: none');
    expect(css).not.toContain('::after');
    expect(source).toContain('PH_FRONT_SRC');
    expect(source).toContain("'--phone-ph-island-source'");
  });

  it('uses the clean runtime command port and one packed-alpha surface', () => {
    expect(source).toContain('createPhonePackedAlphaSurface');
    expect(source).toContain('PhoneLeafCommandHandle');
    expect(source).toContain('reports.registerMount');
    expect(source).toContain("reportFrame('ph-figure-canvas'");
    expect(source).toContain('phoneMediaUrlFor(');
    expect(source).toContain('surface.activate(mode)');
    expect(source).toContain('setMediaPhase(command)');
    expect(source).toContain("activateSurface('initial')");
    expect(source).toContain('PH_FIGURE_END_SECONDS');
    expect(source).toContain("surfaceRef.current?.dispose('reactivatable')");
    expect(source).not.toContain('surfaceRef.current?.release()');
    expect(source).toContain('surfaceRef.current?.probe()');
    expect(source).toContain('surface.presentFrame({');
    expect(source).not.toContain('seekPhonePhReverseFrame');
    expect(source).not.toContain("video.play()");
    expect(motionSource).toContain("direction === 1 ? 'presented-frame'");
    expect(motionSource).not.toContain("direction === 1 ? 'native'");
    expect(motionSource).toContain('phonePhForegroundParallaxY');
    expect(reverseSource).not.toContain('phone-presented-reverse-playback');
    for (const forbidden of [
      ['production', 'phone', 'types'].join('/'),
      'phone-native-autoplay',
      'phone-lab-contact-timeline',
      'phone-presented-reverse-playback'
    ]) expect(source).not.toContain(forbidden);
  });

  it('falls back to its static layers and parks media without a reload', () => {
    const root = new FakeElement();
    const video = new FakeVideo();
    root.dataset.r4Scene = 'ph-animation';
    root.connect('[data-ph-alpha-video]', video);
    video.paused = false;

    applyPhonePhMediaFallback(root as unknown as HTMLElement);

    expect(root.dataset.phonePhMedia).toBe('fallback');
    expect(video.dataset.phonePhMedia).toBe('fallback');
    expect(video.paused).toBe(true);

    video.paused = false;
    parkPhonePhMedia(root as unknown as HTMLElement);

    expect(video.paused).toBe(true);
    expect(video.preload).toBe('auto');
    expect(video.loadCalls).toBe(0);
  });
});
