import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  PhoneFigure3,
  phoneFigure3Frame,
  phoneFigure3MediaInput,
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

  it('uses the shared timeline driver instead of scroll-time naked seeks', () => {
    expect(phoneFigure3MediaInput(.6, -1)).toMatchObject({
      direction: -1,
      mode: 'timeline',
      progress: .6,
      reducedMotion: false
    });
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
