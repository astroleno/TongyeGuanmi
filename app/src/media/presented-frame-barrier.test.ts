import { describe, expect, it, vi } from 'vitest';

import {
  createPresentedFrameBarrier,
  createSceneCanvasPresentedFrameClock,
  type PresentedFrameBarrierChild
} from './presented-frame-barrier';
import {
  frameIndexForProgress,
  mediaTimeForFrame,
  type VideoFrameMap
} from './frame-timebase';
import type {
  PresentedFrameReceipt,
  PresentedFrameRequest
} from './presented-frame-clock';
import { VIDEO_FRAME_MAPS } from './video-frame-maps';

type DeferredReceipt = {
  request: PresentedFrameRequest;
  resolve(receipt: PresentedFrameReceipt): void;
  reject(error: Error): void;
};

class FakeClock {
  readonly pending: DeferredReceipt[] = [];
  abortCalls = 0;

  request(request: PresentedFrameRequest): Promise<PresentedFrameReceipt> {
    return new Promise<PresentedFrameReceipt>((resolve, reject) => {
      const entry = { request, resolve, reject };
      this.pending.push(entry);
      request.signal.addEventListener('abort', () => {
        this.abortCalls += 1;
        reject(new Error('child aborted'));
      }, { once: true });
    });
  }
}

const masterMap = VIDEO_FRAME_MAPS['ph-figure-motion'];
const figureMap = VIDEO_FRAME_MAPS['crane-figure-motion'];
const flockMap = VIDEO_FRAME_MAPS['crane-flock-motion'];

function request(overrides: Partial<PresentedFrameRequest> = {}): PresentedFrameRequest {
  return {
    runId: 'barrier-test:1',
    direction: 1,
    sequence: 1,
    desiredProgress: 23 / masterMap.endFrame,
    frameMap: masterMap,
    signal: new AbortController().signal,
    ...overrides
  };
}

function presented(
  input: PresentedFrameRequest,
  map: VideoFrameMap,
  evidence: PresentedFrameReceipt['evidence'] = 'packed-canvas-draw'
): PresentedFrameReceipt {
  const desiredFrameIndex = frameIndexForProgress(map, input.desiredProgress);
  return {
    status: 'presented',
    runId: input.runId,
    sequence: input.sequence,
    desiredFrameIndex,
    presentedFrameIndex: desiredFrameIndex,
    mediaTimeSeconds: mediaTimeForFrame(map, desiredFrameIndex),
    presentedProgress: desiredFrameIndex / map.endFrame,
    evidence
  };
}

function stale(input: PresentedFrameRequest): PresentedFrameReceipt {
  return {
    status: 'stale',
    runId: input.runId,
    sequence: input.sequence,
    desiredFrameIndex: frameIndexForProgress(input.frameMap, input.desiredProgress),
    presentedFrameIndex: -1,
    mediaTimeSeconds: Number.NaN,
    presentedProgress: input.desiredProgress,
    evidence: 'packed-canvas-draw'
  };
}

function child(clock: FakeClock, frameMap: VideoFrameMap): PresentedFrameBarrierChild {
  return { clock, frameMap };
}

describe('presented frame barrier', () => {
  it('commits master progress only after every child presents its exact frame', async () => {
    const figure = new FakeClock();
    const flock = new FakeClock();
    const barrier = createPresentedFrameBarrier([
      child(figure, figureMap),
      child(flock, flockMap)
    ]);
    const input = request({ desiredProgress: 23 / masterMap.endFrame });
    const result = barrier.request(input);

    expect(figure.pending[0]?.request.frameMap).toBe(figureMap);
    expect(flock.pending[0]?.request.frameMap).toBe(flockMap);
    figure.pending[0]!.resolve(presented(figure.pending[0]!.request, figureMap));
    let settled = false;
    void result.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    flock.pending[0]!.resolve(presented(flock.pending[0]!.request, flockMap));
    await expect(result).resolves.toMatchObject({
      status: 'presented',
      sequence: 1,
      desiredFrameIndex: 23,
      presentedFrameIndex: 23,
      presentedProgress: 23 / masterMap.endFrame,
      evidence: 'packed-canvas-draw'
    });
    expect(barrier.snapshot()).toMatchObject({
      childCount: 2,
      desiredFrameIndex: 23,
      presentedFrameIndex: 23,
      pending: false,
      staleCount: 0
    });
    barrier.dispose();
  });

  it('does not partially commit when one child is stale', async () => {
    const figure = new FakeClock();
    const flock = new FakeClock();
    const barrier = createPresentedFrameBarrier([
      child(figure, figureMap),
      child(flock, flockMap)
    ]);
    const result = barrier.request(request());

    figure.pending[0]!.resolve(presented(figure.pending[0]!.request, figureMap));
    flock.pending[0]!.resolve(stale(flock.pending[0]!.request));
    await expect(result).resolves.toMatchObject({
      status: 'stale',
      presentedFrameIndex: -1
    });
    expect(barrier.snapshot().presentedFrameIndex).toBeUndefined();
    expect(barrier.snapshot().pending).toBe(false);
    barrier.dispose();
  });

  it('makes a superseded request stale and aborts child waiters on failure', async () => {
    const firstFigure = new FakeClock();
    const firstFlock = new FakeClock();
    const barrier = createPresentedFrameBarrier([
      child(firstFigure, figureMap),
      child(firstFlock, flockMap)
    ]);
    const first = barrier.request(request({ sequence: 1, desiredProgress: 0 }));
    const second = barrier.request(request({ sequence: 2, desiredProgress: 1 }));

    await expect(first).resolves.toMatchObject({ status: 'stale', sequence: 1 });
    firstFigure.pending[0]!.resolve(stale(firstFigure.pending[0]!.request));
    firstFlock.pending[0]!.resolve(stale(firstFlock.pending[0]!.request));
    second.then(() => undefined);
    const secondFigure = firstFigure.pending[1];
    const secondFlock = firstFlock.pending[1];
    expect(secondFigure).toBeDefined();
    expect(secondFlock).toBeDefined();
    secondFigure!.resolve(presented(secondFigure!.request, figureMap));
    secondFlock!.resolve(presented(secondFlock!.request, flockMap));
    await expect(second).resolves.toMatchObject({ status: 'presented', sequence: 2 });
    expect(firstFigure.abortCalls).toBe(1);
    expect(firstFlock.abortCalls).toBe(1);
    barrier.dispose();
  });

  it('aborts the other child when one child fails and disposes without leaked work', async () => {
    const figure = new FakeClock();
    const flock = new FakeClock();
    const barrier = createPresentedFrameBarrier([
      child(figure, figureMap),
      child(flock, flockMap)
    ]);
    const result = barrier.request(request());
    figure.pending[0]!.reject(new Error('figure draw failed'));

    await expect(result).rejects.toThrow('figure draw failed');
    expect(flock.abortCalls).toBe(1);
    barrier.dispose();

    const next = barrier.request(request({ sequence: 2 }));
    await expect(next).resolves.toMatchObject({ status: 'stale' });
  });

  it('creates a scene-canvas receipt only after the requested draw succeeds', async () => {
    const draw = vi.fn(async () => true);
    const clock = createSceneCanvasPresentedFrameClock({ draw });
    const input = request({ desiredProgress: 12 / masterMap.endFrame });

    await expect(clock.request(input)).resolves.toMatchObject({
      status: 'presented',
      desiredFrameIndex: 12,
      presentedFrameIndex: 12,
      evidence: 'scene-canvas-draw'
    });
    expect(draw).toHaveBeenCalledWith(input);
    clock.dispose();
  });

  it('fails a scene-canvas receipt when its draw returns false', async () => {
    const clock = createSceneCanvasPresentedFrameClock({ draw: () => false });
    await expect(clock.request(request())).rejects.toThrow('scene canvas draw failed');
    clock.dispose();
  });
});
