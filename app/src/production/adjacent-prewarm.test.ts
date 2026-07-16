import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduleAdjacentPrewarm } from './adjacent-prewarm';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('scheduleAdjacentPrewarm', () => {
  it('runs an idle callback exactly once', async () => {
    let idleCallback: (() => void) | undefined;
    const requestIdleCallback = vi.fn((callback: () => void) => {
      idleCallback = callback;
      return 7;
    });
    const task = vi.fn(async () => undefined);
    vi.stubGlobal('window', { requestIdleCallback });

    scheduleAdjacentPrewarm(task, 240);
    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 240 });
    idleCallback?.();
    await Promise.resolve();

    expect(task).toHaveBeenCalledOnce();
  });

  it('cancels an idle callback before it starts', async () => {
    let idleCallback: (() => void) | undefined;
    const cancelIdleCallback = vi.fn();
    const task = vi.fn(async () => undefined);
    vi.stubGlobal('window', {
      requestIdleCallback: (callback: () => void) => {
        idleCallback = callback;
        return 11;
      },
      cancelIdleCallback
    });

    const cancel = scheduleAdjacentPrewarm(task);
    cancel();
    idleCallback?.();
    await Promise.resolve();

    expect(cancelIdleCallback).toHaveBeenCalledWith(11);
    expect(task).not.toHaveBeenCalled();
  });

  it('uses a short timeout when requestIdleCallback is unavailable', async () => {
    let timerCallback: (() => void) | undefined;
    const setTimeout = vi.fn((callback: () => void) => {
      timerCallback = callback;
      return 13;
    });
    const task = vi.fn(async () => undefined);
    vi.stubGlobal('window', { setTimeout, clearTimeout: vi.fn() });

    scheduleAdjacentPrewarm(task);
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 32);
    timerCallback?.();
    await Promise.resolve();

    expect(task).toHaveBeenCalledOnce();
  });

  it('absorbs rejected prewarm work without synchronously escaping React', async () => {
    let idleCallback: (() => void) | undefined;
    vi.stubGlobal('window', {
      requestIdleCallback: (callback: () => void) => {
        idleCallback = callback;
        return 17;
      }
    });

    scheduleAdjacentPrewarm(() => Promise.reject(new Error('warmup failed')));
    expect(() => idleCallback?.()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });
});
