// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { mediaTimeForFrame, type SpikeVideoFrameMap } from './spike-frame-map';
import {
  createStrictPackedProbe,
  type StrictPackedProbeRequest
} from './strict-packed-probe';

type Callback = (now: number, metadata: { mediaTime: number }) => void;

class FakeVideo {
  currentTime = 0;
  seeking = false;
  private callbackId = 0;
  private callback: Callback | undefined;
  private readonly listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  requestVideoFrameCallback(callback: Callback): number {
    this.callback = callback;
    return ++this.callbackId;
  }

  cancelVideoFrameCallback(): void {
    this.callback = undefined;
  }

  pause(): void {
    // The probe must not require native playback for proof.
  }

  seekTo(time: number): void {
    this.currentTime = time;
    this.seeking = true;
  }

  emitFrame(mediaTime: number): void {
    const callback = this.callback;
    this.callback = undefined;
    callback?.(0, { mediaTime });
  }

  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

const frameMap: SpikeVideoFrameMap = {
  fpsNumerator: 30,
  fpsDenominator: 1,
  firstPtsSeconds: 0,
  frameCount: 46,
  startFrame: 0,
  endFrame: 45
};

function request(sequence: number, desiredProgress = 0.5): StrictPackedProbeRequest {
  return {
    runId: 'packed-test',
    direction: 1,
    sequence,
    desiredProgress,
    frameMap
  };
}

function frame(generation: number, frameIndex: number): { canvas: HTMLCanvasElement; generation: number } {
  const canvas = document.createElement('canvas');
  canvas.dataset.packedAlphaFrameReady = 'true';
  canvas.dataset.packedAlphaMediaTime = String(mediaTimeForFrame(frameMap, frameIndex));
  return { canvas, generation };
}

describe('strict packed-alpha probe', () => {
  it('does not accept a video RVFC until the active generation has drawn the exact frame', async () => {
    const video = new FakeVideo();
    const render = vi.fn(() => true);
    let generation = 7;
    const probe = createStrictPackedProbe({
      video: video as unknown as HTMLVideoElement,
      render,
      getActiveGeneration: () => generation,
      timeoutMs: 100
    });

    let settled = false;
    const result = probe.request(request(1)).then((receipt) => {
      settled = true;
      return receipt;
    });
    video.seekTo(mediaTimeForFrame(frameMap, 23));
    video.emitFrame(mediaTimeForFrame(frameMap, 23));
    await Promise.resolve();
    expect(settled).toBe(false);

    probe.notifyFrame(frame(7, 23));
    await expect(result).resolves.toMatchObject({
      status: 'presented',
      desiredFrameIndex: 23,
      presentedFrameIndex: 23,
      evidence: 'packed-canvas-draw',
      generation: 7
    });
    probe.dispose();
    generation = 0;
  });

  it('makes an old-generation draw stale instead of committing it', async () => {
    const video = new FakeVideo();
    let generation = 1;
    const probe = createStrictPackedProbe({
      video: video as unknown as HTMLVideoElement,
      render: () => true,
      getActiveGeneration: () => generation,
      timeoutMs: 100
    });

    const result = probe.request(request(1, 0));
    generation = 2;
    probe.notifyFrame(frame(1, 0));
    await expect(result).resolves.toMatchObject({
      status: 'stale',
      desiredFrameIndex: 0,
      evidence: 'none'
    });
    probe.dispose();
  });

  it('rejects the active proof when an explicit Canvas render fails', async () => {
    const video = new FakeVideo();
    const probe = createStrictPackedProbe({
      video: video as unknown as HTMLVideoElement,
      render: () => false,
      getActiveGeneration: () => 1,
      timeoutMs: 100
    });

    const result = probe.request(request(1));
    expect(probe.render()).toBe(false);
    await expect(result).rejects.toThrow('packed-alpha render failed');
    probe.dispose();
  });

  it('fails closed on context loss and aborts late callbacks on dispose', async () => {
    const video = new FakeVideo();
    const probe = createStrictPackedProbe({
      video: video as unknown as HTMLVideoElement,
      render: () => true,
      getActiveGeneration: () => 1,
      timeoutMs: 100
    });

    const result = probe.request(request(1));
    probe.fail(new Error('packed-alpha context lost'));
    await expect(result).rejects.toThrow('packed-alpha context lost');
    probe.dispose();
  });
});
