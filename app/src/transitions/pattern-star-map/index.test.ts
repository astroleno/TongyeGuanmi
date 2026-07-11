import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { storyManifest } from '../../story/manifest';
import { verifySegmentTimeline } from '../../story/verifySegmentTimeline';
import {
  createPatternStarMapTransition,
  PATTERN_STAR_MAP_INK_TARGET_IMAGE,
  PATTERN_STAR_MAP_INK_PROGRESS_SPAN,
  patternTopSceneOpacityForStarMap,
  starMapPresentationProgressForPatternStarMap
} from './index';
import type { LayerHandle, LayerVisibilityState, SpineSegmentNode, TransitionContext } from '../../story/types';

const patternBloomTimelineSource = readFileSync(new URL('../pattern-bloom/timeline.ts', import.meta.url), 'utf8');

function layer(scene: 'pattern' | 'star-map', role: 'current' | 'next'): LayerHandle {
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
  const found = storyManifest.nodes.find((node): node is SpineSegmentNode => node.kind === 'segment' && node.id === 'pattern-star-map');
  if (!found) {
    throw new Error('pattern-star-map segment missing');
  }
  return structuredClone(found);
}

function context(prefersReducedMotion = false): TransitionContext {
  return {
    segment: segment(),
    from: layer('pattern', 'current'),
    to: layer('star-map', 'next'),
    stage: {
      getLayer: () => undefined,
      ensureLayer: (scene, role) => layer(scene as 'pattern' | 'star-map', role === 'current' ? 'current' : 'next'),
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

describe('pattern-star-map transition', () => {
  it('keeps the star-map presentation delayed so the ink handoff stays readable', () => {
    expect(segment().virtualDuration).toBeLessThanOrEqual(2000);
    expect(starMapPresentationProgressForPatternStarMap(0.40)).toBe(0);
    expect(starMapPresentationProgressForPatternStarMap(0.55)).toBeLessThan(0.04);
    expect(starMapPresentationProgressForPatternStarMap(0.78)).toBeLessThan(0.04);
    expect(starMapPresentationProgressForPatternStarMap(0.96)).toBeGreaterThan(0.35);
    expect(starMapPresentationProgressForPatternStarMap(1)).toBe(1);
  });

  it('finishes the second Ink sweep before the endpoint and fades Pattern to a light ghost', () => {
    expect(PATTERN_STAR_MAP_INK_PROGRESS_SPAN).toBe(0.94);
    expect(patternTopSceneOpacityForStarMap(0)).toBe(1);
    expect(patternTopSceneOpacityForStarMap(0.2)).toBeCloseTo(0.18, 3);
    expect(patternTopSceneOpacityForStarMap(0.85)).toBeLessThan(0.18);
    expect(patternTopSceneOpacityForStarMap(1)).toBe(0);
  });

  it('does not apply a per-frame clip-path to the full-resolution Star-map receiver', () => {
    expect(patternBloomTimelineSource).not.toContain("style.setProperty('clip-path'");
    expect(patternBloomTimelineSource).not.toContain("style.setProperty('-webkit-clip-path'");
  });

  it('uses the one canonical Star canvas for both Ink and hold instead of swapping a fake snapshot', () => {
    expect(patternBloomTimelineSource).not.toContain("document.createElement('canvas')");
    expect(patternBloomTimelineSource).not.toContain('starMapSnapshotCanvas');
    expect(patternBloomTimelineSource).toContain('nextSceneElement: this.starMapSourceCanvas');
    expect(patternBloomTimelineSource).toContain('releaseStarMapTransitionMotion(starMapRoot)');
  });

  it('resolves the Ink grade to the main Star grade before the live canvas handoff', () => {
    expect(patternBloomTimelineSource).toContain('PATTERN_STAR_MAP_MAIN_BRIGHTNESS = 0.74');
    expect(patternBloomTimelineSource).toContain('PATTERN_STAR_MAP_PERLIN_RESOLVE_START = 0.72');
  });

  it('passes timeline verification and exposes a reduced-motion fallback', async () => {
    const transition = createPatternStarMapTransition();
    const timeline = await transition.buildTimeline(context());

    expect(transition.reducedMotionFallback).toBeTypeOf('function');
    expect(verifySegmentTimeline(timeline, { policy: segment().policy })).toMatchObject({
      maxVisibleLayers: 2
    });
    expect(timeline.sample?.(0.5)).toMatchObject({
      from: { visible: true, opacity: 1 },
      to: { visible: true, opacity: 1 }
    });
    expect(PATTERN_STAR_MAP_INK_TARGET_IMAGE).toContain('back2.png');
  });

  it('is idempotent across 0 to 1 to 0 to 1 progress', async () => {
    const transition = createPatternStarMapTransition();
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
    const transition = createPatternStarMapTransition();
    const timeline = await transition.buildTimeline(context(true));

    await expect(timeline.play(1)).resolves.toBeUndefined();
    expect(timeline.sample?.(1).to.visible).toBe(true);
  });
});
