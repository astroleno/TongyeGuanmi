import { describe, expect, it } from 'vitest';
import { storyManifest } from '../../story/manifest';
import { verifySegmentTimeline } from '../../story/verifySegmentTimeline';
import { createHeroPatternTransition } from './index';
import type { LayerHandle, LayerVisibilityState, SpineSegmentNode, TransitionContext } from '../../story/types';

function layer(scene: 'hero' | 'pattern', role: 'current' | 'next'): LayerHandle {
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
    get visibility() {
      return visibility;
    },
    setVisibility(next) {
      visibility = next;
    },
    dispose() {
      visibility = { mounted: false, visible: false, inert: true, opacity: 0, pointerEvents: 'none' };
    }
  };
}

function segment(): SpineSegmentNode {
  const found = storyManifest.nodes.find((node): node is SpineSegmentNode => node.kind === 'segment' && node.id === 'hero-pattern');
  if (!found) {
    throw new Error('hero-pattern segment missing');
  }
  return structuredClone(found);
}

function context(prefersReducedMotion = false): TransitionContext {
  return {
    segment: segment(),
    from: layer('hero', 'current'),
    to: layer('pattern', 'next'),
    stage: {
      getLayer: () => undefined,
      ensureLayer: (scene, role) => layer(scene as 'hero' | 'pattern', role === 'current' ? 'current' : 'next'),
      releaseLayer: () => undefined,
      snapshot: () => []
    },
    direction: 1,
    runId: 'r4-g1-test:1',
    prepareToken: 'r4-g1-test:prepare:1',
    prefersReducedMotion,
    reportMilestone: () => undefined
  };
}

describe('hero-pattern transition', () => {
  it('passes timeline verification and exposes a reduced-motion fallback', async () => {
    const transition = createHeroPatternTransition();
    const timeline = await transition.buildTimeline(context());

    expect(transition.reducedMotionFallback).toBeTypeOf('function');
    expect(verifySegmentTimeline(timeline, { policy: segment().policy })).toMatchObject({
      maxVisibleLayers: 2
    });
  });

  it('is idempotent across 0 to 1 to 0 to 1 progress', async () => {
    const transition = createHeroPatternTransition();
    const timeline = await transition.buildTimeline(context());

    timeline.progress(0);
    const start = timeline.sample?.(0);
    timeline.progress(1);
    const end = timeline.sample?.(1);
    timeline.progress(0);
    expect(timeline.sample?.(0)).toEqual(start);
    timeline.progress(1);
    expect(timeline.sample?.(1)).toEqual(end);
  });

  it('collapses duration in reduced motion', async () => {
    const transition = createHeroPatternTransition();
    const timeline = await transition.buildTimeline(context(true));

    await expect(timeline.play(1)).resolves.toBeUndefined();
    expect(timeline.sample?.(1).to.visible).toBe(true);
  });
});
