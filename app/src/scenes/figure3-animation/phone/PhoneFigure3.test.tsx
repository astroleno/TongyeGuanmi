import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { PhoneLeafReportPort } from '../../../production/phone-story/presentation';
import {
  PhoneFigure3,
  PHONE_FIGURE3_ENDPOINT_POSTER_FALLBACK_MS,
  phoneFigure3CanStartPreparedRun,
  phoneFigure3EndpointIsPresented,
  phoneFigure3Frame,
  phoneFigure3HasReusableEndpointFrame,
  phoneFigure3MediaAction,
  phoneFigure3RunStartEndpoint,
  releasePhoneFigure3Video
} from './PhoneFigure3';

describe('PhoneFigure3', () => {
  const reports = {
    registerMount: vi.fn(), reportPrepared: vi.fn(), reportFrame: vi.fn(),
    reportProgress: vi.fn(), reportComplete: vi.fn(), reportFailure: vi.fn()
  } satisfies PhoneLeafReportPort;

  it('owns one static poster plus one persistent Figure3 video and paper Canvas', () => {
    const motionMarkup = renderToStaticMarkup(createElement(PhoneFigure3, {
      reports
    }));

    expect(motionMarkup.match(/data-media-key="figure3-motion"/g)).toHaveLength(1);
    expect(motionMarkup.match(/<video/g)).toHaveLength(1);
    expect(motionMarkup.match(/<canvas/g)).toHaveLength(1);
    expect(motionMarkup.match(/<img/g)).toHaveLength(1);
    expect(motionMarkup).toContain('data-phone-figure3-paper-poster');
    expect(motionMarkup).toContain('data-phone-figure3-paper-canvas');
    expect(motionMarkup).toContain('data-phone-figure3-initial-composite');
    expect(motionMarkup).toContain('data-phone-media-fallback="figure3"');
    expect(motionMarkup).toContain('data-phone-media-owner="figure3-motion"');
  });

  it('fills the complete presentation plane instead of an 80svh subsection', () => {
    const css = readFileSync(new URL('./PhoneFigure3.css', import.meta.url), 'utf8');
    expect(css).not.toContain('max(80svh, 38rem)');
    expect(css).toMatch(/\.phone-figure3__mount\s*\{[^}]*block-size:\s*100%;/s);
    expect(css).toMatch(/\.phone-figure3\s*\{[^}]*block-size:\s*100%;/s);
  });

  it('bounds the physical endpoint gate before the visible poster takes over', () => {
    expect(PHONE_FIGURE3_ENDPOINT_POSTER_FALLBACK_MS).toBe(1500);
  });

  it('uses stable endpoints for media failure and reduced motion', () => {
    expect(phoneFigure3Frame(0.5)).toMatchObject({
      progress: 0.5,
      videoOpacity: 1,
      backdropOpacity: expect.any(Number),
      backdropScale: expect.any(Number)
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

  it('selects autonomous playback or deterministic endpoints from scroll state', () => {
    expect(phoneFigure3MediaAction(false, true)).toBe('hold-initial');
    expect(phoneFigure3MediaAction(true, true)).toBe('play-forward');
    expect(phoneFigure3MediaAction(true, true, false, false, false, -1)).toBe('play-reverse');
    expect(phoneFigure3MediaAction(false, true, false, false, true, 1)).toBe('hold-terminal');
    expect(phoneFigure3MediaAction(false, true, false, false, true, -1)).toBe('hold-terminal');
    expect(phoneFigure3MediaAction(false, false)).toBe('release');
  });

  it('waits for the presentable endpoint required by each direction', () => {
    expect(phoneFigure3RunStartEndpoint(1)).toBe(0);
    expect(phoneFigure3RunStartEndpoint(-1)).toBe(1);
    expect(phoneFigure3CanStartPreparedRun(1, null)).toBe(false);
    expect(phoneFigure3CanStartPreparedRun(1, 1)).toBe(false);
    expect(phoneFigure3CanStartPreparedRun(1, 0)).toBe(true);
    expect(phoneFigure3CanStartPreparedRun(-1, null)).toBe(false);
    expect(phoneFigure3CanStartPreparedRun(-1, 0)).toBe(false);
    expect(phoneFigure3CanStartPreparedRun(-1, 1)).toBe(true);
  });

  it('accepts a decoded Safari endpoint without waiting for a frame callback', () => {
    expect(phoneFigure3EndpointIsPresented(0, 0, 2, false)).toBe(true);
    expect(phoneFigure3EndpointIsPresented(0, .04, 2, false)).toBe(true);
    expect(phoneFigure3EndpointIsPresented(0, .06, 2, false)).toBe(false);
    expect(phoneFigure3EndpointIsPresented(1, 2.567, 2, false)).toBe(true);
    expect(phoneFigure3EndpointIsPresented(1, 2.567, 1, false)).toBe(false);
    expect(phoneFigure3EndpointIsPresented(1, 2.567, 2, true)).toBe(false);
  });

  it('reuses only a Canvas frame with an exact mapped video endpoint', () => {
    const video = {
      currentTime: 0,
      readyState: 2,
      seeking: false
    } as Pick<HTMLVideoElement, 'currentTime' | 'readyState' | 'seeking'>;
    const canvas = {
      dataset: {
        phoneFigure3PaperFrame: 'ready',
        phoneFigure3PaperEndpoint: 'initial',
        phoneFigure3PaperFrameIndex: '0'
      }
    } as Pick<HTMLCanvasElement, 'dataset'>;

    expect(phoneFigure3HasReusableEndpointFrame(video, canvas, 0)).toBe(true);
    expect(phoneFigure3HasReusableEndpointFrame(video, canvas, 1)).toBe(false);

    video.currentTime = 77 / 30;
    canvas.dataset.phoneFigure3PaperEndpoint = 'terminal';
    canvas.dataset.phoneFigure3PaperFrameIndex = '77';
    expect(phoneFigure3HasReusableEndpointFrame(video, canvas, 1)).toBe(true);
    canvas.dataset.phoneFigure3PaperFrameIndex = '76';
    expect(phoneFigure3HasReusableEndpointFrame(video, canvas, 1)).toBe(false);
  });

  it('disposes the retired video source and decoder', () => {
    const firstSource = { getAttribute: vi.fn(() => null), dataset: {}, removeAttribute: vi.fn() };
    const secondSource = { getAttribute: vi.fn(() => null), dataset: {}, removeAttribute: vi.fn() };
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
