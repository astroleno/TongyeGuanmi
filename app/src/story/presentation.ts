import type { ComponentType, ReactNode } from 'react';
import type {
  Direction,
  MediaKey,
  MilestoneKey,
  PrepareToken,
  SceneId,
  SegmentId,
  SegmentRunId,
  SpineSegmentNode
} from './types';

/**
 * Presentation-only contracts.  The canonical story model deliberately does
 * not import these types: a shell may render the same product spine through a
 * Stage/Director implementation, a phone rail, or a static fallback.
 */
export type LayerVisibilityState = {
  mounted: boolean;
  visible: boolean;
  inert: boolean;
  opacity: number;
  pointerEvents: 'auto' | 'none';
};

export type VisibilityPredicate = (state: LayerVisibilityState) => boolean;

export type StageLayerRole = 'prev' | 'current' | 'next' | 'retiring';

export type LayerHandle = {
  scene: SceneId;
  role: StageLayerRole;
  element: HTMLElement | null;
  visibility: LayerVisibilityState;
  setVisibility(state: LayerVisibilityState): void;
  dispose(): void;
};

export type StageHandle = {
  getLayer(scene: SceneId): LayerHandle | undefined;
  ensureLayer(scene: SceneId, role: StageLayerRole): LayerHandle;
  releaseLayer(scene: SceneId): void;
  snapshot(): readonly LayerHandle[];
};

export type MediaPlaybackHandle = {
  key: MediaKey;
  readyMilestone: MilestoneKey;
  preparingTimeoutMs: number;
  canReverse: boolean;
  jumpToEnd(): Promise<void> | void;
  play(direction: Direction, runId: SegmentRunId): Promise<void> | void;
  pause(): void;
  dispose(): void;
};

export type ScenePreloadResult = {
  milestones: readonly MilestoneKey[];
  media?: readonly MediaPlaybackHandle[];
};

export type HeroIntroMode = 'waiting' | 'running' | 'complete' | 'endpoint';

export type ScenePresentationState = Readonly<{
  heroIntroMode?: HeroIntroMode;
  reducedMotion?: boolean;
  onHeroIntroComplete?: () => void;
}>;

/**
 * Renderer-neutral lifecycle shared by presentation adapters. Desktop
 * Stage/Director modules and native-scroll phone adapters may expose different
 * build APIs, but their mounted visual owners use the same teardown semantics.
 */
export type PresentationAdapterLifecycle = {
  enter?(): void;
  leave?(): void;
  reverse?(): void;
  dispose?(): void;
};

/**
 * This is the phone's lazy receiver boundary. The shared story contract does
 * not own phone runtime types, so it carries the runtime's immutable token as
 * an opaque object. Renderer-local adapters may derive a key internally, but
 * no direct entry may serialize its authority identity in transit.
 */
export type TargetPresentationRequest = Readonly<{
  progress: number;
  direction: 1 | -1;
  runId: string;
  /** Full authority/session/revision/subject/kind identity for this proof. */
  presentationToken: object;
  signal: AbortSignal;
  /** A cold/hash/menu entry must settle an actual receiver presentation. */
  directEntry?: boolean;
}>;

export type ScenePresentationAdapterHandle = PresentationAdapterLifecycle & {
  root(): HTMLElement | null;
  /**
   * The concrete media/compositor element that must occupy the transition
   * effect plane for a media handoff. This keeps layering explicit without
   * asking the route presentation owner to discover children in the DOM.
   */
  effectRoot?(): HTMLElement | null;
  update(progress: number): void;
  /**
   * Resolves only after the receiver owns a physically presented frame or an
   * explicit canonical static plate. A rejected promise is retryable and must
   * never be interpreted as permission to commit the downstream endpoint.
   */
  prepareTargetPresentation?(
    request: TargetPresentationRequest
  ): Promise<void>;
};

export type TransitionPresentationAdapterHandle = PresentationAdapterLifecycle & {
  render(progress: number): void;
  prepare?(direction: 1 | -1, signal: AbortSignal): Promise<void>;
};

export type SceneComponentProps = {
  scene: SceneId;
  hidden: boolean;
  /** Packed-alpha phone surfaces may create their own Canvas after mount. */
  packedCanvasOwner?: 'scene' | 'surface';
  role?: StageLayerRole;
  children?: ReactNode;
  copyCueActive?: boolean;
  presentation?: ScenePresentationState;
  registerHandle?: (name: string, element: HTMLElement | null) => void;
};

export type StaticFallbackContract = {
  sectionIds: readonly string[];
  text: readonly string[];
};

export type SceneModule = {
  id: SceneId;
  Component: ComponentType<SceneComponentProps>;
  staticFallback?: StaticFallbackContract;
  requiredHandles?: readonly string[];
  preload(): Promise<ScenePreloadResult> | ScenePreloadResult;
  renderHold(layerRoot: HTMLElement | null): void;
  mount?(layer: LayerHandle): Promise<void> | void;
  dispose?(): Promise<void> | void;
};

export type SegmentSceneRootIdentity = {
  from: HTMLElement | null;
  to: HTMLElement | null;
};

export type StagedLegPreparation = Readonly<{
  runId: SegmentRunId;
  segment: SegmentId;
  direction: Direction;
  legIndex: number;
  from: number;
  to: number;
  durationMs: number;
  resumedStageIndex?: number;
  signal: AbortSignal;
}>;

export type SegmentTimelineHandle = {
  play(direction: Direction): Promise<void>;
  progress(value: number): void;
  reverse(): Promise<void>;
  jumpToEnd(direction: Direction): void;
  dispose(): void;
  labels?: Readonly<Record<string, number>>;
  pauses?: readonly string[];
  sample?(progress: number): {
    from: LayerVisibilityState;
    to: LayerVisibilityState;
    copyCueActive?: boolean;
  };
  rootIdentity?(): SegmentSceneRootIdentity;
  effectCanvases?(): readonly HTMLCanvasElement[];
  prepareLeg?(leg: StagedLegPreparation): Promise<void> | void;
  commitLeg?(leg: StagedLegPreparation): void;
};

export type TransitionContext = {
  segment: SpineSegmentNode;
  stage: StageHandle;
  from: LayerHandle;
  to: LayerHandle;
  direction: Direction;
  runId: SegmentRunId;
  prepareToken: PrepareToken;
  prefersReducedMotion: boolean;
  reportMilestone(milestone: MilestoneReport): void;
};

export type TransitionPrewarmContext = {
  segment: SpineSegmentNode;
  stage: StageHandle;
  from: LayerHandle;
  to: LayerHandle;
  direction: Direction;
  prefersReducedMotion: boolean;
};

export type TransitionModule = {
  id: SegmentId;
  requiredMilestones?: readonly MilestoneKey[];
  copyCue?: SpineSegmentNode['copyCue'];
  mediaPlayback?: SpineSegmentNode['mediaPlayback'];
  buildTimeline(context: TransitionContext): Promise<SegmentTimelineHandle> | SegmentTimelineHandle;
  prewarm?(context: TransitionPrewarmContext): Promise<void> | void;
  reducedMotionFallback?(context: TransitionContext): Promise<void> | void;
  dispose?(): void;
};

export type MilestoneReport = {
  key: MilestoneKey;
  segment: SegmentId;
  runId: SegmentRunId;
  direction: Direction;
  progress?: number;
  stageIndex?: number;
};
