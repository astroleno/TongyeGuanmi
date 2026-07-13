import { afterEach, describe, expect, it, vi } from 'vitest';
import { storyManifest } from '../story/manifest';
import { verifySegmentTimeline } from '../story/verifySegmentTimeline';
import { CRANE_CONTACT_COPY_CUE, createCraneContactTransition } from './crane-contact';
import { createEducationCraneTransition } from './education-crane';
import {
  CRANE_PLAYBACK_MS,
  CRANE_TIMELINE_DURATION_SECONDS,
  renderCraneAnimationProgress
} from '../scenes/crane-animation';
import type { Direction, LayerHandle, LayerVisibilityState, SceneId, SegmentId, SpineSegmentNode, TransitionContext, TransitionModule } from '../story/types';
import { createBackHalfDomContext, FakeCanvas, FakeElement as FixtureElement } from './__fixtures__/back-half.fixture';

afterEach(() => {
  vi.unstubAllGlobals();
});

class FakeStyle {
  readonly values = new Map<string, string>();
  opacity = '';
  visibility = '';
  pointerEvents = '';
  clipPath = '';
  zIndex = '';

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
  }

  getPropertyValue(name: string): string {
    return this.values.get(name) ?? '';
  }
}

class FakeElement {
  readonly style = new FakeStyle();
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly ownerDocument = { defaultView: { innerHeight: 720 } };
  inert = false;
  private readonly selectors = new Map<string, FakeElement>();

  connect(selector: string, element: FakeElement): void {
    this.selectors.set(selector, element);
  }

  matches(selector: string): boolean {
    return selector === '[data-r4-scene="crane-animation"]' && this.dataset.r4Scene === 'crane-animation';
  }

  querySelector(selector: string): FakeElement | null {
    return this.selectors.get(selector) ?? null;
  }

  querySelectorAll(): FakeElement[] {
    const direct = [...new Set(this.selectors.values())];
    return direct.flatMap((element) => [element, ...element.querySelectorAll()]);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      this.dataset[key] = value;
    }
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      delete this.dataset[key];
    }
  }
}

class FakeVideo extends FakeElement {
  duration = 2.5;
  currentTime = 0;
  paused = true;
  loop = false;
  muted = false;
  playsInline = false;
  playbackRate = 1;
  playCalls = 0;

  get ended(): boolean {
    return this.currentTime >= this.duration - 0.001;
  }

  pause(): void {
    this.paused = true;
  }

  addEventListener(): void {}

  removeEventListener(): void {}

  play(): Promise<void> {
    this.playCalls += 1;
    this.paused = false;
    return Promise.resolve();
  }
}

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

function context(
  segmentId: SegmentId,
  from: SceneId,
  to: SceneId,
  prefersReducedMotion = false,
  direction: Direction = 1
): TransitionContext {
  return {
    segment: segment(segmentId),
    from: layer(from, direction === 1 ? 'current' : 'next'),
    to: layer(to, direction === 1 ? 'next' : 'current'),
    stage: {
      getLayer: () => undefined,
      ensureLayer: (scene, role) => layer(scene, role === 'current' ? 'current' : 'next'),
      releaseLayer: () => undefined,
      snapshot: () => []
    },
    direction,
    runId: 'r4-g7-test:1',
    prepareToken: 'r4-g7-test:prepare:1',
    prefersReducedMotion,
    reportMilestone: () => undefined
  };
}

function layerWithElement(scene: SceneId, role: 'current' | 'next', element: FakeElement): LayerHandle {
  const handle = layer(scene, role);
  return {
    scene,
    role,
    element: element as unknown as HTMLElement,
    get visibility() {
      return handle.visibility;
    },
    setVisibility(next) {
      handle.setVisibility(next);
    },
    dispose() {
      handle.dispose();
    }
  };
}

function craneContactDomContext(direction: Direction = 1): {
  context: TransitionContext;
  craneLayer: LayerHandle;
  contactLayer: LayerHandle;
  craneRoot: FakeElement;
  contactRoot: FakeElement;
  figureVideo: FakeVideo;
  flockVideo: FakeVideo;
} {
  const craneLayerElement = new FakeElement();
  const contactLayerElement = new FakeElement();
  const craneRoot = new FakeElement();
  const contactRoot = new FakeElement();
  const figureVideo = new FakeVideo();
  const flockVideo = new FakeVideo();
  craneRoot.dataset.r4Scene = 'crane-animation';
  contactRoot.dataset.r4Scene = 'contact';

  craneLayerElement.connect('[data-r4-scene="crane-animation"]', craneRoot);
  contactLayerElement.connect('[data-r4-scene="contact"]', contactRoot);
  craneRoot.connect('[data-crane-figure-video]', figureVideo);
  craneRoot.connect('[data-crane-figure-front-video]', flockVideo);
  for (const selector of [
    '.crane-layer--cloud-back',
    '.crane-layer--arch',
    '.crane-layer--cloud-front-second',
    '.crane-layer--cloud-front'
  ]) {
    craneRoot.connect(selector, new FakeElement());
  }

  const craneLayer = layerWithElement('crane-animation', direction === 1 ? 'current' : 'next', craneLayerElement);
  const contactLayer = layerWithElement('contact', direction === 1 ? 'next' : 'current', contactLayerElement);
  const transitionContext: TransitionContext = {
    ...context('crane-contact', 'crane-animation', 'contact', false, direction),
    from: craneLayer,
    to: contactLayer
  };

  return {
    context: transitionContext,
    craneLayer,
    contactLayer,
    craneRoot,
    contactRoot,
    figureVideo,
    flockVideo
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
    id: 'education-crane',
    from: 'education',
    to: 'crane-animation',
    create: createEducationCraneTransition
  },
  {
    id: 'crane-contact',
    from: 'crane-animation',
    to: 'contact',
    create: createCraneContactTransition,
    copyCueAtProgress: CRANE_CONTACT_COPY_CUE.atProgress
  }
];

describe('R4 group7 transitions', () => {
  it('lets the main Crane video natural alpha own transparency while active', () => {
    const root = new FakeElement();
    root.dataset.r4Scene = 'crane-animation';

    expect(renderCraneAnimationProgress(root as unknown as HTMLElement, 0).videoOpacity).toBe(0);
    expect(renderCraneAnimationProgress(root as unknown as HTMLElement, 0.22).videoOpacity).toBe(1);
    expect(renderCraneAnimationProgress(root as unknown as HTMLElement, 0.4).videoOpacity).toBe(1);
    expect(renderCraneAnimationProgress(root as unknown as HTMLElement, 0.8).videoOpacity).toBe(1);
  });

  it('builds reverse Crane-to-Contact directly at p=1', async () => {
    const fixture = craneContactDomContext(-1);
    const fromVisibilityWrites: LayerVisibilityState[] = [];
    const toVisibilityWrites: LayerVisibilityState[] = [];
    const setFromVisibility = fixture.context.from.setVisibility.bind(fixture.context.from);
    const setToVisibility = fixture.context.to.setVisibility.bind(fixture.context.to);
    fixture.context.from.setVisibility = (state) => {
      fromVisibilityWrites.push(state);
      setFromVisibility(state);
    };
    fixture.context.to.setVisibility = (state) => {
      toVisibilityWrites.push(state);
      setToVisibility(state);
    };

    await createCraneContactTransition().buildTimeline(fixture.context);

    expect(fixture.context.from.visibility).toMatchObject({ visible: false, opacity: 0 });
    expect(fixture.context.to.visibility).toMatchObject({ visible: true, opacity: 1 });
    expect(fromVisibilityWrites.some((state) => state.visible)).toBe(false);
    expect(toVisibilityWrites.some((state) => !state.visible)).toBe(false);
    expect(fixture.figureVideo.currentTime).toBeCloseTo(2.499, 3);
    expect(fixture.flockVideo.currentTime).toBeCloseTo(2.499, 3);
  });

  it('settles reverse Crane-to-Contact reduced motion at the forward start', async () => {
    const reverseContext = context('crane-contact', 'crane-animation', 'contact', true, -1);

    await createCraneContactTransition().reducedMotionFallback?.(reverseContext);

    expect(reverseContext.from.visibility).toMatchObject({ visible: true, opacity: 1 });
    expect(reverseContext.to.visibility).toMatchObject({ visible: false, opacity: 0 });
  });

  it('keeps Education and the initial Crane frame motionless during their Ink handoff', async () => {
    const fixture = createBackHalfDomContext('education-crane', 'education', 'crane-animation');
    const canvas = new FakeCanvas();
    for (const selector of [
      '.crane-layer--cloud-back',
      '.crane-layer--arch',
      '.crane-layer--cloud-front-second',
      '.crane-layer--cloud-front'
    ]) {
      fixture.toRoot.connect(selector, new FixtureElement());
    }
    vi.stubGlobal('document', { createElement: () => canvas });
    const timeline = await createEducationCraneTransition().buildTimeline(fixture.context);

    timeline.progress(0.25);
    const educationY = fixture.fromRoot.style.getPropertyValue('--r4-education-y');
    const craneProgress = fixture.toRoot.dataset.craneProgress;
    timeline.progress(0.75);

    expect(educationY).toBe('0.00px');
    expect(fixture.fromRoot.style.getPropertyValue('--r4-education-y')).toBe(educationY);
    expect(fixture.fromRoot.style.getPropertyValue('--r4-education-opacity')).toBe('1.0000');
    expect(craneProgress).toBe('0.0000');
    expect(fixture.toRoot.dataset.craneProgress).toBe(craneProgress);
    const receiver = fixture.stage.children[1]!;
    expect(receiver.style.clipPath).toMatch(/^polygon\(/);
    expect(receiver.style.clipPath).not.toContain('inset(');
    expect(receiver.dataset.r4InkBoundaryKind).toBe('horizontal');
    expect(receiver.dataset.r4InkBoundaryRevision).toMatch(/^horizontal-ink-contour-v2-/);
    expect(canvas.dataset.r4InkBoundaryRevision).toBe(receiver.dataset.r4InkBoundaryRevision);
    expect(receiver.dataset.r4InkContourThreshold).toBe(canvas.dataset.r4InkContourThreshold);
  });

  it('advances every Crane frame on the shared timeline while Contact starts at the 80% cue', async () => {
    const fixture = craneContactDomContext();
    const craneSegment = segment('crane-contact');
    const transition = createCraneContactTransition();
    const timeline = await transition.buildTimeline(fixture.context);

    expect(CRANE_PLAYBACK_MS).toBe(3000);
    expect(CRANE_TIMELINE_DURATION_SECONDS).toBe(3);
    expect(craneSegment.virtualDuration).toBe(CRANE_PLAYBACK_MS);
    timeline.progress(0.25);
    expect(fixture.figureVideo.currentTime).toBeGreaterThan(0);
    expect(fixture.flockVideo.currentTime).toBeGreaterThan(0);
    expect(fixture.figureVideo.playCalls).toBe(0);
    expect(fixture.flockVideo.playCalls).toBe(0);
    expect(fixture.craneRoot.dataset.cranePlaybackActive).toBe('true');
    expect(transition.mediaPlayback?.[0]?.forward.mode).toBe('timeline');
    expect(craneSegment.mediaPlayback?.[0]?.forward.mode).toBe('timeline');
    expect(transition.mediaPlayback?.[0]?.reverse).toEqual({ mode: 'timeline', required: true });
    expect(craneSegment.mediaPlayback?.[0]?.reverse).toEqual({ mode: 'timeline', required: true });

    timeline.progress(0.8);
    expect(fixture.figureVideo.currentTime).toBeLessThan(2.499);
    expect(fixture.flockVideo.currentTime).toBeLessThan(2.499);
    expect(fixture.figureVideo.paused).toBe(true);
    expect(fixture.flockVideo.paused).toBe(true);
    expect(fixture.craneRoot.dataset.cranePlaybackActive).toBe('true');
    expect(timeline.sample?.(0.8)).toMatchObject({
      from: { visible: true, opacity: 1 },
      to: { visible: true, opacity: 1 },
      copyCueActive: true
    });

    timeline.progress(1);
    expect(fixture.figureVideo.currentTime).toBeCloseTo(2.499, 3);
    expect(fixture.flockVideo.currentTime).toBeCloseTo(2.499, 3);
    expect(fixture.figureVideo.paused).toBe(true);
    expect(fixture.flockVideo.paused).toBe(true);
  });

  it('keeps Contact hidden until 80%, then reveals complete copy over a linear background ramp', async () => {
    const fixture = craneContactDomContext();
    const timeline = await createCraneContactTransition().buildTimeline(fixture.context);

    timeline.progress(0.72);
    expect(fixture.contactLayer.visibility.visible).toBe(false);
    expect(fixture.contactLayer.element?.style.getPropertyValue('--r4-handoff-paper-alpha')).toBe('0.0000');

    timeline.progress(0.74);
    expect(fixture.contactLayer.visibility.visible).toBe(false);
    expect(fixture.contactLayer.element?.style.getPropertyValue('--r4-handoff-paper-alpha')).toBe('0.0000');
    expect(fixture.contactRoot.style.getPropertyValue('--r4-contact-opacity')).toBe('0.0000');

    timeline.progress(0.8);
    expect(fixture.contactLayer.visibility.visible).toBe(true);
    expect(fixture.contactLayer.element?.style.getPropertyValue('--r4-handoff-paper-alpha')).toBe('0.0000');
    expect(fixture.contactRoot.style.getPropertyValue('--r4-contact-opacity')).toBe('1.0000');
    expect(fixture.contactRoot.style.getPropertyValue('--r4-contact-y')).toBe('0.00px');
    expect(fixture.contactLayer.element?.dataset.copyCueActive).toBe('true');

    timeline.progress(0.9);
    expect(fixture.contactLayer.element?.style.getPropertyValue('--r4-handoff-paper-alpha')).toBe('0.5000');

    timeline.progress(1);
    expect(fixture.craneLayer.visibility.visible).toBe(false);
    expect(fixture.contactLayer.visibility.visible).toBe(true);
    expect(fixture.contactLayer.element?.style.getPropertyValue('--r4-handoff-paper-alpha')).toBe('1.0000');
    expect(fixture.contactRoot.style.getPropertyValue('--r4-contact-opacity')).toBe('1.0000');
  });

  it('fires the Contact cue at 80% of elapsed time and keeps the background ramp linear', async () => {
    let nextFrame: FrameRequestCallback | undefined;
    let frameId = 0;
    vi.stubGlobal('performance', { now: () => 0 });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      nextFrame = callback;
      frameId += 1;
      return frameId;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);

    const fixture = craneContactDomContext();
    const timeline = await createCraneContactTransition().buildTimeline(fixture.context);
    const playback = timeline.play(1);

    nextFrame?.(1_850);
    expect(fixture.contactLayer.element?.dataset.copyCueActive).toBe('false');
    expect(fixture.contactLayer.element?.style.getPropertyValue('--r4-handoff-paper-alpha')).toBe('0.0000');

    nextFrame?.(2_310);
    expect(fixture.contactLayer.element?.style.getPropertyValue('--r4-handoff-paper-alpha')).toBe('0.0000');
    expect(fixture.contactLayer.element?.style.getPropertyValue('--r4-handoff-wash-alpha')).toBe('0.0000');
    expect(fixture.contactLayer.element?.dataset.copyCueActive).toBe('false');

    nextFrame?.(2_400);
    expect(fixture.contactLayer.element?.dataset.copyCueActive).toBe('true');
    expect(fixture.contactLayer.element?.style.getPropertyValue('--r4-handoff-paper-alpha')).toBe('0.0000');
    expect(fixture.contactRoot.style.getPropertyValue('--r4-contact-opacity')).toBe('1.0000');

    nextFrame?.(2_700);
    expect(fixture.contactLayer.element?.style.getPropertyValue('--r4-handoff-paper-alpha')).toBe('0.5000');
    expect(fixture.contactLayer.element?.style.getPropertyValue('--r4-handoff-wash-alpha')).toBe('0.5000');

    nextFrame?.(3_000);
    await playback;
  });

  it('reverses crane media continuously instead of holding the end frame then jumping to zero', async () => {
    const fixture = craneContactDomContext();
    const timeline = await createCraneContactTransition().buildTimeline(fixture.context);
    expect(timeline.rootIdentity?.()).toEqual({
      from: fixture.craneLayer.element,
      to: fixture.contactLayer.element
    });
    timeline.progress(0.2);
    timeline.progress(0.5);
    const forwardFigureAtHalf = fixture.figureVideo.currentTime;
    const forwardFlockAtHalf = fixture.flockVideo.currentTime;
    timeline.progress(0.72);
    timeline.progress(1);
    const figurePlayCalls = fixture.figureVideo.playCalls;
    const flockPlayCalls = fixture.flockVideo.playCalls;
    expect(fixture.contactLayer.visibility.visible).toBe(true);
    expect(fixture.contactLayer.element?.style.getPropertyValue('--r4-handoff-paper-alpha')).toBe('1.0000');
    expect(fixture.contactRoot.style.getPropertyValue('--r4-contact-opacity')).toBe('1.0000');

    timeline.progress(0.8);
    expect(fixture.contactLayer.visibility.visible).toBe(true);
    expect(fixture.contactLayer.element?.style.getPropertyValue('--r4-handoff-paper-alpha')).toBe('0.0000');
    expect(fixture.contactRoot.style.getPropertyValue('--r4-contact-opacity')).toBe('1.0000');

    timeline.progress(0.74);
    expect(fixture.contactLayer.visibility.visible).toBe(false);
    expect(fixture.contactLayer.element?.style.getPropertyValue('--r4-handoff-paper-alpha')).toBe('0.0000');
    expect(fixture.contactRoot.style.getPropertyValue('--r4-contact-opacity')).toBe('0.0000');

    timeline.progress(0.72);
    expect(fixture.contactLayer.visibility.visible).toBe(false);
    expect(fixture.figureVideo.currentTime).toBeGreaterThan(0);
    expect(fixture.figureVideo.currentTime).toBeLessThan(2.499);
    expect(fixture.flockVideo.currentTime).toBeGreaterThan(0);
    expect(fixture.flockVideo.currentTime).toBeLessThan(2.499);
    timeline.progress(0.5);
    expect(fixture.figureVideo.playCalls).toBe(figurePlayCalls);
    expect(fixture.flockVideo.playCalls).toBe(flockPlayCalls);
    expect(fixture.figureVideo.currentTime).toBeCloseTo(forwardFigureAtHalf, 3);
    expect(fixture.flockVideo.currentTime).toBeCloseTo(forwardFlockAtHalf, 3);
    expect(fixture.craneRoot.dataset.cranePlaybackDirection).toBe('-1');
    timeline.progress(0);
    expect(fixture.figureVideo.currentTime).toBe(0);
    expect(fixture.flockVideo.currentTime).toBe(0);
  });

  it('preserves Crane and Contact presentation when disposing independently at both endpoints', async () => {
    const build = async () => {
      const fixture = craneContactDomContext();
      return createCraneContactTransition().buildTimeline(fixture.context);
    };
    const main = await build();
    const start = await build();
    const end = await build();

    expect(verifySegmentTimeline(main, {
      policy: segment('crane-contact').policy,
      copyCueAtProgress: CRANE_CONTACT_COPY_CUE.atProgress,
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

  for (const item of cases) {
    it(`verifies ${item.id} timeline and reduced-motion fallback`, async () => {
      const transition = item.create();
      const timeline = await transition.buildTimeline(context(item.id, item.from, item.to));
      const options = item.copyCueAtProgress === undefined
        ? { policy: segment(item.id).policy }
        : { policy: segment(item.id).policy, copyCueAtProgress: item.copyCueAtProgress };

      expect(transition.reducedMotionFallback).toBeTypeOf('function');
      expect(verifySegmentTimeline(timeline, options)).toMatchObject({
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
