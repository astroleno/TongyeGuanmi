import { describe, expect, it } from 'vitest';
import { storyManifest } from '../story/manifest';
import { verifySegmentTimeline } from '../story/verifySegmentTimeline';
import { createFigure2DistanceExpandTransition } from './figure2-distance-expand';
import { createFigure2ProofBrandTransition } from './figure2-proof-brand';
import { createFigure2ProofCardsClosingTransition } from './figure2-proof-cards-closing';
import { createFigure2ProofOpeningCardsTransition } from './figure2-proof-opening-cards';
import type { LayerHandle, LayerVisibilityState, SceneId, SegmentId, SpineSegmentNode, TransitionContext, TransitionModule } from '../story/types';

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

function segment(id: SegmentId): SpineSegmentNode {
  const found = storyManifest.nodes.find((node): node is SpineSegmentNode => node.kind === 'segment' && node.id === id);
  if (!found) {
    throw new Error(`${id} segment missing`);
  }
  return structuredClone(found);
}

function context(segmentId: SegmentId, from: SceneId, to: SceneId, prefersReducedMotion = false): TransitionContext {
  return {
    segment: segment(segmentId),
    from: layer(from, 'current'),
    to: layer(to, 'next'),
    stage: {
      getLayer: () => undefined,
      ensureLayer: (scene, role) => layer(scene, role === 'current' ? 'current' : 'next'),
      releaseLayer: () => undefined,
      snapshot: () => []
    },
    direction: 1,
    runId: 'r4-g3-test:1',
    prepareToken: 'r4-g3-test:prepare:1',
    prefersReducedMotion,
    reportMilestone: () => undefined
  };
}

const cases = [
  {
    id: 'figure2-distance-expand',
    from: 'figure2-animation',
    to: 'figure2-proof-opening',
    create: createFigure2DistanceExpandTransition
  },
  {
    id: 'figure2-proof-opening-cards',
    from: 'figure2-proof-opening',
    to: 'figure2-proof-cards',
    create: createFigure2ProofOpeningCardsTransition
  },
  {
    id: 'figure2-proof-cards-closing',
    from: 'figure2-proof-cards',
    to: 'figure2-proof-closing',
    create: createFigure2ProofCardsClosingTransition
  },
  {
    id: 'figure2-proof-brand',
    from: 'figure2-proof-closing',
    to: 'brand',
    create: createFigure2ProofBrandTransition
  }
] as const satisfies readonly {
  id: SegmentId;
  from: SceneId;
  to: SceneId;
  create: () => TransitionModule;
}[];

describe('figure2 proof chain transitions', () => {
  for (const item of cases) {
    it(`verifies ${item.id} timeline and reduced-motion fallback`, async () => {
      const transition = item.create();
      const timeline = await transition.buildTimeline(context(item.id, item.from, item.to));
      const isReadingSegment = item.id !== 'figure2-distance-expand';

      expect(transition.reducedMotionFallback).toBeTypeOf('function');
      expect(verifySegmentTimeline(timeline, { policy: segment(item.id).policy })).toMatchObject({
        maxVisibleLayers: isReadingSegment ? 1 : 2
      });
      if (isReadingSegment) {
        expect(timeline.sample?.(0.5)).toMatchObject({
          from: { visible: true, opacity: 1 },
          to: { visible: false, opacity: 0 }
        });
      }
    });

    it(`keeps ${item.id} idempotent across 0 to 1 to 0 to 1`, async () => {
      const timeline = await item.create().buildTimeline(context(item.id, item.from, item.to));

      timeline.progress(0);
      const start = timeline.sample?.(0);
      timeline.progress(1);
      const end = timeline.sample?.(1);
      timeline.progress(0);
      expect(timeline.sample?.(0)).toEqual(start);
      timeline.progress(1);
      expect(timeline.sample?.(1)).toEqual(end);
    });

    it(`collapses ${item.id} duration in reduced motion`, async () => {
      const timeline = await item.create().buildTimeline(context(item.id, item.from, item.to, true));

      await expect(timeline.play(1)).resolves.toBeUndefined();
      expect(timeline.sample?.(1).to.visible).toBe(true);
    });
  }
});
