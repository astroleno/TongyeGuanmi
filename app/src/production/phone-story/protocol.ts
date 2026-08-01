export const PHONE_TRANSACTION_MODES = [
  'boot',
  'entry',
  'segment',
  'rollback',
  'recovery'
] as const;

export type PhoneTransactionMode = (typeof PHONE_TRANSACTION_MODES)[number];
export type PhoneDirection = 'forward' | 'reverse';
export type PhoneTransactionLeg = 'source' | 'effect' | 'target' | 'rollback';

export const PHONE_PREPARED_EVIDENCE_KINDS = [
  'module-loaded',
  'root-connected',
  'image-decoded',
  'video-decoded',
  'canvas-drawn',
  'static-ready',
  'layout-measurable',
  'resource-budget-valid'
] as const;

export const PHONE_FINAL_EVIDENCE_KINDS = [
  'plane-acknowledged',
  'content-visible',
  'frame-visible',
  'coverage-visible',
  'landing-confirmed',
  'scroll-confirmed'
] as const;

export type PhonePreparedEvidenceKind =
  (typeof PHONE_PREPARED_EVIDENCE_KINDS)[number];
export type PhoneFinalEvidenceKind =
  (typeof PHONE_FINAL_EVIDENCE_KINDS)[number];
export type PhoneEvidenceKind =
  | PhonePreparedEvidenceKind
  | PhoneFinalEvidenceKind;

export type PhoneSurfaceId = string;
export type PhoneFrameToken = string;
export type PhoneReportToken = string;

export type PhoneSerializablePrimitive =
  | boolean
  | number
  | string
  | null;

export type PhoneSerializableValue =
  | PhoneSerializablePrimitive
  | readonly PhoneSerializableValue[]
  | Readonly<{ [key: string]: PhoneSerializableValue }>;

export type PhoneAttemptKey<
  SceneId extends string = string,
  SegmentId extends string = string
> = Readonly<{
  authorityId: string;
  transactionId: string;
  transactionGeneration: number;
  mode: PhoneTransactionMode;
  sceneId?: SceneId;
  segmentId: SegmentId | null;
  direction: PhoneDirection | null;
}>;

export type PhoneEvidenceSlot<
  SceneId extends string = string,
  SegmentId extends string = string
> = Readonly<{
  attempt: PhoneAttemptKey<SceneId, SegmentId>;
  stageIndex: number;
  leg: PhoneTransactionLeg;
  kind: PhoneEvidenceKind;
  surfaceId: PhoneSurfaceId | null;
  planeRevision: number | null;
}>;

export type PhonePreparedReport = Readonly<{
  kind: PhonePreparedEvidenceKind;
  token: PhoneReportToken;
  ready: true;
  detail?: PhoneSerializableValue;
}>;

export type PhoneFrameReport = Readonly<{
  kind: 'frame';
  token: PhoneFrameToken;
  presented: true;
  frameId: string;
  detail?: PhoneSerializableValue;
}>;

export type PhoneFailure = Readonly<{
  code: string;
  message: string;
  recoverable: boolean;
  detail?: PhoneSerializableValue;
}>;

export type PhoneActivationCredit =
  | 'physical-epoch'
  | 'direct-muted-autoplay';

export type PhoneLeafActivationCommand = Readonly<{
  invocationId: string;
  surfaceIds: readonly PhoneSurfaceId[];
  credit: PhoneActivationCredit;
}>;

export type PhoneLeafPauseReason =
  | 'hidden'
  | 'superseded'
  | 'rollback'
  | 'outside-closure';

export type PhoneLeafDisposeReason =
  | 'route-dispose'
  | 'closure-retired'
  | 'faulted'
  | 'generation-replaced';

export type PhoneRuntimeLifecycleStep =
  | 'invalidate' | 'pause' | 'dispose' | 'unregister' | 'release';
export type PhoneRuntimeResourceCounts = Readonly<{
  videos: number; activeDecoders: number; canvases: number; webglContexts: number;
}>;
export type PhoneRejectedChunkFailure = Readonly<{
  authorityId: string; transactionId: string; moduleUrl: string;
  dependencies: readonly PhoneDependencyRef[]; reason: string;
}>;
export type PhoneStableRecoveryProof = Readonly<{
  authorityId: string; sceneId: string; commitSequence: number;
}>;

export type PhoneDependencyRef =
  | `scene:${string}`
  | `root:${string}`
  | `transition:${string}`
  | `media:${string}`
  | `compositor:${string}`;

export type PhoneMountRole =
  | `source:root:${string}`
  | `source:${string}`
  | `effect:${string}`
  | `receiver:root:${string}`
  | `receiver:${string}`;

export type PhoneResourceBudget = Readonly<{
  videos: number;
  activeDecoders: number;
  canvases: number;
  webglContexts: number;
}>;

export type PhoneProofBoundary =
  | 'loader-through-prepared'
  | 'source-through-prepared'
  | 'loader-after-visible-stable'
  | 'target-stable-rollback-closed'
  | 'pair-exit-or-route-dispose'
  | 'source-reproof-after-failure';

export type PhoneDependencyClosure = Readonly<{
  load: readonly PhoneDependencyRef[];
  mount: readonly PhoneMountRole[];
  prewarm: readonly PhoneDependencyRef[];
  retainUntil: PhoneProofBoundary;
  exposeReceiverAfter: readonly PhonePreparedEvidenceKind[];
  retireAfter: PhoneProofBoundary;
  resourceBudget: PhoneResourceBudget;
}>;

export type PhoneEntryOrigin =
  | 'initial'
  | 'hash'
  | 'menu'
  | 'popstate'
  | 'programmatic';

export type PhoneEntryRequest = Readonly<{
  pathname: string;
  hash: string;
  origin: PhoneEntryOrigin;
}>;

export type PhoneRuntimeInputEvent = Readonly<{
  type: 'input'; kind: 'wheel' | 'touch' | 'pointer' | 'keyboard';
  delta?: number; key?: string; fresh: boolean;
  target: 'story' | 'native-corridor' | 'contact-control'; trusted?: boolean;
}>;

export type PhoneRuntimeHostEvent =
  | PhoneRuntimeInputEvent
  | Readonly<{ type: 'entry'; request: PhoneEntryRequest }>
  | Readonly<{ type: 'viewport'; viewport: PhoneViewportSnapshot; change: 'toolbar' | 'layout' | 'unsupported' }>
  | Readonly<{ type: 'scroll'; sample: PhoneScrollSample }>
  | Readonly<{ type: 'visibility'; hidden: boolean }>
  | Readonly<{ type: 'pagehide'; persisted: boolean }>
  | Readonly<{ type: 'pageshow'; persisted: boolean }>
  | Readonly<{ type: 'activation'; trusted: boolean }>;

export type PhoneLayoutViewport = Readonly<{
  width: number;
  height: number;
  orientation: 'portrait' | 'landscape';
}>;

export type PhoneVisualViewport = Readonly<{
  offsetLeft: number;
  offsetTop: number;
  width: number;
  height: number;
  scale: number;
}>;

export type PhoneViewportSnapshot = Readonly<{
  layout: PhoneLayoutViewport;
  visual: PhoneVisualViewport;
  layoutRevision: number;
  visualRevision: number;
  supported: boolean;
}>;

export type PhoneScrollSample = Readonly<{
  x: number;
  y: number;
  sampledAt: number;
  origin: 'native' | 'runtime';
}>;

export type PhoneStableCommit<SceneId extends string = string> = Readonly<{
  sceneId: SceneId;
  landing: Readonly<{ kind: string; anchor: string }>;
  commitSequence: number;
}>;

export type PhoneEvidenceRecord = Readonly<{
  slot: PhoneEvidenceSlot;
  token: string;
}>;

export type PhonePresentationPlane<SceneId extends string = string> = Readonly<{
  sceneId: SceneId;
  role: 'candidate' | 'committed' | 'rollback';
}>;

export type PhonePresentationProof<SceneId extends string = string> = Readonly<{
  commitSequence: number;
  plane: PhonePresentationPlane<SceneId>;
  planeRevision: number;
  frameEvidence: PhoneEvidenceRecord;
  contentEvidence: PhoneEvidenceRecord;
  coverageEvidence: PhoneEvidenceRecord;
  landingEvidence: PhoneEvidenceRecord;
  scrollEvidence: PhoneEvidenceRecord;
  planeEvidence: PhoneEvidenceRecord;
}>;

export type PhoneTransactionPhase =
  | 'preparing'
  | 'presenting-source'
  | 'playing'
  | 'dwelling'
  | 'awaiting-leg-intent'
  | 'presenting-target'
  | 'aligning'
  | 'verifying'
  | 'awaiting-media-activation'
  | 'rolling-back';

export type PhoneDeadlineOperation =
  | 'moduleLoad'
  | 'mediaPrepare'
  | 'firstFrame'
  | 'planeApply'
  | 'scrollConfirm'
  | 'dwell'
  | 'rollback';

export type PhoneDeadlinePolicy = Readonly<{
  moduleLoad: number;
  mediaPrepare: number;
  firstFrame: number;
  planeApply: number;
  scrollConfirm: number;
  rollback: number;
}>;

export type PhoneDeadlineState = Readonly<{
  operation: PhoneDeadlineOperation;
  remainingMs: number;
  startedAtActiveMs: number;
  suspended: boolean;
}>;

export type PhoneTransaction<
  SceneId extends string = string,
  SegmentId extends string = string
> = Readonly<{
  mode: PhoneTransactionMode;
  phase: PhoneTransactionPhase;
  attempt: PhoneAttemptKey<SceneId, SegmentId>;
  sourceSceneId: SceneId | null;
  candidateSceneId: SceneId;
  stageIndex: number;
  planeRevision: number | null;
  requiredPrepared: readonly PhoneEvidenceSlot<SceneId, SegmentId>[];
  requiredFinal: readonly PhoneEvidenceSlot<SceneId, SegmentId>[];
  evidence: readonly PhoneEvidenceRecord[];
  closure: PhoneDependencyClosure;
  dependencies: readonly PhoneDependencyRef[];
  requestedEntry: PhoneEntryRequest;
  canonicalPathname: string;
  canonicalHash: string;
  urlEffect: 'none' | 'push' | 'replace';
  restoreUrlOnRollback: boolean;
  fallbackFromSceneId: SceneId | null;
  commitIntent: 'semantic' | 'reproject' | 'rollback';
  pendingEntry: PhoneEntryRequest | null;
  deadlinePolicy: PhoneDeadlinePolicy;
  deadline: PhoneDeadlineState | null;
  progress: number;
  claimedPhysicalEpoch: number | null;
  activation: 'none' | 'offered' | 'spent' | 'awaiting';
  retainedTopology: boolean;
  reducedMotion: boolean;
  failure: PhoneFailure | null;
}>;

export type PhoneTerminalFault = Readonly<{
  code: string;
  message: string;
  retryable: boolean;
}>;

export type PhoneSafeCover = Readonly<{
  kind: 'loader' | 'committed-plane' | 'opaque';
  opaque: true;
}>;

export type PhoneInputSnapshot = Readonly<{
  enabled: boolean;
  claimedEpoch: number | null;
  arrivingTailBlocked: boolean;
}>;

type PhoneSnapshotBase<SceneId extends string> = Readonly<{
  authorityId: string;
  stateRevision: number;
  viewport: PhoneViewportSnapshot;
  scroll: PhoneScrollSample | null;
  input: PhoneInputSnapshot;
  visibility: 'foreground' | 'hidden' | 'persisted';
  lastTransactionGeneration: number;
  lastPlaneRevision: number;
  originalEntry: PhoneEntryRequest;
  stableCommit: PhoneStableCommit<SceneId> | null;
  presentationProof: PhonePresentationProof<SceneId> | null;
}>;

export type PhoneTransactionSnapshot<
  SceneId extends string = string,
  SegmentId extends string = string
> = PhoneSnapshotBase<SceneId> & Readonly<{
  status: 'transaction';
  transaction: PhoneTransaction<SceneId, SegmentId>;
}>;

export type PhoneStableSnapshot<SceneId extends string = string> =
  PhoneSnapshotBase<SceneId> & Readonly<{
    status: 'stable';
    stableCommit: PhoneStableCommit<SceneId>;
    presentationProof: PhonePresentationProof<SceneId>;
    transaction: null;
    scroll: PhoneScrollSample;
  }>;

export type PhoneFaultedSnapshot<SceneId extends string = string> =
  PhoneSnapshotBase<SceneId> & Readonly<{
    status: 'faulted';
    transaction: null;
    fault: PhoneTerminalFault;
    safeCover: PhoneSafeCover;
  }>;

export type PhoneStorySnapshot<
  SceneId extends string = string,
  SegmentId extends string = string
> =
  | PhoneTransactionSnapshot<SceneId, SegmentId>
  | PhoneStableSnapshot<SceneId>
  | PhoneFaultedSnapshot<SceneId>;

export type PhoneEvidenceReport = Readonly<{
  kind: PhoneEvidenceKind;
  token: string;
  accepted: true;
  detail?: PhoneSerializableValue;
}>;

export type PhoneStoryEvent =
  | Readonly<{ type: 'disconnect-requested' }>
  | Readonly<{
      type: 'entry-requested';
      request: PhoneEntryRequest;
      urlWasReplaced?: boolean;
    }>
  | Readonly<{ type: 'retry-requested' }>
  | Readonly<{
      type: 'segment-requested';
      direction: PhoneDirection;
      physicalEpoch: number;
      reducedMotion?: boolean;
    }>
  | Readonly<{
      type: 'evidence-reported';
      slot: PhoneEvidenceSlot;
      report: PhoneEvidenceReport;
    }>
  | Readonly<{
      type: 'failure-reported';
      slot: PhoneEvidenceSlot;
      failure: PhoneFailure;
    }>
  | Readonly<{ type: 'transition-progressed'; progress: number; attempt: PhoneAttemptKey }>
  | Readonly<{ type: 'transition-completed'; attempt: PhoneAttemptKey }>
  | Readonly<{ type: 'leg-intent'; attempt: PhoneAttemptKey; physicalEpoch: number }>
  | Readonly<{
      type: 'deadline-fired';
      operation: PhoneDeadlineOperation;
      attempt: PhoneAttemptKey | null;
    }>
  | Readonly<{
      type: 'viewport-sampled';
      viewport: PhoneViewportSnapshot;
      change: 'toolbar' | 'layout' | 'unsupported';
    }>
  | Readonly<{ type: 'scroll-sampled'; sample: PhoneScrollSample }>
  | Readonly<{ type: 'page-hidden'; persisted: boolean }>
  | Readonly<{ type: 'page-shown'; persisted: boolean; viewport?: PhoneViewportSnapshot }>
  | Readonly<{ type: 'activation-requested'; epoch: number }>
  | Readonly<{ type: 'activation-settled'; invoked: boolean; attempt: PhoneAttemptKey }>
  | Readonly<{ type: 'terminal-fault'; code: string }>;

export type PhoneStoryEffect =
  | Readonly<{
      type: 'load-dependencies';
      attempt: PhoneAttemptKey;
      dependencies: readonly PhoneDependencyRef[];
    }>
  | Readonly<{
      type: 'apply-presentation-plane';
      attempt: PhoneAttemptKey;
      planeRevision: number;
    }>
  | Readonly<{
      type: 'schedule-deadline';
      attempt: PhoneAttemptKey;
      operation: string;
      timeoutMs: number;
    }>
  | Readonly<{
      type: 'release-dependencies';
      attempt: PhoneAttemptKey;
      dependencies: readonly PhoneDependencyRef[];
    }>
  | Readonly<{ type: 'invalidate-attempt'; attempt: PhoneAttemptKey }>
  | Readonly<{ type: 'push-url'; pathname: string; hash: string }>
  | Readonly<{ type: 'replace-url'; pathname: string; hash: string }>
  | Readonly<{ type: 'cancel-deadline'; attempt: PhoneAttemptKey; operation: string }>
  | Readonly<{ type: 'confirm-scroll'; attempt: PhoneAttemptKey; anchor: string }>
  | Readonly<{ type: 'pause-closure'; attempt: PhoneAttemptKey; reason: PhoneLeafPauseReason }>
  | Readonly<{
      type: 'dispose-closure';
      attempt: PhoneAttemptKey;
      reason: PhoneLeafDisposeReason;
    }>
  | Readonly<{
      type: 'activate-surfaces';
      attempt: PhoneAttemptKey;
      credit: PhoneActivationCredit;
      surfaceIds: readonly PhoneSurfaceId[];
    }>
  | Readonly<{ type: 'show-activation-cta'; attempt: PhoneAttemptKey; enabled: boolean }>
  | Readonly<{
      type: 'defer-entry';
      request: PhoneEntryRequest;
      urlWasReplaced?: boolean;
    }>;

export type PhoneReduceResult<
  SceneId extends string = string,
  SegmentId extends string = string
> = Readonly<{
  snapshot: PhoneStorySnapshot<SceneId, SegmentId>;
  effects: readonly PhoneStoryEffect[];
}>;
