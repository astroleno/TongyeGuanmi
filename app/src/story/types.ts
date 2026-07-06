import type { ComponentType, ReactNode } from 'react';

export const SCENE_IDS = [
  'hero',
  'pattern',
  'star-map',
  'aod-animation',
  'method-top',
  'method-bottom',
  'figure2-animation',
  'figure2-proof-opening',
  'figure2-proof-cards',
  'figure2-proof-closing',
  'brand',
  'figure3-animation',
  'services',
  'ttg-animation',
  'lab',
  'ph-animation',
  'education',
  'crane-animation',
  'contact'
] as const;

export const SEGMENT_IDS = [
  'hero-pattern',
  'pattern-star-map',
  'star-map-aod',
  'aod-method-top',
  'method-top-method-bottom',
  'method-bottom-figure2',
  'figure2-distance-expand',
  'figure2-proof-opening-cards',
  'figure2-proof-cards-closing',
  'figure2-proof-brand',
  'brand-figure3',
  'figure3-services',
  'services-ttg',
  'ttg-lab',
  'lab-ph',
  'ph-education',
  'education-crane',
  'crane-contact'
] as const;

export type SceneId = (typeof SCENE_IDS)[number];
export type SegmentId = (typeof SEGMENT_IDS)[number];
export type Direction = 1 | -1;
export type SegmentRunId = `run:${string}`;
export type PrepareToken = `prepare:${string}`;
export type MilestoneKey =
  | 'targetReady'
  | 'timelineReady'
  | 'mediaReady'
  | 'copyCue'
  | 'stagePaused'
  | 'stageResumed';

export type SegmentPolicy =
  | { kind: 'snap'; chargeThreshold: number; interruptible?: boolean }
  | { kind: 'scrub'; snapAfterIdleMs: number }
  | { kind: 'stagedSnap'; stops: readonly number[]; playMs: readonly number[]; postScrollVh?: number }
  | { kind: 'reading'; anchor: SceneId; edgeArm?: 'bottom' | 'top' };

export type MediaKey = string;

export type SegmentVisual =
  | {
      type: 'ink';
      ink: 'center-expand' | 'left-rotate-expand' | 'horizontal' | 'sun-radial';
      direction?: 'bottom-to-top' | 'top-to-bottom';
    }
  | { type: 'media'; media: readonly MediaKey[] }
  | { type: 'internal'; milestone: string };

export type CopyCue = {
  targetScene: SceneId;
  atProgress: number;
};

export type MediaPlaybackDirectionContract = {
  mode: 'play' | 'scrub' | 'timeline' | 'static-fallback' | 'none';
  required: boolean;
};

export type MediaPlaybackContract = {
  id: string;
  media: readonly MediaKey[];
  forward: MediaPlaybackDirectionContract;
  reverse: MediaPlaybackDirectionContract;
  readyMilestones: readonly MilestoneKey[];
  terminalFallbackScene: SceneId;
  preparingTimeoutMs: number;
};

export type SpineHoldNode = {
  kind: 'hold';
  scene: SceneId;
  reading: boolean;
  staticFallback: boolean;
  buildTimeoutMs?: number;
};

export type SpineSegmentNode = {
  kind: 'segment';
  id: SegmentId;
  from: SceneId;
  to: SceneId;
  policy: SegmentPolicy;
  virtualDuration: number;
  visual?: SegmentVisual;
  copyCue?: CopyCue;
  mediaPlayback?: readonly MediaPlaybackContract[];
  buildTimeoutMs?: number;
};

export type SpineNode = SpineHoldNode | SpineSegmentNode;

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

export type SceneComponentProps = {
  scene: SceneId;
  hidden: boolean;
  children?: ReactNode;
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
  mount?(layer: LayerHandle): Promise<void> | void;
  dispose?(): Promise<void> | void;
};

export type SegmentTimelineHandle = {
  play(direction: Direction): Promise<void>;
  progress(value: number): void;
  reverse(): Promise<void>;
  jumpToEnd(direction: Direction): void;
  dispose(): void;
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

export type TransitionModule = {
  id: SegmentId;
  requiredMilestones?: readonly MilestoneKey[];
  copyCue?: CopyCue;
  mediaPlayback?: readonly MediaPlaybackContract[];
  buildTimeline(context: TransitionContext): Promise<SegmentTimelineHandle> | SegmentTimelineHandle;
  reducedMotionFallback?(context: TransitionContext): Promise<void> | void;
  dispose?(): void;
};

export type MilestoneReport = {
  key: MilestoneKey;
  segment: SegmentId;
  runId: SegmentRunId;
  direction: Direction;
  progress?: number;
};

export type SegmentResult =
  | { status: 'completed'; runId: SegmentRunId; segment: SegmentId; direction: Direction }
  | { status: 'aborted'; runId: SegmentRunId; segment: SegmentId; reason: 'seek' | 'superseded' | 'dispose' | 'recovery' }
  | { status: 'failed'; runId: SegmentRunId; segment: SegmentId; error: unknown };

export type DirectorInputSource = 'wheel' | 'touch' | 'key' | 'hash' | 'menu' | 'devtools';

export type DirectorEvent =
  | { type: 'BOOT' }
  | { type: 'BOOT_READY'; initialScene: SceneId }
  | { type: 'BOOT_FAILED'; error: unknown }
  | { type: 'CHARGE_FIRED'; direction: Direction; source: DirectorInputSource; ttlMs?: number }
  | { type: 'PREPARE_REQUESTED'; segment: SegmentId; direction: Direction; token: PrepareToken }
  | { type: 'PREPARE_READY'; segment: SegmentId; token: PrepareToken }
  | { type: 'PREPARE_FAILED'; segment: SegmentId; token: PrepareToken; error: unknown }
  | { type: 'SEGMENT_STARTED'; segment: SegmentId; runId: SegmentRunId; direction: Direction }
  | { type: 'SEGMENT_FINISHED'; result: SegmentResult }
  | { type: 'STAGE_PAUSED'; segment: SegmentId; runId: SegmentRunId; pausePoint: number }
  | { type: 'STAGE_RESUMED'; segment: SegmentId; runId: SegmentRunId }
  | { type: 'SEEK_REQUESTED'; target: SceneId; source: DirectorInputSource }
  | { type: 'RECOVERY_REQUESTED'; segment?: SegmentId; error: unknown };

export type StoryManifest = {
  version: 0;
  defaults: {
    buildTimeoutMs: number;
    chargeThreshold: number;
    chargeDecayPerMs: number;
    settlingMs: number;
  };
  inventory: {
    source: 'R-1';
    generatedAt: string;
    interruptibleCandidates: readonly SegmentId[];
  };
  nodes: readonly SpineNode[];
};

const sceneIdSet = new Set<string>(SCENE_IDS);
const segmentIdSet = new Set<string>(SEGMENT_IDS);

export function isSceneId(value: string): value is SceneId {
  return sceneIdSet.has(value);
}

export function isSegmentId(value: string): value is SegmentId {
  return segmentIdSet.has(value);
}
