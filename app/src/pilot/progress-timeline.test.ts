import { describe, expect, it, vi } from 'vitest';
import type { LayerHandle, LayerVisibilityState } from '../story/types';
import { PilotProgressTimeline } from './progress-timeline';

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

describe('PilotProgressTimeline lifecycle', () => {
  it('releases renderer-owned resources exactly once', () => {
    const release = vi.fn();
    const timeline = new PilotProgressTimeline({
      from: layer('current'),
      to: layer('next'),
      durationMs: 0,
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
});
