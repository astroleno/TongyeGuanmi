import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  PhoneTtg,
  phoneTtgFrame,
  phoneTtgHasReusableEndpointFrame,
  phoneTtgHasReusableTerminalFrame,
  phoneTtgMediaAction,
  markPhoneTtgPresentedEndpoint,
  releasePhoneTtgVideo
} from './PhoneTtg';
import {
  PHONE_TTG_LAB_ANIMATION_STOP,
  phoneTtgDissolveChapterProgress,
  phoneTtgMediaChapterProgress,
  phoneTtgReverseFrameProgress
} from './motion';

describe('PhoneTtg', () => {
  it('owns only its one optional video and retains local static layers', () => {
    const motionMarkup = renderToStaticMarkup(createElement(PhoneTtg, {
      active: true,
      reducedMotion: false
    }));
    const reducedMarkup = renderToStaticMarkup(createElement(PhoneTtg, {
      active: true,
      reducedMotion: true
    }));

    expect(motionMarkup.match(/data-media-key="ttg-figure-motion"/g)).toHaveLength(1);
    expect(motionMarkup.match(/<video/g)).toHaveLength(1);
    expect(motionMarkup.match(/<img/g)).toHaveLength(3);
    expect(reducedMarkup).not.toContain('<video');
  });

  it('has reversible mobile layers and holds the last frame on failure', () => {
    expect(phoneTtgFrame(0, false, false, 1000)).toMatchObject({
      progress: 0,
      backgroundY: 0,
      backgroundScale: 1,
      middleY: 0,
      middleScale: 1,
      foregroundY: 292,
      figureY: -85
    });
    expect(phoneTtgFrame(1, false, false, 1000)).toMatchObject({
      progress: 1,
      visualProgress: 1,
      backgroundY: -143,
      backgroundScale: 1.018,
      middleY: 235,
      middleScale: 1.012,
      foregroundY: 423,
      figureY: 80
    });
    expect(phoneTtgFrame(0.4, false, true, 1000)).toMatchObject({
      progress: 0.4,
      figureOpacity: 0
    });
  });

  it('keeps desktop media/dissolve timing and a 30 fps reverse seek cadence', () => {
    expect(PHONE_TTG_LAB_ANIMATION_STOP).toBeCloseTo(2500 / 3100);
    expect(phoneTtgMediaChapterProgress(1))
      .toBeCloseTo(PHONE_TTG_LAB_ANIMATION_STOP);
    expect(phoneTtgDissolveChapterProgress(0, 1))
      .toBeCloseTo(PHONE_TTG_LAB_ANIMATION_STOP);
    expect(phoneTtgDissolveChapterProgress(1, 1)).toBe(1);
    expect(phoneTtgDissolveChapterProgress(0, -1)).toBe(1);
    expect(phoneTtgDissolveChapterProgress(1, -1))
      .toBeCloseTo(PHONE_TTG_LAB_ANIMATION_STOP);
    expect(phoneTtgReverseFrameProgress(.5)).toBeCloseTo(37 / 74);
  });

  it('selects one native run or a stable endpoint from document state', () => {
    expect(phoneTtgMediaAction(false, true)).toBe('hold-initial');
    expect(phoneTtgMediaAction(true, true)).toBe('play-forward');
    expect(phoneTtgMediaAction(true, true, false, false, false, -1)).toBe('play-reverse');
    expect(phoneTtgMediaAction(false, true, false, false, true, 1)).toBe('hold-terminal');
    expect(phoneTtgMediaAction(false, true, false, false, true, -1)).toBe('hold-terminal');
    expect(phoneTtgMediaAction(false, false)).toBe('release');
  });

  it('reuses the retained physical terminal frame for Lab → TTG reverse', () => {
    expect(phoneTtgHasReusableTerminalFrame({
      currentTime: 2.467,
      duration: 2.5,
      readyState: 2,
      seeking: false,
      dataset: {
        phoneGroup45FrameReady: 'true',
        phoneTtgEndpointReady: 'terminal'
      }
    } as unknown as HTMLVideoElement)).toBe(true);
    expect(phoneTtgHasReusableTerminalFrame({
      currentTime: 0,
      duration: 2.5,
      readyState: 2,
      seeking: false,
      dataset: {
        phoneGroup45FrameReady: 'true',
        phoneTtgEndpointReady: 'terminal'
      }
    } as unknown as HTMLVideoElement)).toBe(false);
  });

  it('retains the physically presented initial frame after reverse completion', () => {
    expect(phoneTtgHasReusableEndpointFrame({
      currentTime: 0,
      duration: 2.5,
      readyState: 2,
      seeking: false,
      dataset: {
        phoneGroup45FrameReady: 'true',
        phoneTtgEndpointReady: 'initial'
      }
    } as unknown as HTMLVideoElement, 0)).toBe(true);
    expect(phoneTtgHasReusableEndpointFrame({
      currentTime: .2,
      duration: 2.5,
      readyState: 2,
      seeking: false,
      dataset: {
        phoneGroup45FrameReady: 'true',
        phoneTtgEndpointReady: 'initial'
      }
    } as unknown as HTMLVideoElement, 0)).toBe(false);
  });

  it('does not expose Safari loadeddata as a physically presented ink frame', () => {
    expect(phoneTtgHasReusableEndpointFrame({
      currentTime: 0,
      duration: 2.5,
      readyState: 2,
      seeking: false,
      dataset: { phoneGroup45FrameReady: 'true' }
    } as unknown as HTMLVideoElement, 0)).toBe(false);
  });

  it('marks a terminal endpoint only from presented-frame media time', () => {
    const video = {
      currentTime: 2.467,
      duration: 2.5,
      readyState: 2,
      seeking: false,
      dataset: {} as Record<string, string>
    } as unknown as HTMLVideoElement;

    markPhoneTtgPresentedEndpoint(video, 2.1);
    expect(video.dataset.phoneTtgEndpointReady).toBeUndefined();

    markPhoneTtgPresentedEndpoint(video, 2.467);
    expect(video.dataset.phoneGroup45FrameReady).toBe('true');
    expect(video.dataset.phoneTtgEndpointReady).toBe('terminal');
    expect(phoneTtgHasReusableTerminalFrame(video)).toBe(true);
  });

  it('disposes the retired video source and decoder', () => {
    const source = { removeAttribute: vi.fn() };
    const video = {
      dataset: { phoneTtgEndpointReady: 'terminal' },
      pause: vi.fn(),
      removeAttribute: vi.fn(),
      querySelectorAll: vi.fn(() => [source]),
      load: vi.fn()
    };

    releasePhoneTtgVideo(video as unknown as HTMLVideoElement);

    expect(video.pause).toHaveBeenCalledOnce();
    expect(video.dataset.phoneTtgEndpointReady).toBeUndefined();
    expect(video.removeAttribute).toHaveBeenCalledWith('src');
    expect(source.removeAttribute).toHaveBeenCalledWith('src');
    expect(video.load).toHaveBeenCalledOnce();
  });
});
