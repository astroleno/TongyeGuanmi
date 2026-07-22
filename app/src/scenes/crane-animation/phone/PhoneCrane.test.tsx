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
  isStaleCraneFramePreparation,
  parkPhoneCraneMedia,
  PHONE_CRANE_STABLE_HOLD_PROGRESS,
  PhoneCrane,
  phoneCranePresentationProgress
} from './PhoneCrane';

const source = readFileSync(new URL('./PhoneCrane.tsx', import.meta.url), 'utf8');

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

  it('uses an adapter-owned auto clock and native forward media', () => {
    expect(source).toContain('createPhoneCraneAutoplay');
    expect(source).toContain('nativePlayback: directionRef.current === 1');
    expect(source).not.toContain('nativePlayback: false');
    expect(PHONE_CRANE_STABLE_HOLD_PROGRESS).toBe(0.42);
  });

  it('does not mistake a superseded scroll seek for a media failure', () => {
    expect(isStaleCraneFramePreparation(new Error('Crane media stale'))).toBe(true);
    expect(isStaleCraneFramePreparation(new Error('media element failed'))).toBe(false);
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
