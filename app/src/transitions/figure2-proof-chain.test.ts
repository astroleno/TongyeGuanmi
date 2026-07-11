import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { figure2AnimationScene } from '../scenes/figure2-animation';
import { storyManifest } from '../story/manifest';
import { verifySegmentTimeline } from '../story/verifySegmentTimeline';
import {
  createFigure2DistanceExpandTransition,
  figure2ProofRevealProgress,
  figure2VideoModeForProofTransition
} from './figure2-distance-expand';
import { thresholdTable } from './shared/depthThresholdMask';
import {
  FIGURE2_INTRO_PLAYBACK_MS
} from '../scenes/figure2-animation';
import { createFigure2ProofBrandTransition } from './figure2-proof-brand';
import { createFigure2ProofCardsClosingTransition } from './figure2-proof-cards-closing';
import { createFigure2ProofOpeningCardsTransition } from './figure2-proof-opening-cards';
import type { LayerHandle, LayerVisibilityState, SceneId, SegmentId, SpineSegmentNode, TransitionContext, TransitionModule } from '../story/types';

class FakeStyle {
  [key: string]: unknown;
  private readonly values = new Map<string, string>();
  clipPath = '';

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }

  removeProperty(name: string): void {
    this.values.delete(name);
    if (name === 'clip-path') {
      this.clipPath = '';
    }
  }

  getPropertyValue(name: string): string {
    return this.values.get(name) ?? '';
  }
}

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly style = new FakeStyle();
  ownerDocument: FakeDocument | null = null;
  parentElement: FakeElement | null = null;
  inert = false;
  className = '';

  append(...children: FakeElement[]): void {
    for (const child of children) {
      child.parentElement = this;
      child.ownerDocument = this.ownerDocument;
      this.children.push(child);
    }
  }

  querySelector(selector: string): FakeElement | null {
    const match = selector.match(/data-r4-ink-segment="([^"]+)"/);
    return match ? this.children.find((child) => child.dataset.r4InkSegment === match[1]) ?? null : null;
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

  remove(): void {
    if (!this.parentElement) {
      return;
    }
    const index = this.parentElement.children.indexOf(this);
    if (index >= 0) {
      this.parentElement.children.splice(index, 1);
    }
    this.parentElement = null;
  }
}

class FakeCanvas extends FakeElement {
  getContext(): null {
    return null;
  }

  remove(): void {
    if (!this.parentElement) {
      return;
    }
    const index = this.parentElement.children.indexOf(this);
    if (index >= 0) {
      this.parentElement.children.splice(index, 1);
    }
    this.parentElement = null;
  }
}

class FakeDocument {
  createElement(): FakeCanvas {
    const canvas = new FakeCanvas();
    canvas.ownerDocument = this;
    return canvas;
  }

  createElementNS(): FakeElement {
    const element = new FakeElement();
    element.ownerDocument = this;
    return element;
  }

  querySelector(): FakeElement | null {
    return null;
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
    runId: 'r4-g3-test:1',
    prepareToken: 'r4-g3-test:prepare:1',
    prefersReducedMotion,
    reportMilestone: () => undefined
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

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
  it('declares two keyed Figure2 video handles and a mediaReady preload milestone', async () => {
    const markup = renderToStaticMarkup(createElement(figure2AnimationScene.Component, {
      scene: 'figure2-animation',
      hidden: false
    }));

    expect(figure2AnimationScene.requiredHandles).toEqual([
      'stage',
      'figures',
      'left-video',
      'right-video'
    ]);
    await expect(Promise.resolve(figure2AnimationScene.preload())).resolves.toMatchObject({
      milestones: ['targetReady', 'mediaReady']
    });
    expect(markup).toContain('data-media-key="figure2-left-alpha"');
    expect(markup).toContain('data-media-key="figure2-right-alpha"');
  });

  it('keeps the Figure2 transition media and milestone contracts equal to the manifest', () => {
    const transition = createFigure2DistanceExpandTransition();
    const manifestSegment = segment('figure2-distance-expand');

    expect(transition.requiredMilestones).toEqual([
      'targetReady',
      'mediaReady',
      'buildReady',
      'timelineReady'
    ]);
    expect(transition.mediaPlayback).toEqual(manifestSegment.mediaPlayback);
  });

  it('reveals the live Brand while Proof remains geometrically unchanged in both directions', async () => {
    const document = new FakeDocument();
    const stage = new FakeElement();
    const fromElement = new FakeElement();
    const toElement = new FakeElement();
    stage.ownerDocument = document;
    fromElement.ownerDocument = document;
    toElement.ownerDocument = document;
    stage.append(fromElement);
    stage.append(toElement);
    vi.stubGlobal('document', document);
    const timeline = await createFigure2ProofBrandTransition().buildTimeline(
      context(
        'figure2-proof-brand',
        'figure2-proof-closing',
        'brand',
        false,
        { from: fromElement as unknown as HTMLElement, to: toElement as unknown as HTMLElement }
      )
    );

    timeline.progress(0.7);
    expect(timeline.sample?.(0.7)).toMatchObject({
      from: { visible: true, opacity: 1 },
      to: { visible: true, opacity: 1 }
    });
    expect(toElement.dataset.r4RevealMode).toBe('live-clip');
    expect(toElement.style.clipPath).toContain('inset(');
    expect(toElement.style.getPropertyValue('mask-image')).toBe('');
    expect(fromElement.style.getPropertyValue('--r4-proof-closing-opacity')).toBe('1.0000');
    expect(fromElement.style.getPropertyValue('--r4-proof-closing-y')).toBe('0.00px');
    expect(toElement.style.getPropertyValue('--r4-brand-opacity')).toBe('1.0000');
    expect(toElement.style.getPropertyValue('--r4-brand-y')).toBe('0.00px');

    timeline.progress(1);
    expect(timeline.sample?.(1)).toMatchObject({
      from: { visible: false, opacity: 0 },
      to: { visible: true, opacity: 1 }
    });
    expect(toElement.style.getPropertyValue('mask-image')).toBe('');
    expect(toElement.style.clipPath).toBe('');

    timeline.progress(0.4);
    expect(toElement.dataset.r4RevealMode).toBe('live-clip');
    expect(toElement.style.clipPath).toContain('inset(');
    timeline.progress(0);

    timeline.progress(0.7);
    timeline.dispose();
    expect(toElement.style.getPropertyValue('mask-image')).toBe('');
    expect(toElement.style.clipPath).toBe('');
  });

  it('uses time-varying depth thresholds whose authored mask values stay strictly binary', () => {
    const midReveal = figure2ProofRevealProgress(0.86);
    expect(midReveal).toBeGreaterThan(0.35);
    expect(midReveal).toBeLessThan(0.78);
    expect(new Set(thresholdTable(midReveal))).toEqual(new Set([0, 1]));

    const lateReveal = figure2ProofRevealProgress(0.985);
    expect(lateReveal).toBeGreaterThan(0.9);
    expect(thresholdTable(lateReveal).every((value) => value === 0 || value === 1)).toBe(true);
  });

  it('applies the binary mask to the live Proof layer without changing layer opacity', async () => {
    const document = new FakeDocument();
    const stage = new FakeElement();
    const fromElement = new FakeElement();
    const toElement = new FakeElement();
    stage.ownerDocument = document;
    fromElement.ownerDocument = document;
    toElement.ownerDocument = document;
    toElement.style.setProperty('opacity', '1');
    stage.append(fromElement, toElement);
    vi.stubGlobal('document', document);
    const timeline = await createFigure2DistanceExpandTransition().buildTimeline(
      context('figure2-distance-expand', 'figure2-animation', 'figure2-proof-opening', false, {
        from: fromElement as unknown as HTMLElement,
        to: toElement as unknown as HTMLElement
      })
    );

    timeline.progress(0.86);

    expect(toElement.dataset.figure2ProofMaskValues).toBe('1,0');
    expect(toElement.style.getPropertyValue('opacity')).toBe('1');
    expect(toElement.style.getPropertyValue('mask-image')).toContain('depth-threshold-mask');

    timeline.progress(1);
    timeline.dispose();
    expect(toElement.style.getPropertyValue('mask-image')).toBe('');
  });

  it('plays the figure videos continuously during the intro and releases them once ink begins', () => {
    expect(figure2VideoModeForProofTransition(0, 1)).toBe('native');
    expect(figure2VideoModeForProofTransition(0.001, 1)).toBe('native');
    expect(figure2VideoModeForProofTransition(0.1, 1)).toBe('none');
    expect(figure2VideoModeForProofTransition(0, -1)).toBe('none');
    expect(figure2VideoModeForProofTransition(0.5, -1)).toBe('none');
    expect(FIGURE2_INTRO_PLAYBACK_MS).toBe(2600);
  });

  for (const item of cases) {
    it(`verifies ${item.id} timeline and reduced-motion fallback`, async () => {
      const transition = item.create();
      const timeline = await transition.buildTimeline(context(item.id, item.from, item.to));
      const isSectionHandoff = item.id === 'figure2-proof-opening-cards' || item.id === 'figure2-proof-cards-closing';

      if (isSectionHandoff) {
        expect(segment(item.id).virtualDuration).toBeGreaterThanOrEqual(700);
      }

      expect(transition.reducedMotionFallback).toBeTypeOf('function');
      expect(verifySegmentTimeline(timeline, { policy: segment(item.id).policy })).toMatchObject({
        maxVisibleLayers: item.id === 'figure2-distance-expand' || isSectionHandoff || item.id === 'figure2-proof-brand' ? 2 : 1
      });
      if (item.id === 'figure2-proof-brand') {
        expect(timeline.sample?.(0.5)).toMatchObject({
          from: { visible: true, opacity: 1 },
          to: { visible: true, opacity: 1 }
        });
      } else if (isSectionHandoff) {
        expect(timeline.sample?.(0.5)).toMatchObject({
          from: { visible: true, opacity: 1 },
          to: { visible: true, opacity: 1 }
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
