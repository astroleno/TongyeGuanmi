import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  PhoneFigure3,
  phoneFigure3AutoplayInput,
  phoneFigure3Frame,
  phoneFigure3MediaAction,
  phoneFigure3MediaInput,
  phoneFigure3ForwardRunAction,
  phoneFigure3OwnsNativeRun,
  phoneFigure3StableEndpointInput,
  releasePhoneFigure3Video
} from './PhoneFigure3';

describe('PhoneFigure3', () => {
  it('owns one optional Figure3 video and skips it for reduced motion', () => {
    const motionMarkup = renderToStaticMarkup(createElement(PhoneFigure3, {
      active: true,
      reducedMotion: false
    }));
    const reducedMarkup = renderToStaticMarkup(createElement(PhoneFigure3, {
      active: true,
      reducedMotion: true
    }));

    expect(motionMarkup.match(/data-media-key="figure3-motion"/g)).toHaveLength(1);
    expect(motionMarkup.match(/<video/g)).toHaveLength(1);
    expect(reducedMarkup).not.toContain('<video');
    expect(motionMarkup).toContain('data-phone-media-owner="figure3-motion"');
  });

  it('uses stable endpoints for media failure and reduced motion', () => {
    expect(phoneFigure3Frame(0.5)).toMatchObject({
      progress: 0.5,
      videoOpacity: 1
    });
    expect(phoneFigure3Frame(0.5, true)).toMatchObject({
      progress: 0,
      videoOpacity: 0
    });
    expect(phoneFigure3Frame(0.5, false, true)).toMatchObject({
      progress: 1,
      videoOpacity: 0
    });
  });

  it('starts each autonomous forward run at source frame zero, not at document progress', () => {
    expect(phoneFigure3AutoplayInput()).toMatchObject({
      direction: 1,
      mode: 'native-preferred',
      progress: 0,
      reducedMotion: false
    });
    expect(phoneFigure3MediaInput(.92, 1)).toMatchObject({
      direction: 1,
      mode: 'native-preferred',
      progress: .92
    });
    // The adapter uses the zero-progress autoplay input above; a scroll value
    // may still be tracked for trigger direction but is never used as start time.
    expect(phoneFigure3AutoplayInput().progress).toBe(0);
  });

  it('holds deterministic endpoints for prewarm, reverse, and forward exit', () => {
    expect(phoneFigure3MediaAction(false, true)).toBe('hold-initial');
    expect(phoneFigure3MediaAction(true, true)).toBe('play-forward');
    expect(phoneFigure3MediaAction(true, true, false, false, false, -1)).toBe('hold-initial');
    expect(phoneFigure3MediaAction(false, true, false, false, true, 1)).toBe('hold-terminal');
    expect(phoneFigure3MediaAction(false, true, false, false, true, -1)).toBe('hold-initial');
    expect(phoneFigure3MediaAction(false, false)).toBe('release');
    expect(phoneFigure3StableEndpointInput(0)).toMatchObject({
      direction: -1,
      mode: 'timeline',
      progress: 0
    });
    expect(phoneFigure3MediaInput(.6, -1)).toMatchObject({
      direction: -1,
      mode: 'timeline',
      progress: .6,
      reducedMotion: false
    });
  });

  it('coalesces repeated reconciliation and rejects stale play owners', () => {
    expect(phoneFigure3ForwardRunAction(false, true, 'preparing')).toBe('wait');
    expect(phoneFigure3ForwardRunAction(false, true, 'playing')).toBe('wait');
    expect(phoneFigure3ForwardRunAction(true, false, 'stable-initial')).toBe('start');
    expect(phoneFigure3ForwardRunAction(false, false, 'terminal')).toBe('ignore');
    expect(phoneFigure3OwnsNativeRun(4, 4, 4)).toBe(true);
    expect(phoneFigure3OwnsNativeRun(3, 4, 4)).toBe(false);
  });

  it('disposes the retired video source and decoder', () => {
    const firstSource = { removeAttribute: vi.fn() };
    const secondSource = { removeAttribute: vi.fn() };
    const video = {
      pause: vi.fn(),
      removeAttribute: vi.fn(),
      querySelectorAll: vi.fn(() => [firstSource, secondSource]),
      load: vi.fn()
    };

    releasePhoneFigure3Video(video as unknown as HTMLVideoElement);

    expect(video.pause).toHaveBeenCalledOnce();
    expect(video.removeAttribute).toHaveBeenCalledWith('src');
    expect(firstSource.removeAttribute).toHaveBeenCalledWith('src');
    expect(secondSource.removeAttribute).toHaveBeenCalledWith('src');
    expect(video.load).toHaveBeenCalledOnce();
  });
});
