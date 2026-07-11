import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { storyManifest } from '../../story/manifest';
import { verifySegmentTimeline } from '../../story/verifySegmentTimeline';
import {
  createHeroPatternTransition,
  renderHeroForHeroPattern,
  renderPatternForHeroPattern
} from './index';
import { patternCenterForViewport } from '../../scenes/pattern';
import { createBackHalfDomContext, FakeCanvas } from '../__fixtures__/back-half.fixture';
import type { LayerHandle, LayerVisibilityState, SpineSegmentNode, TransitionContext } from '../../story/types';

const transitionSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

afterEach(() => {
  vi.unstubAllGlobals();
});

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

    expect(patternCenterForViewport(1440)).toEqual({ x: 0.24, y: 0.55 });
    expect(patternRoot.attributes.get('data-pattern-progress')).toBe('0.0000');
    expect(patternRoot.style.values.get('--r4-pattern-opacity')).toBe('1.0000');
    expect(heroRoot.attributes.get('data-hero-progress')).toBe('1.0000');
  });

  it('contains no transition-only Pattern target or second collapse phase', () => {
    expect(transitionSource).toContain('renderPatternHold');
    expect(transitionSource).not.toContain('HERO_PATTERN_INK_TARGET_IMAGE');
    expect(transitionSource).not.toContain('pattern-bloom-initial-no-stars.png');
    expect(transitionSource).not.toContain('patternBloomProgressForHeroPattern');
    expect(transitionSource).not.toContain('HERO_PATTERN_ORIGIN');
    expect(transitionSource).toContain("kind: 'radial'");
    expect(transitionSource).toContain('readPatternCenter(to)');
  });

  it('shares one radial Pattern-center boundary with the effect canvas', async () => {
    const fixture = createBackHalfDomContext('hero-pattern', 'hero', 'pattern');
    const canvas = new FakeCanvas();
    Object.assign(fixture.toRoot, { clientWidth: 1440 });
    vi.stubGlobal('document', { createElement: () => canvas });
    const timeline = await createHeroPatternTransition().buildTimeline(fixture.context);
    const receiver = fixture.stage.children[1]!;

    timeline.progress(0.5);

    expect(receiver.style.clipPath).toMatch(/^polygon\(/);
    expect(receiver.style.clipPath).not.toContain('circle(');
    expect(receiver.dataset.r4InkBoundaryKind).toBe('radial');
    expect(receiver.dataset.r4InkBoundaryOrigin).toBe('0.2400,0.5500');
    expect(receiver.dataset.r4InkBoundaryRevision).toBe(canvas.dataset.r4InkBoundaryRevision);
    expect(fixture.toRoot.dataset.patternProgress).toBe('0.0000');
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
