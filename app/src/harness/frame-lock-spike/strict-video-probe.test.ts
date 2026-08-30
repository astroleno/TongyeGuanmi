import { describe, expect, it } from 'vitest';

import {
  mediaTimeForFrame,
  type SpikeVideoFrameMap
} from './spike-frame-map';
import {
  createStrictVideoProbe,
  type StrictVideoFrameCallbackMetadata
} from './strict-video-probe';

type Listener = () => void;

class FakeVideo {
  currentTimeWrites: number[] = [];
  duration = 2;
  readyState = 4;
  seeking = false;
  paused = true;
  private time = 0;
  private callbackId = 0;
  private callbacks = new Map<number, (now: number, metadata: StrictVideoFrameCallbackMetadata) => void>();
  private listeners = new Map<string, Set<Listener>>();

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

  requestVideoFrameCallback(
    callback: (now: number, metadata: StrictVideoFrameCallbackMetadata) => void
  ): number {
    const id = ++this.callbackId;
    this.callbacks.set(id, callback);
    return id;
  }

  cancelVideoFrameCallback(id: number): void {
    this.callbacks.delete(id);
  }

  pause(): void {
    this.paused = true;
  }

  completeSeek(): void {
    this.seeking = false;
    for (const listener of this.listeners.get('seeked') ?? []) listener();
  }

  emitFrame(mediaTime: number): void {
    const callback = this.callbacks.entries().next().value as [number, (now: number, metadata: StrictVideoFrameCallbackMetadata) => void] | undefined;
    if (!callback) return;
    this.callbacks.delete(callback[0]);
    callback[1](0, { mediaTime });
  }
}

const frameMap: SpikeVideoFrameMap = {
  fpsNumerator: 30,
  fpsDenominator: 1,
  firstPtsSeconds: 0,
  frameCount: 24,
  startFrame: 0,
  endFrame: 23
};

const request = (sequence: number, desiredProgress: number) => ({
  runId: 'spike-run',
  direction: 1 as const,
  sequence,
  desiredProgress,
  frameMap
});

describe('strict video probe', () => {
  it('keeps one seek in flight, makes queued latest-wins requests stale, and commits exact RVFC frames', async () => {
    const video = new FakeVideo();
    const probe = createStrictVideoProbe(video);

    const first = probe.request(request(1, 4 / 23));
    const latest = probe.request(request(2, 9 / 23));

    expect(video.currentTimeWrites).toHaveLength(1);
    await expect(first).resolves.toMatchObject({ status: 'stale', sequence: 1 });

    video.emitFrame(mediaTimeForFrame(frameMap, 4));
    expect(video.currentTimeWrites).toHaveLength(1);
    video.completeSeek();
    expect(video.currentTimeWrites).toHaveLength(2);

    video.emitFrame(mediaTimeForFrame(frameMap, 9));
    await expect(latest).resolves.toMatchObject({
      status: 'presented',
      sequence: 2,
      desiredFrameIndex: 9,
      presentedFrameIndex: 9,
      evidence: 'video-frame-callback'
    });
    probe.dispose();
  });

  it('does not resolve on seeked or a close currentTime until RVFC metadata quantizes to the target frame', async () => {
    const video = new FakeVideo();
    const probe = createStrictVideoProbe(video);
    const readiness = probe.request(request(1, 8 / 23));
    let settled = false;
    void readiness.then(() => { settled = true; });

    video.completeSeek();
    await Promise.resolve();
    expect(settled).toBe(false);

    video.emitFrame(mediaTimeForFrame(frameMap, 9));
    await Promise.resolve();
    expect(settled).toBe(false);

    video.emitFrame(mediaTimeForFrame(frameMap, 8));
    await expect(readiness).resolves.toMatchObject({
      status: 'presented',
      desiredFrameIndex: 8,
      presentedFrameIndex: 8
    });
    probe.dispose();
  });

  it('never commits a late callback after abort or dispose', async () => {
    const abortVideo = new FakeVideo();
    const abortProbe = createStrictVideoProbe(abortVideo);
    const controller = new AbortController();
    const aborted = abortProbe.request({ ...request(1, 4 / 23), signal: controller.signal });
    controller.abort();
    abortVideo.emitFrame(mediaTimeForFrame(frameMap, 4));
    await expect(aborted).resolves.toMatchObject({ status: 'stale', sequence: 1 });
    abortProbe.dispose();

    const disposedVideo = new FakeVideo();
    const disposedProbe = createStrictVideoProbe(disposedVideo);
    const disposed = disposedProbe.request(request(1, 4 / 23));
    disposedProbe.dispose();
    disposedVideo.emitFrame(mediaTimeForFrame(frameMap, 4));
    await expect(disposed).resolves.toMatchObject({ status: 'stale', sequence: 1 });
  });
});
