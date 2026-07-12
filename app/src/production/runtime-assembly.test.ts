import { describe, expect, it, vi } from 'vitest';
import { createDirectorRuntime } from '../runtime/director.actor';
import { SegmentPlayer } from '../story/segment-player';
import type { SegmentTimelineHandle, TransitionModule } from '../story/types';

function timeline(): SegmentTimelineHandle {
  return {
    play: () => Promise.resolve(),
    progress: () => undefined,
    reverse: () => Promise.resolve(),
    jumpToEnd: () => undefined,
    dispose: () => undefined
  };
}

describe('production runtime assembly', () => {
  it('starts the Director and LayerWindow at a direct hash scene', () => {
    const runtime = createDirectorRuntime({
      actorEpoch: 'direct-hash',
      autoStart: false,
      initialScene: 'services'
    });
    expect(runtime.getState().context).toMatchObject({
      cursor: { status: 'hold', scene: 'services' },
      layerWindow: { current: 'services' }
    });
  });

  it('loads and caches a transition on demand before building it', async () => {
    const transition: TransitionModule = {
      id: 'hero-pattern',
      buildTimeline: timeline
    };
    const loader = vi.fn(async () => transition);
    const player = new SegmentPlayer({ transitions: {}, transitionLoader: loader });

    await player.ensureBuilt('hero-pattern');
    await player.ensureBuilt('hero-pattern');

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('keeps Contact committed until reverse recovery reaches the directional Crane endpoint', async () => {
    const jumpToEnd = vi.fn();
    let resolveEndpoint!: (value: SegmentTimelineHandle) => void;
    const endpoint = new Promise<SegmentTimelineHandle>((resolve) => {
      resolveEndpoint = resolve;
    });
    const runtime = createDirectorRuntime({
      actorEpoch: 'production-recovery',
      initialScene: 'contact',
      transitions: {
        'crane-contact': {
          id: 'crane-contact',
          buildTimeline: () => endpoint
        }
      },
      readyGate: {
        waitForTargetReady: () => Promise.reject(new Error('simulated slow-network timeout'))
      }
    });
    runtime.send({ type: 'BOOT_READY' });
    runtime.send({ type: 'CHARGE_FIRED', direction: -1 });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(runtime.getState()).toMatchObject({
      context: {
        cursor: { status: 'hold', scene: 'contact' },
        layerWindow: { current: 'contact' },
        recovery: {
          scope: 'segment',
          status: 'recovering',
          segment: 'crane-contact',
          direction: -1,
          endpoint: 'crane-animation'
        }
      }
    });

    resolveEndpoint({ ...timeline(), jumpToEnd });
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(jumpToEnd).toHaveBeenCalledWith(-1);
    expect(runtime.getState()).toMatchObject({
      state: 'hold',
      context: { cursor: { status: 'hold', scene: 'crane-animation' } }
    });
    runtime.stop();
  });
});
