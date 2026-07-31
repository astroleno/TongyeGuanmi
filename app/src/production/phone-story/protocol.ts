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

export type PhoneActivationInvocation = Readonly<{
  invocationId: string;
  surfaceIds: readonly PhoneSurfaceId[];
  invoked: boolean;
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

export type PhoneStoryEvent =
  | Readonly<{ type: 'entry-requested'; request: PhoneEntryRequest }>
  | Readonly<{ type: 'retry-requested' }>
  | Readonly<{
      type: 'prepared-reported';
      slot: PhoneEvidenceSlot;
      report: PhonePreparedReport;
    }>
  | Readonly<{
      type: 'frame-reported';
      slot: PhoneEvidenceSlot;
      report: PhoneFrameReport;
    }>
  | Readonly<{
      type: 'failure-reported';
      slot: PhoneEvidenceSlot;
      failure: PhoneFailure;
    }>;

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
    }>;
