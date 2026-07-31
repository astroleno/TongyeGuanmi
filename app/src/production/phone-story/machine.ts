import {
  phoneAdjacentTarget,
  phoneEntryForLocation,
  phoneSceneById,
  phoneSegmentBetween,
  phoneWarmEntryPolicy,
  type PhoneSceneId,
  type PhoneSegmentId
} from './manifest';
import {
  PHONE_FINAL_EVIDENCE_KINDS,
  type PhoneAttemptKey,
  type PhoneDirection,
  type PhoneEvidenceKind,
  type PhoneEvidenceRecord,
  type PhoneEvidenceSlot,
  type PhoneEntryRequest,
  type PhoneFailure,
  type PhonePresentationProof,
  type PhoneReduceResult,
  type PhoneStableCommit,
  type PhoneStoryEffect,
  type PhoneStoryEvent,
  type PhoneStorySnapshot,
  type PhoneTransaction,
  type PhoneTransactionLeg,
  type PhoneTransactionMode,
  type PhoneTransactionSnapshot,
  type PhoneViewportSnapshot
} from './protocol';

export type PhoneMachineSnapshot = PhoneStorySnapshot<PhoneSceneId, PhoneSegmentId>;
export type PhoneMachineTransactionSnapshot = PhoneTransactionSnapshot<
  PhoneSceneId,
  PhoneSegmentId
>;
export type PhoneMachineResult = PhoneReduceResult<PhoneSceneId, PhoneSegmentId>;

type BootOptions = Readonly<{
  authorityId: string;
  request: PhoneEntryRequest;
  viewport: PhoneViewportSnapshot;
}>;

type TransactionOptions = Readonly<{
  mode: PhoneTransactionMode;
  sourceSceneId: PhoneSceneId | null;
  candidateSceneId: PhoneSceneId;
  segmentId: PhoneSegmentId | null;
  direction: PhoneDirection | null;
  request: PhoneEntryRequest;
  commitIntent: 'semantic' | 'reproject' | 'rollback';
  generation: number;
  fallbackFromSceneId?: PhoneSceneId | null;
  pendingEntry?: PhoneEntryRequest | null;
  restoreUrlOnRollback?: boolean;
}>;

function freezeOwned<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeOwned(nested);
  return Object.freeze(value);
}

function emptyInput() {
  return { enabled: false, claimedEpoch: null, arrivingTailBlocked: true } as const;
}

function sameAttempt(left: PhoneAttemptKey, right: PhoneAttemptKey): boolean {
  return left.authorityId === right.authorityId
    && left.transactionId === right.transactionId
    && left.transactionGeneration === right.transactionGeneration
    && left.mode === right.mode
    && left.sceneId === right.sceneId
    && left.segmentId === right.segmentId
    && left.direction === right.direction;
}

function sameSlot(left: PhoneEvidenceSlot, right: PhoneEvidenceSlot): boolean {
  return sameAttempt(left.attempt, right.attempt)
    && left.stageIndex === right.stageIndex
    && left.leg === right.leg
    && left.kind === right.kind
    && left.planeRevision === right.planeRevision;
}

export function createPhoneEvidenceSlot<
  SceneId extends string = string,
  SegmentId extends string = string
>(slot: PhoneEvidenceSlot<SceneId, SegmentId>): PhoneEvidenceSlot<SceneId, SegmentId> {
  return freezeOwned({ ...slot });
}

function evidenceSlot(
  attempt: PhoneAttemptKey<PhoneSceneId, PhoneSegmentId>,
  stageIndex: number,
  leg: PhoneTransactionLeg,
  kind: PhoneEvidenceKind,
  planeRevision: number | null
): PhoneEvidenceSlot<PhoneSceneId, PhoneSegmentId> {
  return createPhoneEvidenceSlot({ attempt, stageIndex, leg, kind, planeRevision });
}

function attemptFor(
  authorityId: string,
  options: TransactionOptions
): PhoneAttemptKey<PhoneSceneId, PhoneSegmentId> {
  return freezeOwned({
    authorityId,
    transactionId: [
      authorityId,
      options.generation,
      options.mode,
      options.candidateSceneId,
      options.segmentId ?? 'entry'
    ].join(':'),
    transactionGeneration: options.generation,
    mode: options.mode,
    sceneId: options.candidateSceneId,
    segmentId: options.segmentId,
    direction: options.direction
  });
}

function urlEffectFor(
  request: PhoneEntryRequest,
  canonicalHash: string,
  warm: boolean
): 'none' | 'push' | 'replace' {
  if (warm && (request.origin === 'menu' || request.origin === 'programmatic')) {
    return 'push';
  }
  if (!warm && request.hash !== canonicalHash) return 'replace';
  return 'none';
}

function transactionFor(
  base: PhoneMachineSnapshot,
  options: TransactionOptions
): PhoneTransaction<PhoneSceneId, PhoneSegmentId> {
  const attempt = attemptFor(base.authorityId, options);
  const scene = phoneSceneById(options.candidateSceneId);
  const warm = options.sourceSceneId !== null;
  const closure = options.mode === 'entry' && options.sourceSceneId
    ? phoneWarmEntryPolicy(options.sourceSceneId, options.candidateSceneId).closure
    : scene.directEntry.closure;
  const leg: PhoneTransactionLeg = options.mode === 'rollback' ? 'rollback' : 'target';
  const requiredPrepared = closure.exposeReceiverAfter.map((kind, stageIndex) => (
    evidenceSlot(attempt, stageIndex, leg, kind, null)
  ));
  return freezeOwned({
    mode: options.mode,
    phase: options.mode === 'rollback' ? 'rolling-back' : 'preparing',
    attempt,
    sourceSceneId: options.sourceSceneId,
    candidateSceneId: options.candidateSceneId,
    stageIndex: 0,
    planeRevision: null,
    requiredPrepared,
    requiredFinal: [],
    evidence: [],
    dependencies: closure.load,
    requestedEntry: options.request,
    canonicalPathname: options.request.pathname,
    canonicalHash: scene.directEntry.canonicalHash,
    urlEffect: urlEffectFor(options.request, scene.directEntry.canonicalHash, warm),
    restoreUrlOnRollback: options.restoreUrlOnRollback
      ?? (requestChangedUrl(options.request) && warm),
    fallbackFromSceneId: options.fallbackFromSceneId ?? null,
    commitIntent: options.commitIntent,
    pendingEntry: options.pendingEntry ?? null,
    deadline: {
      operation: 'moduleLoad',
      remainingMs: scene.directEntry.deadlinePolicy.moduleLoad,
      startedAtActiveMs: 0,
      suspended: false
    },
    progress: 0,
    claimedPhysicalEpoch: null,
    activation: 'none',
    retainedTopology: false,
    failure: null
  });
}

function requestChangedUrl(request: PhoneEntryRequest): boolean {
  return request.origin === 'hash' || request.origin === 'popstate';
}

function loadEffects(
  transaction: PhoneTransaction<PhoneSceneId, PhoneSegmentId>
): readonly PhoneStoryEffect[] {
  const scene = phoneSceneById(transaction.candidateSceneId);
  return freezeOwned([
    {
      type: 'load-dependencies',
      attempt: transaction.attempt,
      dependencies: transaction.dependencies
    },
    {
      type: 'schedule-deadline',
      attempt: transaction.attempt,
      operation: 'moduleLoad',
      timeoutMs: scene.directEntry.deadlinePolicy.moduleLoad
    }
  ] satisfies readonly PhoneStoryEffect[]);
}

function initialBase(options: BootOptions): PhoneMachineSnapshot {
  return freezeOwned({
    status: 'faulted',
    authorityId: options.authorityId,
    stateRevision: 0,
    stableCommit: null,
    presentationProof: null,
    transaction: null,
    fault: { code: 'not-connected', message: 'Phone story is not connected', retryable: true },
    safeCover: { kind: 'loader', opaque: true },
    scroll: null,
    viewport: options.viewport,
    input: emptyInput(),
    visibility: 'foreground',
    lastTransactionGeneration: 0,
    lastPlaneRevision: 0,
    originalEntry: options.request
  });
}

function beginTransaction(
  base: PhoneMachineSnapshot,
  options: Omit<TransactionOptions, 'generation'>,
  extraEffects: readonly PhoneStoryEffect[] = []
): PhoneMachineResult {
  const generation = base.lastTransactionGeneration + 1;
  const transaction = transactionFor(base, { ...options, generation });
  const snapshot = freezeOwned({
    status: 'transaction',
    authorityId: base.authorityId,
    stateRevision: base.stateRevision + 1,
    stableCommit: base.stableCommit,
    presentationProof: base.presentationProof,
    transaction,
    scroll: base.scroll,
    viewport: base.viewport,
    input: emptyInput(),
    visibility: base.visibility,
    lastTransactionGeneration: generation,
    lastPlaneRevision: base.lastPlaneRevision,
    originalEntry: base.originalEntry
  } satisfies PhoneMachineTransactionSnapshot);
  return freezeOwned({
    snapshot,
    effects: [...extraEffects, ...loadEffects(transaction)]
  });
}

export function createPhoneStoryBoot(options: BootOptions): PhoneMachineResult {
  const resolution = phoneEntryForLocation(options.request.pathname, options.request.hash);
  return beginTransaction(initialBase(options), {
    mode: 'boot',
    sourceSceneId: null,
    candidateSceneId: resolution.sceneId,
    segmentId: null,
    direction: null,
    request: options.request,
    commitIntent: 'semantic'
  });
}

function acceptedEvidence(
  snapshot: PhoneMachineTransactionSnapshot,
  record: PhoneEvidenceRecord
): PhoneMachineTransactionSnapshot {
  return freezeOwned({
    ...snapshot,
    stateRevision: snapshot.stateRevision + 1,
    transaction: {
      ...snapshot.transaction,
      evidence: [...snapshot.transaction.evidence, record]
    }
  });
}

function hasEvidence(
  transaction: PhoneTransaction<PhoneSceneId, PhoneSegmentId>,
  slot: PhoneEvidenceSlot
): boolean {
  return transaction.evidence.some((record) => sameSlot(record.slot, slot));
}

function quorumComplete(
  transaction: PhoneTransaction<PhoneSceneId, PhoneSegmentId>,
  slots: readonly PhoneEvidenceSlot[]
): boolean {
  return slots.length > 0 && slots.every((slot) => hasEvidence(transaction, slot));
}

function beginFinalProof(snapshot: PhoneMachineTransactionSnapshot): PhoneMachineResult {
  const planeRevision = snapshot.lastPlaneRevision + 1;
  const transaction = snapshot.transaction;
  const leg: PhoneTransactionLeg = transaction.mode === 'rollback' ? 'rollback' : 'target';
  const requiredFinal = PHONE_FINAL_EVIDENCE_KINDS.map((kind, index) => (
    evidenceSlot(transaction.attempt, index, leg, kind, planeRevision)
  ));
  const next = freezeOwned({
    ...snapshot,
    lastPlaneRevision: planeRevision,
    transaction: {
      ...transaction,
      phase: transaction.mode === 'rollback' ? 'rolling-back' : 'presenting-target',
      planeRevision,
      requiredFinal,
      deadline: {
        operation: 'planeApply',
        remainingMs: phoneSceneById(transaction.candidateSceneId)
          .directEntry.deadlinePolicy.planeApply,
        startedAtActiveMs: 0,
        suspended: false
      }
    }
  } satisfies PhoneMachineTransactionSnapshot);
  return freezeOwned({
    snapshot: next,
    effects: [
      {
        type: 'apply-presentation-plane',
        attempt: transaction.attempt,
        planeRevision
      },
      {
        type: 'schedule-deadline',
        attempt: transaction.attempt,
        operation: 'planeApply',
        timeoutMs: phoneSceneById(transaction.candidateSceneId)
          .directEntry.deadlinePolicy.planeApply
      }
    ]
  });
}

function evidenceByKind(
  transaction: PhoneTransaction<PhoneSceneId, PhoneSegmentId>,
  kind: PhoneEvidenceKind
): PhoneEvidenceRecord {
  const record = transaction.evidence.find((candidate) => (
    candidate.slot.kind === kind
      && candidate.slot.planeRevision === transaction.planeRevision
  ));
  if (!record) throw new Error(`Missing ${kind} evidence at stable quorum`);
  return record;
}

function presentationProof(
  transaction: PhoneTransaction<PhoneSceneId, PhoneSegmentId>,
  commitSequence: number,
  role: 'committed' | 'rollback'
): PhonePresentationProof<PhoneSceneId> {
  if (transaction.planeRevision === null) throw new Error('Missing plane revision');
  return freezeOwned({
    commitSequence,
    plane: { sceneId: transaction.candidateSceneId, role },
    planeRevision: transaction.planeRevision,
    planeEvidence: evidenceByKind(transaction, 'plane-acknowledged'),
    contentEvidence: evidenceByKind(transaction, 'content-visible'),
    frameEvidence: evidenceByKind(transaction, 'frame-visible'),
    coverageEvidence: evidenceByKind(transaction, 'coverage-visible'),
    landingEvidence: evidenceByKind(transaction, 'landing-confirmed'),
    scrollEvidence: evidenceByKind(transaction, 'scroll-confirmed')
  });
}

function urlEffects(
  transaction: PhoneTransaction<PhoneSceneId, PhoneSegmentId>,
  mode: 'commit' | 'rollback'
): readonly PhoneStoryEffect[] {
  if (mode === 'rollback' && !transaction.restoreUrlOnRollback) return [];
  if (mode === 'rollback') {
    const scene = phoneSceneById(transaction.candidateSceneId);
    return [{
      type: 'replace-url',
      pathname: transaction.canonicalPathname,
      hash: scene.directEntry.canonicalHash
    }];
  }
  const effect = transaction.fallbackFromSceneId ? 'replace' : transaction.urlEffect;
  if (effect === 'none') return [];
  return [{
    type: effect === 'push' ? 'push-url' : 'replace-url',
    pathname: transaction.canonicalPathname,
    hash: transaction.canonicalHash
  }];
}

export function commitStableCandidate(
  snapshot: PhoneMachineTransactionSnapshot
): PhoneMachineResult {
  const transaction = snapshot.transaction;
  const commitSequence = (snapshot.stableCommit?.commitSequence ?? 0) + 1;
  const scene = phoneSceneById(transaction.candidateSceneId);
  const stableCommit: PhoneStableCommit<PhoneSceneId> = freezeOwned({
    sceneId: scene.id,
    landing: scene.landing,
    commitSequence
  });
  const proof = presentationProof(transaction, commitSequence, 'committed');
  const stable = freezeOwned({
    ...snapshot,
    status: 'stable',
    stableCommit,
    presentationProof: proof,
    transaction: null,
    scroll: snapshot.scroll ?? { x: 0, y: 0, sampledAt: 0, origin: 'runtime' },
    input: { enabled: true, claimedEpoch: null, arrivingTailBlocked: false }
  } as const);
  return freezeOwned({
    snapshot: stable,
    effects: urlEffects(transaction, 'commit')
  });
}

function finishReproject(snapshot: PhoneMachineTransactionSnapshot): PhoneMachineResult {
  const stableCommit = snapshot.stableCommit;
  if (!stableCommit) return terminalFault(snapshot, {
    code: 'missing-rollback-anchor',
    message: 'Cannot settle proof without a stable commit',
    recoverable: false
  });
  const rollback = snapshot.transaction.commitIntent === 'rollback';
  const proof = presentationProof(
    snapshot.transaction,
    stableCommit.commitSequence,
    rollback ? 'rollback' : 'committed'
  );
  const stable = freezeOwned({
    ...snapshot,
    status: 'stable',
    stableCommit,
    presentationProof: proof,
    transaction: null,
    scroll: snapshot.scroll ?? { x: 0, y: 0, sampledAt: 0, origin: 'runtime' },
    input: { enabled: true, claimedEpoch: null, arrivingTailBlocked: false }
  } as const);
  return freezeOwned({
    snapshot: stable,
    effects: rollback ? urlEffects(snapshot.transaction, 'rollback') : []
  });
}

export function reprojectCommittedPlane(
  snapshot: PhoneMachineSnapshot,
  request: PhoneEntryRequest = snapshot.originalEntry,
  intent: 'reproject' | 'rollback' = 'reproject'
): PhoneMachineResult {
  if (!snapshot.stableCommit) return freezeOwned({ snapshot, effects: [] });
  return beginTransaction(snapshot, {
    mode: intent === 'rollback' ? 'rollback' : 'recovery',
    sourceSceneId: snapshot.stableCommit.sceneId,
    candidateSceneId: snapshot.stableCommit.sceneId,
    segmentId: null,
    direction: null,
    request,
    commitIntent: intent,
    restoreUrlOnRollback: intent === 'rollback' && requestChangedUrl(request)
  });
}

function terminalFault(
  snapshot: PhoneMachineSnapshot,
  failure: PhoneFailure
): PhoneMachineResult {
  const hasProvenPlane = snapshot.stableCommit !== null && snapshot.presentationProof !== null;
  return freezeOwned({
    snapshot: {
      ...snapshot,
      status: 'faulted',
      stateRevision: snapshot.stateRevision + 1,
      transaction: null,
      fault: {
        code: failure.code,
        message: failure.message,
        retryable: failure.recoverable
      },
      safeCover: {
        kind: hasProvenPlane ? 'committed-plane' : 'loader',
        opaque: true
      },
      input: emptyInput()
    },
    effects: []
  });
}

function startWarmEntry(
  snapshot: PhoneMachineSnapshot,
  request: PhoneEntryRequest,
  target: PhoneSceneId,
  invalidatedAttempt?: PhoneAttemptKey<PhoneSceneId, PhoneSegmentId>
): PhoneMachineResult {
  const source = snapshot.stableCommit;
  if (!source) {
    return beginTransaction(snapshot, {
      mode: 'boot',
      sourceSceneId: null,
      candidateSceneId: target,
      segmentId: null,
      direction: null,
      request,
      commitIntent: 'semantic'
    }, invalidatedAttempt ? [{ type: 'invalidate-attempt', attempt: invalidatedAttempt }] : []);
  }
  if (source.sceneId === target) return reprojectCommittedPlane(snapshot, request);
  return beginTransaction(snapshot, {
    mode: 'entry',
    sourceSceneId: source.sceneId,
    candidateSceneId: target,
    segmentId: null,
    direction: null,
    request,
    commitIntent: 'semantic'
  }, invalidatedAttempt ? [{ type: 'invalidate-attempt', attempt: invalidatedAttempt }] : []);
}

function handleEntry(
  snapshot: PhoneMachineSnapshot,
  request: PhoneEntryRequest
): PhoneMachineResult {
  const target = phoneEntryForLocation(request.pathname, request.hash).sceneId;
  if (snapshot.status === 'transaction') {
    if (snapshot.transaction.mode === 'rollback') {
      return freezeOwned({
        snapshot: {
          ...snapshot,
          stateRevision: snapshot.stateRevision + 1,
          transaction: { ...snapshot.transaction, pendingEntry: request }
        },
        effects: []
      });
    }
    return startWarmEntry(snapshot, request, target, snapshot.transaction.attempt);
  }
  return startWarmEntry(snapshot, request, target);
}

function validFailureSlot(
  snapshot: PhoneMachineTransactionSnapshot,
  slot: PhoneEvidenceSlot
): boolean {
  return sameAttempt(snapshot.transaction.attempt, slot.attempt)
    && [...snapshot.transaction.requiredPrepared, ...snapshot.transaction.requiredFinal]
      .some((required) => sameSlot(required, slot));
}

function handleFailure(
  snapshot: PhoneMachineTransactionSnapshot,
  slot: PhoneEvidenceSlot,
  failure: PhoneFailure
): PhoneMachineResult {
  if (!validFailureSlot(snapshot, slot)) return freezeOwned({ snapshot, effects: [] });
  const transaction = snapshot.transaction;
  if (transaction.mode === 'boot') {
    if (transaction.candidateSceneId === 'hero') return terminalFault(snapshot, failure);
    const heroRequest: PhoneEntryRequest = {
      pathname: transaction.canonicalPathname,
      hash: '#home',
      origin: 'programmatic'
    };
    return beginTransaction(snapshot, {
      mode: 'boot',
      sourceSceneId: null,
      candidateSceneId: 'hero',
      segmentId: null,
      direction: null,
      request: heroRequest,
      commitIntent: 'semantic',
      fallbackFromSceneId: transaction.candidateSceneId
    }, [{ type: 'invalidate-attempt', attempt: transaction.attempt }]);
  }
  if (transaction.mode === 'rollback') return terminalFault(snapshot, failure);
  if (snapshot.stableCommit) {
    return reprojectCommittedPlane(snapshot, transaction.requestedEntry, 'rollback');
  }
  return terminalFault(snapshot, failure);
}

function handleEvidence(
  snapshot: PhoneMachineTransactionSnapshot,
  slot: PhoneEvidenceSlot,
  kind: PhoneEvidenceKind,
  token: string
): PhoneMachineResult {
  const transaction = snapshot.transaction;
  if (!sameAttempt(transaction.attempt, slot.attempt) || kind !== slot.kind) {
    return freezeOwned({ snapshot, effects: [] });
  }
  const requirements = [...transaction.requiredPrepared, ...transaction.requiredFinal];
  if (!requirements.some((required) => sameSlot(required, slot)) || hasEvidence(transaction, slot)) {
    return freezeOwned({ snapshot, effects: [] });
  }
  const accepted = acceptedEvidence(snapshot, freezeOwned({ slot, token }));
  if (
    transaction.requiredFinal.length === 0
    && quorumComplete(accepted.transaction, accepted.transaction.requiredPrepared)
  ) {
    return beginFinalProof(accepted);
  }
  if (
    accepted.transaction.requiredFinal.length > 0
    && quorumComplete(accepted.transaction, accepted.transaction.requiredFinal)
  ) {
    return accepted.transaction.commitIntent === 'semantic'
      ? commitStableCandidate(accepted)
      : finishReproject(accepted);
  }
  return freezeOwned({ snapshot: accepted, effects: [] });
}

function handleRetry(snapshot: PhoneMachineSnapshot): PhoneMachineResult {
  if (snapshot.status !== 'faulted') return freezeOwned({ snapshot, effects: [] });
  if (snapshot.stableCommit) return reprojectCommittedPlane(snapshot);
  return beginTransaction(snapshot, {
    mode: 'boot',
    sourceSceneId: null,
    candidateSceneId: 'hero',
    segmentId: null,
    direction: null,
    request: { pathname: snapshot.originalEntry.pathname, hash: '#home', origin: 'programmatic' },
    commitIntent: 'semantic',
    fallbackFromSceneId: null
  });
}

export function phoneEventPriority(event: PhoneStoryEvent): number {
  switch (event.type) {
    case 'disconnect-requested': return 0;
    case 'page-hidden':
    case 'viewport-sampled': return event.type === 'page-hidden' || event.change !== 'toolbar' ? 1 : 4;
    case 'terminal-fault': return 2;
    case 'entry-requested': return 3;
    case 'page-shown': return 4;
    case 'physical-intent':
    case 'scroll-sampled': return 6;
    default: return 5;
  }
}

export type PhoneQueuedEvent = Readonly<{
  sequence: number;
  event: PhoneStoryEvent;
}>;

export type PhoneEventQueue = readonly PhoneQueuedEvent[];

export function enqueuePhoneStoryEvent(
  queue: PhoneEventQueue,
  event: PhoneStoryEvent,
  sequence: number
): PhoneEventQueue {
  return freezeOwned([...queue, { event, sequence }]);
}

export function dequeuePhoneStoryEvent(queue: PhoneEventQueue): Readonly<{
  item: PhoneQueuedEvent | null;
  queue: PhoneEventQueue;
}> {
  if (queue.length === 0) return freezeOwned({ item: null, queue });
  const selected = queue.reduce((best, item) => {
    const priority = phoneEventPriority(item.event);
    const bestPriority = phoneEventPriority(best.event);
    return priority < bestPriority
      || (priority === bestPriority && item.sequence < best.sequence)
      ? item
      : best;
  });
  return freezeOwned({
    item: selected,
    queue: queue.filter((item) => item !== selected)
  });
}

export function reducePhoneStory(
  snapshot: PhoneMachineSnapshot,
  event: PhoneStoryEvent
): PhoneMachineResult {
  switch (event.type) {
    case 'entry-requested': return handleEntry(snapshot, event.request);
    case 'retry-requested': return handleRetry(snapshot);
    case 'evidence-reported':
      return snapshot.status === 'transaction'
        ? handleEvidence(snapshot, event.slot, event.report.kind, event.report.token)
        : freezeOwned({ snapshot, effects: [] });
    case 'prepared-reported':
      return snapshot.status === 'transaction'
        ? handleEvidence(snapshot, event.slot, event.report.kind, event.report.token)
        : freezeOwned({ snapshot, effects: [] });
    case 'frame-reported':
      return snapshot.status === 'transaction'
        ? handleEvidence(snapshot, event.slot, event.slot.kind, event.report.token)
        : freezeOwned({ snapshot, effects: [] });
    case 'failure-reported':
      return snapshot.status === 'transaction'
        ? handleFailure(snapshot, event.slot, event.failure)
        : freezeOwned({ snapshot, effects: [] });
    case 'terminal-fault':
      return terminalFault(snapshot, {
        code: event.code,
        message: event.code,
        recoverable: true
      });
    default: return freezeOwned({ snapshot, effects: [] });
  }
}

function committedScene(snapshot: PhoneMachineSnapshot): PhoneSceneId | null {
  return snapshot.stableCommit?.sceneId ?? null;
}

export function selectPhoneEdgeSurface(snapshot: PhoneMachineSnapshot): `#${string}` | null {
  const scene = committedScene(snapshot);
  return scene ? phoneSceneById(scene).edgeSurface : null;
}

export function selectPhoneCheckpoint(snapshot: PhoneMachineSnapshot): string | null {
  const scene = committedScene(snapshot);
  return scene ? phoneSceneById(scene).checkpoint : null;
}

export function selectPhoneNavigationScene(snapshot: PhoneMachineSnapshot): PhoneSceneId | null {
  const scene = committedScene(snapshot);
  return scene ? phoneSceneById(scene).navigationId : null;
}

export function selectPhoneAdjacentSegment(
  snapshot: PhoneMachineSnapshot,
  direction: PhoneDirection
): PhoneSegmentId | null {
  const scene = committedScene(snapshot);
  const target = scene ? phoneAdjacentTarget(scene, direction) : null;
  return scene && target ? phoneSegmentBetween(scene, target)?.id ?? null : null;
}
