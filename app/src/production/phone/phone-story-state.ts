import type { SceneId, SegmentId } from '../../story/types';
import {
  phoneRun,
  phoneScrollRun,
  type PhoneCursorRunId,
  type PhoneRunDefinition,
  type PhoneRunId,
  type PhoneScrollRunId
} from './phone-story-runs';
import {
  phoneStableProjection,
  phoneStoryPresentation,
  type PhonePresentationProjection
} from './phone-story-presentation';
import type { PhoneIntentDisposition } from './phone-transition-coordinator';

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

export type PhoneExecutionIdentity = Readonly<{
  authorityId: string;
  sessionId: string;
  generation: number;
  leg: number;
  direction: 1 | -1;
}>;

type PhoneSnapshotIdentityEvent = PhoneExecutionIdentity & Readonly<{
  type:
    | 'PRESENTED_FRAME'
    | 'PROGRESS_REPORTED'
    | 'LEG_COMPLETED'
    | 'TARGET_PRESENTED'
    | 'LAYOUT_RELEASED'
    | 'LANDING_MEASURED'
    | 'SCROLL_COMMANDED'
    | 'SCROLL_CONFIRMED'
    | 'STABLE_PRESENTATION_VERIFIED'
    | 'FAILED'
    | 'ROLLBACK_RENDERED'
    | 'ROLLBACK_LAYOUT_RELEASED'
    | 'ROLLBACK_LANDING_MEASURED'
    | 'ROLLBACK_SCROLL_COMMANDED'
    | 'ROLLBACK_SCROLL_CONFIRMED'
    | 'ROLLBACK_STABLE_PRESENTATION_VERIFIED';
  progress?: number;
  reason?: PhoneFailureReason;
  targetY?: number;
  geometryRevision?: number;
  commandId?: number;
  actualY?: number;
  visualViewportOffsetTop?: number;
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
  run: PhoneRunDefinition,
  direction: 1 | -1
): Readonly<{ source: SceneId; target: SceneId }> {
  return direction === 1
    ? { source: run.from, target: run.to }
    : { source: run.to, target: run.from };
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function runForOperation(operation: PhoneStoryOperation): PhoneRunDefinition | null {
  return operation.run ? phoneRun(operation.run) : null;
}

function transactionCursor(snapshot: PhoneTransactionSnapshot): PhoneStoryTransition | null {
  const operation = snapshot.session.operation;
  const run = operation.run ? phoneRun(operation.run) : null;
  if (!run) return null;
  const leg = run.legs[operation.legIndex]!;
  if (!leg) return null;
  return {
    kind: 'transition',
    sessionId: snapshot.session.sessionId,
    run: run.id,
    legIndex: operation.legIndex,
    runSource: operation.from,
    segment: leg.segment,
    from: leg.from,
    to: leg.to,
    direction: operation.direction,
    phase: snapshot.session.phase,
    progress: snapshot.session.progress
  };
}

function projectionForTransaction(
  snapshot: PhoneTransactionSnapshot
): PhonePresentationProjection {
  const { phase, operation } = snapshot.session;
  if (
    operation.trigger === 'entry'
    && operation.run === null
    && phase === 'verifying-target'
  ) {
    return phoneStableProjection(operationTarget(operation), 'candidate');
  }
  if (
    phase === 'releasing-layout'
    || phase === 'measuring-landing'
    || phase === 'aligning-scroll'
    || phase === 'verifying-stable'
  ) {
    return phoneStableProjection(operationTarget(operation), 'candidate');
  }
  if (phase.startsWith('rollback-')) {
    return phoneStableProjection(operationSource(operation), 'candidate');
  }
  const cursor = transactionCursor(snapshot);
  return cursor
    ? phoneStoryPresentation(cursor)
    : phoneStableProjection(operationSource(operation), 'candidate');
}

function scrollRunCursor(snapshot: PhoneScrollRunSnapshot): PhoneStoryTransition {
  const run = phoneScrollRun(snapshot.run);
  const direction = snapshot.scroll.direction === -1 ? -1 : 1;
  return {
    kind: 'transition',
    sessionId: `phone-scroll-${snapshot.scroll.sampleRevision}`,
    run: snapshot.run,
    legIndex: 0,
    runSource: direction === 1 ? run.from : run.to,
    segment: run.segment,
    from: run.from,
    to: run.to,
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
    projection: phoneStableProjection(scene),
    status: 'stable',
    scene,
    session: null
  };
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
    phase: 'rollback-rendering'
  });
}

function eventOwnsTransaction(
  snapshot: PhoneStorySnapshot,
  event: PhoneSnapshotIdentityEvent
): snapshot is PhoneTransactionSnapshot {
  if (snapshot.status !== 'transaction') return false;
  return snapshot.authorityId === event.authorityId
    && snapshot.session.sessionId === event.sessionId
    && snapshot.session.generation === event.generation
    && snapshot.session.operation.legIndex === event.leg
    && snapshot.session.operation.direction === event.direction;
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
    ? operation.legIndex === run.legs.length - 1
    : operation.legIndex === 0;
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
  const run = phoneRun(event.run);
  const endpoints = directionalEndpoints(run, event.direction);
  if (snapshot.scene !== endpoints.source) return reduced(snapshot);
  const legIndex = event.legIndex ?? (
    event.direction === 1 ? 0 : run.legs.length - 1
  );
  const leg = run.legs[legIndex];
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
      policy: run.anchor,
      y: event.anchorY,
      geometryRevision: null
    },
    alignment: null
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
    projection: phoneStableProjection(leg.from, 'candidate'),
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
    leg: event.direction === 1 ? 0 : phoneRun(event.run).legs.length - 1,
    direction: event.direction,
    run: event.run,
    anchorY: event.anchorY,
    inputEpoch: event.inputEpoch,
    trigger: 'input'
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
  const cinematicRun = event.cinematic ? phoneRun(event.cinematic.run) : null;
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
    alignment: null
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
    return reduced(nextStable(snapshot, event.scene, event.actualY));
  }

  if (event.type === 'NAVIGATE_REQUESTED') {
    // The runtime normalizer converts navigation to DIRECT_ENTRY_REQUESTED so
    // a menu/hash/history seek cannot publish a fake stable hold here.
    return reduced(snapshot);
  }

  if (event.type === 'SCROLL_RUN_RECONCILED') {
    if (snapshot.status === 'transaction') return reduced(snapshot);
    const virtual: PhoneScrollRunSnapshot = {
      authorityId: snapshot.authorityId,
      revision: snapshot.revision + 1,
      diagnostics: snapshot.diagnostics,
      scroll: {
        actualY: event.actualY,
        corridor: event.corridor ?? null,
        progress: clamp(event.progress),
        direction: event.direction,
        sampleRevision: snapshot.scroll.sampleRevision + 1
      },
      input: snapshot.input,
      projection: phoneStableProjection(phoneScrollRun(event.run).from, 'candidate'),
      status: 'scroll-run',
      run: event.run,
      session: null
    };
    const cursor = scrollRunCursor(virtual);
    return reduced({ ...virtual, projection: phoneStoryPresentation(cursor) });
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
    return reduced({
        ...snapshot,
        revision: snapshot.revision + 1,
        scroll: {
          ...snapshot.scroll,
          actualY: event.actualY,
          corridor: event.corridor ?? snapshot.scroll.corridor,
          progress: event.progress === undefined ? snapshot.scroll.progress : clamp(event.progress),
          direction: event.direction ?? snapshot.scroll.direction,
          sampleRevision: snapshot.scroll.sampleRevision + 1
        }
      });
  }

  if (!eventOwnsTransaction(snapshot, event)) return reduced(snapshot);
  const { session } = snapshot;
  const operation = session.operation;

  switch (event.type) {
    case 'PRESENTED_FRAME':
      return session.phase !== 'preparing'
        ? reduced(snapshot)
        : reduced(nextTransaction(snapshot, { ...session, phase: 'animating' }));
    case 'PROGRESS_REPORTED': {
      if (session.phase !== 'animating' || event.progress === undefined) return reduced(snapshot);
      const progress = clamp(event.progress);
      const monotonic = operation.direction === 1
        ? progress >= session.progress
        : progress <= session.progress;
      return !monotonic || progress === session.progress
        ? reduced(snapshot)
        : reduced(nextTransaction(snapshot, { ...session, progress }));
    }
    case 'LEG_COMPLETED': {
      if (session.phase !== 'animating') return reduced(snapshot);
      if (isTerminalLeg(operation)) {
        return reduced(nextTransaction(snapshot, { ...session, phase: 'verifying-target' }));
      }
      const run = runForOperation(operation);
      if (!run) return reduced(snapshot);
      const legIndex = operation.legIndex + operation.direction;
      return !run.legs[legIndex]
        ? reduced(snapshot)
        : reduced(nextTransaction(snapshot, {
          ...session,
          operation: { ...operation, legIndex },
          phase: 'preparing',
          progress: operation.direction === 1 ? 0 : 1
        }));
    }
    case 'TARGET_PRESENTED':
      return session.phase !== 'verifying-target' || !isTerminalLeg(operation)
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
    case 'STABLE_PRESENTATION_VERIFIED':
      return reduceStablePresentationVerified(
        snapshot,
        session,
        forwardAlignmentPhases,
        operationTarget(operation)
      );
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
    case 'ROLLBACK_STABLE_PRESENTATION_VERIFIED':
      return reduceStablePresentationVerified(
        snapshot,
        session,
        rollbackAlignmentPhases,
        operationSource(operation)
      );
    default:
      return reduced(snapshot);
  }
}
