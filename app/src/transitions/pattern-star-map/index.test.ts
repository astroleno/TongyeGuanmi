import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { storyManifest } from '../../story/manifest';
import { verifySegmentTimeline } from '../../story/verifySegmentTimeline';
import { starMapMotionEnabled } from '../../scenes/star-map';
import { createPatternStarMapTransition, PATTERN_STAR_MAP_ORIGIN } from './index';
import type { LayerHandle, LayerVisibilityState, SpineSegmentNode, TransitionContext } from '../../story/types';

const transitionSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const stylesheet = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');

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
    dispose() {}
  };
}

function segment(): SpineSegmentNode {
  const found = storyManifest.nodes.find(
    (node): node is SpineSegmentNode => node.kind === 'segment' && node.id === 'pattern-star-map'
  );
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
  it('reveals the live Star-map from the canonical expanded Pattern center', () => {
    expect(PATTERN_STAR_MAP_ORIGIN).toEqual({ x: 0.24, y: 0.55 });
    expect(transitionSource).toContain('renderPatternHold');
    expect(transitionSource).toContain('renderStarMapHold');
    expect(transitionSource).not.toContain('PATTERN_STAR_MAP_INK_TARGET_IMAGE');
    expect(transitionSource).not.toContain('back2.png');
    expect(transitionSource).not.toContain('pauseStarMapTransitionMotion');
  });

  it('uses the live Star canvas with the canonical .92 grade and active Perlin owner', () => {
    expect(stylesheet).toMatch(/\.r3-star-map__canvas\s*\{[^}]*brightness\(\.92\)/s);
    expect(stylesheet).not.toContain('data-star-map-transition-motion="paused"');
    expect(starMapMotionEnabled(false, false)).toBe(true);
    expect(starMapMotionEnabled(true, false)).toBe(false);
    expect(starMapMotionEnabled(false, true)).toBe(false);
  });

  it('passes timeline verification without swapping roots', async () => {
    const transition = createPatternStarMapTransition();
    const timeline = await transition.buildTimeline(context());

    expect(verifySegmentTimeline(timeline, { policy: segment().policy })).toMatchObject({ maxVisibleLayers: 2 });
    expect(timeline.sample?.(0.5)).toMatchObject({
      from: { visible: true, opacity: 1 },
      to: { visible: true, opacity: 1 }
    });
  });

  it('is idempotent in both directions and collapses reduced motion to the endpoint', async () => {
    const transition = createPatternStarMapTransition();
    const timeline = await transition.buildTimeline(context(true));
    const start = timeline.sample?.(0);
    const end = timeline.sample?.(1);

    timeline.progress(1);
    timeline.progress(0);
    expect(timeline.sample?.(0)).toEqual(start);
    timeline.progress(1);
    expect(timeline.sample?.(1)).toEqual(end);
    await expect(timeline.play(1)).resolves.toBeUndefined();
  });
});
