import { describe, expect, it } from 'vitest';
import { storyManifest } from '../../story/manifest';
import { verifySegmentTimeline } from '../../story/verifySegmentTimeline';
import type { LayerHandle, LayerVisibilityState, SpineSegmentNode, TransitionContext } from '../../story/types';
import { createMethodTopMethodBottomTransition } from './index';

function layer(scene: 'method-top' | 'method-bottom', role: 'current' | 'next'): LayerHandle {
  let visibility: LayerVisibilityState = {
    mounted: true,
    visible: role === 'current',
    inert: role !== 'current',
    opacity: role === 'current' ? 1 : 0,
    pointerEvents: role === 'current' ? 'auto' : 'none'
  };
  return {
    scene,
    role,
    element: null,
    get visibility() { return visibility; },
    setVisibility(next) { visibility = next; },
    dispose() {}
  };
}

function context(prefersReducedMotion = false, direction: 1 | -1 = 1): TransitionContext {
  const segment = storyManifest.nodes.find(
    (node): node is SpineSegmentNode => node.kind === 'segment' && node.id === 'method-top-method-bottom'
  );
  if (!segment) throw new Error('method-top-method-bottom segment missing');
  const from = layer('method-top', 'current');
  const to = layer('method-bottom', 'next');
  return {
    segment,
    from,
    to,
    stage: { getLayer: () => undefined, ensureLayer: () => to, releaseLayer() {}, snapshot: () => [] },
    direction,
    runId: 'method-split:1',
    prepareToken: 'method-split:prepare:1',
    prefersReducedMotion,
    reportMilestone() {}
  };
}

describe('method-top-method-bottom transition', () => {
  it('keeps the two Method holds distinct with a short non-Ink crossfade', async () => {
    const transition = createMethodTopMethodBottomTransition();
    const current = context();
    const timeline = await transition.buildTimeline(current);

    expect(current.segment.virtualDuration).toBe(600);
    expect(timeline.sample?.(0)).toMatchObject({
      from: { visible: true, opacity: 1 },
      to: { visible: true, inert: true, opacity: 1 }
    });
    expect(timeline.sample?.(0.5)).toMatchObject({
      from: { visible: true },
      to: { visible: true }
    });
    expect(timeline.sample?.(1)).toMatchObject({
      from: { visible: false, opacity: 0 },
      to: { visible: true, opacity: 1 }
    });
    expect(verifySegmentTimeline(timeline, {
      policy: current.segment.policy,
      allowVisibleTargetAtStart: true
    })).toMatchObject({
      maxVisibleLayers: 2
    });
  });

  it('keeps an opaque paper receiver behind the outgoing layout in both directions', async () => {
    const forward = await createMethodTopMethodBottomTransition().buildTimeline(context());
    const reverse = await createMethodTopMethodBottomTransition().buildTimeline(context(false, -1));

    expect(forward.sample?.(0.5)).toMatchObject({
      from: { visible: true, opacity: expect.any(Number) },
      to: { visible: true, inert: true, opacity: 1 }
    });
    expect(reverse.sample?.(0.5)).toMatchObject({
      from: { visible: true, inert: true, opacity: 1 },
      to: { visible: true, opacity: expect.any(Number) }
    });
    expect(reverse.sample?.(0)).toMatchObject({
      from: { visible: true, inert: true, opacity: 1 },
      to: { visible: false, opacity: 0 }
    });
  });

  it('keeps both semantic holds in reduced motion while collapsing visual time', async () => {
    const current = context(true);
    const timeline = await createMethodTopMethodBottomTransition().buildTimeline(current);

    await expect(timeline.play(1)).resolves.toBeUndefined();
    expect(current.to.visibility).toMatchObject({ visible: true, inert: true, opacity: 1 });
  });
});
