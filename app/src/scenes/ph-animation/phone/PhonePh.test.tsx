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
  phonePhPresentationProgress
} from './PhonePh';

const source = readFileSync(new URL('./PhonePh.tsx', import.meta.url), 'utf8');

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

  it('starts the canonical media clock instead of seeking from scroll samples', () => {
    expect(source).toContain('createPhonePhAutoplay');
    expect(source).toContain('renderPhAnimationProgress(root, progress, { mediaRun })');
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
