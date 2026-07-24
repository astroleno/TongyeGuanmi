import { describe, expect, it, vi } from 'vitest';
import {
  preparePhoneTargetPresentation,
  waitForPhoneTargetPresentation
} from './phone-target-presentation';

function scheduler() {
  const callbacks: FrameRequestCallback[] = [];
  return {
    callbacks,
    request: vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    }),
    cancel: vi.fn()
  };
}

describe('phone target presentation contract', () => {
  it('waits for physically presented evidence', async () => {
    const frames = scheduler();
    const controller = new AbortController();
    let ready = false;
    const prepared = waitForPhoneTargetPresentation(
      () => ready,
      controller.signal,
      frames
    );

    expect(frames.callbacks).toHaveLength(1);
    ready = true;
    frames.callbacks.shift()?.(16);

    await expect(prepared).resolves.toBeUndefined();
  });

  it('rejects retryable failure instead of committing an endpoint', async () => {
    const controller = new AbortController();
    await expect(waitForPhoneTargetPresentation(
      () => 'retryable-failure',
      controller.signal,
      scheduler()
    )).rejects.toThrow('retryable');
  });

  it('requires every media receiver to implement preparation', async () => {
    const controller = new AbortController();
    await expect(preparePhoneTargetPresentation(null, {
      progress: 0,
      direction: 1,
      runId: 'missing',
      signal: controller.signal
    })).rejects.toThrow('no presentation preparation contract');
  });
});
