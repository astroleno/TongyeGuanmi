import { describe, expect, it, vi } from 'vitest';
import { createPhonePresentedReversePlayback } from './phone-presented-reverse-playback';

describe('Unit 6 presented-frame reverse playback', () => {
  it('publishes canonical progress only after the physical frame is ready', async () => {
    const frames: FrameRequestCallback[] = [];
    const events: string[] = [];
    const complete = vi.fn();
    const playback = createPhonePresentedReversePlayback({
      durationMs: 3000,
      prepare: async (progress) => {
        events.push(`prepare:${progress.toFixed(2)}`);
        return true;
      },
      render: (progress) => events.push(`render:${progress.toFixed(2)}`),
      onComplete: complete,
      onError: vi.fn(),
      requestFrame: (callback) => {
        frames.push(callback);
        return frames.length;
      },
      cancelFrame: vi.fn()
    });

    playback.start();
    frames.shift()?.(0);
    await Promise.resolve();
    frames.shift()?.(1500);
    await Promise.resolve();
    frames.shift()?.(3000);
    await Promise.resolve();

    expect(events).toEqual([
      'prepare:1.00',
      'render:1.00',
      'prepare:0.50',
      'render:0.50',
      'prepare:0.00',
      'render:0.00'
    ]);
    expect(complete).toHaveBeenCalledOnce();
  });

  it('invalidates an in-flight frame when the run stops', async () => {
    const frames: FrameRequestCallback[] = [];
    let resolvePreparation: ((ready: boolean) => void) | undefined;
    const render = vi.fn();
    const playback = createPhonePresentedReversePlayback({
      durationMs: 1500,
      prepare: () => new Promise((resolve) => {
        resolvePreparation = resolve;
      }),
      render,
      onComplete: vi.fn(),
      onError: vi.fn(),
      requestFrame: (callback) => {
        frames.push(callback);
        return frames.length;
      },
      cancelFrame: vi.fn()
    });

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
    const playback = createPhonePresentedReversePlayback({
      durationMs: 1500,
      prepare: async () => {
        throw new Error('decoder failed');
      },
      render: vi.fn(),
      onComplete: vi.fn(),
      onError,
      visibilityDocument,
      requestFrame: (callback) => {
        frames.push(callback);
        return frames.length;
      },
      cancelFrame: vi.fn()
    });

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
});
