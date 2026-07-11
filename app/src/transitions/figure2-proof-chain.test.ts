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
import { thresholdTable, thresholdTables } from './shared/depthThresholdMask';
import {
  FIGURE2_INTRO_PLAYBACK_MS
} from '../scenes/figure2-animation';
import { createFigure2ProofBrandTransition } from './figure2-proof-brand';
import { createFigure2ProofCardsClosingTransition } from './figure2-proof-cards-closing';
import { createFigure2ProofOpeningCardsTransition } from './figure2-proof-opening-cards';
import type { Direction, LayerHandle, LayerVisibilityState, SceneId, SegmentId, SpineSegmentNode, TransitionContext, TransitionModule } from '../story/types';

class FakeStyle {
  [key: string]: unknown;
  private readonly values = new Map<string, string>();
  clipPath = '';
  filter = '';
  opacity = '';
  transform = '';
  visibility = '';

  get length(): number {
    return this.values.size;
  }

  item(index: number): string {
    return [...this.values.keys()][index] ?? '';
  }

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
  private readonly selectors = new Map<string, FakeElement>();

  append(...children: FakeElement[]): void {
    for (const child of children) {
      child.parentElement = this;
      child.ownerDocument = this.ownerDocument;
      this.children.push(child);
    }
  }

  connect(selector: string, element: FakeElement): void {
    this.selectors.set(selector, element);
  }

  querySelector(selector: string): FakeElement | null {
    const direct = this.selectors.get(selector);
    if (direct) {
      return direct;
    }
    const match = selector.match(/data-r4-ink-segment="([^"]+)"/);
    if (match) {
      return this.children.find((child) => child.dataset.r4InkSegment === match[1]) ?? null;
    }
    if (selector === '[data-figure2-retained-ground="true"]') {
      return this.children.find((child) => child.dataset.figure2RetainedGround === 'true') ?? null;
    }
    if (selector === '[data-stage-retained-figure2-arch="true"]') {
      return this.children.find((child) => child.dataset.stageRetainedFigure2Arch === 'true') ?? null;
    }
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
  elements: { from?: HTMLElement; to?: HTMLElement } = {},
  direction: Direction = 1
): TransitionContext {
  return {
    segment: segment(segmentId),
    from: layer(from, direction === 1 ? 'current' : 'next', elements.from ?? null),
    to: layer(to, direction === 1 ? 'next' : 'current', elements.to ?? null),
    stage: {
      getLayer: () => undefined,
      ensureLayer: (scene, role) => layer(scene, role === 'current' ? 'current' : 'next'),
      releaseLayer: () => undefined,
      snapshot: () => []
    },
    direction,
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
    const retainedArch = new FakeElement();
    stage.ownerDocument = document;
    fromElement.ownerDocument = document;
    toElement.ownerDocument = document;
    retainedArch.ownerDocument = document;
    retainedArch.dataset.stageRetainedFigure2Arch = 'true';
    stage.append(retainedArch, fromElement, toElement);
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
    expect(toElement.dataset.r4RevealMode).toBe('ink-occluded-live-gate');
    expect(toElement.style.clipPath).toMatch(/^inset\(/);
    expect(toElement.style.clipPath).not.toContain('polygon(');
    const inkCanvas = stage.children.find((child) => child.dataset.r4InkSegment === 'figure2-proof-brand');
    expect(toElement.dataset.r4InkBoundaryKind).toBe('horizontal');
    expect(toElement.dataset.r4InkBoundaryRevision).toBeUndefined();
    expect(inkCanvas?.dataset.r4InkBoundaryRevision).toBeUndefined();
    expect(retainedArch.dataset.r4InkBoundaryRevision).toBeUndefined();
    expect(retainedArch.style.clipPath).toMatch(/^inset\(/);
    expect(retainedArch.style.clipPath).not.toContain('polygon(');
    expect(retainedArch.style.visibility).toBe('visible');
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
    expect(retainedArch.style.visibility).toBe('hidden');
    expect(retainedArch.style.clipPath).toBe('');

    timeline.progress(0.4);
    expect(toElement.dataset.r4RevealMode).toBe('ink-occluded-live-gate');
    expect(toElement.style.clipPath).toMatch(/^inset\(/);
    expect(toElement.style.clipPath).not.toContain('polygon(');
    timeline.progress(0);
    expect(stage.querySelector('[data-stage-retained-figure2-arch="true"]')).toBe(retainedArch);
    expect(retainedArch.style.visibility).toBe('visible');
    expect(retainedArch.style.clipPath).toBe('');

    timeline.progress(1);
    timeline.dispose();
    expect(toElement.style.getPropertyValue('mask-image')).toBe('');
    expect(toElement.style.clipPath).toBe('');
    expect(retainedArch.style.visibility).toBe('hidden');
    expect(retainedArch.style.clipPath).toBe('');
  });

  it.each([
    ['figure2-proof-opening-cards', 'figure2-proof-opening', 'figure2-proof-cards', createFigure2ProofOpeningCardsTransition],
    ['figure2-proof-cards-closing', 'figure2-proof-cards', 'figure2-proof-closing', createFigure2ProofCardsClosingTransition]
  ] as const)('leaves the retained arch untouched through forward and reverse %s handoffs', async (segmentId, from, to, create) => {
    const stage = new FakeElement();
    const fromElement = new FakeElement();
    const toElement = new FakeElement();
    const retainedArch = new FakeElement();
    retainedArch.dataset.stageRetainedFigure2Arch = 'true';
    retainedArch.style.filter = 'brightness(.76)';
    retainedArch.style.transform = 'scale(1.135)';
    retainedArch.style.opacity = '0.88';
    retainedArch.style.clipPath = 'polygon(0 0, 100% 0, 100% 100%, 0 100%)';
    stage.append(retainedArch, fromElement, toElement);
    const retainedPresentation = () => ({
      identity: stage.querySelector('[data-stage-retained-figure2-arch="true"]'),
      filter: retainedArch.style.filter,
      transform: retainedArch.style.transform,
      opacity: retainedArch.style.opacity,
      clipPath: retainedArch.style.clipPath
    });
    const initial = retainedPresentation();

    for (const direction of [1, -1] as const) {
      const timeline = await create().buildTimeline(context(
        segmentId,
        from,
        to,
        false,
        {
          from: fromElement as unknown as HTMLElement,
          to: toElement as unknown as HTMLElement
        },
        direction
      ));
      expect(retainedPresentation()).toEqual(initial);
      timeline.progress(0.54);
      expect(retainedPresentation()).toEqual(initial);
      timeline.progress(direction === 1 ? 1 : 0);
      expect(retainedPresentation()).toEqual(initial);
      timeline.dispose();
      expect(retainedPresentation()).toEqual(initial);
    }
  });

  it('uses time-varying depth thresholds whose authored mask values stay strictly binary', () => {
    const midReveal = figure2ProofRevealProgress(0.86);
    expect(midReveal).toBeGreaterThan(0.35);
    expect(midReveal).toBeLessThan(0.78);
    expect(new Set(thresholdTable(midReveal))).toEqual(new Set([0, 1]));

    const lateReveal = figure2ProofRevealProgress(0.985);
    expect(lateReveal).toBeGreaterThan(0.9);
    expect(thresholdTable(lateReveal).every((value) => value === 0 || value === 1)).toBe(true);
    for (const progress of [0, midReveal, lateReveal, 1, midReveal]) {
      const tables = thresholdTables(progress);
      expect(tables.reveal.every((value, index) => value + (tables.conceal[index] ?? -1) === 1)).toBe(true);
    }
  });

  it('applies complementary binary masks to live Figure2 and both live Proof surfaces', async () => {
    const document = new FakeDocument();
    const stage = new FakeElement();
    const fromElement = new FakeElement();
    const toElement = new FakeElement();
    const fromRoot = new FakeElement();
    const depthField = new FakeElement();
    const proofGround = new FakeElement();
    const retainedArch = new FakeElement();
    stage.ownerDocument = document;
    fromElement.ownerDocument = document;
    toElement.ownerDocument = document;
    fromRoot.ownerDocument = document;
    depthField.ownerDocument = document;
    proofGround.ownerDocument = document;
    retainedArch.ownerDocument = document;
    fromElement.connect(
      '[data-r4-scene="figure2-animation"], [data-r3-scene="figure2-animation"]',
      fromRoot
    );
    fromRoot.connect('[data-figure2-depth-field="true"]', depthField);
    proofGround.dataset.figure2RetainedGround = 'true';
    retainedArch.dataset.stageRetainedFigure2Arch = 'true';
    toElement.style.setProperty('opacity', '1');
    stage.append(proofGround, retainedArch, fromElement, toElement);
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
    expect(toElement.style.getPropertyValue('mask-image')).toContain('depth-threshold-reveal-mask');
    expect(proofGround.style.getPropertyValue('mask-image')).toContain('depth-threshold-reveal-mask');
    expect(depthField.style.getPropertyValue('mask-image')).toContain('depth-threshold-conceal-mask');
    expect(toElement.dataset.r4DepthMaskValues).toBe('1,0');
    expect(proofGround.dataset.r4DepthMaskValues).toBe('1,0');
    expect(depthField.dataset.r4DepthMaskValues).toBe('0,1');
    expect(retainedArch.style.getPropertyValue('mask-image')).toBe('');

    timeline.progress(1);
    timeline.dispose();
    expect(toElement.style.getPropertyValue('mask-image')).toBe('');
    expect(proofGround.style.getPropertyValue('mask-image')).toBe('');
    expect(depthField.style.getPropertyValue('mask-image')).toBe('');
  });

  it('initializes a reverse Figure2-to-Proof build at the forward end', async () => {
    const document = new FakeDocument();
    const stage = new FakeElement();
    const fromElement = new FakeElement();
    const toElement = new FakeElement();
    stage.ownerDocument = document;
    fromElement.ownerDocument = document;
    toElement.ownerDocument = document;
    stage.append(fromElement, toElement);
    vi.stubGlobal('document', document);
    const reverseContext = context(
      'figure2-distance-expand',
      'figure2-animation',
      'figure2-proof-opening',
      false,
      { from: fromElement as unknown as HTMLElement, to: toElement as unknown as HTMLElement },
      -1
    );
    const fromVisibilityWrites: LayerVisibilityState[] = [];
    const toVisibilityWrites: LayerVisibilityState[] = [];
    const setFromVisibility = reverseContext.from.setVisibility.bind(reverseContext.from);
    const setToVisibility = reverseContext.to.setVisibility.bind(reverseContext.to);
    reverseContext.from.setVisibility = (state) => {
      fromVisibilityWrites.push(state);
      setFromVisibility(state);
    };
    reverseContext.to.setVisibility = (state) => {
      toVisibilityWrites.push(state);
      setToVisibility(state);
    };

    await createFigure2DistanceExpandTransition().buildTimeline(reverseContext);

    expect(reverseContext.from.visibility).toMatchObject({ visible: false, opacity: 0 });
    expect(reverseContext.to.visibility).toMatchObject({ visible: true, opacity: 1 });
    expect(fromVisibilityWrites.some((state) => state.visible)).toBe(false);
    expect(toVisibilityWrites.some((state) => !state.visible)).toBe(false);
    expect(toElement.dataset.figure2ProofTransitionProgress).toBe('1.0000');
  });

  it.each([
    ['figure2-proof-opening-cards', 'figure2-proof-opening', 'figure2-proof-cards', createFigure2ProofOpeningCardsTransition],
    ['figure2-proof-cards-closing', 'figure2-proof-cards', 'figure2-proof-closing', createFigure2ProofCardsClosingTransition]
  ] as const)('initializes reverse %s at the forward endpoint', async (segmentId, from, to, create) => {
    const fromElement = new FakeElement();
    const toElement = new FakeElement();
    const reverseContext = context(
      segmentId,
      from,
      to,
      false,
      { from: fromElement as unknown as HTMLElement, to: toElement as unknown as HTMLElement },
      -1
    );
    const fromVisibilityWrites: LayerVisibilityState[] = [];
    const toVisibilityWrites: LayerVisibilityState[] = [];
    const setFromVisibility = reverseContext.from.setVisibility.bind(reverseContext.from);
    const setToVisibility = reverseContext.to.setVisibility.bind(reverseContext.to);
    reverseContext.from.setVisibility = (state) => {
      fromVisibilityWrites.push(state);
      setFromVisibility(state);
    };
    reverseContext.to.setVisibility = (state) => {
      toVisibilityWrites.push(state);
      setToVisibility(state);
    };

    const timeline = await create().buildTimeline(reverseContext);

    expect(reverseContext.from.visibility).toMatchObject({ visible: false, opacity: 0 });
    expect(reverseContext.to.visibility).toMatchObject({ visible: true, opacity: 1 });
    expect(fromElement.style.transform).toBe('translate3d(0, -100%, 0)');
    expect(toElement.style.transform).toBe('');
    expect(fromVisibilityWrites.some((state) => state.visible)).toBe(false);
    expect(toVisibilityWrites.some((state) => !state.visible)).toBe(false);
    expect(timeline.rootIdentity?.()).toEqual({
      from: fromElement,
      to: toElement
    });
  });

  it.each([
    ['figure2-proof-opening-cards', 'figure2-proof-opening', 'figure2-proof-cards', createFigure2ProofOpeningCardsTransition],
    ['figure2-proof-cards-closing', 'figure2-proof-cards', 'figure2-proof-closing', createFigure2ProofCardsClosingTransition]
  ] as const)('verifies %s presentation symmetry and both dispose endpoints', async (segmentId, from, to, create) => {
    const build = () => create().buildTimeline(context(
      segmentId,
      from,
      to,
      false,
      {
        from: new FakeElement() as unknown as HTMLElement,
        to: new FakeElement() as unknown as HTMLElement
      }
    ));
    const main = await build();
    const start = await build();
    const end = await build();

    expect(verifySegmentTimeline(main, {
      policy: segment(segmentId).policy,
      requireStableSceneIdentity: true,
      requirePresentation: true,
      disposeEndpointTimelines: { start, end }
    })).toMatchObject({
      presentationSymmetric: true,
      disposeInvariant: true,
      disposedEndpoints: [0, 1]
    });
    main.dispose();
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
