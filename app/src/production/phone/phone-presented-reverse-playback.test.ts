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

  it('commits zero from the last presented 30fps sample without a second zero seek', async () => {
    const frames: FrameRequestCallback[] = [];
    const prepared: number[] = [];
    const rendered: number[] = [];
    const complete = vi.fn();
    const playback = createPhonePresentedReversePlayback([
      3000,
      async (progress) => {
        prepared.push(progress);
        return true;
      },
      (progress) => rendered.push(progress),
      complete,
      vi.fn(),
      null,
      (callback) => {
        frames.push(callback);
        return frames.length;
      },
      vi.fn()
    ]);

    playback.start();
    for (let index = 0; index < 100 && !complete.mock.calls.length; index += 1) {
      frames.shift()?.(index * 16);
      await Promise.resolve();
    }

    expect(complete).toHaveBeenCalledOnce();
    expect(prepared.at(-1)).toBeGreaterThan(0);
    expect(rendered.at(-1)).toBe(0);
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

  it('does not render or complete a prepared frame while the page is hidden', async () => {
    const frames: FrameRequestCallback[] = [];
    const listeners = new Set<() => void>();
    let resolvePreparation: ((ready: boolean) => void) | undefined;
    const render = vi.fn();
    const complete = vi.fn();
    const visibilityDocument = {
      hidden: false,
      addEventListener: vi.fn((_type: string, listener: () => void) => {
        listeners.add(listener);
      }),
      removeEventListener: vi.fn()
    };
    const playback = createPhonePresentedReversePlayback([
      1500,
      () => new Promise((resolve) => {
        resolvePreparation = resolve;
      }),
      render,
      complete,
      vi.fn(),
      visibilityDocument,
      (callback) => {
        frames.push(callback);
        return frames.length;
      },
      vi.fn()
    ]);

    playback.start();
    frames.shift()?.(0);
    visibilityDocument.hidden = true;
    listeners.forEach((listener) => listener());
    resolvePreparation?.(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(render).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    expect(playback.active).toBe(true);

    visibilityDocument.hidden = false;
    listeners.forEach((listener) => listener());
    expect(frames).toHaveLength(1);
    frames.shift()?.(16);
    resolvePreparation?.(true);
    await Promise.resolve();

    expect(render).toHaveBeenCalledOnce();
    playback.dispose();
  });
});
