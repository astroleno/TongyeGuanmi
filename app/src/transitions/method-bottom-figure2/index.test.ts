import { describe, expect, it } from 'vitest';
import { storyManifest } from '../../story/manifest';
import { verifySegmentTimeline } from '../../story/verifySegmentTimeline';
import {
  createMethodBottomFigure2Transition,
  figure2InkProgressForMethodBottom,
  figure2StageProgressForMethodBottom
} from './index';
import type { LayerHandle, LayerVisibilityState, SceneId, SpineSegmentNode, TransitionContext } from '../../story/types';

function layer(scene: SceneId, role: 'current' | 'next'): LayerHandle {
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
  const found = storyManifest.nodes.find((node): node is SpineSegmentNode => node.kind === 'segment' && node.id === 'method-bottom-figure2');
  if (!found) {
    throw new Error('method-bottom-figure2 segment missing');
  }
  return structuredClone(found);
}

function context(prefersReducedMotion = false): TransitionContext {
  return {
    segment: segment(),
    from: layer('method-bottom', 'current'),
    to: layer('figure2-animation', 'next'),
    stage: {
      getLayer: () => undefined,
      ensureLayer: (scene, role) => layer(scene, role === 'current' ? 'current' : 'next'),
      releaseLayer: () => undefined,
      snapshot: () => []
    },
    direction: 1,
    runId: 'r4-g2-test:1',
    prepareToken: 'r4-g2-test:prepare:1',
    prefersReducedMotion,
    reportMilestone: () => undefined
  };
}

describe('method-bottom-figure2 transition', () => {
  it('separates the bottom ink reveal from the figure2 zoom stage', () => {
    expect(figure2InkProgressForMethodBottom(0.17)).toBeCloseTo(0.5, 5);
    expect(figure2InkProgressForMethodBottom(0.34)).toBe(1);
    expect(figure2StageProgressForMethodBottom(0.17)).toBe(0);
    expect(figure2StageProgressForMethodBottom(0.67)).toBeGreaterThan(0.45);
    expect(figure2StageProgressForMethodBottom(1)).toBe(1);
  });

  it('passes timeline verification and exposes reduced motion fallback', async () => {
    const transition = createMethodBottomFigure2Transition();
    const timeline = await transition.buildTimeline(context());

    expect(transition.reducedMotionFallback).toBeTypeOf('function');
    expect(verifySegmentTimeline(timeline, { policy: segment().policy })).toMatchObject({
      maxVisibleLayers: 1
    });
    expect(timeline.sample?.(0.17)).toMatchObject({
      from: { visible: true, opacity: 1 },
      to: { visible: false, opacity: 0 }
    });
    expect(timeline.sample?.(0.5)).toMatchObject({
      from: { visible: false, opacity: 0 },
      to: { visible: true, opacity: 1 }
    });
  });

  it('is idempotent across 0 to 1 to 0 to 1 progress', async () => {
    const timeline = await createMethodBottomFigure2Transition().buildTimeline(context());

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
    const timeline = await createMethodBottomFigure2Transition().buildTimeline(context(true));

    await expect(timeline.play(1)).resolves.toBeUndefined();
    expect(timeline.sample?.(1).to.visible).toBe(true);
  });
});
