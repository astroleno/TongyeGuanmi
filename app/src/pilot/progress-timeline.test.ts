import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LayerHandle, LayerVisibilityState } from '../story/types';
import { PilotProgressTimeline, type PilotProgressTimelineOptions } from './progress-timeline';

function layer(role: 'current' | 'next'): LayerHandle {
  let visibility: LayerVisibilityState = {
    mounted: true,
    visible: role === 'current',
    inert: role !== 'current',
    opacity: role === 'current' ? 1 : 0,
    pointerEvents: role === 'current' ? 'auto' : 'none'
  };
  return {
    scene: role === 'current' ? 'star-map' : 'aod-animation',
    role,
    element: null,
    get visibility() {
      return visibility;
    },
    setVisibility(next) {
      visibility = next;
    },
    dispose() {}
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PilotProgressTimeline lifecycle', () => {
  it('initializes a reverse build at p=1 without writing the forward start first', () => {
    const renderedProgress: number[] = [];
    const from = layer('next');
    const to = layer('current');
    const options = {
      from,
      to,
      durationMs: 0,
      direction: -1,
      sample: (progress: number) => progress >= 0.999
        ? {
            from: { mounted: true, visible: false, inert: true, opacity: 0, pointerEvents: 'none' as const },
            to: { mounted: true, visible: true, inert: true, opacity: 1, pointerEvents: 'none' as const }
          }
        : {
            from: { mounted: true, visible: true, inert: true, opacity: 1, pointerEvents: 'none' as const },
            to: { mounted: true, visible: false, inert: true, opacity: 0, pointerEvents: 'none' as const }
          },
      render: (progress: number) => renderedProgress.push(progress)
    } satisfies PilotProgressTimelineOptions;

    new PilotProgressTimeline(options);

    expect(renderedProgress).toEqual([1]);
    expect(from.visibility).toMatchObject({ visible: false, opacity: 0 });
    expect(to.visibility).toMatchObject({ visible: true, opacity: 1 });
  });

  it('releases renderer-owned resources exactly once', () => {
    const release = vi.fn();
    const timeline = new PilotProgressTimeline({
      from: layer('current'),
      to: layer('next'),
      durationMs: 0,
      direction: 1,
      sample: () => ({
        from: { mounted: true, visible: true, inert: false, opacity: 1, pointerEvents: 'auto' },
        to: { mounted: true, visible: false, inert: true, opacity: 0, pointerEvents: 'none' }
      }),
      dispose: release
    });

    timeline.dispose();
    timeline.dispose();

    expect(release).toHaveBeenCalledOnce();
  });

  it('rejects automatic playback when a renderer frame fails', async () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const failure = new Error('renderer context lost');
    const timeline = new PilotProgressTimeline({
      from: layer('current'),
      to: layer('next'),
      durationMs: 1_000,
      direction: 1,
      sample: () => ({
        from: { mounted: true, visible: true, inert: true, opacity: 1, pointerEvents: 'none' },
        to: { mounted: true, visible: true, inert: true, opacity: 1, pointerEvents: 'none' }
      }),
      render: (progress) => {
        if (progress > 0) throw failure;
      }
    });

    const playback = timeline.play();
    callbacks.shift()?.(16);

    await expect(playback).rejects.toBe(failure);
    timeline.dispose();
  });
});
