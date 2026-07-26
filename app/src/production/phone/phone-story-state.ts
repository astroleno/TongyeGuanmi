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

type PhoneLegacyStoryHold = PhoneStoryHold & Readonly<{
  revision: number;
}>;

type PhoneLegacyStoryTransition = PhoneStoryTransition & Readonly<{
  revision: number;
  generation: number;
  runTarget: SceneId;
}>;

/** @deprecated Test-only cursor reducer compatibility. */
export type PhoneStoryLegacyCursor = PhoneLegacyStoryHold | PhoneLegacyStoryTransition;

export type PhoneStorySessionIdentity = Readonly<{
  sessionId: string;
  generation: number;
}>;

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

export type PhoneStoryRunOperation = Readonly<{
  kind: 'run';
  trigger: 'input' | 'auto';
  run: PhoneRunId;
  direction: 1 | -1;
  legIndex: number;
}>;

export type PhoneStoryEntryOperation = Readonly<{
  kind: 'entry';
  target: SceneId;
  source: 'initial' | 'hash' | 'menu' | 'history';
  fallbackScene: SceneId;
  cinematic: Readonly<{
    run: PhoneRunId;
    direction: 1;
    legIndex: number;
  }> | null;
}>;

export type PhoneStoryOperation =
  | PhoneStoryRunOperation
  | PhoneStoryEntryOperation;

export type PhoneSnapshotSession = Readonly<{
  sessionId: string;
  generation: number;
  inputEpoch: number | null;
  /** Entry operations are introduced with the route-local factory in Task 2. */
  operation: PhoneStoryRunOperation;
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
      run: PhoneRunId;
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
    | 'ROLLBACK_COMMITTED';
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
      type: 'HOLD_RECONCILED';
      authorityId: string;
      scene: SceneId;
      actualY?: number;
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
      progress?: number;
      direction?: -1 | 0 | 1;
    }>;

export type PhoneStoryEffect = never;

export type PhoneStoryReduction = Readonly<{
  snapshot: PhoneStorySnapshot;
  effects: readonly PhoneStoryEffect[];
}>;

const noEffects: readonly PhoneStoryEffect[] = [];

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

function runForOperation(operation: PhoneStoryRunOperation): PhoneRunDefinition {
  return phoneRun(operation.run);
}

function transactionCursor(snapshot: PhoneTransactionSnapshot): PhoneStoryTransition {
  const run = runForOperation(snapshot.session.operation);
  const { legIndex } = snapshot.session.operation;
  const leg = run.legs[legIndex]!;
  const { direction } = snapshot.session.operation;
  return {
    kind: 'transition',
    sessionId: snapshot.session.sessionId,
    run: run.id,
    legIndex,
    runSource: direction === 1 ? run.from : run.to,
    segment: leg.segment,
    from: leg.from,
    to: leg.to,
    direction,
    phase: snapshot.session.phase,
    progress: snapshot.session.progress
  };
}

function projectionForTransaction(
  snapshot: PhoneTransactionSnapshot
): PhonePresentationProjection {
  const projection = phoneStoryPresentation(transactionCursor(snapshot));
  return snapshot.session.phase === 'verifying-stable'
    ? { ...projection, commitState: 'candidate' }
    : projection;
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
  return transactionCursor(snapshot);
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

function eventOwnsTransaction(
  snapshot: PhoneStorySnapshot,
  event: PhoneSnapshotIdentityEvent
): snapshot is PhoneTransactionSnapshot {
  if (snapshot.status !== 'transaction') return false;
  return snapshot.authorityId === event.authorityId
    && snapshot.session.sessionId === event.sessionId
    && snapshot.session.generation === event.generation
    && snapshot.session.operation.legIndex === event.leg;
}

function operationTarget(operation: PhoneStoryRunOperation): SceneId {
  const run = phoneRun(operation.run);
  return operation.direction === 1 ? run.to : run.from;
}

function operationSource(operation: PhoneStoryRunOperation): SceneId {
  const run = phoneRun(operation.run);
  return operation.direction === 1 ? run.from : run.to;
}

function isTerminalLeg(operation: PhoneStoryRunOperation): boolean {
  const run = runForOperation(operation);
  return operation.direction === 1
    ? operation.legIndex === run.legs.length - 1
    : operation.legIndex === 0;
}

function reduced(snapshot: PhoneStorySnapshot): PhoneStoryReduction {
  return { snapshot, effects: noEffects };
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
      kind: 'run',
      trigger: event.trigger ?? (event.inputEpoch === null ? 'auto' : 'input'),
      run: event.run,
      direction: event.direction,
      legIndex
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
    diagnostics: snapshot.diagnostics,
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

export function reducePhoneStorySnapshot(
  snapshot: PhoneStorySnapshot,
  event: PhoneStoryEvent
): PhoneStoryReduction {
  if (event.type === 'RUN_STARTED') {
    return snapshot.status === 'stable' ? startedRun(snapshot, event) : reduced(snapshot);
  }
  if (event.authorityId !== snapshot.authorityId) return reduced(snapshot);

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
      if (
        session.phase !== 'measuring-landing'
        || event.targetY === undefined
        || event.geometryRevision === undefined
      ) return reduced(snapshot);
      return reduced(nextTransaction(snapshot, {
        ...session,
        phase: 'aligning-scroll',
        alignment: {
          geometryRevision: event.geometryRevision,
          targetY: event.targetY,
          commandId: 0,
          correctionCount: 0,
          confirmedY: null,
          visualViewportOffsetTop: event.visualViewportOffsetTop ?? 0
        }
      }));
    case 'SCROLL_COMMANDED':
      if (session.phase !== 'aligning-scroll' || !session.alignment || event.commandId === undefined) {
        return reduced(snapshot);
      }
      return reduced(nextTransaction(snapshot, {
        ...session,
        alignment: { ...session.alignment, commandId: event.commandId }
      }));
    case 'SCROLL_CONFIRMED':
      if (
        session.phase !== 'aligning-scroll'
        || !session.alignment
        || event.commandId !== session.alignment.commandId
        || event.actualY === undefined
      ) return reduced(snapshot);
      return reduced(nextTransaction(snapshot, {
        ...session,
        phase: 'verifying-stable',
        alignment: { ...session.alignment, confirmedY: event.actualY }
      }));
    case 'STABLE_PRESENTATION_VERIFIED': {
      if (session.phase !== 'verifying-stable') return reduced(snapshot);
      const actualY = session.alignment?.confirmedY ?? snapshot.scroll.actualY;
      return reduced(nextStable(snapshot, operationTarget(operation), actualY));
    }
    case 'FAILED': {
      if (session.phase.startsWith('rollback-')) return reduced(snapshot);
      const reason = event.reason ?? 'capability-failed';
      return reduced(nextTransaction({
        ...snapshot,
        diagnostics: {
          lastRollback: {
            run: operation.run,
            reason,
            generation: session.generation + 1
          }
        }
      }, {
        ...session,
        generation: session.generation + 1,
        phase: 'rollback-rendering'
      }));
    }
    case 'ROLLBACK_COMMITTED':
      return session.phase !== 'rollback-rendering'
        ? reduced(snapshot)
        : reduced(nextStable(
          snapshot,
          operationSource(operation),
          session.anchor.y ?? snapshot.scroll.actualY
        ));
    default:
      return reduced(snapshot);
  }
}

/**
 * Legacy cursor-only reducer retained for tests and unconverted callers. It is
 * deliberately not used by the orchestrator publication path after Task 1.
 */
export type PhoneStoryCursorEvent =
  | (PhoneStorySessionIdentity & Readonly<{
      type: 'PHASE';
      phase: PhoneAdapterTransitionPhase;
    }>)
  | (PhoneStorySessionIdentity & Readonly<{
      type: 'PROGRESS';
      progress: number;
    }>)
  | (PhoneStorySessionIdentity & Readonly<{ type: 'ADVANCE_LEG' }>)
  | (PhoneStorySessionIdentity & Readonly<{ type: 'COMMIT' }>)
  | (PhoneStorySessionIdentity & Readonly<{ type: 'LAND' }>)
  | (PhoneStorySessionIdentity & Readonly<{ type: 'RELEASE' }>)
  | (PhoneStorySessionIdentity & Readonly<{ type: 'SETTLE' }>)
  | (PhoneStorySessionIdentity & Readonly<{ type: 'FAIL' }>)
  | (PhoneStorySessionIdentity & Readonly<{ type: 'ROLLBACK_COMMITTED' }>);

export function createPhoneStoryHold(
  scene: SceneId,
  revision = 0
): PhoneLegacyStoryHold {
  return { kind: 'hold', scene, revision };
}

function legacyTransitionAtLeg(
  run: PhoneRunDefinition,
  legIndex: number,
  direction: 1 | -1,
  identity: PhoneStorySessionIdentity,
  revision: number
): PhoneLegacyStoryTransition {
  const leg = run.legs[legIndex];
  if (!leg) throw new Error(`Phone run ${run.id} has no leg ${legIndex}`);
  const endpoints = directionalEndpoints(run, direction);
  return {
    kind: 'transition',
    revision,
    sessionId: identity.sessionId,
    generation: identity.generation,
    run: run.id,
    legIndex,
    runSource: endpoints.source,
    runTarget: endpoints.target,
    segment: leg.segment,
    from: leg.from,
    to: leg.to,
    direction,
    phase: 'preparing',
    progress: direction === 1 ? 0 : 1
  };
}

export function startPhoneStoryRun(
  cursor: PhoneStoryLegacyCursor,
  runId: PhoneRunId,
  direction: 1 | -1,
  identity: PhoneStorySessionIdentity,
  legIndex?: number
): PhoneLegacyStoryTransition {
  if (cursor.kind !== 'hold') {
    throw new Error('Cannot start a phone run outside a stable hold');
  }
  const run = phoneRun(runId);
  const endpoints = directionalEndpoints(run, direction);
  if (cursor.scene !== endpoints.source) {
    throw new Error(
      `Phone run ${runId} cannot start from ${cursor.scene} in direction ${direction}`
    );
  }
  return legacyTransitionAtLeg(
    run,
    legIndex ?? (direction === 1 ? 0 : run.legs.length - 1),
    direction,
    identity,
    cursor.revision
  );
}

function legacyEventOwnsCursor(
  cursor: PhoneLegacyStoryTransition,
  event: PhoneStoryCursorEvent
): boolean {
  return cursor.sessionId === event.sessionId && cursor.generation === event.generation;
}

function legacyTerminalLeg(cursor: PhoneLegacyStoryTransition): boolean {
  if (cursor.run.endsWith('-scroll')) return true;
  const run = phoneRun(cursor.run as PhoneRunId);
  return cursor.direction === 1
    ? cursor.legIndex === run.legs.length - 1
    : cursor.legIndex === 0;
}

export function reducePhoneStoryCursor(
  cursor: PhoneStoryLegacyCursor,
  event: PhoneStoryCursorEvent
): PhoneStoryLegacyCursor {
  if (cursor.kind !== 'transition' || !legacyEventOwnsCursor(cursor, event)) {
    return cursor;
  }
  if (event.type === 'FAIL') {
    return cursor.phase === 'rolling-back' ? cursor : { ...cursor, phase: 'rolling-back' };
  }
  if (event.type === 'ROLLBACK_COMMITTED') {
    return cursor.phase === 'rolling-back'
      ? createPhoneStoryHold(cursor.runSource, cursor.revision + 1)
      : cursor;
  }
  if (cursor.phase === 'rolling-back') return cursor;
  if (event.type === 'PHASE') {
    const legal = (
      (cursor.phase === 'preparing' && event.phase === 'presented-frame-ready')
      || (cursor.phase === 'presented-frame-ready' && event.phase === 'animating')
    );
    return legal ? { ...cursor, phase: event.phase } : cursor;
  }
  if (event.type === 'PROGRESS') {
    const progress = clamp(event.progress);
    const monotonic = cursor.direction === 1
      ? progress >= cursor.progress
      : progress <= cursor.progress;
    if (!monotonic || progress === cursor.progress) return cursor;
    return cursor.phase === 'preparing'
      ? { ...cursor, phase: 'animating', progress }
      : { ...cursor, progress };
  }
  if (event.type === 'ADVANCE_LEG') {
    if (legacyTerminalLeg(cursor) || cursor.phase !== 'animating') return cursor;
    return legacyTransitionAtLeg(
      phoneRun(cursor.run as PhoneRunId),
      cursor.legIndex + cursor.direction,
      cursor.direction,
      cursor,
      cursor.revision
    );
  }
  if (event.type === 'COMMIT') {
    return legacyTerminalLeg(cursor) && cursor.phase === 'animating'
      ? { ...cursor, phase: 'committing' }
      : cursor;
  }
  if (event.type === 'LAND') {
    return cursor.phase === 'committing' ? { ...cursor, phase: 'landing' } : cursor;
  }
  if (event.type === 'RELEASE') {
    return cursor.phase === 'landing' ? { ...cursor, phase: 'releasing' } : cursor;
  }
  if (event.type === 'SETTLE') {
    return cursor.phase === 'releasing'
      ? createPhoneStoryHold(cursor.runTarget, cursor.revision + 1)
      : cursor;
  }
  return cursor;
}
