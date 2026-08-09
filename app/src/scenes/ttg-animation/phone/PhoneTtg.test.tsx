import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  PhoneTtg,
  phoneTtgBootstrapEndpoint,
  phoneTtgFrame,
  phoneTtgHasTokenBoundEndpointFrame,
  phoneTtgHasReusableEndpointFrame,
  phoneTtgHeldEndpoint,
  phoneTtgMediaAction,
  phoneTtgPreparedPresentationFrame,
  phoneTtgPresentationProbeTime,
  phoneTtgTargetPresentationLease,
  markPhoneTtgPresentedEndpoint,
  releasePhoneTtgVideo,
  waitForPhoneTtgCurrentData
} from './PhoneTtg';
import {
  phoneRuntimePresentationTokenKey,
  type PresentationToken
} from '../../../production/phone/phone-story/runtime';
import {
  PHONE_TTG_LAB_ANIMATION_STOP,
  phoneTtgDissolveChapterProgress,
  phoneTtgMediaChapterProgress,
  phoneTtgReverseFrameProgress
} from './motion';

function ttgPresentationToken(
  overrides: Partial<PresentationToken> = {}
): PresentationToken {
  return {
    authorityId: 'authority',
    sessionId: 'session',
    generation: 42,
    leg: 0,
    revision: 41,
    subject: 'group45:effect',
    kind: 'effect-frame',
    ...overrides
  };
}

const phoneTtgSource = readFileSync(
  new URL('./PhoneTtg.tsx', import.meta.url),
  'utf8'
);

describe('PhoneTtg', () => {
  it('[Services↔TTG hard cutover] starts playback only from reconciliation', () => {
    expect([...phoneTtgSource.matchAll(/\bstartRun\(/g)]).toHaveLength(1);
    expect(phoneTtgSource).not.toMatch(/^\s*(?:enter|reverse)\(\)/m);
    const reconcileStart = phoneTtgSource.indexOf('const reconcileMedia');
    const handleStart = phoneTtgSource.indexOf('useImperativeHandle(forwardedRef');
    expect(phoneTtgSource.slice(reconcileStart, handleStart)).toContain('startRun(');
  });

  it('[P0 TTG reverse] delegates reverse progress to the presented-frame primitive', () => {
    expect(phoneTtgSource).toContain('createPhonePresentedReversePlayback');
    expect(phoneTtgSource).toContain('preparePhoneTimelineVideoFrame');
    expect(phoneTtgSource).not.toContain('playback.start(-1)');
  });

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

  it('keeps the orchestrator target ahead of an inactive prewarm endpoint', () => {
    expect(phoneTtgHeldEndpoint('hold-initial', 1)).toBe(1);
    expect(phoneTtgHeldEndpoint('hold-terminal', 0)).toBe(0);
    expect(phoneTtgHeldEndpoint('hold-initial', null)).toBe(0);
    expect(phoneTtgHeldEndpoint('hold-terminal', null)).toBe(1);
    expect(phoneTtgHeldEndpoint('play-reverse', 1)).toBeNull();
  });

  it('[Services↔TTG hard cutover] does not reset a pending terminal admission to frame zero', () => {
    const terminalTarget = {
      endpoint: 1,
      direction: -1,
      token: ttgPresentationToken({
        leg: 1,
        revision: 42,
        subject: 'group45:ttg',
        kind: 'packed-canvas-frame'
      }),
      signal: new AbortController().signal
    } as const;

    expect(phoneTtgBootstrapEndpoint(terminalTarget)).toBe(1);
    expect(phoneTtgBootstrapEndpoint(null)).toBe(0);
    const aborted = new AbortController();
    aborted.abort();
    expect(phoneTtgBootstrapEndpoint({
      ...terminalTarget,
      signal: aborted.signal
    })).toBe(0);
    expect(phoneTtgSource).toContain(
      'playback.reset(phoneTtgBootstrapEndpoint(targetPreparationRef.current));'
    );
  });

  it('[Services↔TTG hard cutover] retains an immutable direct target through an inactive snapshot pass', () => {
    const token = ttgPresentationToken();
    const target = {
      endpoint: 0,
      direction: 1,
      token,
      signal: new AbortController().signal
    } as const;

    expect(phoneTtgTargetPresentationLease(target, 'release'))
      .toBe('retain-target-presentation');
    expect(phoneTtgTargetPresentationLease(null, 'hold-initial'))
      .toBe('hold-initial');
  });

  it('[Services↔TTG hard cutover] hands a prepared leg-0 target to its legal leg-1 playback successor', () => {
    const admission = ttgPresentationToken();
    const playback = ttgPresentationToken({
      leg: 1,
      revision: 42,
      subject: 'group45:ttg',
      kind: 'packed-canvas-frame'
    });
    const key = phoneRuntimePresentationTokenKey(admission);
    const target = {
      endpoint: 0,
      direction: 1,
      token: admission,
      signal: new AbortController().signal
    } as const;
    const execution = [
      'authority',
      'session',
      42,
      1,
      1,
      playback
    ] as const;
    const prepared = { endpoint: 0, presentationKey: key } as const;

    expect(phoneTtgTargetPresentationLease(
      target,
      'play-forward',
      execution,
      prepared
    )).toBe('play-forward');
    expect(phoneTtgTargetPresentationLease(
      target,
      'play-forward',
      execution,
      { endpoint: 0, presentationKey: key + ':stale' }
    )).toBe('retain-target-presentation');
  });

  it('[Services↔TTG hard cutover] rejects a cross-leg successor that does not advance revision', () => {
    const admission = ttgPresentationToken({ revision: 42 });
    const playback = ttgPresentationToken({
      leg: 1,
      revision: 42,
      subject: 'group45:ttg',
      kind: 'packed-canvas-frame'
    });
    const target = {
      endpoint: 0,
      direction: 1,
      token: admission,
      signal: new AbortController().signal
    } as const;

    expect(phoneTtgTargetPresentationLease(
      target,
      'play-forward',
      ['authority', 'session', 42, 1, 1, playback],
      {
        endpoint: 0,
        presentationKey: phoneRuntimePresentationTokenKey(admission)
      }
    )).toBe('discard-stale-target');
  });

  it('[Services↔TTG hard cutover] drops a stale prior-session target before a new execution can start', () => {
    const stale = ttgPresentationToken({ sessionId: 'stale-session' });
    const playback = ttgPresentationToken({
      leg: 1,
      revision: 42,
      subject: 'group45:ttg',
      kind: 'packed-canvas-frame'
    });
    const target = {
      endpoint: 0,
      direction: 1,
      token: stale,
      signal: new AbortController().signal
    } as const;

    expect(phoneTtgTargetPresentationLease(
      target,
      'play-forward',
      ['authority', 'session', 42, 1, 1, playback],
      { endpoint: 0, presentationKey: phoneRuntimePresentationTokenKey(stale) }
    )).toBe('discard-stale-target');
  });

  it('[Services↔TTG hard cutover] discards an aborted target before it can retain the next reconciliation', () => {
    const controller = new AbortController();
    const token = ttgPresentationToken();
    const target = {
      endpoint: 0,
      direction: 1,
      token,
      signal: controller.signal
    } as const;

    controller.abort();

    expect(phoneTtgTargetPresentationLease(target, 'release'))
      .toBe('discard-stale-target');
  });

  it('[Services↔TTG hard cutover] admits a same-leg reverse target only with its exact prepared token', () => {
    const token = ttgPresentationToken({
      leg: 1,
      revision: 42,
      subject: 'group45:ttg',
      kind: 'packed-canvas-frame'
    });
    const key = phoneRuntimePresentationTokenKey(token);
    const target = {
      endpoint: 1,
      direction: -1,
      token,
      signal: new AbortController().signal
    } as const;

    expect(phoneTtgTargetPresentationLease(
      target,
      'play-reverse',
      ['authority', 'session', 42, 1, -1, token],
      { endpoint: 1, presentationKey: key }
    )).toBe('play-reverse');
  });

  it('[Services↔TTG hard cutover] accepts a direct endpoint only when its complete current token prepared it', () => {
    const key = 'authority:session:7:0:42:group45:ttg:packed-canvas-frame';
    const prepared = { endpoint: 0, presentationKey: key } as const;

    expect(phoneTtgHasTokenBoundEndpointFrame(prepared, 0, key)).toBe(true);
    expect(phoneTtgHasTokenBoundEndpointFrame(prepared, 0, key + ':stale')).toBe(false);
    expect(phoneTtgHasTokenBoundEndpointFrame(prepared, 1, key)).toBe(false);
  });

  it('[WebKit direct-entry admission] nudges only an exact prepared initial endpoint to request a real video frame', () => {
    const key = 'authority:session:7:0:42:group45:ttg:packed-canvas-frame';
    const prepared = { endpoint: 0, presentationKey: key } as const;

    expect(phoneTtgPresentationProbeTime(0, prepared, key)).toBeCloseTo(.0001);
    expect(phoneTtgPresentationProbeTime(0, prepared, key + ':stale')).toBe(0);
    expect(phoneTtgPresentationProbeTime(2.4, null, key)).toBeCloseTo(2.39999);
    expect(phoneTtgSource).toContain(
      'video.currentTime = phoneTtgPresentationProbeTime('
    );
  });

  it('[WebKit direct-entry admission] forwards only an exact verified decoder endpoint after target post-paint', () => {
    const token = ttgPresentationToken({
      subject: 'group45:ttg',
      kind: 'packed-canvas-frame'
    });
    const key = phoneRuntimePresentationTokenKey(token);
    const video = {
      currentTime: .0001,
      duration: 2.5,
      readyState: 4,
      seeking: false,
      dataset: {
        phoneGroup45FrameReady: 'true',
        phoneTtgEndpointReady: 'initial',
        timelineVideoFrameReady: 'true',
        timelineVideoFrameEvidence: 'seeked-fallback'
      }
    } as unknown as HTMLVideoElement;

    expect(phoneTtgPreparedPresentationFrame(
      token,
      { endpoint: 0, presentationKey: key },
      video,
      3,
      42
    )).toEqual({
      token,
      frameSequence: 3,
      observedAt: 42,
      origin: 'leaf-post-paint'
    });
    expect(phoneTtgPreparedPresentationFrame(
      token,
      { endpoint: 0, presentationKey: key + ':stale' },
      video,
      3,
      42
    )).toBeNull();
    video.dataset.timelineVideoFrameEvidence = 'unverified';
    expect(phoneTtgPreparedPresentationFrame(
      token,
      { endpoint: 0, presentationKey: key },
      video,
      3,
      42
    )).toBeNull();
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
    expect(phoneTtgHasReusableEndpointFrame(video, 1)).toBe(true);
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

  it('rearms remounted media before waiting for current data', async () => {
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    const video = Object.assign(new EventTarget(), {
      preload: 'none',
      readyState: 0,
      load: vi.fn()
    }) as unknown as HTMLVideoElement;
    const controller = new AbortController();

    try {
      const ready = waitForPhoneTtgCurrentData(video, controller.signal);
      video.dispatchEvent(new Event('loadeddata'));

      expect(await ready).toBe(true);
      expect(video.preload).toBe('auto');
      expect(video.load).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
