import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { phoneManifest, phonePreparedSurfaceIds, phoneSceneById,
  type PhoneSceneId, type PhoneSegmentId } from './manifest';
import {
  createPhonePresentation,
  type PhoneLeafCommandHandle,
  type PhoneLeafMountLease,
  type PhoneLeafReportBinding,
  type PhonePlaneRequest,
  type PhonePresentationDependencies
} from './presentation';
import type {
  PhoneAttemptKey, PhoneEvidenceSlot, PhoneFinalEvidenceKind,
  PhoneLayoutViewport, PhonePreparedEvidenceKind, PhoneVisualViewport,
  PhoneViewportSnapshot
} from './protocol';

function createNoopPhoneLeafCommandHandle(): PhoneLeafCommandHandle {
  return Object.freeze({
    rebind: () => undefined,
    activate: ({ invocationId, surfaceIds }) => ({
      invocationId, surfaceIds, invoked: true,
      settlements: surfaceIds.map((surfaceId) => ({ surfaceId, status: 'fulfilled' }))
    }),
    render: () => undefined, settle: () => undefined,
    pause: () => undefined, dispose: () => undefined
  });
}

type Rect = Readonly<{
  left: number; top: number; right: number; bottom: number;
  width: number; height: number;
}>;

type FakeElementState = {
  name: string;
  connected: boolean;
  parent: HTMLElement | null;
  children: HTMLElement[];
  rect: Rect;
  selectors: Map<string, HTMLElement>;
  attributes: Map<string, string>;
  properties: Map<string, string>;
};

const elementStates = new WeakMap<HTMLElement, FakeElementState>();

function rect(left = 0, top = 0, width = 390, height = 844): Rect {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

function fakeElement(name: string, bounds = rect()): HTMLElement {
  const properties = new Map<string, string>();
  const attributes = new Map<string, string>();
  const state: FakeElementState = {
    name, connected: true, parent: null, children: [], rect: bounds,
    selectors: new Map(), attributes, properties
  };
  const element = {
    get isConnected() { return state.connected; },
    get parentElement() { return state.parent; },
    get children() { return state.children; },
    style: {
      getPropertyValue: (property: string) => properties.get(property) ?? '',
      removeProperty: (property: string) => properties.delete(property),
      setProperty: (property: string, value: string) => { properties.set(property, value); }
    },
    classList: { contains: (value: string) => name === value },
    contains: (candidate: HTMLElement | null) => {
      for (let current = candidate; current; current = elementStates.get(current)?.parent ?? null) {
        if (current === element) return true;
      }
      return false;
    },
    getAttribute: (attribute: string) => attributes.get(attribute) ?? null,
    getBoundingClientRect: () => state.rect,
    hasAttribute: (attribute: string) => attributes.has(attribute),
    querySelector: (selector: string) => state.selectors.get(selector) ?? null,
    removeAttribute: (attribute: string) => attributes.delete(attribute),
    setAttribute: (attribute: string, value: string) => { attributes.set(attribute, value); },
    toggleAttribute: (attribute: string, force?: boolean) => {
      const enabled = force ?? !attributes.has(attribute);
      if (enabled) attributes.set(attribute, ''); else attributes.delete(attribute);
      return enabled;
    }
  } as unknown as HTMLElement;
  elementStates.set(element, state);
  return element;
}

function append(parent: HTMLElement, child: HTMLElement): void {
  const parentState = elementStates.get(parent);
  const childState = elementStates.get(child);
  if (!parentState || !childState) throw new Error('unknown fake element');
  childState.parent = parent;
  parentState.children.push(child);
}

function select(parent: HTMLElement, selector: string, child: HTMLElement): void {
  elementStates.get(parent)?.selectors.set(selector, child);
}

function setRect(element: HTMLElement, bounds: Rect): void {
  const state = elementStates.get(element);
  if (state) state.rect = bounds;
}

function setConnected(element: HTMLElement, connected: boolean): void {
  const state = elementStates.get(element);
  if (state) state.connected = connected;
}

function computedStyle(overrides: Partial<CSSStyleDeclaration> = {}): CSSStyleDeclaration {
  return {
    backgroundColor: 'rgba(0, 0, 0, 0)', clip: 'auto', clipPath: 'none',
    content: 'none', display: 'block', isolation: 'auto', opacity: '1',
    overflow: 'visible', pointerEvents: 'none', position: 'relative',
    transform: 'none', visibility: 'visible', zIndex: 'auto',
    ...overrides
  } as CSSStyleDeclaration;
}

type StoryFixture = ReturnType<typeof createStoryFixture>;

function createStoryFixture(layout: PhoneLayoutViewport = {
  width: 390, height: 844, orientation: 'portrait'
}, visual: PhoneVisualViewport = {
  offsetLeft: 0, offsetTop: 0, width: 390, height: 844, scale: 1
}) {
  const story = fakeElement('phone-story');
  const viewport = fakeElement('phone-story__viewport');
  const coverage = fakeElement('phone-story__coverage');
  const planes = fakeElement('phone-story__planes');
  const source = fakeElement('source');
  const effect = fakeElement('effect');
  const receiver = fakeElement('receiver');
  const reading = fakeElement('phone-story__reading-flow');
  append(story, viewport);
  append(viewport, coverage);
  append(viewport, planes);
  append(planes, source);
  append(planes, effect);
  append(planes, receiver);
  append(story, reading);
  select(story, '.phone-story__viewport', viewport);
  select(story, '.phone-story__coverage', coverage);
  select(story, '.phone-story__planes', planes);
  select(story, '[data-phone-plane="source"]', source);
  select(story, '[data-phone-plane="effect"]', effect);
  select(story, '[data-phone-plane="receiver"]', receiver);
  select(story, '.phone-story__reading-flow', reading);
  const styleMap = new WeakMap<HTMLElement, CSSStyleDeclaration>();
  const pseudoMap = new WeakMap<HTMLElement, Map<string, CSSStyleDeclaration>>();
  styleMap.set(story, computedStyle({ isolation: 'isolate', position: 'relative' }));
  styleMap.set(viewport, computedStyle({ isolation: 'isolate', position: 'fixed' }));
  styleMap.set(coverage, computedStyle({ backgroundColor: 'rgb(7, 17, 14)', zIndex: '0' }));
  styleMap.set(planes, computedStyle({ isolation: 'isolate', zIndex: '1' }));
  styleMap.set(source, computedStyle({ zIndex: '10' }));
  styleMap.set(effect, computedStyle({ zIndex: '20' }));
  styleMap.set(receiver, computedStyle({ zIndex: '30' }));
  styleMap.set(reading, computedStyle({ zIndex: '50', pointerEvents: 'auto' }));
  let hitStack: readonly HTMLElement[] = [receiver, planes, viewport, story];
  let currentLayout = layout;
  let currentVisual = visual;
  const dependencies: PhonePresentationDependencies = {
    sampleLayoutViewport: () => currentLayout,
    sampleVisualViewport: () => currentVisual,
    getComputedStyle: (element, pseudo) => pseudo
      ? pseudoMap.get(element)?.get(pseudo) ?? computedStyle()
      : styleMap.get(element) ?? computedStyle(),
    elementsFromPoint: () => hitStack
  };
  return {
    story, viewport, coverage, planes, source, effect, receiver, reading,
    dependencies,
    presentation: createPhonePresentation(dependencies),
    setHitStack: (stack: readonly HTMLElement[]) => { hitStack = stack; },
    setLayout: (next: PhoneLayoutViewport) => { currentLayout = next; },
    setPseudoStyle: (element: HTMLElement, pseudo: string, style: CSSStyleDeclaration) => {
      const styles = pseudoMap.get(element) ?? new Map<string, CSSStyleDeclaration>();
      styles.set(pseudo, style);
      pseudoMap.set(element, styles);
    },
    setStyle: (element: HTMLElement, style: CSSStyleDeclaration) => styleMap.set(element, style),
    setVisual: (next: PhoneVisualViewport) => { currentVisual = next; }
  };
}

function surfaceKind(id: string): 'dom' | 'image' | 'video' | 'canvas-2d' | 'canvas-webgl' {
  if (id.includes('video')) return 'video';
  if (id.includes('image') || id.includes('poster') || id.includes('arch')) return 'image';
  if (['star-map-canvas', 'hero-intro-ink', 'figure3-paper-canvas'].includes(id)) {
    return 'canvas-2d';
  }
  if (id.includes('canvas')) return 'canvas-webgl';
  return 'dom';
}

function attemptFor(
  sceneId: PhoneSceneId,
  mode: PhoneAttemptKey['mode'] = 'boot',
  segmentId: PhoneSegmentId | null = null,
  direction: PhoneAttemptKey['direction'] = null,
  generation = 1
): PhoneAttemptKey<PhoneSceneId, PhoneSegmentId> {
  return {
    authorityId: 'presentation-authority',
    transactionId: `presentation:${generation}:${mode}:${sceneId}:${segmentId ?? 'entry'}`,
    transactionGeneration: generation,
    mode,
    sceneId,
    segmentId,
    direction
  };
}

function viewportSnapshot(
  layout: PhoneLayoutViewport = { width: 390, height: 844, orientation: 'portrait' },
  visual: PhoneVisualViewport = {
    offsetLeft: 0, offsetTop: 0, width: 390, height: 844, scale: 1
  }
): PhoneViewportSnapshot {
  return { layout, visual, layoutRevision: 1, visualRevision: 1, supported: true };
}

const finalKinds: readonly PhoneFinalEvidenceKind[] = [
  'plane-acknowledged', 'content-visible', 'frame-visible',
  'coverage-visible', 'landing-confirmed', 'scroll-confirmed'
];

function slotsFor(
  attempt: PhoneAttemptKey<PhoneSceneId, PhoneSegmentId>,
  leg: 'source' | 'target' | 'rollback',
  planeRevision = 1,
  kinds: readonly PhoneFinalEvidenceKind[] = finalKinds
): readonly PhoneEvidenceSlot[] {
  return kinds.map((kind) => ({
    attempt, stageIndex: 0, leg, kind, surfaceId: null, planeRevision
  }));
}

function planeRequest(
  sceneId: PhoneSceneId,
  attempt = attemptFor(sceneId),
  leg: 'source' | 'target' | 'rollback' = 'target',
  kinds: readonly PhoneFinalEvidenceKind[] = finalKinds,
  planeRevision = 1,
  viewport = viewportSnapshot()
): PhonePlaneRequest {
  return {
    attempt, stageIndex: 0, leg, sceneId, planeRevision,
    viewport, required: slotsFor(attempt, leg, planeRevision, kinds),
    progress: attempt.direction === 'reverse' ? 1 : 0,
    loaderCovered: attempt.mode === 'boot', interactionEnabled: false
  };
}

function registerScene(
  fixture: StoryFixture,
  sceneId: PhoneSceneId,
  attempt = attemptFor(sceneId),
  leg: 'source' | 'target' | 'rollback' = 'target'
): Readonly<{
  lease: PhoneLeafMountLease; root: HTMLElement; content: HTMLElement;
  binding: PhoneLeafReportBinding; surfaces: ReadonlyMap<string, HTMLElement>;
}> {
  const scene = phoneSceneById(sceneId);
  const plane = leg === 'target' ? fixture.receiver : fixture.source;
  const root = fakeElement(`root:${sceneId}`);
  const content = fakeElement(`content:${sceneId}`, rect(20, 20, 200, 200));
  append(plane, root);
  append(root, content);
  for (const selector of scene.content.selectors) select(root, selector, content);
  const landingSelector = scene.landing.anchor.startsWith('#')
    || scene.landing.anchor.startsWith('[') ? scene.landing.anchor
      : `[data-phone-landing="${scene.landing.anchor}"]`;
  select(root, landingSelector, content);
  const surfaceElements = new Map<string, HTMLElement>();
  const surfaces = scene.surfaces.map((id) => {
    const element = fakeElement(id, rect(0, 0, 390, 844));
    append(root, element);
    surfaceElements.set(id, element);
    return { id, element, kind: surfaceKind(id) };
  });
  const allowedReports = scene.directEntry.closure.exposeReceiverAfter;
  const binding: PhoneLeafReportBinding = {
    attempt, stageIndex: 0, leg, allowedReports,
    allowedSurfaceIds: scene.surfaces, planeRevision: 1
  };
  const lease = fixture.presentation.registerLeafMount({
    binding,
    registration: { root, surfaces, commands: createNoopPhoneLeafCommandHandle() }
  });
  fixture.setHitStack([content, root, plane, fixture.planes, fixture.viewport, fixture.story]);
  for (const kind of allowedReports) {
    if (!['image-decoded', 'video-decoded', 'canvas-drawn', 'static-ready'].includes(kind)) continue;
    for (const surfaceId of phonePreparedSurfaceIds(sceneId, kind as PhonePreparedEvidenceKind)) {
      if (!surfaceId) continue;
      fixture.presentation.verifyPrepared({
        binding, lease,
        fact: { surfaceId, report: { kind, token: `${sceneId}:${kind}:${surfaceId}`, ready: true } }
      });
    }
  }
  return { lease, root, content, binding, surfaces: surfaceElements };
}

describe('phone presentation semantic plane', () => {
  it('applies the documented stack in both directions of all 15 segments', () => {
    for (const segment of phoneManifest.segments) {
      for (const direction of ['forward', 'reverse'] as const) {
        const fixture = createStoryFixture();
        fixture.presentation.attachRoot(fixture.story);
        const leg = segment[direction];
        const attempt = attemptFor(leg.target, 'segment', segment.id, direction);
        registerScene(fixture, leg.target, attempt);
        fixture.setStyle(fixture.effect, computedStyle({
          zIndex: segment.effectPlacement === 'between' ? '20' : '40'
        }));
        const result = fixture.presentation.applyPlane(planeRequest(
          leg.target, attempt, 'target', ['plane-acknowledged']
        ));
        expect(result.failure, `${segment.id}:${direction}`).toBeNull();
        expect(result.records).toHaveLength(1);
        expect(fixture.source.style.getPropertyValue('--phone-plane-z')).toBe('10');
        expect(fixture.effect.style.getPropertyValue('--phone-plane-z')).toBe(
          segment.effectPlacement === 'between' ? '20' : '40'
        );
        expect(fixture.receiver.style.getPropertyValue('--phone-plane-z')).toBe('30');
      }
    }
  });

  it.each([
    ['between above receiver', 'figure3-services', '40'],
    ['above-both below receiver', 'hero-pattern', '20']
  ] as const)('rejects %s', (_label, segmentId, effectZ) => {
    const fixture = createStoryFixture();
    fixture.presentation.attachRoot(fixture.story);
    const segment = phoneManifest.segments.find(({ id }) => id === segmentId);
    if (!segment) throw new Error('missing segment fixture');
    const attempt = attemptFor(segment.forward.target, 'segment', segment.id, 'forward');
    registerScene(fixture, segment.forward.target, attempt);
    fixture.setStyle(fixture.effect, computedStyle({ zIndex: effectZ }));
    expect(fixture.presentation.applyPlane(planeRequest(
      segment.forward.target, attempt, 'target', ['plane-acknowledged']
    )).failure?.code).toBe('presentation-stack-invalid');
  });

  it('rejects undocumented stacking parents and descendant z-index escape attempts', () => {
    const fixture = createStoryFixture();
    fixture.presentation.attachRoot(fixture.story);
    const { content } = registerScene(fixture, 'pattern');
    fixture.setStyle(content, computedStyle({ zIndex: '9999' }));
    fixture.setStyle(fixture.receiver, computedStyle({ zIndex: '5' }));
    expect(fixture.presentation.applyPlane(planeRequest(
      'pattern', attemptFor('pattern'), 'target', ['plane-acknowledged']
    )).failure?.code).toBe('presentation-stack-invalid');
    elementStates.get(fixture.effect)!.parent = fixture.viewport;
    expect(fixture.presentation.applyPlane(planeRequest(
      'pattern', attemptFor('pattern'), 'target', ['plane-acknowledged']
    )).failure?.code).toBe('presentation-stack-invalid');
    elementStates.get(fixture.effect)!.parent = fixture.planes;
    fixture.setStyle(fixture.receiver, computedStyle({ zIndex: '30' }));
    elementStates.get(fixture.coverage)!.parent = fixture.story;
    expect(fixture.presentation.applyPlane(planeRequest(
      'pattern', attemptFor('pattern'), 'target', ['plane-acknowledged']
    )).failure?.code).toBe('presentation-stack-invalid');
  });

  it('rejects opaque siblings and pseudo-elements above the active scene', () => {
    const fixture = createStoryFixture();
    fixture.presentation.attachRoot(fixture.story);
    const { root, content } = registerScene(fixture, 'pattern');
    const occluder = fakeElement('opaque-sibling', rect(0, 0, 390, 844));
    append(fixture.planes, occluder);
    fixture.setStyle(occluder, computedStyle({ backgroundColor: 'rgb(0, 0, 0)', zIndex: '45' }));
    fixture.setHitStack([content, root, fixture.receiver]);
    expect(fixture.presentation.verifyVisibleCandidate(planeRequest('pattern')).failure?.code)
      .toBe('presentation-content-occluded');
    fixture.setHitStack([content, root, fixture.receiver]);
    fixture.setPseudoStyle(fixture.source, '::after', computedStyle({
      backgroundColor: 'rgb(0, 0, 0)', content: '""', position: 'absolute', zIndex: '45'
    }));
    expect(fixture.presentation.verifyVisibleCandidate(planeRequest('pattern')).failure?.code)
      .toBe('presentation-content-occluded');
  });

  it('proves pointer-inert visual content without requiring it in the hit-test stack', () => {
    const fixture = createStoryFixture();
    fixture.presentation.attachRoot(fixture.story);
    registerScene(fixture, 'pattern');
    fixture.setHitStack([fixture.reading, fixture.story]);
    expect(fixture.presentation.verifyVisibleCandidate(planeRequest('pattern')).failure)
      .toBeNull();
  });

  it('rejects a plane revision assembled from mixed attempts', () => {
    const fixture = createStoryFixture();
    fixture.presentation.attachRoot(fixture.story);
    registerScene(fixture, 'pattern');
    const request = planeRequest('pattern');
    const other = attemptFor('pattern', 'boot', null, null, 2);
    const mixed: PhonePlaneRequest = {
      ...request,
      required: [...request.required.slice(0, -1), slotsFor(other, 'target', 1).at(-1)!]
    };
    expect(fixture.presentation.verifyVisibleCandidate(mixed).failure?.code)
      .toBe('presentation-proof-identity-invalid');
  });

  it('keeps visual endpoints inert through candidate exposure and leaves reading interaction disabled', () => {
    const fixture = createStoryFixture();
    fixture.presentation.attachRoot(fixture.story);
    const { lease, root, binding } = registerScene(fixture, 'pattern');
    const prepared = fixture.presentation.verifyPrepared({ binding, lease, fact: null });
    expect(prepared.records.map(({ slot }) => slot.kind)).toEqual(expect.arrayContaining([
      'root-connected', 'layout-measurable', 'resource-budget-valid'
    ]));
    expect(fixture.receiver.getAttribute('data-phone-exposed')).not.toBe('true');
    const result = fixture.presentation.verifyVisibleCandidate(planeRequest('pattern'));
    expect(result.failure).toBeNull();
    expect(fixture.receiver.getAttribute('data-phone-exposed')).toBe('true');
    expect(fixture.source.getAttribute('data-phone-retained')).toBe('true');
    expect(root.getAttribute('aria-hidden')).toBe('true');
    expect(root.hasAttribute('inert')).toBe(true);
    expect(fixture.reading.getAttribute('aria-hidden')).toBe('false');
    expect(fixture.story.getAttribute('data-phone-interaction')).toBe('disabled');
  });

  it('re-proves rollback from the retained source plane instead of exposing the receiver', () => {
    const fixture = createStoryFixture();
    fixture.presentation.attachRoot(fixture.story);
    const attempt = attemptFor('pattern', 'rollback');
    registerScene(fixture, 'pattern', attempt, 'rollback');
    const result = fixture.presentation.verifyRollback(
      planeRequest('pattern', attempt, 'rollback')
    );
    expect(result.failure).toBeNull();
    expect(fixture.source.getAttribute('data-phone-exposed')).toBe('true');
    expect(fixture.receiver.getAttribute('data-phone-exposed')).toBe('false');
  });
});

describe('phone presentation viewport and coverage', () => {
  it('preserves all layout and visual viewport fields, including fractional zoomed offsets', () => {
    const layout: PhoneLayoutViewport = { width: 844, height: 390, orientation: 'landscape' };
    const visual: PhoneVisualViewport = {
      offsetLeft: 0.5, offsetTop: 17.25, width: 700.5, height: 340.75, scale: 1.75
    };
    const fixture = createStoryFixture(layout, visual);
    expect(fixture.presentation.sampleLayoutViewport()).toEqual(layout);
    expect(fixture.presentation.sampleVisualViewport()).toEqual(visual);
    fixture.setVisual({ ...visual, offsetLeft: 0, offsetTop: 0 });
    expect(fixture.presentation.sampleVisualViewport()).toMatchObject({
      offsetLeft: 0, offsetTop: 0, scale: 1.75
    });
  });

  it.each([
    { offsetLeft: 0, offsetTop: 0, width: 390, height: 844, scale: 1 },
    { offsetLeft: 0.25, offsetTop: 21.5, width: 389.5, height: 700.25, scale: 1.25 },
    { offsetLeft: 31, offsetTop: 0, width: 780, height: 390, scale: 2 }
  ])('proves four-edge coverage for $offsetLeft/$offsetTop at scale $scale', (visual) => {
    const layout: PhoneLayoutViewport = visual.width > visual.height
      ? { width: 844, height: 390, orientation: 'landscape' }
      : { width: 390, height: 844, orientation: 'portrait' };
    const fixture = createStoryFixture(layout, visual);
    const liveRect = rect(visual.offsetLeft, visual.offsetTop, visual.width, visual.height);
    setRect(fixture.coverage, liveRect);
    setRect(fixture.receiver, liveRect);
    fixture.presentation.attachRoot(fixture.story);
    registerScene(fixture, 'pattern');
    const result = fixture.presentation.verifyVisibleCandidate(planeRequest(
      'pattern', attemptFor('pattern'), 'target', finalKinds, 1,
      viewportSnapshot(layout, visual)
    ));
    expect(result.failure).toBeNull();
    expect(result.records.some(({ slot }) => slot.kind === 'coverage-visible')).toBe(true);
    expect(fixture.story.style.getPropertyValue('--phone-visual-offset-left')).toBe(`${visual.offsetLeft}px`);
    expect(fixture.story.style.getPropertyValue('--phone-visual-offset-top')).toBe(`${visual.offsetTop}px`);
    expect(fixture.story.style.getPropertyValue('--phone-visual-scale')).toBe(String(visual.scale));
    expect(fixture.story.style.getPropertyValue('--phone-story-coverage')).toBe('#8f7f61');
  });

  it.each([
    ['right', rect(0, 0, 389, 844)],
    ['bottom', rect(0, 0, 390, 843)]
  ] as const)('fails a one-pixel %s coverage deficit', (_edge, coverageRect) => {
    const fixture = createStoryFixture();
    setRect(fixture.coverage, coverageRect);
    fixture.presentation.attachRoot(fixture.story);
    registerScene(fixture, 'pattern');
    expect(fixture.presentation.verifyVisibleCandidate(planeRequest('pattern')).failure?.code)
      .toBe('presentation-coverage-invalid');
  });

  it('uses one scene-independent coverage calculation and separates authored layout variables', () => {
    const values: string[][] = [];
    for (const sceneId of ['pattern', 'contact'] as const) {
      const fixture = createStoryFixture();
      fixture.presentation.attachRoot(fixture.story);
      registerScene(fixture, sceneId);
      fixture.presentation.applyPlane(planeRequest(
        sceneId, attemptFor(sceneId), 'target', ['plane-acknowledged']
      ));
      values.push([
        fixture.story.style.getPropertyValue('--phone-visual-offset-left'),
        fixture.story.style.getPropertyValue('--phone-visual-offset-top'),
        fixture.story.style.getPropertyValue('--phone-visual-width'),
        fixture.story.style.getPropertyValue('--phone-visual-height'),
        fixture.story.style.getPropertyValue('--phone-visual-scale'),
        fixture.story.style.getPropertyValue('--phone-layout-width'),
        fixture.story.style.getPropertyValue('--phone-layout-height')
      ]);
    }
    expect(values[0]).toEqual(values[1]);
  });
});

describe('phone presentation content, frame, and mount proof', () => {
  it.each([
    ['disconnected root', 'root-connected', (_fixture: StoryFixture, root: HTMLElement) => setConnected(root, false)],
    ['empty rect', 'layout-measurable', (_fixture: StoryFixture, root: HTMLElement) => setRect(root, rect(0, 0, 0, 0))]
  ] as const)('rejects %s during prepared proof', (_label, rejectedKind, mutate) => {
    const fixture = createStoryFixture();
    fixture.presentation.attachRoot(fixture.story);
    const { lease, root, binding } = registerScene(fixture, 'pattern');
    mutate(fixture, root);
    expect(fixture.presentation.verifyPrepared({ binding, lease, fact: null }).records)
      .not.toEqual(expect.arrayContaining([
        expect.objectContaining({ slot: expect.objectContaining({ kind: rejectedKind }) })
      ]));
  });

  it.each([
    ['display', { display: 'none' }],
    ['visibility', { visibility: 'hidden' }],
    ['opacity', { opacity: '0' }],
    ['clip', { clipPath: 'inset(50%)' }]
  ] as const)('rejects hidden content by %s', (_label, hiddenStyle) => {
    const fixture = createStoryFixture();
    fixture.presentation.attachRoot(fixture.story);
    const { content } = registerScene(fixture, 'pattern');
    fixture.setStyle(content, computedStyle(hiddenStyle));
    expect(fixture.presentation.verifyVisibleCandidate(planeRequest('pattern')).failure?.code)
      .toBe('presentation-content-invisible');
  });

  it('rejects content hidden by an ancestor opacity or clip', () => {
    const fixture = createStoryFixture();
    fixture.presentation.attachRoot(fixture.story);
    const { root } = registerScene(fixture, 'pattern');
    fixture.setStyle(root, computedStyle({ opacity: '0' }));
    expect(fixture.presentation.verifyVisibleCandidate(planeRequest('pattern')).failure?.code)
      .toBe('presentation-content-invisible');
    fixture.setStyle(root, computedStyle({ clipPath: 'inset(50%)' }));
    expect(fixture.presentation.verifyVisibleCandidate(planeRequest('pattern')).failure?.code)
      .toBe('presentation-content-invisible');
  });

  it('accepts a fully proved packed-alpha compositor when either authored layer is visible', () => {
    const fixture = createStoryFixture();
    fixture.presentation.attachRoot(fixture.story);
    const { root, surfaces } = registerScene(fixture, 'crane-animation');
    const scene = phoneSceneById('crane-animation');
    const figure = surfaces.get('crane-figure-canvas')!;
    const flock = surfaces.get('crane-flock-canvas')!;
    select(root, scene.content.selectors[0]!, figure);
    select(root, scene.content.selectors[1]!, flock);

    fixture.setStyle(figure, computedStyle({ opacity: '0' }));
    fixture.setStyle(flock, computedStyle({ opacity: '1' }));
    fixture.setHitStack([flock, root, fixture.receiver, fixture.planes, fixture.viewport]);
    expect(fixture.presentation.verifyVisibleCandidate(
      planeRequest('crane-animation')
    ).failure).toBeNull();

    fixture.setStyle(figure, computedStyle({ opacity: '1' }));
    fixture.setStyle(flock, computedStyle({ opacity: '0', visibility: 'hidden' }));
    fixture.setHitStack([figure, root, fixture.receiver, fixture.planes, fixture.viewport]);
    expect(fixture.presentation.verifyVisibleCandidate(
      planeRequest('crane-animation')
    ).failure).toBeNull();
  });

  it('rejects a packed-alpha compositor when every authored layer is hidden', () => {
    const fixture = createStoryFixture();
    fixture.presentation.attachRoot(fixture.story);
    const { root, surfaces } = registerScene(fixture, 'crane-animation');
    const scene = phoneSceneById('crane-animation');
    const figure = surfaces.get('crane-figure-canvas')!;
    const flock = surfaces.get('crane-flock-canvas')!;
    select(root, scene.content.selectors[0]!, figure);
    select(root, scene.content.selectors[1]!, flock);
    fixture.setStyle(figure, computedStyle({ opacity: '0' }));
    fixture.setStyle(flock, computedStyle({ opacity: '0' }));

    expect(fixture.presentation.verifyVisibleCandidate(
      planeRequest('crane-animation')
    ).failure?.code).toBe('presentation-content-invisible');
  });

  it('requires every selector inside the registered root and a live intersecting rect', () => {
    const fixture = createStoryFixture();
    fixture.presentation.attachRoot(fixture.story);
    const { root, content } = registerScene(fixture, 'brand');
    elementStates.get(root)?.selectors.delete('.phone-brand__definition p');
    expect(fixture.presentation.verifyVisibleCandidate(planeRequest('brand')).failure?.code)
      .toBe('presentation-content-missing');
    select(root, '.phone-brand__definition p', content);
    setRect(content, rect(500, 900, 20, 20));
    expect(fixture.presentation.verifyVisibleCandidate(planeRequest('brand')).failure?.code)
      .toBe('presentation-content-invisible');
  });

  it('requires the current plane revision and visibly presented policy surface', () => {
    const fixture = createStoryFixture();
    fixture.presentation.attachRoot(fixture.story);
    const { lease } = registerScene(fixture, 'pattern');
    const stale = planeRequest('pattern', attemptFor('pattern'), 'target', finalKinds, 2);
    const staleRequired = { ...stale, required: slotsFor(stale.attempt, 'target', 1) };
    expect(fixture.presentation.verifyVisibleCandidate(staleRequired).failure?.code)
      .toBe('presentation-proof-identity-invalid');
    lease.release();
    expect(fixture.presentation.verifyVisibleCandidate(planeRequest('pattern')).failure?.code)
      .toBe('presentation-mount-missing');
  });

  it('rejects undeclared, duplicate, external, and second-live mount surfaces', () => {
    const fixture = createStoryFixture();
    fixture.presentation.attachRoot(fixture.story);
    const scene = phoneSceneById('pattern');
    const root = fakeElement('root:pattern');
    append(fixture.receiver, root);
    const image = fakeElement('pattern-image');
    append(root, image);
    const binding: PhoneLeafReportBinding = {
      attempt: attemptFor('pattern'), stageIndex: 0, leg: 'target',
      allowedReports: scene.directEntry.closure.exposeReceiverAfter,
      allowedSurfaceIds: scene.surfaces, planeRevision: 1
    };
    const commands = createNoopPhoneLeafCommandHandle();
    const request = { binding, registration: {
      root, surfaces: [{ id: 'pattern-image', element: image, kind: 'image' as const }], commands
    } };
    const lease = fixture.presentation.registerLeafMount(request);
    expect(lease.commands).toBe(commands);
    expect(() => fixture.presentation.registerLeafMount(request)).toThrow(/already registered/);
    lease.release();
    expect(() => fixture.presentation.registerLeafMount({
      ...request,
      registration: { ...request.registration, surfaces: [
        ...request.registration.surfaces,
        { id: 'rogue-image', element: image, kind: 'image' as const }
      ] }
    })).toThrow(/closed presentation binding|manifest/);
    expect(() => fixture.presentation.registerLeafMount({
      ...request,
      registration: { ...request.registration, surfaces: [
        request.registration.surfaces[0]!, request.registration.surfaces[0]!
      ] }
    })).toThrow(/closed presentation binding|duplicate/);
    expect(() => fixture.presentation.registerLeafMount({
      ...request,
      registration: { ...request.registration, surfaces: [{
        id: 'pattern-image', element: fakeElement('external'), kind: 'image' as const
      }] }
    })).toThrow(/registered root/);
  });

  it('rebinds one opaque lease without remounting and releases all ownership once', () => {
    const fixture = createStoryFixture();
    const detach = fixture.presentation.attachRoot(fixture.story);
    const { lease, binding } = registerScene(fixture, 'pattern');
    const rebound: PhoneLeafReportBinding = {
      ...binding,
      attempt: attemptFor('pattern', 'recovery', null, null, 2),
      planeRevision: 2
    };
    lease.rebind(rebound);
    expect(fixture.presentation.verifyVisibleCandidate(planeRequest(
      'pattern', rebound.attempt, 'target', finalKinds, 2,
      { ...viewportSnapshot(), visualRevision: 2 }
    )).failure).toBeNull();
    expect(lease.registrationKey).toBeTruthy();
    expect('dispatch' in lease).toBe(false);
    expect('attempt' in lease).toBe(false);
    detach();
    detach();
    expect(() => lease.release()).not.toThrow();
    fixture.presentation.attachRoot(fixture.story);
    const replacement = registerScene(fixture, 'pattern', attemptFor('pattern', 'boot', null, null, 3));
    expect(replacement.lease.registrationKey).not.toBe(lease.registrationKey);
  });
});

describe('phone presentation fixed topology and Hero zero contract', () => {
  it('keeps one fixed isolated topology with coverage below all story planes', () => {
    const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
    expect(styles).toMatch(/\.phone-story__viewport\s*\{[^}]*position:\s*fixed/s);
    expect(styles).not.toMatch(/\.phone-story__viewport\s*\{[^}]*position:\s*absolute/s);
    expect(styles).toMatch(/\.phone-story__coverage\s*\{[^}]*z-index:\s*0/s);
    expect(styles).toMatch(/\[data-phone-plane="source"\][^{]*\{[^}]*z-index:\s*10/s);
    expect(styles).toMatch(/\[data-phone-plane="receiver"\][^{]*\{[^}]*z-index:\s*30/s);
    expect(styles).not.toMatch(/\.phone-story__coverage::(?:before|after)/);
    expect(styles).toContain('--phone-visual-offset-left');
    expect(styles).toContain('--phone-visual-offset-top');
    expect(styles).toContain('--phone-visual-scale');
    expect(styles).toContain('--phone-layout-width');
  });

  it('applies Hero progress zero before a candidate proof can release Loader', () => {
    const fixture = createStoryFixture();
    fixture.presentation.attachRoot(fixture.story);
    registerScene(fixture, 'hero');
    const result = fixture.presentation.verifyVisibleCandidate(planeRequest('hero'));
    expect(result.failure).toBeNull();
    expect(fixture.story.style.getPropertyValue('--phone-story-progress')).toBe('0');
    expect(fixture.story.style.getPropertyValue('--phone-hero-motion-progress')).toBe('0');
    expect(fixture.story.style.getPropertyValue('--phone-hero-authored-progress')).toBe('0');
    expect(result.records.map(({ slot }) => slot.kind)).toEqual(finalKinds);
  });
});
