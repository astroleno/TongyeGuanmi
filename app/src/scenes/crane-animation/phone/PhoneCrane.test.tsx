import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FakeElement,
  FakeVideo
} from '../../../transitions/__fixtures__/back-half.fixture';
import {
  applyPhoneCraneMediaFallback,
  parkPhoneCraneMedia,
  PHONE_CRANE_STABLE_HOLD_PROGRESS,
  PhoneCrane,
  phoneCranePresentationProgress
} from './PhoneCrane';

const source = readFileSync(new URL('./PhoneCrane.tsx', import.meta.url), 'utf8');
const autoplaySource = readFileSync(
  new URL('./PhoneCrane.autoplay.ts', import.meta.url),
  'utf8'
);
const motionSource = readFileSync(
  new URL('./PhoneCrane.motion.ts', import.meta.url),
  'utf8'
);
const css = readFileSync(new URL('./PhoneCrane.css', import.meta.url), 'utf8');

describe('PhoneCrane', () => {
  it('keeps one canonical Crane stage with two media surfaces', () => {
    const markup = renderToStaticMarkup(createElement(PhoneCrane, {
      active: true,
      reducedMotion: false
    }));

    expect(markup.match(/data-r4-scene="crane-animation"/g)).toHaveLength(1);
    expect(markup.match(/data-media-key="crane-figure-motion"/g)).toHaveLength(1);
    expect(markup.match(/data-media-key="crane-flock-motion"/g)).toHaveLength(1);
    expect(markup).toContain('data-phone-scene="crane-animation"');
  });

  it('uses stable reduced-motion endpoints in canonical order', () => {
    expect(phoneCranePresentationProgress(0.49, true)).toBe(0);
    expect(phoneCranePresentationProgress(0.5, true)).toBe(1);
    expect(phoneCranePresentationProgress(0.25)).toBe(0.25);
  });

  it('reuses AOD native clocks with the authored half-second media stagger', () => {
    expect(autoplaySource).toContain('createPhoneNativeAutoplay');
    expect(source).toContain('createPhonePackedAlphaSurface');
    expect(source).toContain("'crane-figure-packed'");
    expect(source).toContain("'crane-flock-packed'");
    expect(source).toContain("ensurePackedSurfaces('endpoint')");
    expect(source).toContain("reducedMotion ? 'endpoint' : 'forward'");
    expect(autoplaySource).toContain('FIGURE_START_SECONDS = 0.5');
    expect(autoplaySource).toContain('figureClock.start()');
    expect(motionSource).toContain('renderPhoneCranePresentation');
    expect(motionSource).toContain("'endpoint-dissolve'");
    expect(source).toContain("runId: 'phone-crane:stable-endpoint'");
    expect(source).toContain('PHONE_CRANE_STABLE_HOLD_PROGRESS');
    expect(autoplaySource).not.toContain('nativeGate');
    expect(css).toContain('.phone-crane .r4-crane-animation .phone-crane__figure-canvas');
    expect(css).toContain('--phone-crane-motion-width');
    expect(css).toContain('* .834');
    expect(css).toContain('--phone-crane-flock-center-y: 64.2%');
    expect(css).toContain('position: absolute');
    expect(css).not.toContain('9dvh');
    expect(PHONE_CRANE_STABLE_HOLD_PROGRESS).toBe(0.42);
    expect(autoplaySource).toContain('PHONE_CRANE_STABLE_HOLD_PROGRESS * (1 - elapsed)');
  });

  it('keeps the static Crane layers on media failure and retires both videos', () => {
    const root = new FakeElement();
    const figure = new FakeVideo();
    const flock = new FakeVideo();
    root.dataset.r4Scene = 'crane-animation';
    root.connect('[data-crane-figure-video]', figure);
    root.connect('[data-crane-figure-front-video]', flock);
    figure.paused = false;
    flock.paused = false;

    applyPhoneCraneMediaFallback(root as unknown as HTMLElement);

    expect(root.dataset.phoneCraneMedia).toBe('fallback');
    expect(figure.dataset.phoneCraneMedia).toBe('fallback');
    expect(flock.dataset.phoneCraneMedia).toBe('fallback');
    expect(figure.paused).toBe(true);
    expect(flock.paused).toBe(true);

    figure.paused = false;
    flock.paused = false;
    parkPhoneCraneMedia(root as unknown as HTMLElement);

    expect(figure.paused).toBe(true);
    expect(flock.paused).toBe(true);
    expect(figure.preload).toBe('auto');
    expect(flock.preload).toBe('auto');
  });
});
