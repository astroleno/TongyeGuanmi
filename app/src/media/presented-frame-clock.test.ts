import { describe, expect, it, vi } from 'vitest';

import {
  createVideoPresentedFrameClock,
  type PresentedFrameRequest
} from './presented-frame-clock';
import { createPhoneFrameLockPresenter } from './phone-frame-lock-presenter';
import { mediaTimeForFrame } from './frame-timebase';
import { disposeStrictTimelineVideoDriver } from './strict-timeline-video-driver';
import { VIDEO_FRAME_MAPS } from './video-frame-maps';
import type { PhoneLeafGenerationBinding, PhoneLeafReportPort } from '../production/phone-story/presentation';
import type { PhoneMediaFrameRequest } from '../production/phone-story/protocol';

type Listener = () => void;

type FakeVideoOptions = Readonly<{
  seekingOnCurrentTimeWrite?: boolean;
}>;

class FakeVideo {
  readonly dataset: Record<string, string> = {};
  duration = 10;
  readyState = 4;
  currentTimeWrites: number[] = [];
  requestCount = 0;
  paused = true;
  seeking = false;
  loop = false;
  muted = false;
  playsInline = false;
  playbackRate = 1;
  private time = 0;
  private callback: ((now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => void) | undefined;
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly seekingOnCurrentTimeWrite: boolean;

  constructor({ seekingOnCurrentTimeWrite = true }: FakeVideoOptions = {}) {
    this.seekingOnCurrentTimeWrite = seekingOnCurrentTimeWrite;
  }

  get currentTime(): number {
    return this.time;
  }

  set currentTime(value: number) {
    this.time = value;
    this.currentTimeWrites.push(value);
    this.seeking = this.seekingOnCurrentTimeWrite;
  }

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }

  pause(): void {
    this.paused = true;
  }

  requestVideoFrameCallback(
    callback: (now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => void
  ): number {
    this.requestCount += 1;
    this.callback = callback;
    return 1;
  }

  cancelVideoFrameCallback(): void {
    this.callback = undefined;
  }

  completeSeek(): void {
    this.seeking = false;
    for (const listener of this.listeners.get('seeked') ?? []) {
      listener();
    }
  }

  presentFrame(mediaTime = this.time): void {
    const callback = this.callback;
    this.callback = undefined;
    callback?.(0, { mediaTime } as VideoFrameCallbackMetadata);
  }
}

const videoElement = (video: FakeVideo) => video as unknown as HTMLVideoElement;
const frameMap = VIDEO_FRAME_MAPS['ph-figure-motion'];

function request(overrides: Partial<PresentedFrameRequest> = {}): PresentedFrameRequest {
  return {
    runId: 'clock-test:1',
    direction: 1,
    sequence: 1,
    desiredProgress: 23 / frameMap.endFrame,
    frameMap,
    signal: new AbortController().signal,
    ...overrides
  };
}

function phoneReportPort(): PhoneLeafReportPort {
  return {
    registerMount: vi.fn(),
    reportPrepared: vi.fn(),
    reportFrame: vi.fn(),
    reportProgress: vi.fn(),
    reportComplete: vi.fn(),
    reportFailure: vi.fn()
  };
}

function phoneRequest(
  binding: PhoneLeafGenerationBinding,
  sequence: number,
  desiredProgress: number
): PhoneMediaFrameRequest {
  return {
    frameToken: binding.frameToken,
    transactionId: binding.transactionId ?? binding.frameToken,
    direction: 1,
    sequence,
    desiredProgress,
    signal: new AbortController().signal
  };
}

describe('video presented frame clock', () => {
  it('adapts the shared driver into an exact presented receipt and diagnostics', async () => {
    const video = new FakeVideo();
    const clock = createVideoPresentedFrameClock(videoElement(video));
    const targetFrameIndex = 23;
    const targetTime = mediaTimeForFrame(frameMap, targetFrameIndex);

    const receiptPromise = clock.request(request());
    video.completeSeek();
    video.presentFrame(targetTime + 0.0001);

    await expect(receiptPromise).resolves.toEqual({
      status: 'presented',
      runId: 'clock-test:1',
      sequence: 1,
      desiredFrameIndex: targetFrameIndex,
      presentedFrameIndex: targetFrameIndex,
      mediaTimeSeconds: targetTime + 0.0001,
      presentedProgress: targetFrameIndex / frameMap.endFrame,
      evidence: 'video-frame-callback'
    });
    expect(clock.snapshot()).toMatchObject({
      desiredFrameIndex: targetFrameIndex,
      presentedFrameIndex: targetFrameIndex,
      frameLag: 0,
      lagFrames: 0,
      evidence: 'video-frame-callback',
      staleCount: 0,
      pending: false
    });
    expect(video.dataset.timelineVideoDesiredFrame).toBe(String(targetFrameIndex));
    expect(video.dataset.timelineVideoPresentedFrame).toBe(String(targetFrameIndex));
    expect(video.dataset.timelineVideoFrameLag).toBe('0');
    expect(video.dataset.timelineVideoSequence).toBe('1');
    expect(video.dataset.timelineVideoEvidence).toBe('video-frame-callback');
    expect(video.dataset.timelineVideoStaleCount).toBe('0');
    clock.dispose();
  });

  it('seeks just beyond an integer PTS before accepting its exact callback', async () => {
    const video = new FakeVideo();
    const clock = createVideoPresentedFrameClock(videoElement(video));
    const targetFrameIndex = 23;
    const targetTime = mediaTimeForFrame(frameMap, targetFrameIndex);
    const receiptPromise = clock.request(request({
      desiredProgress: targetFrameIndex / frameMap.endFrame
    }));

    expect(video.currentTime).toBeGreaterThan(targetTime);
    expect(video.currentTime).toBeLessThan(targetTime + 1 / 30 / 2);
    video.completeSeek();
    video.presentFrame(targetTime);

    await expect(receiptPromise).resolves.toMatchObject({
      status: 'presented', presentedFrameIndex: targetFrameIndex,
      mediaTimeSeconds: targetTime
    });
    clock.dispose();
  });

  it('makes an older same-run sequence stale without replacing the latest request', async () => {
    const video = new FakeVideo();
    const clock = createVideoPresentedFrameClock(videoElement(video));

    const first = clock.request(request({ sequence: 1, desiredProgress: 1 / frameMap.endFrame }));
    const second = clock.request(request({ sequence: 2, desiredProgress: 44 / frameMap.endFrame }));

    await expect(first).resolves.toMatchObject({ status: 'stale', sequence: 1 });
    video.completeSeek();
    video.presentFrame(mediaTimeForFrame(frameMap, 44));
    await expect(second).resolves.toMatchObject({
      status: 'presented',
      sequence: 2,
      desiredFrameIndex: 44,
      presentedFrameIndex: 44
    });
    expect(clock.snapshot()).toMatchObject({ sequence: 2, staleCount: 1, frameLag: 0 });
    clock.dispose();
  });

  it('rejects a late older sequence after the newer frame has already presented', async () => {
    const video = new FakeVideo();
    const clock = createVideoPresentedFrameClock(videoElement(video));

    const latest = clock.request(request({ sequence: 2, desiredProgress: 44 / frameMap.endFrame }));
    video.completeSeek();
    video.presentFrame(mediaTimeForFrame(frameMap, 44));
    await expect(latest).resolves.toMatchObject({ status: 'presented', sequence: 2 });
    const writesAfterLatest = video.currentTimeWrites.length;

    await expect(clock.request(request({ sequence: 1, desiredProgress: 1 / frameMap.endFrame })))
      .resolves.toMatchObject({ status: 'stale', sequence: 1 });
    expect(video.currentTimeWrites).toHaveLength(writesAfterLatest);
    expect(clock.snapshot()).toMatchObject({
      sequence: 2,
      presentedFrameIndex: 44,
      staleCount: 0
    });
    clock.dispose();
  });

  it('propagates abort and clears all clock diagnostics on dispose', async () => {
    const video = new FakeVideo();
    const clock = createVideoPresentedFrameClock(videoElement(video));
    const controller = new AbortController();
    const pending = clock.request(request({ signal: controller.signal }));
    controller.abort('test abort');

    await expect(pending).rejects.toMatchObject({ code: 'MEDIA_PREPARATION_ABORTED' });
    expect(video.dataset.timelineVideoClockPending).toBe('false');
    clock.dispose();
    expect(video.dataset.timelineVideoDesiredFrame).toBeUndefined();
    expect(video.dataset.timelineVideoPresentedFrame).toBeUndefined();
    expect(video.dataset.timelineVideoFrameLag).toBeUndefined();
    expect(video.dataset.timelineVideoSequence).toBeUndefined();
    expect(video.dataset.timelineVideoEvidence).toBeUndefined();
    expect(video.dataset.timelineVideoSeekMs).toBeUndefined();
    expect(video.dataset.timelineVideoStaleCount).toBeUndefined();
    expect(video.dataset.timelineVideoClockPending).toBeUndefined();
  });

  it('does not create a second driver when two clocks share one video', () => {
    const video = new FakeVideo();
    const first = createVideoPresentedFrameClock(videoElement(video));
    const second = createVideoPresentedFrameClock(videoElement(video));

    expect(first).not.toBe(second);
    first.dispose();
    second.dispose();
  });

  it('recreates the shared driver after a retained video clock is disposed', async () => {
    const video = new FakeVideo();
    const first = createVideoPresentedFrameClock(videoElement(video));
    const firstRequest = first.request(request({
      runId: 'clock-recreate:1', sequence: 1, desiredProgress: 23 / frameMap.endFrame
    }));
    video.completeSeek();
    video.presentFrame(mediaTimeForFrame(frameMap, 23));
    await expect(firstRequest).resolves.toMatchObject({
      status: 'presented', presentedFrameIndex: 23
    });
    first.dispose();

    const second = createVideoPresentedFrameClock(videoElement(video));
    const secondRequest = second.request(request({
      runId: 'clock-recreate:2', sequence: 2, desiredProgress: 44 / frameMap.endFrame
    }));
    video.completeSeek();
    video.presentFrame(mediaTimeForFrame(frameMap, 44));
    await expect(secondRequest).resolves.toMatchObject({
      status: 'presented', presentedFrameIndex: 44,
      evidence: 'video-frame-callback'
    });
    second.dispose();
  });

  it('makes a disposed pending clock stale and clears diagnostics without a successor', async () => {
    const video = new FakeVideo();
    const clock = createVideoPresentedFrameClock(videoElement(video));
    const pending = clock.request(request({
      runId: 'clock-dispose-pending:1', sequence: 1, desiredProgress: 23 / frameMap.endFrame
    }));

    clock.dispose();

    await expect(pending).resolves.toMatchObject({ status: 'stale', sequence: 1 });
    expect(video.dataset.timelineVideoDesiredFrame).toBeUndefined();
    expect(video.dataset.timelineVideoPresentedFrame).toBeUndefined();
    expect(video.dataset.timelineVideoFrameLag).toBeUndefined();
    expect(video.dataset.timelineVideoEvidence).toBeUndefined();
    expect(video.dataset.timelineVideoClockPending).toBeUndefined();
    expect(video.dataset.timelineVideoStaticFallback).toBeUndefined();
  });

  it('keeps the successor alive when the predecessor clock is disposed first', async () => {
    const video = new FakeVideo();
    const predecessor = createVideoPresentedFrameClock(videoElement(video));
    const successor = createVideoPresentedFrameClock(videoElement(video));
    const predecessorRequest = predecessor.request(request({
      runId: 'clock-dispose-order-a:predecessor', sequence: 1,
      desiredProgress: 23 / frameMap.endFrame
    }));
    const successorRequest = successor.request(request({
      runId: 'clock-dispose-order-a:successor', sequence: 2,
      desiredProgress: 44 / frameMap.endFrame
    }));

    predecessor.dispose();
    expect(video.dataset.timelineVideoDesiredFrame).toBe('44');
    video.completeSeek();
    video.presentFrame(mediaTimeForFrame(frameMap, 44));

    await expect(predecessorRequest).resolves.toMatchObject({ status: 'stale' });
    await expect(successorRequest).resolves.toMatchObject({
      status: 'presented', desiredFrameIndex: 44, presentedFrameIndex: 44
    });
    expect(video.dataset.timelineVideoStaticFallback).toBeUndefined();
    successor.dispose();
  });

  it('keeps the successor alive when the predecessor clock is disposed second', async () => {
    const video = new FakeVideo();
    const first = createVideoPresentedFrameClock(videoElement(video));
    const second = createVideoPresentedFrameClock(videoElement(video));
    const predecessorRequest = second.request(request({
      runId: 'clock-dispose-order-b:predecessor', sequence: 1,
      desiredProgress: 23 / frameMap.endFrame
    }));
    const successorRequest = first.request(request({
      runId: 'clock-dispose-order-b:successor', sequence: 2,
      desiredProgress: 44 / frameMap.endFrame
    }));

    second.dispose();
    expect(video.dataset.timelineVideoDesiredFrame).toBe('44');
    video.completeSeek();
    video.presentFrame(mediaTimeForFrame(frameMap, 44));

    await expect(predecessorRequest).resolves.toMatchObject({ status: 'stale' });
    await expect(successorRequest).resolves.toMatchObject({
      status: 'presented', desiredFrameIndex: 44, presentedFrameIndex: 44
    });
    expect(video.dataset.timelineVideoStaticFallback).toBeUndefined();
    first.dispose();
  });

  it('keeps the physical driver alive across a zero-clock gap during prime seek', async () => {
    const video = new FakeVideo();
    const targetFrameIndex = 23;
    const targetTime = mediaTimeForFrame(frameMap, targetFrameIndex);
    video.currentTime = targetTime;
    video.completeSeek();

    const predecessor = createVideoPresentedFrameClock(videoElement(video));
    const predecessorRequest = predecessor.request(request({
      runId: 'clock-zero-lease:predecessor', sequence: 1,
      desiredProgress: targetFrameIndex / frameMap.endFrame
    }));

    expect(video.currentTime).toBeGreaterThan(targetTime);
    expect(video.seeking).toBe(true);
    predecessor.dispose();
    await expect(predecessorRequest).resolves.toMatchObject({ status: 'stale' });
    expect(video.listenerCount('seeked')).toBe(1);

    const successor = createVideoPresentedFrameClock(videoElement(video));
    const successorRequest = successor.request(request({
      runId: 'clock-zero-lease:successor', sequence: 2,
      desiredProgress: targetFrameIndex / frameMap.endFrame
    }));
    expect(video.requestCount).toBe(0);
    video.completeSeek();
    expect(video.requestCount).toBe(1);
    video.completeSeek();
    video.presentFrame(targetTime + 0.0001);

    await expect(successorRequest).resolves.toMatchObject({
      status: 'presented', presentedFrameIndex: targetFrameIndex,
      evidence: 'video-frame-callback'
    });
    expect(video.listenerCount('seeked')).toBe(1);
    successor.dispose();
  });

  it('restarts a successor after a disposed clock cancels timer-based priming', async () => {
    const video = new FakeVideo({ seekingOnCurrentTimeWrite: false });
    const targetFrameIndex = 23;
    const targetTime = mediaTimeForFrame(frameMap, targetFrameIndex);
    video.currentTime = targetTime;
    video.completeSeek();

    const predecessor = createVideoPresentedFrameClock(videoElement(video));
    const predecessorRequest = predecessor.request(request({
      runId: 'clock-timer-gap:predecessor', sequence: 1,
      desiredProgress: targetFrameIndex / frameMap.endFrame
    }));
    expect(video.seeking).toBe(false);

    predecessor.dispose();
    await expect(predecessorRequest).resolves.toMatchObject({ status: 'stale' });

    const successor = createVideoPresentedFrameClock(videoElement(video));
    try {
      const successorRequest = successor.request(request({
        runId: 'clock-timer-gap:successor', sequence: 2,
        desiredProgress: targetFrameIndex / frameMap.endFrame
      }));
      expect(video.requestCount).toBe(1);
      video.presentFrame(targetTime + 0.0001);

      await expect(successorRequest).resolves.toMatchObject({
        status: 'presented', presentedFrameIndex: targetFrameIndex,
        evidence: 'video-frame-callback'
      });
    } finally {
      successor.dispose();
    }
  });

  it('reacquires a physical driver for a live clock after hard release', async () => {
    const video = new FakeVideo();
    const clock = createVideoPresentedFrameClock(videoElement(video));
    const first = clock.request(request({
      runId: 'clock-hard-release-live', sequence: 1,
      desiredProgress: 23 / frameMap.endFrame
    }));
    video.completeSeek();
    video.presentFrame(mediaTimeForFrame(frameMap, 23));
    await expect(first).resolves.toMatchObject({
      status: 'presented', presentedFrameIndex: 23
    });

    disposeStrictTimelineVideoDriver(videoElement(video));

    const second = clock.request(request({
      runId: 'clock-hard-release-live', sequence: 2,
      desiredProgress: 44 / frameMap.endFrame
    }));
    video.completeSeek();
    video.presentFrame(mediaTimeForFrame(frameMap, 44));

    await expect(second).resolves.toMatchObject({
      status: 'presented', presentedFrameIndex: 44,
      evidence: 'video-frame-callback'
    });
    clock.dispose();
  });

  it('clears clock diagnostics when the physical driver is hard-released', async () => {
    const video = new FakeVideo();
    const clock = createVideoPresentedFrameClock(videoElement(video));
    const pending = clock.request(request({
      runId: 'clock-hard-release:1', sequence: 1, desiredProgress: 23 / frameMap.endFrame
    }));
    video.completeSeek();
    video.presentFrame(mediaTimeForFrame(frameMap, 23));
    await expect(pending).resolves.toMatchObject({ status: 'presented' });

    disposeStrictTimelineVideoDriver(videoElement(video));

    expect(video.dataset.timelineVideoRun).toBeUndefined();
    expect(video.dataset.timelineVideoDesiredFrame).toBeUndefined();
    expect(video.dataset.timelineVideoPresentedFrame).toBeUndefined();
    expect(video.dataset.timelineVideoEvidence).toBeUndefined();
    expect(video.dataset.timelineVideoClockPending).toBeUndefined();
    clock.dispose();
  });

  it('does not let a stale presenter reset terminate a successor on the retained video', async () => {
    const video = new FakeVideo();
    const surface = { dataset: {} } as unknown as HTMLElement;
    const firstReports = phoneReportPort();
    const successorReports = phoneReportPort();
    let activeBinding: PhoneLeafGenerationBinding = {
      reports: firstReports,
      frameToken: 'figure3:forward:1',
      transactionId: 'figure3:forward:1',
      direction: 'forward'
    };
    const createPresenter = () => createPhoneFrameLockPresenter(
      frameMap,
      'scene-canvas-draw',
      () => activeBinding,
      () => videoElement(video),
      () => surface,
      'figure3-paper-canvas',
      'phoneFigure3PaperFrameIndex',
      {
        mapDesiredProgress: (progress) => progress,
        paint: () => true
      }
    );

    const firstPresenter = createPresenter();
    const firstReceipt = firstPresenter.present(
      phoneRequest(activeBinding, 1, 23 / frameMap.endFrame)
    );

    activeBinding = {
      reports: successorReports,
      frameToken: 'figure3:forward:2',
      transactionId: 'figure3:forward:2',
      direction: 'forward'
    };
    const successorPresenter = createPresenter();
    const successorReceipt = successorPresenter.present(
      phoneRequest(activeBinding, 2, 44 / frameMap.endFrame)
    );

    firstPresenter.reset();
    video.completeSeek();
    video.presentFrame(mediaTimeForFrame(frameMap, 44));

    await expect(firstReceipt).resolves.toMatchObject({
      status: 'stale', frameToken: 'figure3:forward:1'
    });
    await expect(successorReceipt).resolves.toMatchObject({
      status: 'presented', frameToken: 'figure3:forward:2',
      sequence: 2, evidence: 'scene-canvas-draw', presentedProgress: 44 / frameMap.endFrame
    });
    expect(firstReports.reportFrame).not.toHaveBeenCalled();
    expect(successorReports.reportFrame).toHaveBeenCalledOnce();
    expect(video.dataset.timelineVideoStaticFallback).toBeUndefined();
    successorPresenter.reset();
  });
});
