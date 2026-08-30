// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { progressForFrameIndex, type SpikeVideoFrameMap } from './spike-frame-map';
import {
  createSpikeFrameBarrier,
  type SpikeFrameBarrierChildReceipt,
  type SpikeFrameBarrierChildRequest
} from './spike-frame-barrier';

const masterFrameMap: SpikeVideoFrameMap = {
  fpsNumerator: 30,
  fpsDenominator: 1,
  firstPtsSeconds: 0,
  frameCount: 75,
  startFrame: 0,
  endFrame: 74
};

const flockFrameMap: SpikeVideoFrameMap = {
  ...masterFrameMap,
  frameCount: 74,
  endFrame: 73
};

type Pending = {
  request: SpikeFrameBarrierChildRequest;
  resolve: (receipt: SpikeFrameBarrierChildReceipt) => void;
  reject: (error: Error) => void;
};

function clock(): { request: ReturnType<typeof vi.fn>; pending: Pending[]; dispose: ReturnType<typeof vi.fn> } {
  const pending: Pending[] = [];
  const request = vi.fn((input: SpikeFrameBarrierChildRequest) => new Promise<SpikeFrameBarrierChildReceipt>((resolve, reject) => {
    pending.push({ request: input, resolve, reject });
    input.signal?.addEventListener('abort', () => resolve({
      status: 'stale',
      sequence: input.sequence,
      desiredFrameIndex: 0,
      presentedFrameIndex: 0,
      mediaTimeSeconds: 0,
      evidence: 'none'
    }), { once: true });
  }));
  return { request, pending, dispose: vi.fn() };
}

function presented(input: SpikeFrameBarrierChildRequest): SpikeFrameBarrierChildReceipt {
  return {
    status: 'presented',
    sequence: input.sequence,
    desiredFrameIndex: input.frameMap.endFrame,
    presentedFrameIndex: input.frameMap.endFrame,
    mediaTimeSeconds: 1,
    evidence: 'packed-canvas-draw'
  };
}

describe('Spike frame barrier', () => {
  it('waits for both surfaces and returns one master receipt', async () => {
    const figure = clock();
    const flock = clock();
    const barrier = createSpikeFrameBarrier({
      masterFrameMap,
      childFrameMaps: [masterFrameMap, flockFrameMap],
      clocks: [figure, flock]
    });

    const result = barrier.request({
      runId: 'crane-test',
      direction: 1,
      sequence: 1,
      desiredProgress: 1
    });
    figure.pending[0]!.resolve(presented(figure.pending[0]!.request));
    let settled = false;
    void result.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    flock.pending[0]!.resolve(presented(flock.pending[0]!.request));
    await expect(result).resolves.toMatchObject({
      status: 'presented',
      sequence: 1,
      presentedProgress: progressForFrameIndex(masterFrameMap, masterFrameMap.endFrame)
    });
    barrier.dispose();
  });

  it('returns stale for the group when either child is stale', async () => {
    const figure = clock();
    const flock = clock();
    const barrier = createSpikeFrameBarrier({
      masterFrameMap,
      childFrameMaps: [masterFrameMap, flockFrameMap],
      clocks: [figure, flock]
    });
    const result = barrier.request({
      runId: 'crane-test', direction: 1, sequence: 1, desiredProgress: 0.5
    });
    figure.pending[0]!.resolve({
      ...presented(figure.pending[0]!.request), status: 'stale', evidence: 'none'
    });
    flock.pending[0]!.resolve(presented(flock.pending[0]!.request));
    await expect(result).resolves.toMatchObject({ status: 'stale', sequence: 1 });
    barrier.dispose();
  });

  it('rejects the group on a child failure and aborts the sibling', async () => {
    const figure = clock();
    const flock = clock();
    const barrier = createSpikeFrameBarrier({
      masterFrameMap,
      childFrameMaps: [masterFrameMap, flockFrameMap],
      clocks: [figure, flock]
    });
    const result = barrier.request({
      runId: 'crane-test', direction: 1, sequence: 1, desiredProgress: 0.5
    });
    figure.pending[0]!.reject(new Error('figure failed'));
    await expect(result).rejects.toThrow('figure failed');
    expect(flock.pending[0]!.request.signal?.aborted).toBe(true);
    barrier.dispose();
  });

  it('aborts both children when disposed while a barrier is pending', async () => {
    const figure = clock();
    const flock = clock();
    const barrier = createSpikeFrameBarrier({
      masterFrameMap,
      childFrameMaps: [masterFrameMap, flockFrameMap],
      clocks: [figure, flock]
    });
    const result = barrier.request({
      runId: 'crane-test', direction: 1, sequence: 1, desiredProgress: 0.5
    });
    barrier.dispose();
    await expect(result).resolves.toMatchObject({ status: 'stale' });
    expect(figure.pending[0]!.request.signal?.aborted).toBe(true);
    expect(flock.pending[0]!.request.signal?.aborted).toBe(true);
  });
});
