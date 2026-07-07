import { describe, expect, it } from 'vitest';
import { storyManifest } from '../../story/manifest';
import { verifySegmentTimeline } from '../../story/verifySegmentTimeline';
import { createHeroPatternTransition, patternBloomProgressForHeroPattern, renderPatternForHeroPattern } from './index';
import type { LayerHandle, LayerVisibilityState, SpineSegmentNode, TransitionContext } from '../../story/types';

class FakeStyle {
  values = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }
}

class FakeElement {
  style = new FakeStyle();
  attributes = new Map<string, string>();

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

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
  it('matches main bloom timing after the initial full-petal reveal', () => {
    expect(patternBloomProgressForHeroPattern(0)).toBe(0);
    expect(patternBloomProgressForHeroPattern(0.419)).toBe(0);
    expect(patternBloomProgressForHeroPattern(0.56)).toBeCloseTo(0.5, 5);
    expect(patternBloomProgressForHeroPattern(0.70)).toBe(1);
    expect(patternBloomProgressForHeroPattern(1)).toBe(1);
  });

  it('keeps the full-petal pattern visible while the ink reveals before collapse', () => {
    const root = new FakeElement();

    renderPatternForHeroPattern(root as unknown as HTMLElement, 0.2);

    expect(root.attributes.get('data-pattern-progress')).toBe('0.0000');
    expect(root.style.values.get('--r4-pattern-progress')).toBe('0.0000');
    expect(root.style.values.get('--r4-pattern-opacity')).toBe('1.0000');

    renderPatternForHeroPattern(root as unknown as HTMLElement, 0.419);

    expect(root.attributes.get('data-pattern-progress')).toBe('0.0000');
    expect(root.style.values.get('--r4-pattern-opacity')).toBe('1.0000');
  });

  it('passes timeline verification and exposes a reduced-motion fallback', async () => {
    const transition = createHeroPatternTransition();
    const timeline = await transition.buildTimeline(context());

    expect(transition.reducedMotionFallback).toBeTypeOf('function');
    expect(verifySegmentTimeline(timeline, { policy: segment().policy })).toMatchObject({
      maxVisibleLayers: 2
    });
    expect(timeline.sample?.(0.5)).toMatchObject({
      from: { visible: true, opacity: 1 },
      to: { visible: true, opacity: 1 }
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
