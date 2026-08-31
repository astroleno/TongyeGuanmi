import { describe, expect, it } from 'vitest';

import {
  createVideoPresentedFrameClock,
  type PresentedFrameRequest
} from './presented-frame-clock';
import { mediaTimeForFrame } from './frame-timebase';
import { VIDEO_FRAME_MAPS } from './video-frame-maps';

type Listener = () => void;

class FakeVideo {
  readonly dataset: Record<string, string> = {};
  duration = 10;
  readyState = 4;
  currentTimeWrites: number[] = [];
  paused = true;
  seeking = false;
  loop = false;
  muted = false;
  playsInline = false;
  playbackRate = 1;
  private time = 0;
  private callback: ((now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => void) | undefined;
  private readonly listeners = new Map<string, Set<Listener>>();

  get currentTime(): number {
    return this.time;
  }

  set currentTime(value: number) {
    this.time = value;
    this.currentTimeWrites.push(value);
    this.seeking = true;
  }

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  pause(): void {
    this.paused = true;
  }

  requestVideoFrameCallback(
    callback: (now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => void
  ): number {
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
});

