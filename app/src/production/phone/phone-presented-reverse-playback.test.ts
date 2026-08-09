import { describe, expect, it, vi } from 'vitest';
import { createPhonePresentedReversePlayback } from './phone-presented-reverse-playback';

describe('Unit 6 presented-frame reverse playback', () => {
  it('publishes canonical progress only after the physical frame is ready', async () => {
    const frames: FrameRequestCallback[] = [];
    const events: string[] = [];
    const complete = vi.fn();
    const playback = createPhonePresentedReversePlayback([
      100,
      async (progress) => {
        events.push(`prepare:${progress.toFixed(2)}`);
        return true;
      },
      (progress) => events.push(`render:${progress.toFixed(2)}`),
      complete,
      vi.fn(),
      null,
      null,
      (callback) => {
        frames.push(callback);
        return frames.length;
      },
      vi.fn()
    ]);

    playback.start();
    frames.shift()?.(0);
    await Promise.resolve();
    frames.shift()?.(16);
    await Promise.resolve();
    frames.shift()?.(32);
    await Promise.resolve();
    frames.shift()?.(48);
    await Promise.resolve();

    expect(events).toEqual([
      'prepare:1.00',
      'render:1.00',
      'prepare:0.67',
      'render:0.67',
      'prepare:0.33',
      'render:0.33',
      'prepare:0.00',
      'render:0.00'
    ]);
    expect(complete).toHaveBeenCalledOnce();
  });

  it('invalidates an in-flight frame when the run stops', async () => {
    const frames: FrameRequestCallback[] = [];
    let resolvePreparation: ((ready: boolean) => void) | undefined;
    const render = vi.fn();
    const playback = createPhonePresentedReversePlayback([
      1500,
      () => new Promise((resolve) => {
        resolvePreparation = resolve;
      }),
      render,
      vi.fn(),
      vi.fn(),
      null,
      null,
      (callback) => {
        frames.push(callback);
        return frames.length;
      },
      vi.fn()
    ]);

    playback.start();
    frames.shift()?.(0);
    playback.stop();
    resolvePreparation?.(true);
    await Promise.resolve();

    expect(render).not.toHaveBeenCalled();
    expect(playback.active).toBe(false);
  });

  it('reports decoder preparation errors and releases visibility ownership', async () => {
    const frames: FrameRequestCallback[] = [];
    const onError = vi.fn();
    const visibilityDocument = {
      hidden: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    const playback = createPhonePresentedReversePlayback([
      1500,
      async () => {
        throw new Error('decoder failed');
      },
      vi.fn(),
      vi.fn(),
      onError,
      null,
      visibilityDocument,
      (callback) => {
        frames.push(callback);
        return frames.length;
      },
      vi.fn()
    ]);

    playback.start();
    frames.shift()?.(0);
    await Promise.resolve();
    await Promise.resolve();
    playback.dispose();

    expect(onError).toHaveBeenCalledOnce();
    expect(visibilityDocument.removeEventListener).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function)
    );
  });

  it('ignores a rejected stale preparation after a replacement run starts', async () => {
    const frames: FrameRequestCallback[] = [];
    let rejectOld: ((cause: Error) => void) | undefined;
    const onError = vi.fn();
    const playback = createPhonePresentedReversePlayback([
      1500,
      () => new Promise((_resolve, reject) => {
        rejectOld = reject;
      }),
      vi.fn(),
      vi.fn(),
      onError,
      null,
      null,
      (callback) => {
        frames.push(callback);
        return frames.length;
      },
      vi.fn()
    ]);

    playback.start();
    frames.shift()?.(0);
    playback.start();
    rejectOld?.(new Error('stale decoder callback'));
    await Promise.resolve();

    expect(onError).not.toHaveBeenCalled();
    expect(playback.active).toBe(true);
    playback.dispose();
  });
});
