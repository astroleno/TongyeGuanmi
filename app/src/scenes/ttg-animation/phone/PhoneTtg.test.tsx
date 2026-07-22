import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  PhoneTtg,
  phoneTtgFrame,
  phoneTtgMediaAction,
  releasePhoneTtgVideo
} from './PhoneTtg';

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

  it('has reversible mobile layer frames and a media-failure endpoint', () => {
    expect(phoneTtgFrame(0, false, false, 1000)).toMatchObject({
      progress: 0,
      backgroundY: 0,
      middleY: 0,
      foregroundY: 292,
      figureY: -85
    });
    expect(phoneTtgFrame(1, false, false, 1000)).toMatchObject({
      progress: 1,
      visualProgress: 1,
      backgroundY: -143,
      middleY: 235,
      foregroundY: 423,
      figureY: 80
    });
    expect(phoneTtgFrame(0.4, false, true, 1000)).toMatchObject({
      progress: 1,
      figureOpacity: 0
    });
  });

  it('selects one native run or a stable endpoint from document state', () => {
    expect(phoneTtgMediaAction(false, true)).toBe('hold-initial');
    expect(phoneTtgMediaAction(true, true)).toBe('play-forward');
    expect(phoneTtgMediaAction(true, true, false, false, false, -1)).toBe('hold-initial');
    expect(phoneTtgMediaAction(false, true, false, false, true, 1)).toBe('hold-terminal');
    expect(phoneTtgMediaAction(false, true, false, false, true, -1)).toBe('hold-initial');
    expect(phoneTtgMediaAction(false, false)).toBe('release');
  });

  it('disposes the retired video source and decoder', () => {
    const source = { removeAttribute: vi.fn() };
    const video = {
      pause: vi.fn(),
      removeAttribute: vi.fn(),
      querySelectorAll: vi.fn(() => [source]),
      load: vi.fn()
    };

    releasePhoneTtgVideo(video as unknown as HTMLVideoElement);

    expect(video.pause).toHaveBeenCalledOnce();
    expect(video.removeAttribute).toHaveBeenCalledWith('src');
    expect(source.removeAttribute).toHaveBeenCalledWith('src');
    expect(video.load).toHaveBeenCalledOnce();
  });
});
