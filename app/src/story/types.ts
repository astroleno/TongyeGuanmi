export const SCENE_IDS = [
  'hero',
  'pattern',
  'star-map',
  'aod-animation',
  'method-top',
  'method-bottom',
  'figure2-animation',
  'figure2-proof',
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
export type ActorEpoch = string;
export type SegmentRunId = `${ActorEpoch}:${number}`;
export type PrepareToken = `${ActorEpoch}:prepare:${number}`;
export type MilestoneKey =
  | 'targetReady'
  | 'buildReady'
  | 'timelineReady'
  | 'mediaReady'
  | 'copyCue'
  | 'stagePaused'
  | 'stageResumed';

export type SegmentPolicy =
  | { kind: 'snap'; chargeThreshold: number; interruptible?: boolean }
  | { kind: 'scrub'; snapAfterIdleMs: number }
  | {
      kind: 'stagedSnap';
      stops: readonly number[];
      playMs: readonly number[];
      advance: readonly StagedBoundaryAdvance[];
      postScrollVh?: number;
    }
  | { kind: 'reading'; anchor: SceneId; edgeArm?: 'bottom' | 'top' };

export type StagedBoundaryAdvance =
  | { kind: 'immediate' }
  | { kind: 'gesture' }
  | { kind: 'delay'; ms: number };

export type MediaKey = string;

export type SegmentVisual =
  | {
      type: 'ink';
      ink: 'center-expand' | 'left-rotate-expand' | 'horizontal';
      direction?: 'bottom-to-top' | 'top-to-bottom';
    }
  | { type: 'disappear'; media?: readonly MediaKey[] };

export type CopyCue = {
  targetScene: SceneId;
  atProgress: number;
};

export type MediaPlaybackDirectionContract = {
  mode: 'play' | 'scrub' | 'timeline' | 'static-fallback' | 'none';
  required: boolean;
  media?: readonly MediaKey[];
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
  freshInput?: boolean;
  buildTimeoutMs?: number;
};

export type SpineSegmentNode = {
  kind: 'segment';
  id: SegmentId;
  from: SceneId;
  to: SceneId;
  policy: SegmentPolicy;
  virtualDuration: number;
  requiredMilestones?: readonly MilestoneKey[];
  visual?: SegmentVisual;
  copyCue?: CopyCue;
  mediaPlayback?: readonly MediaPlaybackContract[];
  buildTimeoutMs?: number;
};

export type SpineNode = SpineHoldNode | SpineSegmentNode;

export type {
  HeroIntroMode,
  LayerHandle,
  LayerVisibilityState,
  MediaPlaybackHandle,
  MilestoneReport,
  PresentationAdapterLifecycle,
  ScenePresentationAdapterHandle,
  SceneComponentProps,
  SceneModule,
  ScenePresentationState,
  ScenePreloadResult,
  SegmentSceneRootIdentity,
  SegmentTimelineHandle,
  StageHandle,
  StageLayerRole,
  StagedLegPreparation,
  StaticFallbackContract,
  TransitionContext,
  TransitionPresentationAdapterHandle,
  TransitionModule,
  TransitionPrewarmContext,
  VisibilityPredicate
} from './presentation';

export type SegmentResult =
  | { status: 'completed'; runId: SegmentRunId; segment: SegmentId; direction: Direction }
  | {
      status: 'aborted';
      runId: SegmentRunId;
      segment: SegmentId;
      reason: 'seek' | 'superseded' | 'dispose' | 'recovery';
    }
  | { status: 'failed'; runId: SegmentRunId; segment: SegmentId; error: Error };

export type DirectorInputSource = 'wheel' | 'touch' | 'key';
export type DirectorSeekSource = 'hash' | 'menu' | 'history' | 'recovery';

export type ReadingEntrySource = DirectorSeekSource | 'initial' | 'sequential';

export type ReadingEntryIntent = Readonly<{
  scene: SceneId;
  edge: 'top' | 'bottom';
  source: ReadingEntrySource;
  token: number;
}>;

export type Figure2ProofPanel = 'opening' | 'cards' | 'closing';

export type StoryCursor =
  | { status: 'hold'; scene: SceneId }
  | { status: 'segment'; segment: SegmentId; from: SceneId; to: SceneId }
  | { status: 'settling'; segment: SegmentId; from: SceneId; to: SceneId; target: SceneId };

export type PausePoint = {
  segmentId: SegmentId;
  stageIndex: number;
};

export type QueuedIntent = {
  direction: Direction;
  strength: number;
  deadline: number;
  updatedAt: number;
  ttlMs: number;
  decayRatePerMs: number;
};

export type DirectorEvent =
  | { type: 'BOOT_READY' }
  | { type: 'BOOT_FAILED'; error: unknown }
  | { type: 'INPUT_DELTA'; delta: number; source: DirectorInputSource; now?: number }
  | { type: 'CHARGE_FIRED'; direction: Direction; now?: number }
  | { type: 'TARGET_READY'; scene: SceneId; prepareToken: PrepareToken }
  | { type: 'MEDIA_READY'; key: MilestoneKey; prepareToken?: PrepareToken; runId?: SegmentRunId }
  | { type: 'PREPARE_TIMEOUT'; segment: SegmentId; prepareToken: PrepareToken }
  | { type: 'BUILD_TIMEOUT'; segment: SegmentId; runId?: SegmentRunId; prepareToken?: PrepareToken }
  | { type: 'PLAYBACK_DONE'; runId: SegmentRunId }
  | { type: 'PLAYBACK_FAILED'; runId: SegmentRunId; error: Error }
  | { type: 'STAGE_PAUSED'; runId: SegmentRunId; segment: SegmentId; stageIndex: number }
  | { type: 'STAGE_RESUMED'; runId: SegmentRunId; segment: SegmentId; stageIndex: number }
  | { type: 'SETTLING_DONE'; now?: number }
  | { type: 'RETIRING_RELEASED' }
  | { type: 'RECOVERY_FAILED'; segment: SegmentId; direction: Direction; error: Error }
  | { type: 'RECOVERY_CANCELLED' }
  | { type: 'SEEK'; label: string; source: DirectorSeekSource }
  | { type: 'SEGMENT_ABORTED'; runId: SegmentRunId; reason: string };

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
