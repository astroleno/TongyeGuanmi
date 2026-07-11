import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { storyManifest } from '../story/manifest';
import { verifySegmentTimeline } from '../story/verifySegmentTimeline';
import { createBrandFigure3Transition } from './brand-figure3';
import { createFigure3ServicesTransition, FIGURE3_SERVICES_COPY_CUE, FIGURE3_SERVICES_DURATION_MS } from './figure3-services';
import type { LayerHandle, LayerVisibilityState, SceneId, SegmentId, SpineSegmentNode, TransitionContext, TransitionModule } from '../story/types';

const stylesheet = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

class FakeStyle {
  [key: string]: unknown;
  private readonly values = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }

  removeProperty(name: string): void {
    this.values.delete(name);
  }

  getPropertyValue(name: string): string {
    return this.values.get(name) ?? '';
  }
}

class FakeElement {
  readonly dataset: Record<string, string> = {};
  readonly style = new FakeStyle();
  inert = false;

  querySelector(): null {
    return null;
  }

  querySelectorAll(): FakeElement[] {
    return [];
  }

  matches(): boolean {
    return true;
  }

  removeAttribute(name: string): void {
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      delete this.dataset[key];
    }
  }

  setAttribute(name: string, value: string): void {
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      this.dataset[key] = value;
    }
  }
}

function layer(scene: SceneId, role: 'current' | 'next', element: HTMLElement | null = null): LayerHandle {
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
    element,
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

function context(
  segmentId: SegmentId,
  from: SceneId,
  to: SceneId,
  prefersReducedMotion = false,
  elements: { from?: HTMLElement; to?: HTMLElement } = {}
): TransitionContext {
  return {
    segment: segment(segmentId),
    from: layer(from, 'current', elements.from ?? null),
    to: layer(to, 'next', elements.to ?? null),
    stage: {
      getLayer: () => undefined,
      ensureLayer: (scene, role) => layer(scene, role === 'current' ? 'current' : 'next'),
      releaseLayer: () => undefined,
      snapshot: () => []
    },
    direction: 1,
    runId: 'r4-g4-test:1',
    prepareToken: 'r4-g4-test:prepare:1',
    prefersReducedMotion,
    reportMilestone: () => undefined
  };
}

const cases: readonly {
  id: SegmentId;
  from: SceneId;
  to: SceneId;
  create: () => TransitionModule;
  copyCueAtProgress?: number;
}[] = [
  {
    id: 'brand-figure3',
    from: 'brand',
    to: 'figure3-animation',
    create: createBrandFigure3Transition
  },
  {
    id: 'figure3-services',
    from: 'figure3-animation',
    to: 'services',
    create: createFigure3ServicesTransition,
    copyCueAtProgress: FIGURE3_SERVICES_COPY_CUE.atProgress
  }
];

describe('R4 group4 transitions', () => {
  it('removes the horizontal Figure3 edge gradient without changing Figure3-to-Services choreography', () => {
    const overlay = stylesheet.match(/\.figure3-transition__sticky::after\s*\{([^}]*)\}/s)?.[1] ?? '';
    expect(overlay).not.toContain('linear-gradient(90deg');
  });

  it('reveals completed Services copy at 80% while its paper builds linearly to the staged hold', async () => {
    const policy = segment('figure3-services').policy;
    if (policy.kind !== 'stagedSnap') {
      throw new Error('figure3-services must remain staged');
    }
    const stop = policy.stops[0] ?? 0;
    const timeline = await createFigure3ServicesTransition().buildTimeline(
      context('figure3-services', 'figure3-animation', 'services')
    );

    expect(FIGURE3_SERVICES_DURATION_MS).toBe(2000);
    expect(policy.playMs).toEqual([2000, 620]);

    expect(FIGURE3_SERVICES_COPY_CUE.atProgress).toBe(0.8);
    expect(timeline.sample?.(0.799)).toMatchObject({
      from: { visible: true, opacity: 1 },
      to: { visible: false, opacity: 0 }
    });
    expect(timeline.sample?.(0.8)).toMatchObject({
      from: { visible: true, opacity: 1 },
      to: { visible: true, opacity: 1 }
    });
    expect(timeline.sample?.(stop)).toMatchObject({
      from: { visible: false, opacity: 0 },
      to: { visible: true, opacity: 1 }
    });
  });

  it('keeps Figure3 behind the receiver until paper and wash are fully opaque in forward and reverse', async () => {
    const policy = segment('figure3-services').policy;
    if (policy.kind !== 'stagedSnap') {
      throw new Error('figure3-services must remain staged');
    }
    const stop = policy.stops[0] ?? 0;
    const fromElement = new FakeElement();
    const toElement = new FakeElement();
    const transitionContext = context(
      'figure3-services',
      'figure3-animation',
      'services',
      false,
      { from: fromElement as unknown as HTMLElement, to: toElement as unknown as HTMLElement }
    );
    const timeline = await createFigure3ServicesTransition().buildTimeline(transitionContext);
    const midpoint = 0.8 + (stop - 0.8) * 0.5;

    timeline.progress(0.8);
    expect(transitionContext.from.visibility.visible).toBe(true);
    expect(transitionContext.to.visibility.visible).toBe(true);
    expect(toElement.style.getPropertyValue('--r4-handoff-paper-alpha')).toBe('0.0000');
    expect(toElement.style.getPropertyValue('--r4-services-opacity')).toBe('1.0000');
    expect(toElement.style.getPropertyValue('--r4-services-y')).toBe('0.00px');

    timeline.progress(midpoint);
    expect(Number.parseFloat(toElement.style.getPropertyValue('--r4-handoff-paper-alpha'))).toBeCloseTo(0.5, 3);
    expect(Number.parseFloat(toElement.style.getPropertyValue('--r4-handoff-wash-alpha'))).toBeCloseTo(0.5, 3);
    expect(transitionContext.from.visibility.visible).toBe(true);
    expect(transitionContext.to.visibility.visible).toBe(true);

    timeline.progress(stop);
    expect(toElement.style.getPropertyValue('--r4-handoff-paper-alpha')).toBe('1.0000');
    expect(toElement.style.getPropertyValue('--r4-handoff-wash-alpha')).toBe('1.0000');
    expect(transitionContext.from.visibility.visible).toBe(false);

    timeline.progress(midpoint);
    expect(transitionContext.from.visibility.visible).toBe(true);
    expect(transitionContext.to.visibility.visible).toBe(true);
    timeline.progress(0.799);
    expect(transitionContext.from.visibility.visible).toBe(true);
    expect(transitionContext.to.visibility.visible).toBe(false);

    timeline.dispose();
  });

  for (const item of cases) {
    it(`verifies ${item.id} timeline and reduced-motion fallback`, async () => {
      const transition = item.create();
      const timeline = await transition.buildTimeline(context(item.id, item.from, item.to));

      expect(transition.reducedMotionFallback).toBeTypeOf('function');
      expect(verifySegmentTimeline(timeline, {
        policy: segment(item.id).policy,
        ...(item.copyCueAtProgress !== undefined ? { copyCueAtProgress: item.copyCueAtProgress } : {})
      })).toMatchObject({
        maxVisibleLayers: 2
      });
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
