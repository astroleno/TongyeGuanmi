import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPresentedProgressCoordinator,
  createRuntimeSegmentProgressReceipt,
  type SegmentProgressPresenter
} from './presented-progress-coordinator';
import type { SegmentProgressReceipt, SegmentProgressRequest } from './types';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

function receipt(request: SegmentProgressRequest): SegmentProgressReceipt {
  return {
    status: 'presented',
    runId: request.runId,
    sequence: request.sequence,
    desiredProgress: request.desiredProgress,
    presentedProgress: request.desiredProgress,
    evidence: 'runtime'
  };
}

describe('presented progress coordinator', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps one presentation in flight and coalesces to the latest queued request', async () => {
    const requests: SegmentProgressRequest[] = [];
    const presentations: Array<ReturnType<typeof deferred<SegmentProgressReceipt>>> = [];
    const present: SegmentProgressPresenter = vi.fn((request) => {
      requests.push(request);
      const next = deferred<SegmentProgressReceipt>();
      presentations.push(next);
      return next.promise;
    });
    const coordinator = createPresentedProgressCoordinator({
      runId: 'coordinator:1',
      direction: 1,
      present
    });

    const first = coordinator.request(0.1);
    await Promise.resolve();
    const second = coordinator.request(0.4);
    const third = coordinator.request(0.9);

    await expect(second).resolves.toMatchObject({ status: 'stale', sequence: 2 });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ sequence: 1, desiredProgress: 0.1 });
    expect(requests[0]?.signal.aborted).toBe(true);
    expect(coordinator.snapshot()).toMatchObject({
      sequence: 3,
      desiredProgress: 0.9,
      pending: true,
      queued: true
    });

    presentations[0]!.resolve(receipt(requests[0]!));
    await expect(first).resolves.toMatchObject({ status: 'stale', sequence: 1 });
    await Promise.resolve();
    await Promise.resolve();
    expect(requests).toHaveLength(2);
    expect(requests[1]).toMatchObject({ sequence: 3, desiredProgress: 0.9 });

    presentations[1]!.resolve(receipt(requests[1]!));
    await expect(third).resolves.toMatchObject({
      status: 'presented', sequence: 3, presentedProgress: 0.9
    });
    expect(coordinator.snapshot()).toMatchObject({
      pending: false,
      queued: false,
      presentedProgress: 0.9,
      staleCount: 2
    });
    coordinator.dispose();
  });

  it('commits only a current presented receipt and discards a stale presenter result', async () => {
    const pending = deferred<SegmentProgressReceipt>();
    const onPresented = vi.fn();
    const coordinator = createPresentedProgressCoordinator({
      runId: 'coordinator-stale:1',
      direction: -1,
      present: () => pending.promise,
      onPresented
    });

    const result = coordinator.request(0.25);
    await Promise.resolve();
    pending.resolve({ ...receipt({
      runId: 'coordinator-stale:1',
      direction: -1,
      sequence: 1,
      desiredProgress: 0.25,
      signal: new AbortController().signal
    }), status: 'stale' });
    await expect(result).resolves.toMatchObject({ status: 'stale' });
    expect(onPresented).not.toHaveBeenCalled();
    expect(coordinator.snapshot()).toMatchObject({
      presentedProgress: undefined,
      pending: false,
      staleCount: 1
    });
    coordinator.dispose();
  });

  it('aborts and settles active and queued work when disposed', async () => {
    const pending = deferred<SegmentProgressReceipt>();
    let activeRequest: SegmentProgressRequest | undefined;
    const coordinator = createPresentedProgressCoordinator({
      runId: 'coordinator-dispose:1',
      direction: 1,
      present: (request) => {
        activeRequest = request;
        return pending.promise;
      }
    });

    const first = coordinator.request(0.2);
    await Promise.resolve();
    const second = coordinator.request(0.8);
    coordinator.dispose('test dispose');

    await expect(first).resolves.toMatchObject({ status: 'stale', sequence: 1 });
    await expect(second).resolves.toMatchObject({ status: 'stale', sequence: 2 });
    expect(activeRequest?.signal.aborted).toBe(true);
    expect(coordinator.snapshot()).toMatchObject({ pending: false, queued: false });
    pending.resolve(receipt(activeRequest!));
  });

  it('propagates a presentation timeout and aborts its signal', async () => {
    vi.useFakeTimers();
    let activeRequest: SegmentProgressRequest | undefined;
    const pending = deferred<SegmentProgressReceipt>();
    const coordinator = createPresentedProgressCoordinator({
      runId: 'coordinator-timeout:1',
      direction: 1,
      timeoutMs: 25,
      present: (request) => {
        activeRequest = request;
        return pending.promise;
      }
    });

    const result = coordinator.request(0.5);
    const expectedRejection = expect(result).rejects.toMatchObject({
      code: 'MEDIA_PREPARATION_TIMEOUT'
    });
    await vi.advanceTimersByTimeAsync(25);
    await expectedRejection;
    expect(activeRequest?.signal.aborted).toBe(true);
    expect(coordinator.snapshot()).toMatchObject({ pending: false });
    pending.resolve(receipt(activeRequest!));
    coordinator.dispose();
  });

  it('commits synchronous runtime receipts for non-media progress ranges', async () => {
    const onPresented = vi.fn();
    const present: SegmentProgressPresenter = vi.fn((request) => (
      createRuntimeSegmentProgressReceipt(request)
    ));
    const coordinator = createPresentedProgressCoordinator({
      runId: 'coordinator-runtime:1',
      direction: 1,
      present,
      onPresented
    });

    await expect(coordinator.request(0.6)).resolves.toMatchObject({
      status: 'presented',
      sequence: 1,
      presentedProgress: 0.6,
      evidence: 'runtime'
    });
    expect(present).toHaveBeenCalledOnce();
    expect(onPresented).toHaveBeenCalledOnce();
    expect(coordinator.snapshot()).toMatchObject({
      pending: false,
      queued: false,
      presentedProgress: 0.6
    });
    coordinator.dispose();
  });
});
