import { describe, expect, it, vi } from 'vitest';
import { phoneFigure3CanStartPreparedRun } from './PhoneFigure3';
import { createPhonePresentedReversePlayback } from '../../../production/phone/phone-presented-reverse-playback';

describe('Figure3 presented-frame reverse playback', () => {
  it('publishes a frame only after its physical preparation resolves', async () => {
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
    expect(playback.active).toBe(false);
  });

  it('invalidates an in-flight preparation when stopped', async () => {
    const frames: FrameRequestCallback[] = [];
    let resolvePreparation: ((ready: boolean) => void) | undefined;
    const render = vi.fn();
    const playback = createPhonePresentedReversePlayback([
      2600,
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

  it('consumes the admitted terminal canvas frame before requesting a later reverse seek', async () => {
    const frames: FrameRequestCallback[] = [];
    const timelineRequests: number[] = [];
    const runId = 'authority|session|609|1|609|group45%3Afigure3|packed-canvas-frame';
    let admittedEndpointRunId: string | null = runId;
    const playback = createPhonePresentedReversePlayback([
      2600,
      async (progress) => {
        const reuseAdmittedEndpoint = progress >= .9999
          && phoneFigure3CanStartPreparedRun(
            -1,
            1,
            runId,
            admittedEndpointRunId
          );
        if (reuseAdmittedEndpoint) {
          admittedEndpointRunId = null;
          return true;
        }
        timelineRequests.push(progress);
        return true;
      },
      vi.fn(),
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
    await Promise.resolve();
    frames.shift()?.(16);
    await Promise.resolve();

    // The first scheduler tick is the token-bound terminal canvas that was
    // already accepted by the machine. Only the next physical frame may ask
    // the timeline driver to seek.
    expect(timelineRequests).toHaveLength(1);
    expect(timelineRequests[0]).toBeLessThan(1);
    playback.stop();
  });

  it('falls back on preparation failure and releases visibility ownership', async () => {
    const frames: FrameRequestCallback[] = [];
    const onError = vi.fn();
    const visibilityDocument = {
      hidden: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    const playback = createPhonePresentedReversePlayback([
      2600,
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
});
