import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { storyManifest } from '../../story/manifest';
import { verifySegmentTimeline } from '../../story/verifySegmentTimeline';
import {
  createHeroPatternTransition,
  HERO_PATTERN_ORIGIN,
  renderHeroForHeroPattern,
  renderPatternForHeroPattern
} from './index';
import type { LayerHandle, LayerVisibilityState, SpineSegmentNode, TransitionContext } from '../../story/types';

const transitionSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

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
    dispose() {}
  };
}

function segment(): SpineSegmentNode {
  const found = storyManifest.nodes.find(
    (node): node is SpineSegmentNode => node.kind === 'segment' && node.id === 'hero-pattern'
  );
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
  it('reveals the canonical expanded Pattern at its authored left-side center', () => {
    const patternRoot = new FakeElement();
    const heroRoot = new FakeElement();

    renderPatternForHeroPattern(patternRoot as unknown as HTMLElement);
    renderHeroForHeroPattern(heroRoot as unknown as HTMLElement);

    expect(HERO_PATTERN_ORIGIN).toEqual({ x: 0.24, y: 0.55 });
    expect(patternRoot.attributes.get('data-pattern-progress')).toBe('0.0000');
    expect(patternRoot.style.values.get('--r4-pattern-opacity')).toBe('1.0000');
    expect(heroRoot.attributes.get('data-hero-progress')).toBe('1.0000');
  });

  it('contains no transition-only Pattern target or second collapse phase', () => {
    expect(transitionSource).toContain('renderPatternHold');
    expect(transitionSource).not.toContain('HERO_PATTERN_INK_TARGET_IMAGE');
    expect(transitionSource).not.toContain('pattern-bloom-initial-no-stars.png');
    expect(transitionSource).not.toContain('patternBloomProgressForHeroPattern');
  });

  it('uses one 2200ms snap and passes timeline verification', async () => {
    const transition = createHeroPatternTransition();
    const timeline = await transition.buildTimeline(context());

    expect(segment()).toMatchObject({
      policy: { kind: 'snap' },
      virtualDuration: 2200
    });
    expect(verifySegmentTimeline(timeline, { policy: segment().policy })).toMatchObject({ maxVisibleLayers: 2 });
    expect(timeline.sample?.(0.5)).toMatchObject({
      from: { visible: true, opacity: 1 },
      to: { visible: true, opacity: 1 }
    });
  });

  it('is idempotent in both directions and collapses reduced motion to the endpoint', async () => {
    const transition = createHeroPatternTransition();
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
