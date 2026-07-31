import type { PhoneCheckpointId } from '../../../story/semantic-checkpoints';
import type { SceneId, SegmentId } from '../../../story/types';
import { useLayoutEffect, type RefObject } from 'react';
import type { PhoneRouteScope } from '../phone-route-scope';
import {
  phoneRunLegSegment,
  phoneScrollSegment,
  type PhoneRunId,
  type PhoneScrollRunId
} from '../phone-story-runs';
import {
  phoneSurfaceRenderedProofEdge,
  phoneDirectEntryAdmissionTuple,
  phoneScenePresentationTuple,
  phoneSegmentPresentationTuple,
  type CanonicalPhoneSegmentId,
  type PhoneLandingResolverId,
  type PhonePresentationCommitState,
  type PhonePresentationEvidenceKind,
  type PhoneStageOwner,
  type PhoneSurfaceId
} from './manifest';
import type {
  PhoneStoryCursor,
  PhoneTransactionPhase,
  PresentationProof,
  PresentationReadiness,
  PresentationToken
} from './machine';
import './presentation.css';

/**
 * Edge/theme ownership is part of the atomic presentation projection. It is
 * deliberately colocated with DOM roles rather than left in a scene helper.
 */
export type PhoneEdgeScene =
  | 'hero'
  | 'pattern'
  | 'star'
  | 'aod'
  | 'method'
  | 'figure2'
  | 'proof'
  | 'brand'
  | 'figure3'
  | 'services'
  | 'ttg'
  | 'lab'
  | 'ph'
  | 'education'
  | 'crane'
  | 'contact';

export const PHONE_PATTERN_TERMINAL_EDGE_SURFACE = '#8f7f61';

export const PHONE_EDGE_SURFACE_BY_SCENE: Readonly<
  Record<PhoneEdgeScene, string>
> = {
  hero: '#07110e',
  pattern: PHONE_PATTERN_TERMINAL_EDGE_SURFACE,
  star: '#06100d',
  aod: '#ede4d2',
  method: '#ede4d2',
  figure2: '#e2dac9',
  proof: '#ede4d2',
  brand: '#ede4d2',
  figure3: '#ede4d2',
  services: '#ede4d2',
  ttg: '#080d10',
  lab: '#ede4d2',
  ph: '#9889a5',
  education: '#ede4d2',
  crane: '#ede4d2',
  contact: '#ede4d2'
};

export function phoneEdgeSurfaceForScene(scene: PhoneEdgeScene): string {
  return PHONE_EDGE_SURFACE_BY_SCENE[scene];
}

export type {
  PhoneLandingResolverId,
  PhonePresentationCommitState,
  PhoneStageOwner,
  PhoneSurfaceId
} from './manifest';

/** Pure reducer projection. DOM application is intentionally below this type. */
export type PhonePresentationProjection = Readonly<{
  revision: number;
  scene: SceneId;
  checkpoint: PhoneCheckpointId;
  edge: PhoneEdgeScene;
  commitState: PhonePresentationCommitState;
  semanticScene: SceneId;
  navigationScene: SceneId;
  stageOwner: PhoneStageOwner;
  stageScene: SceneId | null;
  sourceSurface: PhoneSurfaceId | null;
  receiverSurface: PhoneSurfaceId;
  coverageSurface: PhoneSurfaceId;
  landingResolver: PhoneLandingResolverId;
}>;

/**
 * Ordered presentation projection passed across independently minified chunks.
 * The reducer keeps its richer object-shaped snapshot private to the authority.
 */
export type PhonePresentationProjectionSnapshot = readonly [
  revision: number,
  scene: SceneId,
  checkpoint: PhoneCheckpointId,
  edge: PhoneEdgeScene,
  commitState: PhonePresentationCommitState,
  semanticScene: SceneId,
  navigationScene: SceneId,
  stageOwner: PhoneStageOwner,
  stageScene: SceneId | null,
  sourceSurface: PhoneSurfaceId | null,
  receiverSurface: PhoneSurfaceId,
  coverageSurface: PhoneSurfaceId,
  landingResolver: PhoneLandingResolverId
];

export type PhonePresentationSessionSnapshot = readonly [
  sessionId: string,
  generation: number,
  run: PhoneRunId | null,
  legIndex: number,
  direction: 1 | -1,
  phase: PhoneTransactionPhase,
  progress: number,
  anchorY: number | null
];

/**
 * The sole reducer-to-presentation transport. It remains positional because
 * Terser can mangle named fields independently in Rollup's emitted chunks.
 */
export type PhonePresentationSnapshot = readonly [
  status: 'stable' | 'scroll-run' | 'transaction',
  revision: number,
  stableScene: SceneId | null,
  scrollRun: PhoneScrollRunId | null,
  scrollCorridor: string | null,
  scrollProgress: number,
  scrollDirection: -1 | 0 | 1,
  projection: PhonePresentationProjectionSnapshot,
  session: PhonePresentationSessionSnapshot | null,
  retryableRun: PhoneRunId | null
];

type PhonePresentationSnapshotView = Readonly<{
  status: PhonePresentationSnapshot[0];
  revision: number;
  stableScene: SceneId | null;
  scrollRun: PhoneScrollRunId | null;
  scroll: Readonly<{
    corridor: string | null;
    progress: number;
    direction: -1 | 0 | 1;
  }>;
  projection: PhonePresentationProjection;
  session: Readonly<{
    sessionId: string;
    generation: number;
    operation: Readonly<{
      run: PhoneRunId | null;
      legIndex: number;
      direction: 1 | -1;
    }>;
    phase: PhoneTransactionPhase;
    progress: number;
    anchor: Readonly<{ y: number | null }>;
  }> | null;
  retryableRun: PhoneRunId | null;
}>;

function presentationSnapshotView(
  [
    status,
    revision,
    stableScene,
    scrollRun,
    scrollCorridor,
    scrollProgress,
    scrollDirection,
    projectionSnapshot,
    sessionSnapshot,
    retryableRun
  ]: PhonePresentationSnapshot
): PhonePresentationSnapshotView {
  const [
    projectionRevision,
    scene,
    checkpoint,
    edge,
    commitState,
    semanticScene,
    navigationScene,
    stageOwner,
    stageScene,
    sourceSurface,
    receiverSurface,
    coverageSurface,
    landingResolver
  ] = projectionSnapshot;
  const session = sessionSnapshot === null
    ? null
    : {
        sessionId: sessionSnapshot[0],
        generation: sessionSnapshot[1],
        operation: {
          run: sessionSnapshot[2],
          legIndex: sessionSnapshot[3],
          direction: sessionSnapshot[4]
        },
        phase: sessionSnapshot[5],
        progress: sessionSnapshot[6],
        anchor: { y: sessionSnapshot[7] }
      };
  return {
    status,
    revision,
    stableScene,
    scrollRun,
    scroll: {
      corridor: scrollCorridor,
      progress: scrollProgress,
      direction: scrollDirection
    },
    projection: {
      revision: projectionRevision,
      scene,
      checkpoint,
      edge,
      commitState,
      semanticScene,
      navigationScene,
      stageOwner,
      stageScene,
      sourceSurface,
      receiverSurface,
      coverageSurface,
      landingResolver
    },
    session,
    retryableRun
  };
}

/** @deprecated Evidence facts are derived by this presentation boundary. */
export type PhonePresentationEvidence = Readonly<
  Partial<PhonePresentationProjection>
>;

export type PhoneStableProjectionTuple = readonly [
  checkpoint: PhoneCheckpointId,
  edge: PhoneEdgeScene,
  stageOwner: PhoneStageOwner,
  stageScene: SceneId | null,
  surface: PhoneSurfaceId,
  landingResolver: PhoneLandingResolverId
];

export type PhoneStoryPresentationTuple = readonly [
  scene: SceneId,
  checkpoint: PhoneCheckpointId,
  edge: PhoneEdgeScene,
  stageOwner: PhoneStageOwner,
  stageScene: SceneId | null,
  sourceSurface: PhoneSurfaceId | null,
  receiverSurface: PhoneSurfaceId,
  landingResolver: PhoneLandingResolverId
];

export type PhoneTransitionPresentationInput = readonly [
  from: SceneId,
  to: SceneId,
  segment: SegmentId,
  direction: 1 | -1,
  progress: number
];

type StablePresentation = readonly [PhoneCheckpointId, PhoneEdgeScene];

export function phoneStablePresentation(
  scene: SceneId
): Required<Pick<PhonePresentationProjection, 'scene' | 'checkpoint' | 'edge'>> {
  const [checkpoint, edge] = phoneStablePresentationTuple(scene);
  return { scene, checkpoint, edge };
}

export function phoneStablePresentationTuple(scene: SceneId): StablePresentation {
  const contract = phoneScenePresentationTuple(scene);
  return [contract[0], contract[1]];
}

export function phoneStableProjectionTuple(
  scene: SceneId
): PhoneStableProjectionTuple {
  const contract = phoneScenePresentationTuple(scene);
  return [
    contract[0],
    contract[1],
    contract[2],
    contract[3],
    contract[4],
    contract[5]
  ];
}

export function phoneStableProjection(
  scene: SceneId,
  commitState: Extract<PhonePresentationCommitState, 'candidate' | 'stable'> = 'stable'
): PhonePresentationProjection {
  const contract = phoneScenePresentationTuple(scene);
  return {
    revision: 0,
    scene,
    checkpoint: contract[0],
    edge: contract[1],
    commitState,
    semanticScene: scene,
    navigationScene: scene,
    stageOwner: contract[2],
    stageScene: contract[3],
    sourceSurface: null,
    receiverSurface: contract[4],
    coverageSurface: contract[4],
    landingResolver: contract[5]
  };
}

export function phoneStoryPresentationTuple(
  cursor: PhoneStoryCursor
): PhoneStoryPresentationTuple {
  if (cursor.kind === 'hold') {
    const contract = phoneScenePresentationTuple(cursor.scene);
    return [
      cursor.scene,
      contract[0],
      contract[1],
      contract[2],
      contract[3],
      null,
      contract[4],
      contract[5]
    ];
  }
  return phoneTransitionPresentationTuple([
    cursor.from,
    cursor.to,
    cursor.segment,
    cursor.direction,
    cursor.progress
  ]);
}

export function phoneTransitionPresentationTuple(
  [from, to, segmentId, direction, progress]: PhoneTransitionPresentationInput
): PhoneStoryPresentationTuple {
  const semanticScene = progress > 0.001 ? to : from;
  const edgeScene = direction === 1
    ? progress === 1 ? to : from
    : progress === 0 ? from : to;
  const sceneContract = phoneScenePresentationTuple(semanticScene);
  const edgeContract = phoneScenePresentationTuple(edgeScene);
  const segment = phoneSegmentPresentationTuple(segmentId);
  return [
    semanticScene,
    segmentId === 'aod-method-top' && progress <= 0.001
      ? 'aod-autoplay'
      : segment[0],
    edgeContract[1],
    sceneContract[2],
    sceneContract[3],
    segment[4],
    segment[5],
    sceneContract[5]
  ];
}

export function phoneStoryPresentation(
  cursor: PhoneStoryCursor
): PhonePresentationProjection {
  const [
    scene,
    checkpoint,
    edge,
    stageOwner,
    stageScene,
    sourceSurface,
    receiverSurface,
    landingResolver
  ] = phoneStoryPresentationTuple(cursor);
  const coverageSurface = cursor.kind === 'hold'
    ? receiverSurface
    : cursor.direction === 1 ? sourceSurface! : receiverSurface;
  return {
    revision: 0,
    scene,
    checkpoint,
    edge,
    commitState: cursor.kind === 'hold' ? 'stable' : 'transition',
    semanticScene: scene,
    navigationScene: scene,
    stageOwner,
    stageScene,
    sourceSurface,
    receiverSurface,
    coverageSurface,
    landingResolver
  };
}

/** Global presentation plane; these roles never inherit a scene-local z-index. */
export type PhoneSurfaceRole =
  | 'stable'
  | 'candidate-stable'
  | 'fixed-current'
  | 'transition-source'
  | 'transition-receiver'
  | 'retained-under-stage'
  | 'retired';

export type PhonePresentationLayer =
  | 'coverage'
  | 'retained'
  | 'fixed'
  | 'stable'
  | 'transition-source'
  | 'transition-effect-between'
  | 'transition-receiver'
  | 'transition-effect-above';

export type PhoneLayerAssignment = Readonly<{ role: PhonePresentationLayer }>;

export type PhoneTransitionLayerPlan = Readonly<{
  segment: CanonicalPhoneSegmentId;
  source: PhoneLayerAssignment & Readonly<{ surface: PhoneSurfaceId }>;
  receiver: PhoneLayerAssignment & Readonly<{ surface: PhoneSurfaceId }>;
  /** Host and effect element remain distinct registrations. */
  effect: PhoneLayerAssignment & Readonly<{
    host: PhoneSurfaceId;
    placement: 'above-both' | 'between';
  }>;
}>;

const layerZIndex = {
  coverage: 100,
  retained: 200,
  fixed: 300,
  stable: 400,
  'transition-source': 500,
  'transition-effect-between': 550,
  'transition-receiver': 600,
  'transition-effect-above': 700
} as const satisfies Readonly<Record<PhonePresentationLayer, number>>;

export function phonePresentationLayerZIndex(role: PhonePresentationLayer): number {
  return layerZIndex[role];
}

export function phonePresentationLayer(role: PhonePresentationLayer): PhoneLayerAssignment {
  return { role };
}

export function phoneLayerForSurfaceRole(role: PhoneSurfaceRole): PhonePresentationLayer {
  switch (role) {
    case 'retained-under-stage':
    case 'retired':
      return 'retained';
    case 'fixed-current':
      return 'fixed';
    case 'stable':
    case 'candidate-stable':
      return 'stable';
    case 'transition-source':
      return 'transition-source';
    case 'transition-receiver':
      return 'transition-receiver';
  }
}

export function phoneSurfaceRoleZIndex(role: PhoneSurfaceRole): number {
  return phonePresentationLayerZIndex(phoneLayerForSurfaceRole(role));
}

function effectLayer(
  placement: PhoneTransitionLayerPlan['effect']['placement']
): PhonePresentationLayer {
  return placement === 'above-both'
    ? 'transition-effect-above'
    : 'transition-effect-between';
}

/**
 * The effect role is selected from manifest placement only. Even when an
 * effect is hosted by an endpoint, its element remains on the requested
 * global plane rather than being collapsed into that endpoint's layer.
 */
export function phoneTransitionLayerPlan(
  contract: ReturnType<typeof phoneSegmentPresentationTuple>,
  direction: 1 | -1,
  _progress: number
): PhoneTransitionLayerPlan {
  const source = direction === 1 ? contract[4] : contract[5];
  const receiver = direction === 1 ? contract[5] : contract[4];
  return {
    segment: contract[1],
    source: { surface: source, role: 'transition-source' },
    receiver: { surface: receiver, role: 'transition-receiver' },
    effect: {
      host: contract[6],
      placement: contract[7],
      role: effectLayer(contract[7])
    }
  };
}

const effectSegmentAliases = {
  'portrait-hero-pattern-ink': 'hero-pattern',
  'hero-pattern': 'hero-pattern',
  'portrait-pattern-star-ink': 'pattern-star-map',
  'pattern-star-map': 'pattern-star-map',
  'portrait-star-aod-ink': 'star-map-aod',
  'star-map-aod': 'star-map-aod',
  'aod-to-method': 'aod-method-top',
  'phone-method-bottom-figure2': 'method-bottom-figure2',
  'method-bottom-figure2': 'method-bottom-figure2',
  'figure2-distance-expand': 'figure2-distance-expand',
  'figure2-proof-brand': 'figure2-proof-brand',
  'phone-figure2-proof-brand': 'figure2-proof-brand',
  'phone-brand-figure3': 'brand-figure3',
  'brand-figure3': 'brand-figure3',
  'figure3-to-services': 'figure3-services',
  'phone-services-ttg': 'services-ttg',
  'services-ttg': 'services-ttg',
  'ttg-to-lab': 'ttg-lab',
  'phone-lab-ph-ink': 'lab-ph',
  'lab-ph': 'lab-ph',
  'phone-education-crane-ink': 'education-crane',
  'education-crane': 'education-crane',
  'ph-to-education': 'ph-education',
  'crane-to-contact': 'crane-contact'
} as const satisfies Readonly<Record<string, CanonicalPhoneSegmentId>>;

export function canonicalPhoneEffectSegment(
  effectId: string | undefined
): CanonicalPhoneSegmentId | null {
  if (!effectId) return null;
  return effectSegmentAliases[effectId as keyof typeof effectSegmentAliases] ?? null;
}

/** A preflight can observe an owned target before the same revision reveals it. */
export type PhoneSurfacePresentationReadMode = 'preflight' | 'committed';

/** Positional DOM/media facts consumed by the single runtime commit gate. */
export type PhoneSurfacePresentation = readonly [
  connected: boolean,
  visible: boolean,
  coverage: boolean,
  content: boolean,
  frameKind: Exclude<
    PhonePresentationEvidenceKind,
    'coverage' | 'dom-reading' | 'direct-entry'
  > | null
];

type RectLike = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}>;

function connected(element: HTMLElement | null): element is HTMLElement {
  if (!element) return false;
  return !('isConnected' in element) || element.isConnected !== false;
}

function rectFor(element: HTMLElement): RectLike | null {
  const reader = element.getBoundingClientRect;
  if (typeof reader !== 'function') return null;
  return reader.call(element) ?? null;
}

function visible(
  element: HTMLElement,
  mode: PhoneSurfacePresentationReadMode
): boolean {
  if ('hidden' in element && element.hidden) return false;
  // `inert` removes an element from interaction and accessibility, not from
  // the compositor. Transition endpoints intentionally stay interaction-inert
  // while their physical frame is visible, so it cannot invalidate a proof.
  if (typeof getComputedStyle === 'function') {
    const style = getComputedStyle(element);
    if (
      style.display === 'none'
      || (mode !== 'preflight'
        && (style.visibility === 'hidden' || style.visibility === 'collapse'))
      || Number.parseFloat(style.opacity || '1') <= 0.01
    ) return false;
  }
  const rect = rectFor(element);
  return !rect || (rect.width > 0 && rect.height > 0);
}

function coversLiveViewport(element: HTMLElement): boolean {
  const rect = rectFor(element);
  if (!rect || typeof window === 'undefined') return true;
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  const width = viewport?.width ?? window.innerWidth;
  const height = viewport?.height ?? window.innerHeight;
  if (width <= 0 || height <= 0) return false;
  const epsilon = .5;
  return rect.left <= left + epsilon
    && rect.top <= top + epsilon
    && rect.right >= left + width - epsilon
    && rect.bottom >= top + height - epsilon;
}

function intersectsLiveViewport(element: HTMLElement): boolean {
  const rect = rectFor(element);
  if (!rect || typeof window === 'undefined') return true;
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  const right = left + (viewport?.width ?? window.innerWidth);
  const bottom = top + (viewport?.height ?? window.innerHeight);
  return rect.right > left
    && rect.left < right
    && rect.bottom > top
    && rect.top < bottom;
}

function elementForProbe(root: HTMLElement, selector: string): HTMLElement | null {
  if (typeof root.matches === 'function' && root.matches(selector)) return root;
  return root.querySelector?.<HTMLElement>(selector) ?? null;
}

function hasTextProbe(
  root: HTMLElement,
  selectors: readonly string[],
  reading: boolean,
  mode: PhoneSurfacePresentationReadMode
): boolean {
  return selectors.length > 0 && selectors.every((selector) => {
    const element = elementForProbe(root, selector);
    if (!element?.textContent?.trim()) return false;
    return !reading || (visible(element, mode) && intersectsLiveViewport(element));
  });
}

function hasFrameProbe(
  root: HTMLElement,
  selectors: readonly string[],
  mode: PhoneSurfacePresentationReadMode
): boolean {
  return selectors.length > 0 && selectors.every((selector) => {
    const element = elementForProbe(root, selector);
    return Boolean(element && visible(element, mode) && intersectsLiveViewport(element));
  });
}

export function readPhoneSurfacePresentation(
  root: HTMLElement | null,
  coverageRoot: HTMLElement | null,
  mode: PhoneSurfacePresentationReadMode = 'committed'
): PhoneSurfacePresentation {
  const rootConnected = connected(root);
  const coverageConnected = connected(coverageRoot);
  const rootVisible = rootConnected && visible(root, mode);
  const coverageVisible = coverageConnected && visible(coverageRoot, mode);
  return [
    rootConnected && coverageConnected,
    rootVisible,
    coverageVisible && coversLiveViewport(coverageRoot),
    false,
    null
  ];
}

export function readPhoneScenePresentation(
  scene: SceneId,
  root: HTMLElement | null,
  coverageRoot: HTMLElement | null,
  mode: PhoneSurfacePresentationReadMode = 'committed'
): PhoneSurfacePresentation {
  const [, , , , , , probeKind, selectors] = phoneScenePresentationTuple(scene);
  const rootConnected = connected(root);
  const coverageConnected = connected(coverageRoot);
  const rootVisible = rootConnected && visible(root, mode);
  const coverageVisible = coverageConnected && visible(coverageRoot, mode);
  const visualProbe = probeKind === 'visual' || probeKind === 'static-visual';
  const textContent = rootVisible && !visualProbe
    && hasTextProbe(root, selectors, probeKind === 'reading', mode);
  const framePresented = rootVisible && visualProbe && hasFrameProbe(root, selectors, mode);
  const content = visualProbe ? framePresented : textContent;
  const frameKind = (
    probeKind === 'static' && textContent
  ) || (
    probeKind === 'static-visual' && framePresented
  )
    ? 'static-poster'
    : probeKind === 'visual' && framePresented
      ? 'packed-canvas-frame'
      : null;
  return [
    rootConnected && coverageConnected,
    rootVisible,
    coverageVisible && coversLiveViewport(coverageRoot),
    content,
    frameKind
  ];
}

export function phoneSurfaceSupportsEvidence(
  [connectedFact, visibleFact, coverage, content, frameKind]: PhoneSurfacePresentation,
  kind: PhonePresentationEvidenceKind
): boolean {
  switch (kind) {
    case 'coverage':
      return connectedFact && coverage;
    case 'dom-reading':
      return connectedFact && visibleFact && content;
    case 'direct-entry':
      return connectedFact && visibleFact && coverage && content;
    case 'static-poster':
    case 'native-video-frame':
    case 'packed-canvas-frame':
    case 'effect-frame':
      return connectedFact && visibleFact && frameKind === kind;
  }
}

/** Live visual-viewport coverage is published in the same presentation plane. */
export type PhoneLayoutViewport = Readonly<{
  width: number;
  height: number;
  revision: number;
}>;

export type PhoneCoverageViewport = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  revision: number;
}>;

type EventSource = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

type PhoneVisualViewport = Readonly<{
  offsetLeft: number;
  offsetTop: number;
  width: number;
  height: number;
}>;

export type PhoneViewportWindow = EventSource & Readonly<{
  innerWidth: number;
  innerHeight: number;
  visualViewport?: (EventSource & PhoneVisualViewport) | null;
  requestAnimationFrame(callback: FrameRequestCallback): number;
  cancelAnimationFrame(handle: number): void;
}>;

export type PhoneViewportCoverageController = Readonly<{
  sync(forceLayout?: boolean): void;
  dispose(): void;
}>;

function finiteViewport(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function roundedViewport(value: number): number {
  return Math.max(1, Math.round(value));
}

export function readPhoneCoverageViewport(
  source: Readonly<{
    innerWidth: number;
    innerHeight: number;
    visualViewport?: PhoneVisualViewport | null;
  }>,
  revision = 0
): PhoneCoverageViewport {
  const viewport = source.visualViewport;
  const width = roundedViewport(finiteViewport(
    viewport?.width ?? source.innerWidth,
    source.innerWidth || 1
  ));
  const height = roundedViewport(finiteViewport(
    viewport?.height ?? source.innerHeight,
    source.innerHeight || 1
  ));
  const left = Math.max(0, finiteViewport(viewport?.offsetLeft ?? 0, 0));
  const top = Math.max(0, finiteViewport(viewport?.offsetTop ?? 0, 0));
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    revision
  };
}

export function readPhoneLayoutViewport(
  coverage: PhoneCoverageViewport,
  revision = 0
): PhoneLayoutViewport {
  return { width: coverage.width, height: coverage.height, revision };
}

function sameCoverage(
  left: PhoneCoverageViewport | null,
  right: PhoneCoverageViewport
): boolean {
  return Boolean(
    left
    && left.left === right.left
    && left.top === right.top
    && left.right === right.right
    && left.bottom === right.bottom
  );
}

export function applyPhoneCoverageViewport(
  root: HTMLElement,
  coverage: PhoneCoverageViewport
): void {
  root.style.setProperty('--portrait-coverage-left', `${coverage.left}px`);
  root.style.setProperty('--portrait-coverage-top', `${coverage.top}px`);
  root.style.setProperty('--portrait-coverage-right', `${coverage.right}px`);
  root.style.setProperty('--portrait-coverage-bottom', `${coverage.bottom}px`);
  root.style.setProperty('--portrait-coverage-width', `${coverage.width}px`);
  root.style.setProperty('--portrait-coverage-height', `${coverage.height}px`);
  root.dataset.phoneCoverageRevision = String(coverage.revision);
}

export function clearPhoneCoverageViewport(root: HTMLElement): void {
  for (const property of [
    '--portrait-coverage-left',
    '--portrait-coverage-top',
    '--portrait-coverage-right',
    '--portrait-coverage-bottom',
    '--portrait-coverage-width',
    '--portrait-coverage-height'
  ]) root.style.removeProperty(property);
  delete root.dataset.phoneCoverageRevision;
}

/**
 * Coalesces visual viewport movement to presentation revisions. The layout
 * callback is deliberately isolated from toolbar-only changes so it cannot
 * mutate the document scroll clock.
 */
export function createPhoneViewportCoverageController({
  root,
  windowRef,
  documentRef,
  onLayout
}: Readonly<{
  root: HTMLElement;
  windowRef: PhoneViewportWindow;
  documentRef: EventSource;
  onLayout(root: HTMLElement, layout: PhoneLayoutViewport): void;
}>): PhoneViewportCoverageController {
  let disposed = false;
  let frame = 0;
  let forceLayout = false;
  let coverage: PhoneCoverageViewport | null = null;
  let layout: PhoneLayoutViewport | null = null;
  let coverageRevision = 0;
  let layoutRevision = 0;

  const sync = (force = false) => {
    if (disposed) return;
    const observed = readPhoneCoverageViewport(windowRef, coverageRevision + 1);
    if (!sameCoverage(coverage, observed)) {
      coverageRevision += 1;
      coverage = { ...observed, revision: coverageRevision };
      applyPhoneCoverageViewport(root, coverage);
    }
    const currentCoverage = coverage ?? observed;
    const widthChanged = !layout || Math.abs(currentCoverage.width - layout.width) > 1;
    if (!force && !forceLayout && !widthChanged) return;
    layoutRevision += 1;
    layout = readPhoneLayoutViewport(currentCoverage, layoutRevision);
    forceLayout = false;
    onLayout(root, layout);
  };
  const schedule = () => {
    if (frame || disposed) return;
    frame = windowRef.requestAnimationFrame(() => {
      frame = 0;
      sync();
    });
  };
  const scheduleForcedLayout = () => {
    forceLayout = true;
    schedule();
  };

  sync(true);
  windowRef.visualViewport?.addEventListener('resize', schedule);
  windowRef.visualViewport?.addEventListener('scroll', schedule);
  windowRef.addEventListener('resize', schedule);
  windowRef.addEventListener('orientationchange', scheduleForcedLayout);
  documentRef.addEventListener('fullscreenchange', scheduleForcedLayout);

  return {
    sync,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame) windowRef.cancelAnimationFrame(frame);
      windowRef.visualViewport?.removeEventListener('resize', schedule);
      windowRef.visualViewport?.removeEventListener('scroll', schedule);
      windowRef.removeEventListener('resize', schedule);
      windowRef.removeEventListener('orientationchange', scheduleForcedLayout);
      documentRef.removeEventListener('fullscreenchange', scheduleForcedLayout);
      clearPhoneCoverageViewport(root);
    }
  };
}

export function usePhoneViewportCoverage(
  rootRef: RefObject<HTMLElement | null>,
  onLayout: (root: HTMLElement, layout: PhoneLayoutViewport) => void
): void {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window === 'undefined') return;
    const controller = createPhoneViewportCoverageController({
      root,
      windowRef: window,
      documentRef: document,
      onLayout
    });
    return () => controller.dispose();
  }, [onLayout, rootRef]);
}

export type PhoneSurfaceKind = 'native' | 'fixed' | 'transition';

/**
 * The renderer's irreducible fact: a concrete frame was drawn for one exact
 * immutable token.  DOM visibility and coverage remain presentation-plane
 * facts and are added here before anything reaches the reducer.
 */
export type PhoneRenderedPresentationFrame = Readonly<{
  token: PresentationToken;
  frameSequence: number;
  observedAt: number;
  /**
   * The authority can request a segment's first physical frame from the same
   * canvas that later proves a visual target. Keep that provenance explicit so
   * an active target adapter cannot reinterpret the frame as a target hold.
   */
  origin?: 'segment-first-frame' | 'leaf-static-poster';
}>;

/**
 * Visual leaves receive an active token and actively publish only successful
 * physical draws.  They never inspect route state or publish a stable scene.
 */
export type PhonePresentationAdapter = Readonly<{
  present(
    token: PresentationToken,
    report: (frame: PhoneRenderedPresentationFrame) => void
  ): void;
  dispose?(token: PresentationToken): void;
}>;

/**
 * The browser presentation boundary used by non-media static/reading holds.
 * It is injectable solely to make the otherwise browser-only boundary
 * deterministic in unit tests.
 */
export type PhonePresentationFrameScheduler = (
  callback: () => void
) => () => void;

export type PhoneSurfaceRegistration = Readonly<{
  id: string;
  scene: SceneId;
  kind: PhoneSurfaceKind;
  root(): HTMLElement | null;
  coverageRoot?(): HTMLElement | null;
  /** Concrete DOM/media facts; boolean placeholders are intentionally absent. */
  presentation?(mode: PhoneSurfacePresentationReadMode): PhoneSurfacePresentation;
  /** Renderer-owned actual-frame callback boundary for visual surfaces. */
  adapter?: PhonePresentationAdapter;
  /**
   * Fixed surfaces may opt into a leaf-owned static poster only by verifying
   * that their physical target marker still belongs to this exact token.
   */
  staticPoster?(token: PresentationToken): boolean;
  /** Optional scene-local compositor preparation for a direct target hold. */
  prepareDirectEntry?(request: PhoneDirectEntryPresentationRequest): Promise<void> | void;
}>;

export type PhoneSurfaceLease = Readonly<{ dispose(): void }>;

/** Effect hosts and effect elements are deliberately independent planes. */
export type PhoneEffectRegistration = Readonly<{
  id: string;
  host(): HTMLElement | null;
  element(): HTMLElement | null;
}>;

export type PhoneDirectEntryPresentationRequest = Readonly<{
  scene: SceneId;
  sessionId: string;
  generation: number;
  /** The exact immutable token the receiver must render before it may settle. */
  token: PresentationToken;
  signal: AbortSignal;
}>;

export type PhoneTransitionEndpoints = Readonly<{
  source: HTMLElement;
  receiver: HTMLElement;
  sessionId: string;
  generation: number;
}>;

type ResolvedSurface = Readonly<{
  registration: PhoneSurfaceRegistration;
  root: HTMLElement;
  coverageRoot: HTMLElement;
  role: PhoneSurfaceRole;
}>;

export type PhonePresentationPlan = Readonly<{
  snapshot: PhonePresentationSnapshot;
  root: HTMLElement | null;
  surfaces: readonly ResolvedSurface[];
  endpoints: PhoneTransitionEndpoints | null;
  layerPlan: PhoneTransitionLayerPlan | null;
  checkpointTrace: readonly PhoneCheckpointId[];
}>;

/**
 * A reducer event can publish the exact first physical frame before React has
 * committed the receiver's new transition role. This narrowly admits that
 * single projection; all diagnostic reapplications remain strict.
 */
export type PhonePresentationPreflightOptions = Readonly<{
  admitFirstFrameProjection?: boolean;
}>;

export type PhoneStoryPresentation = Readonly<{
  attach(): void;
  preflight(
    snapshot: PhonePresentationSnapshot,
    options?: PhonePresentationPreflightOptions
  ): PhonePresentationPlan | null;
  apply(plan: PhonePresentationPlan): void;
  reapplyCurrent(): void;
  registerSurface(registration: PhoneSurfaceRegistration): PhoneSurfaceLease;
  registerEffect(registration: PhoneEffectRegistration): PhoneSurfaceLease;
  /** True only when a registered scene surface is connected, visible, and covered. */
  hasPresentedSurface(scene: SceneId): boolean;
  readSurfacePresentation(scene: SceneId): PhoneSurfacePresentation | null;
  /** Candidate-only coverage observation; it cannot be committed as stable. */
  readPresentationReadiness(
    scene: SceneId,
    token: PresentationToken
  ): PresentationReadiness | null;
  /** Arms a renderer-owned visual adapter for an exact target token. */
  activatePresentationAdapter(
    scene: SceneId,
    token: PresentationToken,
    report: (proof: PresentationProof) => void
  ): void;
  /** Turns an actual renderer/effect draw into a validated immutable proof. */
  proofForRenderedFrame(
    frame: PhoneRenderedPresentationFrame
  ): PresentationProof | null;
  prepareDirectEntry(
    scene: SceneId,
    request: PhoneDirectEntryPresentationRequest
  ): Promise<void> | void;
  registerTransitionEndpoints(endpoints: PhoneTransitionEndpoints): void;
  clearTransitionEndpoints(): void;
  rootForScene(scene: SceneId): HTMLElement | null;
  dispose(): void;
}>;

type DocumentSnapshot = Readonly<{
  documentSurface: string;
  edge: string | undefined;
  checkpoint: string | undefined;
  theme: string | undefined;
}>;

type OwnedDocument = Readonly<{ token: object; before: DocumentSnapshot }>;

const rootOwners = new WeakMap<HTMLElement, object>();
const documentOwners = new WeakMap<Document, OwnedDocument>();
const layerOwners = new WeakMap<HTMLElement, object>();
const rootDataKeys = [
  'phoneAuthorityId',
  'phoneAuthorityScope',
  'phoneCursor',
  'phoneRevision',
  'phonePresentationRevision',
  'phoneSession',
  'phoneTransitionGeneration',
  'phoneTransitionLeg',
  'phoneTransitionDirection',
  'phoneTransitionProgress',
  'phoneSegment',
  'phoneTransitionPhase',
  'phoneTransitionLock',
  'phoneInputState',
  'phoneScrollCorridor',
  'phoneScrollProgress',
  'phoneStageOwner',
  'phoneStageScene',
  'phoneProjectionState',
  'phoneStableScene',
  'phoneAnchorY',
  'phoneRetryableRun',
  'phoneLayerSegment',
  'portraitCheckpoint',
  'portraitCheckpointTrace',
  'portraitEdgeScene',
  'portraitEdgeSurface'
] as const;

function data(
  element: HTMLElement,
  key: keyof DOMStringMap,
  value: string | undefined
): void {
  if (value === undefined) delete element.dataset[key];
  else element.dataset[key] = value;
}

function presentationFor(
  registration: PhoneSurfaceRegistration,
  surfaceRoot: HTMLElement,
  coverageRoot: HTMLElement,
  mode: PhoneSurfacePresentationReadMode
): PhoneSurfacePresentation {
  return registration.presentation?.(mode)
    ?? readPhoneSurfacePresentation(surfaceRoot, coverageRoot, mode);
}

function themeMeta(documentRef: Document): HTMLMetaElement | null {
  return documentRef.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
}

function captureDocument(documentRef: Document): DocumentSnapshot {
  const documentElement = documentRef.documentElement;
  return {
    documentSurface: documentElement.style.getPropertyValue(
      '--portrait-document-surface'
    ),
    edge: documentElement.dataset.portraitEdgeScene,
    checkpoint: documentElement.dataset.portraitCheckpoint,
    theme: themeMeta(documentRef)?.getAttribute('content') ?? undefined
  };
}

function restoreDocument(documentRef: Document, before: DocumentSnapshot): void {
  const documentElement = documentRef.documentElement;
  if (before.documentSurface) {
    documentElement.style.setProperty(
      '--portrait-document-surface',
      before.documentSurface
    );
  } else {
    documentElement.style.removeProperty('--portrait-document-surface');
  }
  if (before.edge) documentElement.dataset.portraitEdgeScene = before.edge;
  else delete documentElement.dataset.portraitEdgeScene;
  if (before.checkpoint) documentElement.dataset.portraitCheckpoint = before.checkpoint;
  else delete documentElement.dataset.portraitCheckpoint;
  const theme = themeMeta(documentRef);
  if (theme && before.theme !== undefined) {
    theme.setAttribute('content', before.theme);
  }
}

function roleFor(
  snapshot: PhonePresentationSnapshotView,
  projection: PhonePresentationProjection,
  registration: PhoneSurfaceRegistration,
  layerPlan: PhoneTransitionLayerPlan | null
): PhoneSurfaceRole {
  if (layerPlan) {
    if (registration.id === layerPlan.receiver.surface) {
      return 'transition-receiver';
    }
    if (registration.id === layerPlan.source.surface) {
      return 'transition-source';
    }
  }
  if (registration.id === projection.receiverSurface) {
    if (snapshot.status === 'stable') {
      return registration.kind === 'fixed' ? 'fixed-current' : 'stable';
    }
    return projection.commitState === 'candidate'
      ? 'candidate-stable'
      : 'transition-receiver';
  }
  if (registration.id === projection.sourceSurface) return 'transition-source';
  if (registration.kind === 'fixed' && projection.stageOwner !== 'native') {
    return registration.scene === projection.stageScene
      ? 'fixed-current'
      : snapshot.status === 'stable' ? 'retired' : 'retained-under-stage';
  }
  return snapshot.status === 'stable' ? 'retired' : 'retained-under-stage';
}

function transitionLayerPlanFor(
  snapshot: PhonePresentationSnapshotView
): PhoneTransitionLayerPlan | null {
  if (snapshot.projection.commitState !== 'transition') return null;
  if (snapshot.status === 'scroll-run') {
    if (!snapshot.scrollRun) return null;
    return phoneTransitionLayerPlan(
      phoneSegmentPresentationTuple(phoneScrollSegment(snapshot.scrollRun)),
      snapshot.scroll.direction === -1 ? -1 : 1,
      snapshot.scroll.progress
    );
  }
  if (snapshot.status !== 'transaction' || !snapshot.session) return null;
  const operation = snapshot.session.operation;
  if (!operation.run) return null;
  const segment = phoneRunLegSegment(operation.run, operation.legIndex);
  if (!segment) return null;
  return phoneTransitionLayerPlan(
    phoneSegmentPresentationTuple(segment),
    operation.direction,
    snapshot.session.progress
  );
}

function executionEndpoints(
  snapshot: PhonePresentationSnapshotView,
  endpoints: PhoneTransitionEndpoints | null
): PhoneTransitionEndpoints | null {
  return snapshot.status === 'transaction' ? endpoints : null;
}

function scheduleBrowserPresentationFrame(callback: () => void): () => void {
  // The non-browser branch exists for deterministic SSR/unit-test execution.
  // A mounted route always crosses requestAnimationFrame before a static or
  // reading proof is allowed to enter the reducer.
  if (
    typeof window === 'undefined'
    || typeof window.requestAnimationFrame !== 'function'
  ) {
    callback();
    return () => undefined;
  }
  let cancelled = false;
  const frame = window.requestAnimationFrame(() => {
    if (!cancelled) callback();
  });
  return () => {
    cancelled = true;
    window.cancelAnimationFrame(frame);
  };
}

export function createPhoneStoryPresentation({
  authorityId,
  scope,
  root,
  schedulePresentationFrame = scheduleBrowserPresentationFrame
}: Readonly<{
  authorityId: string;
  scope: PhoneRouteScope;
  root: () => HTMLElement | null;
  schedulePresentationFrame?: PhonePresentationFrameScheduler;
}>): PhoneStoryPresentation {
  const token = {};
  const registrations = new Map<string, PhoneSurfaceRegistration>();
  const effects = new Map<string, PhoneEffectRegistration>();
  const activeAdapters = new Map<string, Readonly<{
    token: PresentationToken;
    report: (proof: PresentationProof) => void;
    dispose(): void;
    /** Static/reading bindings retry on the next projected browser paint. */
    requestFrame?(): void;
  }>>();
  const ownedRoots = new Set<HTMLElement>();
  const decoratedEndpoints = new Set<HTMLElement>();
  const decoratedLayers = new Set<HTMLElement>();
  const decoratedEffects = new Set<HTMLElement>();
  let attached = false;
  let disposed = false;
  let endpoints: PhoneTransitionEndpoints | null = null;
  let checkpointTrace: readonly PhoneCheckpointId[] = [];
  let latestPlan: PhonePresentationPlan | null = null;
  let presentationFrameSequence = 0;

  const ownRoot = (element: HTMLElement) => {
    rootOwners.set(element, token);
    ownedRoots.add(element);
  };
  const ownDocument = (documentRef: Document) => {
    const existing = documentOwners.get(documentRef);
    if (!existing || existing.token !== token) {
      documentOwners.set(documentRef, {
        token,
        before: existing?.before ?? captureDocument(documentRef)
      });
    }
  };
  const clearLayer = (element: HTMLElement) => {
    if (layerOwners.get(element) !== token) return;
    data(element, 'phoneLayerRole', undefined);
    layerOwners.delete(element);
    decoratedLayers.delete(element);
  };
  const decorateLayer = (
    element: HTMLElement,
    role: PhonePresentationLayer
  ) => {
    layerOwners.set(element, token);
    decoratedLayers.add(element);
    data(element, 'phoneLayerRole', role);
  };
  const clearEffectDecorations = () => {
    for (const element of decoratedEffects) {
      clearLayer(element);
      data(element, 'phoneEffectHost', undefined);
      data(element, 'phoneEffectSegment', undefined);
    }
    decoratedEffects.clear();
  };
  const decorateEffects = (layerPlan: PhoneTransitionLayerPlan | null) => {
    clearEffectDecorations();
    if (!layerPlan) return;
    for (const registration of effects.values()) {
      if (canonicalPhoneEffectSegment(registration.id) !== layerPlan.segment) continue;
      const host = registration.host();
      const effect = registration.element();
      if (!connected(host) || !connected(effect)) continue;
      decorateLayer(effect, layerPlan.effect.role);
      data(effect, 'phoneEffectHost', layerPlan.effect.host);
      data(effect, 'phoneEffectSegment', layerPlan.segment);
      decoratedEffects.add(effect);
    }
  };
  const clearEndpointDecorations = (next: readonly HTMLElement[] = []) => {
    for (const element of decoratedEndpoints) {
      if (next.includes(element)) continue;
      decoratedEndpoints.delete(element);
      if (rootOwners.get(element) !== token) continue;
      data(element, 'phoneBoundarySession', undefined);
      data(element, 'phoneBoundaryGeneration', undefined);
      data(element, 'phoneBoundaryEndpoint', undefined);
      clearLayer(element);
      if (element.dataset.phoneSurfaceRole?.startsWith('transition-')) {
        data(element, 'phoneSurfaceRole', undefined);
      }
      if (!ownedRoots.has(element)) rootOwners.delete(element);
    }
  };
  const nextTrace = (checkpoint: PhoneCheckpointId): readonly PhoneCheckpointId[] => {
    if (checkpointTrace.at(-1) === checkpoint) return checkpointTrace;
    return [...checkpointTrace.slice(-63), checkpoint];
  };
  const documentRef = () => typeof document === 'undefined' ? null : document;

  const samePresentationToken = (
    left: PresentationToken,
    right: PresentationToken
  ): boolean => left.authorityId === right.authorityId
    && left.sessionId === right.sessionId
    && left.generation === right.generation
    && left.leg === right.leg
    && left.revision === right.revision
    && left.subject === right.subject
    && left.kind === right.kind;

  const effectForSubject = (subject: string): PhoneEffectRegistration | null => {
    for (const registration of effects.values()) {
      const segment = canonicalPhoneEffectSegment(registration.id);
      if (segment && phoneSegmentPresentationTuple(segment)[6] === subject) {
        return registration;
      }
    }
    return null;
  };

  const proofForRenderedFrame = (
    frame: PhoneRenderedPresentationFrame
  ): PresentationProof | null => {
    if (
      !Number.isInteger(frame.frameSequence)
      || frame.frameSequence <= 0
      || !Number.isFinite(frame.observedAt)
      || frame.token.authorityId !== authorityId
    ) {
      return null;
    }
    const surface = registrations.get(frame.token.subject);
    if (surface) {
      const contract = phoneScenePresentationTuple(surface.scene);
      const targetBinding = activeAdapters.get(frame.token.subject);
      // The reduced runner invokes a native leaf directly, rather than
      // installing a presentation-plane adapter. Its one post-layout frame is
      // still a terminal physical fact, but only an explicitly identified
      // native static poster may take that route. A fixed surface must expose
      // an equally exact scene-local marker verifier; generic/no-origin
      // callbacks remain transition-source candidates and cannot self-commit.
      const declaredLeafStaticPoster = frame.origin === 'leaf-static-poster'
        && frame.token.kind === 'static-poster'
        && (
          surface.kind === 'native'
          || surface.staticPoster?.(frame.token) === true
        );
      const edge = declaredLeafStaticPoster
        ? phoneScenePresentationTuple(surface.scene)[1]
        : phoneSurfaceRenderedProofEdge(
          surface.scene,
          frame.token.subject,
          frame.token.kind,
          // A token-bound adapter reports its own terminal visual hold. A
          // generic compositor callback has no such binding, so the same
          // source canvas instead proves the receiver edge of its handoff.
          frame.origin === 'segment-first-frame'
            || !targetBinding
            || !samePresentationToken(targetBinding.token, frame.token)
        );
      if (!edge) {
        return null;
      }
      const surfaceRoot = surface.root();
      const coverageRoot = surface.coverageRoot?.() ?? surfaceRoot;
      if (!connected(surfaceRoot) || !connected(coverageRoot)) {
        return null;
      }
      // The generic surface facts intentionally carry no authored-content
      // claim. A static/reading proof must therefore recover its content
      // predicate from this scene's manifest contract, just as direct-entry
      // readiness does. Visual leaves still prove their actual draw through
      // the bound adapter below.
      const facts = surface.presentation?.('committed')
        ?? readPhoneScenePresentation(
          surface.scene,
          surfaceRoot,
          coverageRoot,
          'committed'
        );
      const sourceLedCanvasFrame = frame.token.kind === 'packed-canvas-frame'
        && surfaceRoot.dataset.phoneSurfaceRole === 'transition-source';
      const frameVisible = sourceLedCanvasFrame
        ? visible(surfaceRoot, 'committed')
        : facts[1];
      const frameCoverage = sourceLedCanvasFrame
        ? visible(coverageRoot, 'committed') && coversLiveViewport(coverageRoot)
        : facts[2];
      if (!facts[0] || !frameVisible || !frameCoverage) {
        return null;
      }
      // A browser frame alone is not enough for authored text/poster holds:
      // its manifest-scoped content must also be present in that frame.
      if (
        (contract[6] === 'reading' || contract[6] === 'static')
        && !facts[3]
      ) {
        return null;
      }
      const proof = {
        token: frame.token,
        frameSequence: frame.frameSequence,
        observedAt: frame.observedAt,
        connected: facts[0],
        visible: frameVisible,
        coverageComplete: frameCoverage,
        edge
      };
      return proof;
    }
    const effect = effectForSubject(frame.token.subject);
    if (!effect) {
      return null;
    }
    const effectRoot = effect.element();
    const facts = readPhoneSurfacePresentation(
      effectRoot,
      effectRoot,
      'committed'
    );
    if (!facts[0] || !facts[1] || !facts[2]) {
      return null;
    }
    const segment = canonicalPhoneEffectSegment(effect.id);
    if (!segment) {
      return null;
    }
    if (frame.token.kind !== phoneSegmentPresentationTuple(segment)[8]) {
      return null;
    }
    const proof = {
      token: frame.token,
      frameSequence: frame.frameSequence,
      observedAt: frame.observedAt,
      connected: facts[0],
      visible: facts[1],
      coverageComplete: facts[2],
      edge: phoneScenePresentationTuple(phoneSegmentPresentationTuple(segment)[3])[1]
    };
    return proof;
  };

  return {
    attach() {
      if (!disposed) attached = true;
    },
    preflight(snapshot, options) {
      if (disposed) return null;
      const routeRoot = root();
      if ((attached && !routeRoot) || (routeRoot && !connected(routeRoot))) {
        return null;
      }
      const presentationSnapshot = presentationSnapshotView(snapshot);
      const projection = presentationSnapshot.projection;
      const layerPlan = transitionLayerPlanFor(presentationSnapshot);
      const admitsDormantParticipants = projection.commitState === 'candidate'
        || (
          presentationSnapshot.status === 'transaction'
          && presentationSnapshot.session?.phase === 'preparing'
        )
        // A valid first-frame reducer transition is an atomic hand-off:
        // this projection is what lets React reveal the receiver that the
        // following diagnostic pass will validate strictly.
        || (
          options?.admitFirstFrameProjection === true
          && presentationSnapshot.status === 'transaction'
          && presentationSnapshot.session?.phase === 'animating'
        );
      const sourceLedMediaHandoff = presentationSnapshot.status === 'transaction'
        && presentationSnapshot.session?.phase === 'animating'
        && layerPlan !== null
        && phoneSegmentPresentationTuple(layerPlan.segment)[8]
          === 'packed-canvas-frame';
      let mediaHandoffHasLivePlane = false;
      let registeredMediaHandoffPlanes = 0;
      const surfaces: ResolvedSurface[] = [];
      for (const registration of registrations.values()) {
        const selected = registration.id === projection.receiverSurface
          || registration.id === projection.sourceSurface;
        const surfaceRoot = registration.root();
        const coverageRoot = registration.coverageRoot?.() ?? surfaceRoot;
        if (selected && (!connected(surfaceRoot) || !connected(coverageRoot))) {
          return null;
        }
        if (!connected(surfaceRoot) || !connected(coverageRoot)) continue;
        if (selected && sourceLedMediaHandoff) {
          registeredMediaHandoffPlanes += 1;
        }
        const presentation = presentationFor(
          registration,
          surfaceRoot,
          coverageRoot,
          'preflight'
        );
        // The source remains the one physical renderer during a packed-canvas
        // dissolve. Its interaction role is inert, but that must not make a
        // painted, viewport-covering canvas disappear from the handoff plan.
        const sourceLedCanvasSource = sourceLedMediaHandoff
          && registration.id === projection.sourceSurface;
        const physicalVisible = sourceLedCanvasSource
          ? visible(surfaceRoot, 'committed')
          : presentation[1];
        const physicalCoverage = sourceLedCanvasSource
          ? visible(coverageRoot, 'committed') && coversLiveViewport(coverageRoot)
          : presentation[2];
        /*
         * Admission and proof are deliberately different predicates.
         *
         * A candidate receiver is normally inert/hidden until this very
         * projection assigns it the candidate role. Requiring its committed
         * visibility or coverage here creates a cycle: it cannot be projected
         * until it is visible, and cannot become visible until it is
         * projected. A registered, connected participant is sufficient to
         * admit the atomic candidate plane. Its own token-bound frame and
         * coverage facts still gate PRESENTATION_COMMITTED in the machine.
        */
        if (selected && !presentation[0]) {
          return null;
        }
        if (selected && sourceLedMediaHandoff && physicalVisible && physicalCoverage) {
          mediaHandoffHasLivePlane = true;
        }
        // A preparing transition is the same admission boundary in a
        // different projection shape: its target can still be inert until
        // this atomic role application reaches React. A source-led packed
        // media handoff transfers its one physical plane between source and
        // receiver, so it validates the pair after this loop rather than
        // requiring each participant to be visible at every frame.
        if (
          selected
          && !admitsDormantParticipants
          && !sourceLedMediaHandoff
          && (!presentation[1] || !presentation[2])
        ) {
          return null;
        }
        surfaces.push({
          registration,
          root: surfaceRoot,
          coverageRoot,
          role: roleFor(presentationSnapshot, projection, registration, layerPlan)
        });
      }
      if (
        sourceLedMediaHandoff
        && registeredMediaHandoffPlanes > 0
        && !mediaHandoffHasLivePlane
      ) {
        return null;
      }
      return {
        snapshot,
        root: routeRoot,
        surfaces,
        endpoints: executionEndpoints(presentationSnapshot, endpoints),
        layerPlan,
        checkpointTrace: nextTrace(projection.checkpoint)
      };
    },
    apply(plan) {
      if (disposed) return;
      const {
        snapshot: presentationSnapshot,
        root: routeRoot,
        surfaces,
        layerPlan
      } = plan;
      const snapshot = presentationSnapshotView(presentationSnapshot);
      const nextEndpoints = plan.endpoints
        ? [plan.endpoints.source, plan.endpoints.receiver]
        : [];
      clearEndpointDecorations(nextEndpoints);
      const projection = snapshot.projection;
      if (routeRoot) {
        ownRoot(routeRoot);
        const execution = snapshot.status === 'transaction'
          ? snapshot.session?.operation ?? null
          : null;
        const cursor = snapshot.status === 'stable'
          ? `hold:${snapshot.stableScene ?? projection.semanticScene}`
          : snapshot.status === 'scroll-run'
            ? `transition:${snapshot.scrollRun ?? 'scroll'}:0`
            : `transition:${execution?.run ?? 'entry'}:${execution?.legIndex ?? 0}`;
        const session = snapshot.status === 'transaction' ? snapshot.session : null;
        const edgeSurface = phoneEdgeSurfaceForScene(projection.edge);
        data(routeRoot, 'phoneAuthorityId', authorityId);
        data(routeRoot, 'phoneAuthorityScope', scope);
        data(routeRoot, 'phoneCursor', cursor);
        data(routeRoot, 'phoneRevision', String(snapshot.revision));
        data(routeRoot, 'phonePresentationRevision', String(projection.revision));
        data(routeRoot, 'phoneSession', session?.sessionId);
        data(routeRoot, 'phoneTransitionGeneration', session
          ? String(session.generation)
          : undefined);
        data(routeRoot, 'phoneTransitionLeg', session
          ? String(session.operation.legIndex)
          : undefined);
        data(routeRoot, 'phoneTransitionDirection', session
          ? String(session.operation.direction)
          : undefined);
        data(routeRoot, 'phoneTransitionProgress', session
          ? session.progress.toFixed(4)
          : undefined);
        data(routeRoot, 'phoneSegment', snapshot.status === 'transaction'
          ? snapshot.projection.checkpoint
          : undefined);
        data(routeRoot, 'phoneTransitionPhase', session?.phase);
        data(routeRoot, 'phoneTransitionLock', session ? 'locked' : undefined);
        data(routeRoot, 'phoneInputState', session ? 'locked' : 'free');
        data(routeRoot, 'phoneScrollCorridor', snapshot.scroll.corridor ?? undefined);
        data(routeRoot, 'phoneScrollProgress', snapshot.scroll.progress.toFixed(4));
        data(routeRoot, 'phoneStageOwner', projection.stageOwner);
        data(routeRoot, 'phoneStageScene', projection.stageScene ?? 'none');
        data(routeRoot, 'phoneProjectionState', projection.commitState);
        data(routeRoot, 'phoneStableScene', snapshot.status === 'stable'
          ? snapshot.stableScene ?? undefined
          : undefined);
        data(routeRoot, 'phoneAnchorY', !session || session.anchor.y === null
          ? undefined
          : String(Math.round(session.anchor.y)));
        data(routeRoot, 'phoneRetryableRun', snapshot.retryableRun ?? undefined);
        data(routeRoot, 'phoneLayerSegment', layerPlan?.segment);
        data(routeRoot, 'portraitCheckpoint', projection.checkpoint);
        data(routeRoot, 'portraitCheckpointTrace', plan.checkpointTrace.join('>'));
        data(routeRoot, 'portraitEdgeScene', projection.edge);
        data(routeRoot, 'portraitEdgeSurface', edgeSurface);
        routeRoot.style?.setProperty('--portrait-edge-surface', edgeSurface);
        const stageViewport = routeRoot.querySelector?.(
          '.portrait-scroll-spike__stage-viewport'
        );
        if (
          typeof HTMLElement !== 'undefined'
          && stageViewport instanceof HTMLElement
        ) {
          data(stageViewport, 'portraitEdgeScene', projection.edge);
        }
        const page = documentRef();
        if (page) {
          ownDocument(page);
          page.documentElement.style.setProperty(
            '--portrait-document-surface',
            edgeSurface
          );
          page.documentElement.dataset.portraitEdgeScene = projection.edge;
          page.documentElement.dataset.portraitCheckpoint = projection.checkpoint;
          const theme = themeMeta(page);
          if (theme) theme.setAttribute('content', edgeSurface);
        }
      }
      for (const surface of surfaces) {
        data(surface.root, 'phoneSurfaceRole', surface.role);
        const layer = layerPlan && surface.registration.id === layerPlan.source.surface
          ? layerPlan.source.role
          : layerPlan && surface.registration.id === layerPlan.receiver.surface
            ? layerPlan.receiver.role
            : phoneLayerForSurfaceRole(surface.role);
        decorateLayer(surface.root, layer);
        delete surface.root.dataset.phoneBoundarySession;
        delete surface.root.dataset.phoneBoundaryGeneration;
        delete surface.root.dataset.phoneBoundaryEndpoint;
      }
      if (plan.endpoints) {
        const { source, receiver, sessionId, generation } = plan.endpoints;
        data(source, 'phoneSurfaceRole', 'transition-source');
        data(receiver, 'phoneSurfaceRole', 'transition-receiver');
        decorateLayer(
          source,
          layerPlan?.source.role ?? phoneLayerForSurfaceRole('transition-source')
        );
        decorateLayer(
          receiver,
          layerPlan?.receiver.role ?? phoneLayerForSurfaceRole('transition-receiver')
        );
        for (const [element, endpoint] of [[source, 'source'], [receiver, 'receiver']] as const) {
          data(element, 'phoneBoundarySession', sessionId);
          data(element, 'phoneBoundaryGeneration', String(generation));
          data(element, 'phoneBoundaryEndpoint', endpoint);
          rootOwners.set(element, token);
          decoratedEndpoints.add(element);
        }
      }
      decorateEffects(layerPlan);
      checkpointTrace = plan.checkpointTrace;
      latestPlan = plan;
    },
    reapplyCurrent() {
      if (latestPlan) this.apply(latestPlan);
    },
    registerSurface(registration) {
      registrations.set(registration.id, registration);
      return {
        dispose() {
          if (registrations.get(registration.id) === registration) {
            const active = activeAdapters.get(registration.id);
            active?.dispose();
            activeAdapters.delete(registration.id);
            registrations.delete(registration.id);
          }
        }
      };
    },
    registerEffect(registration) {
      effects.set(registration.id, registration);
      return {
        dispose() {
          if (effects.get(registration.id) !== registration) return;
          effects.delete(registration.id);
          const element = registration.element();
          if (element) {
            data(element, 'phoneEffectHost', undefined);
            data(element, 'phoneEffectSegment', undefined);
            clearLayer(element);
          }
        }
      };
    },
    hasPresentedSurface(scene) {
      const presentation = this.readSurfacePresentation(scene);
      return Boolean(
        presentation?.[0]
        && presentation[1]
        && presentation[2]
      );
    },
    readSurfacePresentation(scene) {
      const receiver = phoneScenePresentationTuple(scene)[4];
      const registration = registrations.get(receiver);
      if (!registration) return null;
      const surfaceRoot = registration.root();
      const coverageRoot = registration.coverageRoot?.() ?? surfaceRoot;
      if (!connected(surfaceRoot) || !connected(coverageRoot)) return null;
      // A direct target is proven by its manifest-scoped content contract.
      // Custom readers remain only for tests that deliberately inject facts.
      return registration.presentation?.('committed')
        ?? readPhoneScenePresentation(scene, surfaceRoot, coverageRoot, 'committed');
    },
    activatePresentationAdapter(scene, presentationToken, report) {
      const contract = phoneScenePresentationTuple(scene);
      const admission = phoneDirectEntryAdmissionTuple(scene);
      const receiver = contract[4];
      if (
        presentationToken.authorityId !== authorityId
        || presentationToken.subject !== receiver
        || presentationToken.kind !== admission[1]
      ) return;
      const registration = registrations.get(receiver);
      const active = activeAdapters.get(receiver);
      if (
        active
        && samePresentationToken(active.token, presentationToken)
      ) {
        active.requestFrame?.();
        return;
      }
      active?.dispose();
      const adapter = registration?.adapter;
      if (adapter) {
        const binding = {
          token: presentationToken,
          report,
          dispose: () => adapter.dispose?.(presentationToken)
        } as const;
        activeAdapters.set(receiver, binding);
        adapter.present(presentationToken, (frame) => {
          const current = activeAdapters.get(receiver);
          if (
            current !== binding
            || !samePresentationToken(frame.token, binding.token)
          ) return;
          const proof = proofForRenderedFrame(frame);
          if (proof) binding.report(proof);
        });
        return;
      }
      // Only a manifest-declared DOM post-paint target may use this fallback.
      // Static/canvas/media targets require their leaf adapter and therefore
      // fail closed when it is absent; no receiver-name exception is allowed.
      if (
        !registration
        || admission[0] !== 'dom-post-paint'
        || admission[6]
      ) return;
      let cancel: () => void = () => undefined;
      let framePending = false;
      const requestFrame = () => {
        if (framePending) return;
        framePending = true;
        cancel = schedulePresentationFrame(() => {
          framePending = false;
          if (activeAdapters.get(receiver) !== binding) return;
          const proof = proofForRenderedFrame({
            token: presentationToken,
            frameSequence: ++presentationFrameSequence,
            observedAt: typeof performance !== 'undefined'
              && typeof performance.now === 'function'
              ? performance.now()
              : 0
          });
          if (proof) binding.report(proof);
        });
      };
      const binding = {
        token: presentationToken,
        report,
        dispose: () => cancel(),
        requestFrame
      } as const;
      activeAdapters.set(receiver, binding);
      requestFrame();
    },
    proofForRenderedFrame,
    readPresentationReadiness(scene, presentationToken) {
      const [
        ,
        ,
        ,
        ,
        receiver,
        ,
        contentProbeKind
      ] = phoneScenePresentationTuple(scene);
      if (
        presentationToken.authorityId !== authorityId
        || presentationToken.subject !== receiver
        || contentProbeKind === 'visual'
        || contentProbeKind === 'static-visual'
      ) return null;
      const registration = registrations.get(receiver);
      if (!registration) return null;
      const surfaceRoot = registration.root();
      const coverageRoot = registration.coverageRoot?.() ?? surfaceRoot;
      if (!connected(surfaceRoot) || !connected(coverageRoot)) return null;
      const [isConnected, isVisible, coverageComplete] = (
        registration.presentation?.('committed')
        ?? readPhoneScenePresentation(scene, surfaceRoot, coverageRoot, 'committed')
      );
      if (!isConnected || !isVisible || !coverageComplete) return null;
      return {
        token: presentationToken,
        observedAt: typeof performance !== 'undefined'
          && typeof performance.now === 'function'
          ? performance.now()
          : 0,
        connected: isConnected,
        visible: isVisible,
        coverageComplete
      };
    },
    prepareDirectEntry(scene, request) {
      const contract = phoneScenePresentationTuple(scene);
      const receiver = contract[4];
      const registration = registrations.get(receiver);
      if (!registration) {
        throw new Error('No phone surface registration for direct entry: ' + scene);
      }
      if (!registration.prepareDirectEntry) {
        if (contract[6] === 'visual') {
          throw new Error('Visual phone surface has no direct-entry preparation: ' + scene);
        }
        return;
      }
      return registration.prepareDirectEntry(request);
    },
    registerTransitionEndpoints(next) {
      endpoints = next;
    },
    clearTransitionEndpoints() {
      endpoints = null;
    },
    rootForScene(scene) {
      for (const registration of registrations.values()) {
        if (registration.scene === scene) return registration.root();
      }
      return null;
    },
    dispose() {
      if (disposed) return;
      clearEndpointDecorations();
      clearEffectDecorations();
      for (const element of [...decoratedLayers]) clearLayer(element);
      disposed = true;
      endpoints = null;
      for (const active of activeAdapters.values()) {
        active.dispose();
      }
      activeAdapters.clear();
      registrations.clear();
      effects.clear();
      for (const ownedRoot of ownedRoots) {
        if (rootOwners.get(ownedRoot) === token) {
          for (const key of rootDataKeys) data(ownedRoot, key, undefined);
          ownedRoot.style?.removeProperty('--portrait-edge-surface');
          rootOwners.delete(ownedRoot);
        }
      }
      ownedRoots.clear();
      const page = documentRef();
      if (page) {
        const owner = documentOwners.get(page);
        if (owner?.token === token) {
          restoreDocument(page, owner.before);
          documentOwners.delete(page);
        }
      }
    }
  };
}
