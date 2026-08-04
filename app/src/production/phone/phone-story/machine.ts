import { canonicalSceneIds } from '../../../story/canonical-spine';
import type { SceneId, SegmentId } from '../../../story/types';
import {
  phoneRunLegTuple,
  phoneRunTuple,
  phoneScrollRunTuple,
  type PhoneCursorRunId,
  type PhoneRunId,
  type PhoneRunTuple,
  type PhoneScrollRunId
} from '../phone-story-runs';
import {
  phoneStableProjectionTuple,
  phoneTransitionPresentationTuple,
  type PhoneEdgeScene,
  type PhonePresentationProjection,
  type PhonePresentationSnapshot
} from './presentation';
import {
  phoneScenePresentationTuple,
  phoneScenePresentationProofKind,
  phoneSegmentPresentationTuple,
  type PhonePresentationProofKind,
  type PhoneSurfaceId
} from './manifest';
import type { PhoneIntentDisposition } from '../phone-transition-coordinator';

/** Legacy cursor phases remain readable until the Task 9 compatibility removal. */
export type PhoneTransitionPhase =
  | 'preparing'
  | 'presented-frame-ready'
  | 'animating'
  | 'committing'
  | 'landing'
  | 'releasing'
  | 'rolling-back';

export type PhoneAdapterTransitionPhase = Extract<
  PhoneTransitionPhase,
  'preparing' | 'presented-frame-ready' | 'animating'
>;

export type PhoneStoryHold = Readonly<{
  kind: 'hold';
  scene: SceneId;
}>;

export type PhoneStoryTransition = Readonly<{
  kind: 'transition';
  sessionId: string;
  run: PhoneCursorRunId;
  legIndex: number;
  runSource: SceneId;
  segment: SegmentId;
  from: SceneId;
  to: SceneId;
  direction: 1 | -1;
  phase: PhoneCursorTransitionPhase;
  progress: number;
}>;

/** @deprecated Read this derived model with selectPhoneStoryCursor(). */
export type PhoneStoryCursor = PhoneStoryHold | PhoneStoryTransition;

export type PhoneFailureReason =
  | 'dependency-timeout'
  | 'capability-failed'
  | 'media-failed'
  | 'aod-autoplay-blocked'
  | 'aod-prepare-timeout'
  | 'aod-progress-timeout'
  | 'aod-webgl-unavailable'
  | 'aod-frame-upload-failed'
  | 'aod-frame-draw-failed'
  | 'aod-context-lost'
  | 'reduced-proof-timeout'
  | 'projector-failed'
  | 'surface-disconnected'
  | 'registry-invalidated'
  | 'target-verification-failed'
  | 'landing-measure-failed'
  | 'scroll-confirmation-failed'
  | 'stable-verification-failed';

export type PhoneTransactionPhase =
  | 'preparing'
  | 'animating'
  | 'verifying-target'
  | 'releasing-layout'
  | 'measuring-landing'
  | 'aligning-scroll'
  | 'verifying-stable'
  | 'rollback-rendering'
  | 'rollback-releasing-layout'
  | 'rollback-measuring-landing'
  | 'rollback-aligning-scroll'
  | 'rollback-verifying-stable';

type PhoneCursorTransitionPhase = PhoneTransitionPhase | PhoneTransactionPhase;

export type PhoneScrollCorridorId = string;

export type PhoneAlignmentAttempt = Readonly<{
  geometryRevision: number;
  targetY: number;
  commandId: number;
  correctionCount: 0 | 1;
  confirmedY: number | null;
  visualViewportOffsetTop: number;
}>;

/** One compact execution record covers input runs and direct entries alike. */
export type PhoneStoryOperation = Readonly<{
  trigger: 'input' | 'auto' | 'entry';
  run: PhoneRunId | null;
  direction: 1 | -1;
  legIndex: number;
  from: SceneId;
  to: SceneId;
}>;

/** Immutable identity for one requested presentation revision. */
export type PresentationToken = Readonly<{
  authorityId: string;
  sessionId: string | null;
  generation: number;
  leg: number | null;
  revision: number;
  subject: PhoneSurfaceId | string;
  kind: PhonePresentationProofKind;
}>;

/** A renderer-owned fact that concrete content was presented for its token. */
export type PresentationProof = Readonly<{
  token: PresentationToken;
  frameSequence: number;
  observedAt: number;
  connected: boolean;
  visible: boolean;
  coverageComplete: boolean;
  edge: PhoneEdgeScene;
}>;

/** Candidate-only coverage fact. It may release layout, never publish stable. */
export type PresentationReadiness = Readonly<{
  token: PresentationToken;
  observedAt: number;
  connected: boolean;
  visible: boolean;
  coverageComplete: boolean;
}>;

/** Durable AOD state: the runtime runner only performs effects for this state. */
export type PhoneAodRunnerStage =
  | 'admission'
  | 'playback'
  | 'settling';

export type PhoneAodLifecycle = Readonly<{
  stage: PhoneAodRunnerStage;
}>;

export type PhoneSnapshotSession = Readonly<{
  sessionId: string;
  generation: number;
  inputEpoch: number | null;
  operation: PhoneStoryOperation;
  phase: PhoneTransactionPhase;
  progress: number;
  anchor: Readonly<{
    policy: 'aod-semantic-edge' | 'authored-boundary' | 'preserve-composite' | 'entry-target';
    y: number | null;
    geometryRevision: number | null;
  }>;
  alignment: PhoneAlignmentAttempt | null;
  /** Immutable projection revision carried by every renderer-owned proof. */
  presentationRevision: number;
  /** Physical first-frame proof for the active segment's current revision. */
  firstFrameProof: PresentationProof | null;
  /** Exact target proof; scalar compatibility evidence is removed in Task 3. */
  proof: PresentationProof | null;
  /** Token-bound target coverage used only to begin alignment. */
  readiness: PresentationReadiness | null;
  /** Present only for the canonical AOD ↔ Method segment. */
  aod: PhoneAodLifecycle | null;
  /** A short static admission still uses this same transaction lifecycle. */
  reducedMotion: boolean;
}>;

type PhoneSnapshotBase = Readonly<{
  authorityId: string;
  revision: number;
  diagnostics: Readonly<{
    lastRollback: Readonly<{
      run: PhoneRunId | null;
      reason: PhoneFailureReason;
      generation: number;
    }> | null;
  }>;
  scroll: Readonly<{
    actualY: number;
    corridor: PhoneScrollCorridorId | null;
    progress: number;
    direction: -1 | 0 | 1;
    sampleRevision: number;
  }>;
  input: Readonly<{
    completedEpoch: number | null;
    completedEpochUntil: number | null;
  }>;
  projection: PhonePresentationProjection;
}>;

export type PhoneStableSnapshot = PhoneSnapshotBase & Readonly<{
  status: 'stable';
  scene: SceneId;
  session: null;
}>;

export type PhoneScrollRunSnapshot = PhoneSnapshotBase & Readonly<{
  status: 'scroll-run';
  run: PhoneScrollRunId;
  session: null;
}>;

export type PhoneTransactionSnapshot = PhoneSnapshotBase & Readonly<{
  status: 'transaction';
  session: PhoneSnapshotSession;
}>;

export type PhoneStorySnapshot =
  | PhoneStableSnapshot
  | PhoneScrollRunSnapshot
  | PhoneTransactionSnapshot;

/**
 * Converts reducer-private state to the ordered presentation transport before
 * it crosses into the independently minified presentation chunk.
 */
export function phonePresentationSnapshot(
  snapshot: PhoneStorySnapshot
): PhonePresentationSnapshot {
  const projection = snapshot.projection;
  const session = snapshot.status === 'transaction' ? snapshot.session : null;
  return [
    snapshot.status,
    snapshot.revision,
    snapshot.status === 'stable' ? snapshot.scene : null,
    snapshot.status === 'scroll-run' ? snapshot.run : null,
    snapshot.scroll.corridor,
    snapshot.scroll.progress,
    snapshot.scroll.direction,
    [
      projection.revision,
      projection.scene,
      projection.checkpoint,
      projection.edge,
      projection.commitState,
      projection.semanticScene,
      projection.navigationScene,
      projection.stageOwner,
      projection.stageScene,
      projection.sourceSurface,
      projection.receiverSurface,
      projection.coverageSurface,
      projection.landingResolver
    ],
    session === null
      ? null
      : [
          session.sessionId,
          session.generation,
          session.operation.run,
          session.operation.legIndex,
          session.operation.direction,
          session.phase,
          session.progress,
          session.anchor.y,
          session.operation.trigger
        ],
    snapshot.diagnostics.lastRollback?.run ?? null
  ];
}

function phoneStableProjection(
  scene: SceneId,
  commitState: 'candidate' | 'stable' = 'stable',
  revision = 0
): PhonePresentationProjection {
  const [
    checkpoint,
    edge,
    stageOwner,
    stageScene,
    surface,
    landingResolver
  ] = phoneStableProjectionTuple(scene);
  return {
    revision,
    scene,
    checkpoint,
    edge,
    commitState,
    semanticScene: scene,
    navigationScene: scene,
    stageOwner,
    stageScene,
    sourceSurface: null,
    receiverSurface: surface,
    coverageSurface: surface,
    landingResolver
  };
}

function phoneStoryPresentation(
  cursor: PhoneStoryCursor
): PhonePresentationProjection {
  if (cursor.kind === 'hold') return phoneStableProjection(cursor.scene);
  const [
    scene,
    checkpoint,
    edge,
    stageOwner,
    stageScene,
    sourceSurface,
    receiverSurface,
    landingResolver
  ] = phoneTransitionPresentationTuple([
    cursor.from,
    cursor.to,
    cursor.segment,
    cursor.direction,
    cursor.progress
  ]);
  return {
    revision: 0,
    scene,
    checkpoint,
    edge,
    commitState: 'transition',
    semanticScene: scene,
    navigationScene: scene,
    stageOwner,
    stageScene,
    sourceSurface,
    receiverSurface,
    coverageSurface: cursor.direction === 1 ? sourceSurface! : receiverSurface,
    landingResolver
  };
}

export type PhoneExecutionIdentity = Readonly<{
  authorityId: string;
  sessionId: string;
  generation: number;
  leg: number;
  direction: 1 | -1;
}>;

/**
 * Cross-chunk execution token. Lazy adapters must carry this positional form
 * rather than reading a property-mangled authority identity object.
 */
export type PhoneExecutionToken = readonly [
  authorityId: string,
  sessionId: string,
  generation: number,
  leg: number,
  direction: 1 | -1,
  /** Exact raw presentation token carried by hard-cutover renderer leaves. */
  presentationToken?: PresentationToken
];

type PhoneSnapshotIdentityEvent = PhoneExecutionIdentity & Readonly<{
  type:
    | 'PRESENTATION_READY_REPORTED'
    | 'PRESENTATION_PROOF_REPORTED'
    | 'PROGRESS_REPORTED'
    | 'LEG_COMPLETED'
    /** Direct candidates must align their real target before leaf proof. */
    | 'TARGET_LAYOUT_REQUESTED'
    | 'TARGET_PRESENTED'
    | 'LAYOUT_RELEASED'
    | 'LANDING_MEASURED'
    | 'SCROLL_COMMANDED'
    | 'SCROLL_CONFIRMED'
    /** The sole event allowed to publish a candidate as stable. */
    | 'PRESENTATION_COMMITTED'
    | 'FAILED'
    | 'ROLLBACK_RENDERED'
    | 'ROLLBACK_LAYOUT_RELEASED'
    | 'ROLLBACK_LANDING_MEASURED'
    | 'ROLLBACK_SCROLL_COMMANDED'
    | 'ROLLBACK_SCROLL_CONFIRMED';
  progress?: number;
  reason?: PhoneFailureReason;
  targetY?: number;
  geometryRevision?: number;
  commandId?: number;
  actualY?: number;
  visualViewportOffsetTop?: number;
  /** Monotonic time at which the reducer evaluates proof expiry. */
  now?: number;
  /** Immutable renderer-owned presentation fact for this exact transaction. */
  proof?: PresentationProof;
  /** Candidate-only connected/visible/covered fact for this exact token. */
  readiness?: PresentationReadiness;
}>;

export type PhoneStoryEvent =
  | (PhoneExecutionIdentity & Readonly<{
      type: 'RUN_STARTED';
      run: PhoneRunId;
      direction: 1 | -1;
      anchorY: number;
      inputEpoch: number | null;
      trigger?: 'input' | 'auto';
      legIndex?: number;
      reducedMotion?: boolean;
    }>)
  | PhoneSnapshotIdentityEvent
  | Readonly<{
      type: 'INTENT_RESOLVED';
      authorityId: string;
      inputEpoch: number;
      direction: 1 | -1;
      run: PhoneRunId | null;
      anchorY: number | null;
      boundaryKnown: boolean;
      crossedBoundary: boolean;
      reducedMotion?: boolean;
    }>
  | Readonly<{
      type: 'DIRECT_ENTRY_REQUESTED';
      authorityId: string;
      target: SceneId;
      source: 'initial' | 'hash' | 'menu' | 'history';
      fallbackScene: SceneId;
      cinematic: Readonly<{
        run: PhoneRunId;
        direction: 1;
        legIndex: number;
      }> | null;
    }>
  | Readonly<{
      type: 'BOOTSTRAP_REQUESTED';
      authorityId: string;
      target: SceneId;
      fallbackScene: SceneId;
      cinematic: Readonly<{
        run: PhoneRunId;
        direction: 1;
        legIndex: number;
      }> | null;
    }>
  | Readonly<{
      type: 'HOLD_RECONCILED';
      authorityId: string;
      scene: SceneId;
      actualY?: number;
    }>
  | Readonly<{
      type: 'NAVIGATE_REQUESTED';
      authorityId: string;
      scene: SceneId;
      source: 'hash' | 'menu' | 'history';
    }>
  | Readonly<{
      type: 'SCROLL_RUN_RECONCILED';
      authorityId: string;
      run: PhoneScrollRunId;
      direction: 1 | -1;
      progress: number;
      actualY: number;
      corridor?: PhoneScrollCorridorId | null;
    }>
  | Readonly<{
      type: 'SCROLL_SAMPLED';
      authorityId: string;
      actualY: number;
      corridor?: PhoneScrollCorridorId | null;
      progress?: number | undefined;
      direction?: -1 | 0 | 1 | undefined;
      scene?: SceneId | undefined;
      run?: PhoneScrollRunId | undefined;
      /** Positional front-rail fact; only reduced samples enter static admission. */
      reducedMotion?: boolean | undefined;
    }>;

export type PhoneStoryEffect = never;

export type PhoneStoryReduction = Readonly<{
  snapshot: PhoneStorySnapshot;
  effects: readonly PhoneStoryEffect[];
  inputDisposition?: PhoneIntentDisposition;
}>;

const noEffects: readonly PhoneStoryEffect[] = [];
export const PHONE_SCROLL_ALIGNMENT_TOLERANCE_PX = 1;

export function createPhoneStorySnapshot({
  authorityId,
  scene,
  actualY = 0
}: Readonly<{
  authorityId: string;
  scene: SceneId;
  actualY?: number;
}>): PhoneStableSnapshot {
  return {
    authorityId,
    revision: 0,
    diagnostics: { lastRollback: null },
    scroll: {
      actualY,
      corridor: null,
      progress: 0,
      direction: 0,
      sampleRevision: 0
    },
    input: {
      completedEpoch: null,
      completedEpochUntil: null
    },
    projection: phoneStableProjection(scene),
    status: 'stable',
    scene,
    session: null
  };
}

export function selectPhoneInputLocked(snapshot: PhoneStorySnapshot): boolean {
  return snapshot.status === 'transaction';
}

function directionalEndpoints(
  run: PhoneRunTuple,
  direction: 1 | -1
): Readonly<{ source: SceneId; target: SceneId }> {
  return direction === 1
    ? { source: run[1], target: run[2] }
    : { source: run[2], target: run[1] };
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function runForOperation(operation: PhoneStoryOperation): PhoneRunTuple | null {
  return operation.run ? phoneRunTuple(operation.run) : null;
}

function proofSceneFor(session: PhoneSnapshotSession): SceneId {
  return session.phase.startsWith('rollback-')
    ? operationSource(session.operation)
    : operationTarget(session.operation);
}

function expectedPresentationToken(
  snapshot: PhoneTransactionSnapshot,
  session: PhoneSnapshotSession
): PresentationToken {
  const scene = proofSceneFor(session);
  const reducedStaticTarget = session.reducedMotion
    && !session.phase.startsWith('rollback-');
  return {
    authorityId: snapshot.authorityId,
    sessionId: session.sessionId,
    generation: session.generation,
    leg: session.operation.legIndex,
    revision: session.presentationRevision,
    subject: phoneScenePresentationTuple(scene)[4],
    kind: reducedStaticTarget
      ? 'static-poster'
      : phoneScenePresentationProofKind(scene)
  };
}

function expectedFirstFrameToken(
  snapshot: PhoneTransactionSnapshot,
  session: PhoneSnapshotSession
): PresentationToken | null {
  const frame = activeSegmentFor(session.operation);
  if (!frame) return null;
  return {
    authorityId: snapshot.authorityId,
    sessionId: session.sessionId,
    generation: session.generation,
    leg: session.operation.legIndex,
    revision: session.presentationRevision,
    subject: frame[9],
    kind: frame[8]
  };
}

function samePresentationToken(
  left: PresentationToken,
  right: PresentationToken
): boolean {
  return left.authorityId === right.authorityId
    && left.sessionId === right.sessionId
    && left.generation === right.generation
    && left.leg === right.leg
    && left.revision === right.revision
    && left.subject === right.subject
    && left.kind === right.kind;
}

function activeSegmentFor(
  operation: PhoneStoryOperation
) {
  const leg = operation.run
    ? phoneRunLegTuple(operation.run, operation.legIndex)
    : null;
  return leg ? phoneSegmentPresentationTuple(leg[0]) : null;
}

const PHONE_PRESENTATION_EVIDENCE_TTL_MS = 3_000;

function recentObservation(
  observedAt: number | null,
  now: number
): boolean {
  return observedAt !== null
    && Number.isFinite(now)
    && observedAt <= now
    && now - observedAt <= PHONE_PRESENTATION_EVIDENCE_TTL_MS;
}

function validPresentationProof(
  snapshot: PhoneTransactionSnapshot,
  session: PhoneSnapshotSession,
  proof: PresentationProof | null,
  now: number
): boolean {
  if (!proof) return false;
  const scene = proofSceneFor(session);
  return Number.isInteger(proof.frameSequence)
    && proof.frameSequence > 0
    && proof.connected
    && proof.visible
    && proof.coverageComplete
    && proof.edge === phoneScenePresentationTuple(scene)[1]
    && recentObservation(proof.observedAt, now)
    && samePresentationToken(
      proof.token,
      expectedPresentationToken(snapshot, session)
    );
}

function validFirstFrameProof(
  snapshot: PhoneTransactionSnapshot,
  session: PhoneSnapshotSession,
  proof: PresentationProof | null,
  now: number
): boolean {
  const expected = expectedFirstFrameToken(snapshot, session);
  const frame = activeSegmentFor(session.operation);
  if (!expected || !frame || !proof) return false;
  return Number.isInteger(proof.frameSequence)
    && proof.frameSequence > 0
    && proof.connected
    && proof.visible
    && proof.coverageComplete
    && proof.edge === phoneScenePresentationTuple(frame[3])[1]
    && recentObservation(proof.observedAt, now)
    && samePresentationToken(proof.token, expected);
}

function validPresentationReadiness(
  snapshot: PhoneTransactionSnapshot,
  session: PhoneSnapshotSession,
  readiness: PresentationReadiness | null,
  now: number
): boolean {
  if (!readiness) return false;
  return readiness.connected
    && readiness.visible
    && readiness.coverageComplete
    && recentObservation(readiness.observedAt, now)
    && samePresentationToken(
      readiness.token,
      expectedPresentationToken(snapshot, session)
    );
}

function eventNow(
  event: PhoneSnapshotIdentityEvent,
  proof: PresentationProof | null = null,
  readiness: PresentationReadiness | null = null
): number {
  return event.now ?? Math.max(
    proof?.observedAt ?? 0,
    readiness?.observedAt ?? 0
  );
}

function reportPresentationProof(
  snapshot: PhoneTransactionSnapshot,
  session: PhoneSnapshotSession,
  event: PhoneSnapshotIdentityEvent
): PhoneSnapshotSession | null {
  const proof = event.proof;
  if (!proof) return null;
  // Target and segment first-frame facts use the same immutable transport,
  // but they are never interchangeable. A segment proof can leave prepare;
  // only the target proof can publish a stable hold.
  if (validPresentationProof(snapshot, session, proof, proof.observedAt)) {
    return session.proof === proof ? session : { ...session, proof };
  }
  // Reduced motion has the same immutable candidate, but no playback leg.
  // A source first-frame is therefore never admissible evidence: accepting it
  // would switch the transaction to `animating` and recreate the parallel
  // media lifecycle that this strategy intentionally removes.
  if (session.reducedMotion) return null;
  if (validFirstFrameProof(snapshot, session, proof, proof.observedAt)) {
    return session.firstFrameProof === proof
      ? session
      : { ...session, firstFrameProof: proof };
  }
  return null;
}

function reportPresentationReadiness(
  snapshot: PhoneTransactionSnapshot,
  session: PhoneSnapshotSession,
  event: PhoneSnapshotIdentityEvent
): PhoneSnapshotSession | null {
  const readiness = event.readiness;
  if (
    !readiness
    || !validPresentationReadiness(snapshot, session, readiness, readiness.observedAt)
  ) return null;
  return session.readiness === readiness ? session : { ...session, readiness };
}

/**
 * The only reducer-owned stable publication predicate. Every transaction
 * needs current coverage and current target content. Segment first-frame
 * proof gates animation separately; it can never stand in for a final hold
 * proof, whether the transaction came from input, direct entry, or rollback.
 */
export function canCommitPresentation(
  snapshot: PhoneStorySnapshot,
  now: number
): boolean {
  if (snapshot.status !== 'transaction') return false;
  const { session } = snapshot;
  return validPresentationProof(snapshot, session, session.proof, now);
}

function canStartTargetAlignment(
  snapshot: PhoneTransactionSnapshot,
  session: PhoneSnapshotSession,
  now: number
): boolean {
  return validPresentationReadiness(snapshot, session, session.readiness, now)
    || validPresentationProof(snapshot, session, session.proof, now);
}

function transactionCursor(snapshot: PhoneTransactionSnapshot): PhoneStoryTransition | null {
  const operation = snapshot.session.operation;
  const run = operation.run ? phoneRunTuple(operation.run) : null;
  if (!run) return null;
  const leg = phoneRunLegTuple(operation.run!, operation.legIndex);
  if (!leg) return null;
  // Composite runs change their physical source/receiver at every leg. The
  // run-level endpoints describe only the journey's final destination; using
  // them here leaves reverse media on a hidden native plane and makes its
  // token-bound first canvas frame impossible to admit.
  const [from, to] = operation.direction === 1
    ? [leg[1], leg[2]]
    : [leg[2], leg[1]];
  return {
    kind: 'transition',
    sessionId: snapshot.session.sessionId,
    run: run[0],
    legIndex: operation.legIndex,
    runSource: operation.from,
    segment: leg[0],
    from,
    to,
    direction: operation.direction,
    phase: snapshot.session.phase,
    progress: snapshot.session.progress
  };
}

/**
 * An accepted forward first-frame proof has already drawn a non-endpoint
 * receiver frame, even though the animation clock has not published its
 * first sampled progress yet.  Give presentation selection the smallest
 * non-zero value so the fixed-stage owner changes atomically with that proof.
 * This prevents a strict diagnostic reapply from observing the old native
 * stage while the proved receiver is still hidden underneath it.
 */
const PHONE_FIRST_FRAME_STAGE_EPSILON = .002;

function presentationCursorForTransaction(
  snapshot: PhoneTransactionSnapshot,
  cursor: PhoneStoryTransition
): PhoneStoryTransition {
  const { session } = snapshot;
  return session.operation.direction === 1
    && session.phase === 'animating'
    && session.firstFrameProof !== null
    && session.progress <= .001
    ? { ...cursor, progress: PHONE_FIRST_FRAME_STAGE_EPSILON }
    : cursor;
}

/**
 * A terminal normal-motion candidate still needs one physical stage in which
 * its exact target leaf can paint.  The stable target may be a document
 * reading surface below that stage, so projecting its stable owner before the
 * leaf proof would make the candidate invisible/offscreen and deadlock
 * admission.  Keep only the active leg's physical stage until the proof has
 * been accepted; semantic scene, receiver, landing, and eventual stable
 * owner remain the target's manifest contract.
 */
function terminalCandidateProjection(
  snapshot: PhoneTransactionSnapshot
): PhonePresentationProjection {
  const { operation } = snapshot.session;
  const target = phoneStableProjection(
    operationTarget(operation),
    'candidate',
    snapshot.session.presentationRevision
  );
  const cursor = transactionCursor(snapshot);
  if (!cursor) return target;
  // AOD's forward terminal cursor ends at progress 1, whose semantic scene
  // is already native Method. That would release the packed AOD source before
  // Method can render its exact admission proof. Keep this one vertical
  // handoff on its source physical plane until the proof advances the reducer.
  // Other canonical segments retain their already-qualified terminal policy.
  const keepsAodSourceForMethodAdmission = operation.run === 'aod-method'
    && operation.direction === 1;
  const sourcePhysicalCursor = keepsAodSourceForMethodAdmission
    ? { ...cursor, progress: 0 }
    : cursor;
  const physical = phoneStoryPresentation(sourcePhysicalCursor);
  const candidate = {
    ...target,
    stageOwner: physical.stageOwner,
    stageScene: physical.stageScene
  };
  if (!keepsAodSourceForMethodAdmission) return candidate;
  return {
    ...candidate,
    // Preserve the one currently painted source as the coverage owner. The
    // candidate receiver remains the target leaf, so it can issue its raw
    // post-paint proof without a second visual writer or a blank frame.
    sourceSurface: physical.sourceSurface,
    coverageSurface: physical.coverageSurface
  };
}

function projectionForTransaction(
  snapshot: PhoneTransactionSnapshot
): PhonePresentationProjection {
  const { phase, operation } = snapshot.session;
  const revision = snapshot.session.presentationRevision;
  if (snapshot.session.reducedMotion && !phase.startsWith('rollback-')) {
    return phoneStableProjection(operationTarget(operation), 'candidate', revision);
  }
  if (operation.run === null && !phase.startsWith('rollback-')) {
    const target = phoneStableProjection(operationTarget(operation), 'candidate', revision);
    const source = phoneScenePresentationTuple(operationSource(operation));
    const candidate = {
      ...target,
      edge: source[1]
    };
    // A sampled front hold still enters through the single machine candidate.
    // Until its target leaf reports the exact physical frame, retain the
    // already-painted source as the coverage plane. This prevents Star → AOD
    // from exposing a blank paper frame between its scroll handoff and the
    // AOD packed-canvas admission; TARGET_PRESENTED atomically gives control
    // back to the candidate target below.
    if (
      source[3] !== 'star-map'
      || target.semanticScene !== 'aod-animation'
      || operation.trigger !== 'auto'
      || phase !== 'verifying-target'
    ) return candidate;
    return {
      ...candidate,
      stageOwner: source[2],
      stageScene: source[3],
      sourceSurface: source[4],
      coverageSurface: source[4]
    };
  }
  if (phase === 'verifying-target' && isTerminalLeg(operation)) {
    return terminalCandidateProjection(snapshot);
  }
  if (
    phase === 'releasing-layout'
    || phase === 'measuring-landing'
    || phase === 'aligning-scroll'
    || phase === 'verifying-stable'
  ) {
    // The target proof has already admitted the candidate. It may now release
    // the physical stage, align its document landing, and verify the final
    // stable paint under the target's own manifest owner.
    return phoneStableProjection(operationTarget(operation), 'candidate', revision);
  }
  if (phase.startsWith('rollback-')) {
    return phoneStableProjection(operationSource(operation), 'candidate', revision);
  }
  const cursor = transactionCursor(snapshot);
  if (!cursor) {
    return phoneStableProjection(operationSource(operation), 'candidate', revision);
  }
  const projection = phoneStoryPresentation(
    presentationCursorForTransaction(snapshot, cursor)
  );
  if (
    operation.run === 'aod-method'
    && operation.direction === 1
    && phase === 'animating'
  ) {
    const sourceStage = phoneStoryPresentation({ ...cursor, progress: 0 });
    return {
      ...projection,
      stageOwner: sourceStage.stageOwner,
      stageScene: sourceStage.stageScene,
      revision
    };
  }
  return { ...projection, revision };
}

function scrollRunCursor(snapshot: PhoneScrollRunSnapshot): PhoneStoryTransition {
  const [from, to, segment] = phoneScrollRunTuple(snapshot.run);
  const direction = snapshot.scroll.direction === -1 ? -1 : 1;
  return {
    kind: 'transition',
    sessionId: `phone-scroll-${snapshot.scroll.sampleRevision}`,
    run: snapshot.run,
    legIndex: 0,
    runSource: direction === 1 ? from : to,
    segment,
    from,
    to,
    direction,
    phase: 'animating',
    progress: snapshot.scroll.progress
  };
}

/** Compatibility selector. Production state is PhoneStorySnapshot only. */
export function selectPhoneStoryCursor(snapshot: PhoneStorySnapshot): PhoneStoryCursor {
  if (snapshot.status === 'stable') {
    return { kind: 'hold', scene: snapshot.scene };
  }
  if (snapshot.status === 'scroll-run') return scrollRunCursor(snapshot);
  const cursor = transactionCursor(snapshot);
  return cursor ?? { kind: 'hold', scene: operationSource(snapshot.session.operation) };
}

function nextStable(
  snapshot: PhoneStorySnapshot,
  scene: SceneId,
  actualY = snapshot.scroll.actualY,
  diagnostics = snapshot.diagnostics
): PhoneStableSnapshot {
  return {
    authorityId: snapshot.authorityId,
    revision: snapshot.revision + 1,
    diagnostics,
    scroll: {
      ...snapshot.scroll,
      actualY,
      corridor: null,
      progress: 0,
      direction: 0,
      sampleRevision: snapshot.scroll.sampleRevision + 1
    },
    input: snapshot.input,
    projection: phoneStableProjection(scene, 'stable', snapshot.revision + 1),
    status: 'stable',
    scene,
    session: null
  };
}

type PhoneScrollRunEvidence = Readonly<{
  run: PhoneScrollRunId;
  direction: 1 | -1;
  progress: number;
  actualY: number;
  corridor: PhoneScrollCorridorId | null;
}>;

function nextScrollRun(
  snapshot: Exclude<PhoneStorySnapshot, PhoneTransactionSnapshot>,
  evidence: PhoneScrollRunEvidence
): PhoneScrollRunSnapshot {
  const virtual: PhoneScrollRunSnapshot = {
    authorityId: snapshot.authorityId,
    revision: snapshot.revision + 1,
    diagnostics: snapshot.diagnostics,
    scroll: {
      actualY: evidence.actualY,
      corridor: evidence.corridor,
      progress: clamp(evidence.progress),
      direction: evidence.direction,
      sampleRevision: snapshot.scroll.sampleRevision + 1
    },
    input: snapshot.input,
    projection: phoneStableProjection(
      phoneScrollRunTuple(evidence.run)[0],
      'candidate',
      snapshot.revision + 1
    ),
    status: 'scroll-run',
    run: evidence.run,
    session: null
  };
  return {
    ...virtual,
    projection: {
      ...phoneStoryPresentation(scrollRunCursor(virtual)),
      revision: virtual.revision
    }
  };
}

function nextSampledScroll(
  snapshot: Exclude<PhoneStorySnapshot, PhoneTransactionSnapshot>,
  event: Extract<PhoneStoryEvent, { type: 'SCROLL_SAMPLED' }>
): PhoneStorySnapshot {
  const scroll = {
    actualY: event.actualY,
    corridor: event.corridor ?? snapshot.scroll.corridor,
    progress: event.progress === undefined ? snapshot.scroll.progress : clamp(event.progress),
    direction: event.direction ?? snapshot.scroll.direction,
    sampleRevision: snapshot.scroll.sampleRevision + 1
  };
  if (event.run) {
    return nextScrollRun(snapshot, {
      run: event.run,
      direction: scroll.direction === -1 ? -1 : 1,
      progress: scroll.progress,
      actualY: scroll.actualY,
      corridor: scroll.corridor
    });
  }
  if (event.scene) {
    return {
      authorityId: snapshot.authorityId,
      revision: snapshot.revision + 1,
      diagnostics: snapshot.diagnostics,
      scroll,
      input: snapshot.input,
      projection: phoneStableProjection(event.scene, 'stable', snapshot.revision + 1),
      status: 'stable',
      scene: event.scene,
      session: null
    };
  }
  return { ...snapshot, revision: snapshot.revision + 1, scroll };
}

function nextTransaction(
  snapshot: PhoneTransactionSnapshot,
  session: PhoneSnapshotSession
): PhoneTransactionSnapshot {
  const candidate: PhoneTransactionSnapshot = {
    ...snapshot,
    revision: snapshot.revision + 1,
    session
  };
  return { ...candidate, projection: projectionForTransaction(candidate) };
}

function nextRollback(
  snapshot: PhoneTransactionSnapshot,
  session: PhoneSnapshotSession,
  reason: PhoneFailureReason
): PhoneTransactionSnapshot {
  return nextTransaction({
    ...snapshot,
    diagnostics: {
      lastRollback: {
        run: session.operation.run,
        reason,
        generation: session.generation + 1
      }
    }
  }, {
    ...session,
    generation: session.generation + 1,
    phase: 'rollback-rendering',
    presentationRevision: snapshot.revision + 1,
    firstFrameProof: null,
    proof: null,
    readiness: null,
    aod: session.aod ? { ...session.aod, stage: 'settling' } : null
  });
}

export function phoneExecutionOwnsSnapshot(
  snapshot: PhoneStorySnapshot,
  execution: PhoneExecutionIdentity
): snapshot is PhoneTransactionSnapshot {
  if (snapshot.status !== 'transaction') return false;
  return snapshot.authorityId === execution.authorityId
    && snapshot.session.sessionId === execution.sessionId
    && snapshot.session.generation === execution.generation
    && snapshot.session.operation.legIndex === execution.leg
    && snapshot.session.operation.direction === execution.direction;
}

function operationTarget(operation: PhoneStoryOperation): SceneId {
  return operation.to;
}

function operationSource(operation: PhoneStoryOperation): SceneId {
  return operation.from;
}

function isTerminalLeg(operation: PhoneStoryOperation): boolean {
  const run = runForOperation(operation);
  if (!run) return true;
  return operation.direction === 1
    ? operation.legIndex === run[3] - 1
    : operation.legIndex === 0;
}

function aodLifecycleFor(run: PhoneRunId | null): PhoneAodLifecycle | null {
  return run === 'aod-method' ? { stage: 'admission' } : null;
}

type PhoneAlignmentPhases = readonly [
  measuring: PhoneTransactionPhase,
  aligning: PhoneTransactionPhase,
  verifying: PhoneTransactionPhase
];

const forwardAlignmentPhases: PhoneAlignmentPhases = [
  'measuring-landing',
  'aligning-scroll',
  'verifying-stable'
];

const rollbackAlignmentPhases: PhoneAlignmentPhases = [
  'rollback-measuring-landing',
  'rollback-aligning-scroll',
  'rollback-verifying-stable'
];

function reduceLandingMeasured(
  snapshot: PhoneTransactionSnapshot,
  session: PhoneSnapshotSession,
  event: PhoneSnapshotIdentityEvent,
  [measuring, aligning]: PhoneAlignmentPhases
): PhoneStoryReduction {
  if (
    session.phase !== measuring
    || event.targetY === undefined
    || event.geometryRevision === undefined
  ) return reduced(snapshot);
  return reduced(nextTransaction(snapshot, {
    ...session,
    phase: aligning,
    alignment: {
      geometryRevision: event.geometryRevision,
      targetY: event.targetY,
      commandId: 0,
      correctionCount: 0,
      confirmedY: null,
      visualViewportOffsetTop: event.visualViewportOffsetTop ?? 0
    }
  }));
}

function reduceScrollCommanded(
  snapshot: PhoneTransactionSnapshot,
  session: PhoneSnapshotSession,
  event: PhoneSnapshotIdentityEvent,
  [, aligning]: PhoneAlignmentPhases
): PhoneStoryReduction {
  if (
    session.phase !== aligning
    || !session.alignment
    || event.commandId === undefined
  ) return reduced(snapshot);
  return reduced(nextTransaction(snapshot, {
    ...session,
    alignment: { ...session.alignment, commandId: event.commandId }
  }));
}

function reduceScrollConfirmed(
  snapshot: PhoneTransactionSnapshot,
  session: PhoneSnapshotSession,
  event: PhoneSnapshotIdentityEvent,
  [, aligning, verifying]: PhoneAlignmentPhases,
  rollback: boolean
): PhoneStoryReduction {
  if (
    session.phase !== aligning
    || !session.alignment
    || event.commandId !== session.alignment.commandId
    || event.actualY === undefined
  ) return reduced(snapshot);
  if (
    Math.abs(event.actualY - session.alignment.targetY)
    > PHONE_SCROLL_ALIGNMENT_TOLERANCE_PX
  ) {
    if (session.alignment.correctionCount === 1) {
      return rollback
        ? reduced(snapshot)
        : reduced(nextRollback(snapshot, session, 'scroll-confirmation-failed'));
    }
    return reduced(nextTransaction({
      ...snapshot,
      scroll: { ...snapshot.scroll, actualY: event.actualY }
    }, {
      ...session,
      alignment: {
        ...session.alignment,
        correctionCount: 1,
        confirmedY: null
      }
    }));
  }
  return reduced(nextTransaction(snapshot, {
    ...session,
    phase: verifying,
    alignment: { ...session.alignment, confirmedY: event.actualY }
  }));
}

function reduceStablePresentationVerified(
  snapshot: PhoneTransactionSnapshot,
  session: PhoneSnapshotSession,
  [, , verifying]: PhoneAlignmentPhases,
  scene: SceneId
): PhoneStoryReduction {
  if (session.phase !== verifying) return reduced(snapshot);
  const actualY = session.alignment?.confirmedY ?? snapshot.scroll.actualY;
  return reduced(nextStable(snapshot, scene, actualY));
}

function reduced(
  snapshot: PhoneStorySnapshot,
  inputDisposition?: PhoneIntentDisposition
): PhoneStoryReduction {
  return {
    snapshot,
    effects: noEffects,
    ...(inputDisposition ? { inputDisposition } : {})
  };
}

function startedRun(
  snapshot: PhoneStableSnapshot,
  event: Extract<PhoneStoryEvent, { type: 'RUN_STARTED' }>
): PhoneStoryReduction {
  if (snapshot.authorityId !== event.authorityId) return reduced(snapshot);
  const run = phoneRunTuple(event.run);
  const endpoints = directionalEndpoints(run, event.direction);
  if (snapshot.scene !== endpoints.source) return reduced(snapshot);
  const legIndex = event.legIndex ?? (
    event.direction === 1 ? 0 : run[3] - 1
  );
  const leg = phoneRunLegTuple(event.run, legIndex);
  if (!leg) return reduced(snapshot);
  const session: PhoneSnapshotSession = {
    sessionId: event.sessionId,
    generation: event.generation,
    inputEpoch: event.inputEpoch,
    operation: {
      trigger: event.trigger ?? (event.inputEpoch === null ? 'auto' : 'input'),
      run: event.run,
      direction: event.direction,
      legIndex,
      from: endpoints.source,
      to: endpoints.target
    },
    phase: 'preparing',
    progress: event.direction === 1 ? 0 : 1,
    anchor: {
      policy: run[4],
      y: event.anchorY,
      geometryRevision: null
    },
    alignment: null,
    presentationRevision: snapshot.revision + 1,
    firstFrameProof: null,
    proof: null,
    readiness: null,
    aod: aodLifecycleFor(event.run),
    reducedMotion: event.reducedMotion === true
  };
  const provisional: PhoneTransactionSnapshot = {
    authorityId: snapshot.authorityId,
    revision: snapshot.revision + 1,
    diagnostics: { lastRollback: null },
    scroll: {
      ...snapshot.scroll,
      actualY: event.anchorY,
      direction: event.direction
    },
    input: {
      completedEpoch: event.inputEpoch,
      completedEpochUntil: event.inputEpoch
    },
    projection: phoneStableProjection(leg[1], 'candidate'),
    status: 'transaction',
    session
  };
  return reduced({
    ...provisional,
    projection: projectionForTransaction(provisional)
  });
}

function nextGeneratedIdentity(snapshot: PhoneStorySnapshot): Readonly<{
  sessionId: string;
  generation: number;
}> {
  const generation = snapshot.revision + 1;
  return {
    sessionId: `phone-session-${generation}`,
    generation
  };
}

function startedInputRun(
  snapshot: PhoneStableSnapshot,
  event: Extract<PhoneStoryEvent, { type: 'INTENT_RESOLVED' }>
): PhoneStoryReduction {
  if (
    !event.boundaryKnown
    || !event.crossedBoundary
    || !event.run
    || event.anchorY === null
  ) return reduced(snapshot, 'pass-native');
  const identity = nextGeneratedIdentity(snapshot);
  const reduction = startedRun(snapshot, {
    type: 'RUN_STARTED',
    authorityId: event.authorityId,
    ...identity,
    leg: event.direction === 1 ? 0 : phoneRunTuple(event.run)[3] - 1,
    direction: event.direction,
    run: event.run,
    anchorY: event.anchorY,
    inputEpoch: event.inputEpoch,
    trigger: 'input',
    reducedMotion: event.reducedMotion === true
  });
  return reduction.snapshot === snapshot
    ? reduced(snapshot, 'pass-native')
    : { ...reduction, inputDisposition: 'claim-boundary' };
}

function startedEntry(
  snapshot: Exclude<PhoneStorySnapshot, PhoneTransactionSnapshot>,
  event: Extract<PhoneStoryEvent, { type: 'DIRECT_ENTRY_REQUESTED' }>
): PhoneStoryReduction {
  const identity = nextGeneratedIdentity(snapshot);
  const cinematicRun = event.cinematic ? phoneRunTuple(event.cinematic.run) : null;
  const direction = event.cinematic?.direction ?? 1;
  const terminal = cinematicRun
    ? directionalEndpoints(cinematicRun, direction).target
    : event.target;
  const session: PhoneSnapshotSession = {
    ...identity,
    inputEpoch: null,
    operation: {
      trigger: 'entry',
      run: event.cinematic?.run ?? null,
      direction,
      legIndex: event.cinematic?.legIndex ?? 0,
      from: event.fallbackScene,
      to: terminal
    },
    phase: event.cinematic ? 'preparing' : 'verifying-target',
    progress: event.cinematic ? 0 : 1,
    anchor: {
      policy: 'entry-target',
      y: null,
      geometryRevision: null
    },
    alignment: null,
    presentationRevision: snapshot.revision + 1,
    firstFrameProof: null,
    proof: null,
    readiness: null,
    aod: aodLifecycleFor(event.cinematic?.run ?? null),
    reducedMotion: false
  };
  const provisional: PhoneTransactionSnapshot = {
    authorityId: snapshot.authorityId,
    revision: snapshot.revision + 1,
    diagnostics: { lastRollback: null },
    scroll: snapshot.scroll,
    input: {
      completedEpoch: null,
      completedEpochUntil: null
    },
    projection: phoneStableProjection(event.fallbackScene, 'candidate'),
    status: 'transaction',
    session
  };
  return reduced({
    ...provisional,
    projection: projectionForTransaction(provisional)
  });
}

type PhoneHoldCandidateSample = Readonly<{
  actualY: number;
  corridor: PhoneScrollCorridorId | null;
  progress: number;
  direction: -1 | 0 | 1;
  reducedMotion: boolean;
}>;

function committedSceneFor(
  snapshot: Exclude<PhoneStorySnapshot, PhoneTransactionSnapshot>
): SceneId {
  if (snapshot.status === 'stable') return snapshot.scene;
  const [from, to] = phoneScrollRunTuple(snapshot.run);
  return snapshot.scroll.direction === -1 ? to : from;
}

function directionForHoldCandidate(
  from: SceneId,
  to: SceneId,
  sampledDirection: -1 | 0 | 1
): 1 | -1 {
  if (sampledDirection === 1 || sampledDirection === -1) return sampledDirection;
  const fromIndex = (canonicalSceneIds as readonly SceneId[]).indexOf(from);
  const toIndex = (canonicalSceneIds as readonly SceneId[]).indexOf(to);
  return toIndex < fromIndex ? -1 : 1;
}

function startedHoldCandidate(
  snapshot: Exclude<PhoneStorySnapshot, PhoneTransactionSnapshot>,
  target: SceneId,
  sample: PhoneHoldCandidateSample
): PhoneStoryReduction {
  const from = committedSceneFor(snapshot);
  const identity = nextGeneratedIdentity(snapshot);
  const direction = directionForHoldCandidate(from, target, sample.direction);
  const session: PhoneSnapshotSession = {
    ...identity,
    inputEpoch: null,
    operation: {
      trigger: 'auto',
      run: null,
      direction,
      legIndex: 0,
      from,
      to: target
    },
    // Reduced front motion still owns one ordinary machine transaction. Its
    // proof is terminal static evidence, so it begins in admission and never
    // borrows the run-null direct-entry settle path.
    phase: sample.reducedMotion ? 'preparing' : 'verifying-target',
    progress: sample.reducedMotion ? (direction === 1 ? 0 : 1) : 1,
    anchor: {
      policy: 'entry-target',
      y: null,
      geometryRevision: null
    },
    alignment: null,
    presentationRevision: snapshot.revision + 1,
    firstFrameProof: null,
    proof: null,
    readiness: null,
    aod: null,
    reducedMotion: sample.reducedMotion
  };
  const provisional: PhoneTransactionSnapshot = {
    authorityId: snapshot.authorityId,
    revision: snapshot.revision + 1,
    diagnostics: { lastRollback: null },
    scroll: {
      ...snapshot.scroll,
      actualY: sample.actualY,
      corridor: sample.corridor,
      progress: sample.progress,
      direction: sample.direction,
      sampleRevision: snapshot.scroll.sampleRevision + 1
    },
    input: snapshot.input,
    projection: phoneStableProjection(from, 'candidate'),
    status: 'transaction',
    session
  };
  return reduced({
    ...provisional,
    projection: projectionForTransaction(provisional)
  });
}

export function reducePhoneStorySnapshot(
  snapshot: PhoneStorySnapshot,
  event: PhoneStoryEvent
): PhoneStoryReduction {
  if (event.type === 'RUN_STARTED') {
    return snapshot.status === 'stable' ? startedRun(snapshot, event) : reduced(snapshot);
  }
  if (event.authorityId !== snapshot.authorityId) return reduced(snapshot);

  if (event.type === 'INTENT_RESOLVED') {
    if (snapshot.status === 'transaction') {
      return reduced(snapshot, 'block-active-session');
    }
    if (snapshot.input.completedEpoch === event.inputEpoch) {
      return reduced(snapshot, 'consume-completed-epoch-tail');
    }
    return snapshot.status === 'stable'
      ? startedInputRun(snapshot, event)
      : reduced(snapshot, 'pass-native');
  }

  if (event.type === 'BOOTSTRAP_REQUESTED') {
    return snapshot.status === 'transaction'
      ? reduced(snapshot)
      : startedEntry(snapshot, {
        type: 'DIRECT_ENTRY_REQUESTED',
        authorityId: event.authorityId,
        target: event.target,
        source: 'initial',
        fallbackScene: event.fallbackScene,
        cinematic: event.cinematic
      });
  }

  if (event.type === 'DIRECT_ENTRY_REQUESTED') {
    return snapshot.status === 'transaction'
      ? reduced(snapshot)
      : startedEntry(snapshot, event);
  }

  if (event.type === 'HOLD_RECONCILED') {
    if (snapshot.status === 'transaction') return reduced(snapshot);
    if (snapshot.status === 'stable' && snapshot.scene === event.scene) {
      if (event.actualY === undefined || event.actualY === snapshot.scroll.actualY) {
        return reduced(snapshot);
      }
      return reduced({
          ...snapshot,
          revision: snapshot.revision + 1,
          scroll: {
            ...snapshot.scroll,
            actualY: event.actualY,
            sampleRevision: snapshot.scroll.sampleRevision + 1
          }
        });
    }
    return startedHoldCandidate(snapshot, event.scene, {
      actualY: event.actualY ?? snapshot.scroll.actualY,
      corridor: snapshot.scroll.corridor,
      progress: 1,
      direction: 0,
      reducedMotion: false
    });
  }

  if (event.type === 'NAVIGATE_REQUESTED') {
    // The runtime normalizer converts navigation to DIRECT_ENTRY_REQUESTED so
    // a menu/hash/history seek cannot publish a fake stable hold here.
    return reduced(snapshot);
  }

  if (event.type === 'SCROLL_RUN_RECONCILED') {
    if (snapshot.status === 'transaction') return reduced(snapshot);
    return reduced(nextScrollRun(snapshot, {
      run: event.run,
      direction: event.direction,
      progress: event.progress,
      actualY: event.actualY,
      corridor: event.corridor ?? null
    }));
  }

  if (event.type === 'SCROLL_SAMPLED') {
    if (snapshot.status === 'transaction') {
      return reduced({
          ...snapshot,
          revision: snapshot.revision + 1,
          scroll: {
            ...snapshot.scroll,
            actualY: event.actualY,
            corridor: event.corridor ?? snapshot.scroll.corridor,
            sampleRevision: snapshot.scroll.sampleRevision + 1
          }
        });
    }
    if (
      event.scene
      && event.scene !== committedSceneFor(snapshot)
    ) {
      return startedHoldCandidate(snapshot, event.scene, {
        actualY: event.actualY,
        corridor: event.corridor ?? snapshot.scroll.corridor,
        progress: event.progress === undefined ? snapshot.scroll.progress : clamp(event.progress),
        direction: event.direction ?? snapshot.scroll.direction,
        reducedMotion: event.reducedMotion === true
      });
    }
    return reduced(nextSampledScroll(snapshot, event));
  }

  if (!phoneExecutionOwnsSnapshot(snapshot, event)) return reduced(snapshot);
  const { session } = snapshot;
  const operation = session.operation;

  switch (event.type) {
    case 'PRESENTATION_READY_REPORTED': {
      const nextSession = reportPresentationReadiness(snapshot, session, event);
      return !nextSession || nextSession === session
        ? reduced(snapshot)
        : reduced(nextTransaction(snapshot, nextSession));
    }
    case 'PRESENTATION_PROOF_REPORTED': {
      const nextSession = reportPresentationProof(snapshot, session, event);
      if (!nextSession || nextSession === session) return reduced(snapshot);
      // A manifest-declared sampled static front handoff is still admitted by
      // the same immutable transaction, but a real target paint is terminal
      // evidence. Its sampled scroll position is already the authored rail
      // landing, so no readiness-driven layout release or programmatic scroll
      // correction may race an active Safari touch gesture. No media clock,
      // progress event, or synthetic endpoint commit participates.
      if (
        (
          // Every reduced transaction shares this short static endpoint path.
          (nextSession.reducedMotion
            ? nextSession.phase === 'preparing'
          // Normal sampled front static endpoints are manifest-declared.
          // Their exact leaf proof is terminal, without Safari alignment.
            : operation.run === null
              && operation.trigger === 'auto'
              && nextSession.phase === 'verifying-target'
              && (operation.to === 'star-map' || operation.to === 'aod-animation'))
        )
        && validPresentationProof(
          snapshot,
          nextSession,
          nextSession.proof,
          eventNow(event, nextSession.proof)
        )
      ) return reduced(nextStable(snapshot, operationTarget(operation)));
      return nextSession.phase === 'preparing'
        && validFirstFrameProof(
          snapshot,
          nextSession,
          nextSession.firstFrameProof,
          eventNow(event, nextSession.firstFrameProof)
        )
        ? reduced(nextTransaction(snapshot, {
          ...nextSession,
          phase: 'animating',
          aod: nextSession.aod
            ? {
                ...nextSession.aod,
                stage: 'playback'
              }
            : null
        }))
        : reduced(nextTransaction(snapshot, nextSession));
    }
    case 'PROGRESS_REPORTED': {
      if (
        session.phase !== 'animating'
        || event.progress === undefined
        || (session.aod !== null && session.aod.stage !== 'playback')
      ) return reduced(snapshot);
      const progress = clamp(event.progress);
      const monotonic = operation.direction === 1
        ? progress >= session.progress
        : progress <= session.progress;
      return !monotonic || progress === session.progress
        ? reduced(snapshot)
        : reduced(nextTransaction(snapshot, { ...session, progress }));
    }
    case 'LEG_COMPLETED': {
      if (
        session.phase !== 'animating'
        || (session.aod !== null && session.aod.stage !== 'playback')
      ) return reduced(snapshot);
      if (isTerminalLeg(operation)) {
        return reduced(nextTransaction(snapshot, {
          ...session,
          phase: 'verifying-target',
          presentationRevision: snapshot.revision + 1,
          firstFrameProof: null,
          proof: null,
          readiness: null,
          aod: session.aod ? { ...session.aod, stage: 'settling' } : null
        }));
      }
      const run = runForOperation(operation);
      if (!run) return reduced(snapshot);
      const legIndex = operation.legIndex + operation.direction;
      return legIndex < 0 || legIndex >= run[3]
        ? reduced(snapshot)
        : reduced(nextTransaction(snapshot, {
          ...session,
          operation: { ...operation, legIndex },
          phase: 'preparing',
          progress: operation.direction === 1 ? 0 : 1,
          presentationRevision: snapshot.revision + 1,
          firstFrameProof: null,
          proof: null,
          readiness: null,
          aod: null
        }));
    }
    case 'TARGET_LAYOUT_REQUESTED':
      return session.phase !== 'verifying-target'
        || session.operation.trigger !== 'entry'
        || operation.run !== null
        ? reduced(snapshot)
        : reduced(nextTransaction(snapshot, {
          ...session,
          phase: 'releasing-layout'
        }));
    case 'TARGET_PRESENTED':
      return session.phase !== 'verifying-target'
        || !isTerminalLeg(operation)
        || !canStartTargetAlignment(
          snapshot,
          session,
          eventNow(event, session.proof, session.readiness)
        )
        ? reduced(snapshot)
        : reduced(nextTransaction(snapshot, { ...session, phase: 'releasing-layout' }));
    case 'LAYOUT_RELEASED':
      return session.phase !== 'releasing-layout'
        ? reduced(snapshot)
        : reduced(nextTransaction(snapshot, { ...session, phase: 'measuring-landing' }));
    case 'LANDING_MEASURED':
      return reduceLandingMeasured(snapshot, session, event, forwardAlignmentPhases);
    case 'SCROLL_COMMANDED':
      return reduceScrollCommanded(snapshot, session, event, forwardAlignmentPhases);
    case 'SCROLL_CONFIRMED':
      return reduceScrollConfirmed(snapshot, session, event, forwardAlignmentPhases, false);
    case 'PRESENTATION_COMMITTED': {
      const rollback = session.phase === 'rollback-verifying-stable';
      const phases = rollback ? rollbackAlignmentPhases : forwardAlignmentPhases;
      const scene = rollback ? operationSource(operation) : operationTarget(operation);
      return !canCommitPresentation(
        snapshot,
        eventNow(event, session.proof)
      )
        ? reduced(snapshot)
        : reduceStablePresentationVerified(snapshot, session, phases, scene);
    }
    case 'FAILED': {
      if (session.phase.startsWith('rollback-')) return reduced(snapshot);
      const reason = event.reason ?? 'capability-failed';
      return reduced(nextRollback(snapshot, session, reason));
    }
    case 'ROLLBACK_RENDERED':
      return session.phase !== 'rollback-rendering'
        ? reduced(snapshot)
        : reduced(nextTransaction(snapshot, {
          ...session,
          phase: 'rollback-releasing-layout'
        }));
    case 'ROLLBACK_LAYOUT_RELEASED':
      return session.phase !== 'rollback-releasing-layout'
        ? reduced(snapshot)
        : reduced(nextTransaction(snapshot, {
          ...session,
          phase: 'rollback-measuring-landing'
        }));
    case 'ROLLBACK_LANDING_MEASURED':
      return reduceLandingMeasured(snapshot, session, event, rollbackAlignmentPhases);
    case 'ROLLBACK_SCROLL_COMMANDED':
      return reduceScrollCommanded(snapshot, session, event, rollbackAlignmentPhases);
    case 'ROLLBACK_SCROLL_CONFIRMED':
      return reduceScrollConfirmed(snapshot, session, event, rollbackAlignmentPhases, true);
    default:
      return reduced(snapshot);
  }
}
