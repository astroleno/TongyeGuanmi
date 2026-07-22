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
  phonePhPresentationProgress,
  phonePhTimelineProgressForMediaProgress
} from './PhonePh';

const source = readFileSync(new URL('./PhonePh.tsx', import.meta.url), 'utf8');
const nativeClockSource = readFileSync(
  new URL('../../../production/phone/phone-native-autoplay.ts', import.meta.url),
  'utf8'
);
const css = readFileSync(new URL('./PhonePh.css', import.meta.url), 'utf8');

describe('PhonePh', () => {
  it('keeps one canonical PH visual/media owner', () => {
    const markup = renderToStaticMarkup(createElement(PhonePh, {
      active: true,
      reducedMotion: false
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

  it('keeps native media time aligned to the Figure2 phone camera', () => {
    expect(phonePhTimelineProgressForMediaProgress(0)).toBe(0);
    expect(phonePhTimelineProgressForMediaProgress(0.445)).toBeCloseTo(0.5, 5);
    expect(phonePhTimelineProgressForMediaProgress(1)).toBeCloseTo(1, 5);
    expect(css).toContain('left: 61%');
    expect(css).toContain('--phone-ph-plate-width');
    expect(css).toContain('--phone-ph-front-width');
    expect(css).toContain('var(--phone-cinematic-stage-height, 100lvh) * .74');
    expect(css).toContain('object-position: 12% 50%');
    expect(css).toContain('* 1.55');
    expect(css).toContain('* .245');
    expect(css).toContain('opacity: 1 !important');
    expect(css).toContain('.phone-ph .ph-edge-light');
    expect(css).toContain('background: none');
    expect(css).not.toContain('::before');
    expect(css).not.toContain('::after');
    expect(css).not.toContain('--phone-ph-island-source');
  });

  it('reuses the AOD native-time policy and Figure2 stable-surface policy', () => {
    expect(source).toContain('createPhoneNativeAutoplay');
    expect(source).toContain('createPhonePackedAlphaSurface');
    expect(source).toContain("phoneMediaUrlFor('ph-figure-packed'");
    expect(source).toContain("ensurePackedSurface('endpoint')");
    expect(source).toContain("reducedMotion ? 'endpoint' : 'forward'");
    expect(source).toContain('PH_FIGURE_END_SECONDS');
    expect(source).toContain('createPhonePhReverseDissolve');
    expect(source).toContain("'endpoint-dissolve'");
    expect(nativeClockSource).toContain('video.currentTime / duration');
    expect(nativeClockSource).toContain("video.addEventListener('timeupdate'");
    expect(source).not.toContain('driveTimelineVideo');
    expect(source).not.toContain("mode: 'timeline'");
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
