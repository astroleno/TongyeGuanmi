import {
  phoneAdjacentTarget,
  phoneEntryForLocation,
  phoneManifest,
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
export type PhoneMachineTransactionSnapshot =
  PhoneTransactionSnapshot<PhoneSceneId, PhoneSegmentId>;
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
  physicalEpoch?: number | null;
  reducedMotion?: boolean;
  failure?: PhoneFailure | null;
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
  const segment = options.segmentId
    ? phoneManifest.segments.find((candidate) => candidate.id === options.segmentId) ?? null
    : null;
  const legPolicy = segment && options.direction ? segment[options.direction] : null;
  const closure = options.mode === 'segment' && legPolicy
    ? legPolicy.closure
    : options.mode === 'entry' && options.sourceSceneId
      ? phoneWarmEntryPolicy(options.sourceSceneId, options.candidateSceneId).closure
      : scene.directEntry.closure;
  const leg: PhoneTransactionLeg = options.mode === 'rollback' ? 'rollback' : 'target';
  const targetPrepared = closure.exposeReceiverAfter.map((kind, stageIndex) => (
    evidenceSlot(attempt, stageIndex, leg, kind, null)
  ));
  const requiredPrepared = options.mode === 'segment'
    ? [
        evidenceSlot(attempt, 0, 'source', 'root-connected', null),
        evidenceSlot(attempt, 0, 'effect', 'module-loaded', null),
        evidenceSlot(attempt, 1, 'effect', 'root-connected', null),
        ...targetPrepared
      ]
    : targetPrepared;
  const deadlinePolicy = options.mode === 'rollback' && segment
    ? segment.rollback.deadlinePolicy
    : legPolicy?.deadlinePolicy ?? scene.directEntry.deadlinePolicy;
  const deadlineOperation = options.mode === 'rollback' ? 'rollback' : 'moduleLoad';
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
    closure,
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
      operation: deadlineOperation,
      remainingMs: deadlinePolicy[deadlineOperation],
      startedAtActiveMs: 0,
      suspended: false
    },
    progress: 0,
    claimedPhysicalEpoch: options.physicalEpoch ?? null,
    activation: 'none',
    retainedTopology: false,
    reducedMotion: options.reducedMotion ?? false,
    failure: options.failure ?? null
  });
}

function requestChangedUrl(request: PhoneEntryRequest): boolean {
  return request.origin === 'hash' || request.origin === 'popstate';
}

function loadEffects(
  transaction: PhoneTransaction<PhoneSceneId, PhoneSegmentId>
): readonly PhoneStoryEffect[] {
  const deadline = transaction.deadline;
  return freezeOwned([
    {
      type: 'load-dependencies',
      attempt: transaction.attempt,
      dependencies: transaction.dependencies
    },
    {
      type: 'schedule-deadline',
      attempt: transaction.attempt,
      operation: deadline?.operation ?? 'moduleLoad',
      timeoutMs: deadline?.remainingMs ?? 0
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
    input: {
      enabled: false,
      claimedEpoch: transaction.claimedPhysicalEpoch,
      arrivingTailBlocked: true
    },
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
  const segmentSource = transaction.mode === 'segment';
  const leg: PhoneTransactionLeg = transaction.mode === 'rollback'
    ? 'rollback'
    : segmentSource ? 'source' : 'target';
  const kinds: readonly PhoneEvidenceKind[] = segmentSource
    ? ['plane-acknowledged']
    : PHONE_FINAL_EVIDENCE_KINDS;
  const requiredFinal = kinds.map((kind, index) => (
    evidenceSlot(transaction.attempt, index, leg, kind, planeRevision)
  ));
  const next = freezeOwned({
    ...snapshot,
    lastPlaneRevision: planeRevision,
    transaction: {
      ...transaction,
      phase: transaction.mode === 'rollback'
        ? 'rolling-back'
        : segmentSource ? 'presenting-source' : 'presenting-target',
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

function segmentFor(
  transaction: PhoneTransaction<PhoneSceneId, PhoneSegmentId>
) {
  return transaction.attempt.segmentId
    ? phoneManifest.segments.find(({ id }) => id === transaction.attempt.segmentId) ?? null
    : null;
}

function beginPlayback(snapshot: PhoneMachineTransactionSnapshot): PhoneMachineResult {
  return freezeOwned({
    snapshot: {
      ...snapshot,
      transaction: {
        ...snapshot.transaction,
        phase: 'playing',
        requiredFinal: [],
        deadline: null
      }
    },
    effects: []
  });
}

function beginTargetPresentation(snapshot: PhoneMachineTransactionSnapshot): PhoneMachineResult {
  const transaction = snapshot.transaction;
  const planeRevision = snapshot.lastPlaneRevision + 1;
  const requiredFinal = PHONE_FINAL_EVIDENCE_KINDS.map((kind, index) => (
    evidenceSlot(transaction.attempt, index, 'target', kind, planeRevision)
  ));
  const timeoutMs = segmentFor(transaction)?.[transaction.attempt.direction ?? 'forward']
    .deadlinePolicy.planeApply
    ?? phoneSceneById(transaction.candidateSceneId).directEntry.deadlinePolicy.planeApply;
  return freezeOwned({
    snapshot: {
      ...snapshot,
      stateRevision: snapshot.stateRevision + 1,
      lastPlaneRevision: planeRevision,
      transaction: {
        ...transaction,
        phase: 'presenting-target',
        progress: 1,
        planeRevision,
        requiredFinal,
        deadline: {
          operation: 'planeApply',
          remainingMs: timeoutMs,
          startedAtActiveMs: 0,
          suspended: false
        }
      }
    },
    effects: [{
      type: 'apply-presentation-plane',
      attempt: transaction.attempt,
      planeRevision
    }, {
      type: 'schedule-deadline',
      attempt: transaction.attempt,
      operation: 'planeApply',
      timeoutMs
    }]
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
    input: {
      enabled: true,
      claimedEpoch: transaction.claimedPhysicalEpoch,
      arrivingTailBlocked: transaction.claimedPhysicalEpoch !== null
    }
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
    input: {
      enabled: true,
      claimedEpoch: snapshot.transaction.claimedPhysicalEpoch,
      arrivingTailBlocked: snapshot.transaction.claimedPhysicalEpoch !== null
    }
  } as const);
  const pendingEntryEffect: readonly PhoneStoryEffect[] = snapshot.transaction.pendingEntry
    ? [{ type: 'defer-entry', request: snapshot.transaction.pendingEntry }]
    : [];
  return freezeOwned({
    snapshot: stable,
    effects: [
      ...(rollback ? urlEffects(snapshot.transaction, 'rollback') : []),
      ...pendingEntryEffect
    ]
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
    restoreUrlOnRollback: intent === 'rollback' && requestChangedUrl(request),
    physicalEpoch: snapshot.input.claimedEpoch
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

function failTransaction(
  snapshot: PhoneMachineTransactionSnapshot,
  failure: PhoneFailure
): PhoneMachineResult {
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
      fallbackFromSceneId: transaction.candidateSceneId,
      failure
    }, [{ type: 'invalidate-attempt', attempt: transaction.attempt }]);
  }
  if (transaction.mode === 'rollback' || transaction.mode === 'recovery') {
    return terminalFault(snapshot, failure);
  }
  if (snapshot.stableCommit) {
    return beginTransaction(snapshot, {
      mode: 'rollback',
      sourceSceneId: snapshot.stableCommit.sceneId,
      candidateSceneId: snapshot.stableCommit.sceneId,
      segmentId: transaction.attempt.segmentId,
      direction: transaction.attempt.direction,
      request: transaction.requestedEntry,
      commitIntent: 'rollback',
      pendingEntry: transaction.pendingEntry,
      restoreUrlOnRollback: transaction.restoreUrlOnRollback,
      physicalEpoch: transaction.claimedPhysicalEpoch,
      reducedMotion: transaction.reducedMotion,
      failure
    }, [
      { type: 'invalidate-attempt', attempt: transaction.attempt },
      { type: 'pause-closure', attempt: transaction.attempt, reason: 'rollback' }
    ]);
  }
  return terminalFault(snapshot, failure);
}

function handleFailure(
  snapshot: PhoneMachineTransactionSnapshot,
  slot: PhoneEvidenceSlot,
  failure: PhoneFailure
): PhoneMachineResult {
  return validFailureSlot(snapshot, slot)
    ? failTransaction(snapshot, failure)
    : freezeOwned({ snapshot, effects: [] });
}

function handleDeadline(
  snapshot: PhoneMachineTransactionSnapshot,
  event: Extract<PhoneStoryEvent, { type: 'deadline-fired' }>
): PhoneMachineResult {
  if (!event.attempt || !sameAttempt(snapshot.transaction.attempt, event.attempt)) {
    return freezeOwned({ snapshot, effects: [] });
  }
  return failTransaction(snapshot, {
    code: `deadline:${event.operation}`,
    message: `${event.operation} deadline expired`,
    recoverable: snapshot.transaction.mode !== 'rollback'
  });
}

function handleSegment(
  snapshot: PhoneMachineSnapshot,
  direction: PhoneDirection,
  physicalEpoch: number,
  reducedMotion: boolean
): PhoneMachineResult {
  if (snapshot.status !== 'stable' || !snapshot.input.enabled) {
    return freezeOwned({ snapshot, effects: [] });
  }
  if (snapshot.input.claimedEpoch !== null && physicalEpoch <= snapshot.input.claimedEpoch) {
    return freezeOwned({ snapshot, effects: [] });
  }
  const source = snapshot.stableCommit.sceneId;
  const target = phoneAdjacentTarget(source, direction);
  const segment = target ? phoneSegmentBetween(source, target) : null;
  if (!target || !segment) return freezeOwned({ snapshot, effects: [] });
  return beginTransaction(snapshot, {
    mode: 'segment',
    sourceSceneId: source,
    candidateSceneId: target,
    segmentId: segment.id,
    direction,
    request: snapshot.originalEntry,
    commitIntent: 'semantic',
    physicalEpoch,
    reducedMotion
  });
}

function matchingActiveAttempt(
  snapshot: PhoneMachineTransactionSnapshot,
  attempt: PhoneAttemptKey
): boolean {
  return snapshot.visibility === 'foreground'
    && snapshot.viewport.supported
    && sameAttempt(snapshot.transaction.attempt, attempt);
}

function updateSegmentPhase(
  snapshot: PhoneMachineTransactionSnapshot,
  phase: 'playing' | 'dwelling' | 'awaiting-leg-intent',
  stageIndex = snapshot.transaction.stageIndex,
  progress = snapshot.transaction.progress
): PhoneMachineResult {
  return freezeOwned({
    snapshot: {
      ...snapshot,
      stateRevision: snapshot.stateRevision + 1,
      transaction: { ...snapshot.transaction, phase, stageIndex, progress }
    },
    effects: []
  });
}

function handleProgress(
  snapshot: PhoneMachineTransactionSnapshot,
  attempt: PhoneAttemptKey,
  progress: number
): PhoneMachineResult {
  const current = snapshot.transaction;
  const next = Math.max(0, Math.min(1, progress));
  if (!matchingActiveAttempt(snapshot, attempt) || current.phase !== 'playing'
    || next <= current.progress) {
    return freezeOwned({ snapshot, effects: [] });
  }
  return updateSegmentPhase(snapshot, 'playing', current.stageIndex, next);
}

function handleTransitionComplete(
  snapshot: PhoneMachineTransactionSnapshot,
  attempt: PhoneAttemptKey
): PhoneMachineResult {
  const transaction = snapshot.transaction;
  if (!matchingActiveAttempt(snapshot, attempt) || transaction.mode !== 'segment'
    || transaction.phase !== 'playing') {
    return freezeOwned({ snapshot, effects: [] });
  }
  const policy = segmentFor(transaction)?.timing.policy;
  if (policy?.kind === 'stagedSnap' && transaction.stageIndex < policy.playMs.length - 1) {
    const advance = policy.advance[transaction.stageIndex] ?? { kind: 'immediate' as const };
    const progress = policy.stops[transaction.stageIndex] ?? transaction.progress;
    if (advance.kind === 'delay') {
      return updateSegmentPhase(snapshot, 'dwelling', transaction.stageIndex, progress);
    }
    if (advance.kind === 'gesture') {
      return updateSegmentPhase(snapshot, 'awaiting-leg-intent', transaction.stageIndex, progress);
    }
    return updateSegmentPhase(snapshot, 'playing', transaction.stageIndex + 1, progress);
  }
  return beginTargetPresentation(snapshot);
}

function handleBoundaryAdvance(
  snapshot: PhoneMachineTransactionSnapshot,
  attempt: PhoneAttemptKey,
  phase: 'dwelling' | 'awaiting-leg-intent',
  physicalEpoch: number | null
): PhoneMachineResult {
  const transaction = snapshot.transaction;
  if (!matchingActiveAttempt(snapshot, attempt) || transaction.phase !== phase) {
    return freezeOwned({ snapshot, effects: [] });
  }
  if (phase === 'awaiting-leg-intent' && physicalEpoch !== null
    && transaction.claimedPhysicalEpoch !== null
    && physicalEpoch <= transaction.claimedPhysicalEpoch) {
    return freezeOwned({ snapshot, effects: [] });
  }
  const advanced = updateSegmentPhase(
    snapshot,
    'playing',
    transaction.stageIndex + 1,
    transaction.progress
  );
  if (advanced.snapshot.status !== 'transaction' || physicalEpoch === null) return advanced;
  return freezeOwned({
    snapshot: {
      ...advanced.snapshot,
      transaction: {
        ...advanced.snapshot.transaction,
        claimedPhysicalEpoch: physicalEpoch
      },
      input: { ...advanced.snapshot.input, claimedEpoch: physicalEpoch }
    },
    effects: advanced.effects
  });
}

function handleEvidence(
  snapshot: PhoneMachineTransactionSnapshot,
  slot: PhoneEvidenceSlot,
  kind: PhoneEvidenceKind,
  token: string
): PhoneMachineResult {
  const transaction = snapshot.transaction;
  if (snapshot.visibility !== 'foreground' || !snapshot.viewport.supported
    || !sameAttempt(transaction.attempt, slot.attempt) || kind !== slot.kind) {
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
    if (accepted.transaction.mode === 'segment'
      && accepted.transaction.phase === 'presenting-source') {
      return beginPlayback(accepted);
    }
    return accepted.transaction.commitIntent === 'semantic'
      ? commitStableCandidate(accepted)
      : finishReproject(accepted);
  }
  if (accepted.transaction.mode === 'segment'
    && (accepted.transaction.phase === 'presenting-target'
      || accepted.transaction.phase === 'aligning')) {
    const visibleKinds: readonly PhoneEvidenceKind[] = [
      'plane-acknowledged', 'content-visible', 'frame-visible', 'coverage-visible'
    ];
    const visible = visibleKinds.every((requiredKind) => (
      accepted.transaction.evidence.some(({ slot: evidence }) => (
        evidence.kind === requiredKind
          && evidence.planeRevision === accepted.transaction.planeRevision
      ))
    ));
    const landed = accepted.transaction.evidence.some(({ slot: evidence }) => (
      evidence.kind === 'landing-confirmed'
        && evidence.planeRevision === accepted.transaction.planeRevision
    ));
    if (visible || landed) {
      return freezeOwned({
        snapshot: {
          ...accepted,
          transaction: {
            ...accepted.transaction,
            phase: landed ? 'verifying' : 'aligning'
          }
        },
        effects: []
      });
    }
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

function handleScroll(
  snapshot: PhoneMachineSnapshot,
  sample: Extract<PhoneStoryEvent, { type: 'scroll-sampled' }>['sample']
): PhoneMachineResult {
  if (snapshot.visibility !== 'foreground') return freezeOwned({ snapshot, effects: [] });
  return freezeOwned({
    snapshot: { ...snapshot, stateRevision: snapshot.stateRevision + 1, scroll: sample },
    effects: []
  });
}

function recoverForViewport(
  snapshot: PhoneMachineSnapshot,
  viewport: PhoneViewportSnapshot,
  invalidated: PhoneAttemptKey | null
): PhoneMachineResult {
  const base = freezeOwned({ ...snapshot, viewport, visibility: 'foreground' }) as PhoneMachineSnapshot;
  const prefix: readonly PhoneStoryEffect[] = invalidated
    ? [{ type: 'invalidate-attempt', attempt: invalidated }]
    : [];
  if (base.stableCommit) {
    const recovery = reprojectCommittedPlane(base);
    return freezeOwned({ snapshot: recovery.snapshot, effects: [...prefix, ...recovery.effects] });
  }
  const candidate = base.status === 'transaction'
    ? base.transaction.candidateSceneId
    : phoneEntryForLocation(base.originalEntry.pathname, base.originalEntry.hash).sceneId;
  return beginTransaction(base, {
    mode: 'boot', sourceSceneId: null, candidateSceneId: candidate,
    segmentId: null, direction: null, request: base.originalEntry,
    commitIntent: 'semantic'
  }, prefix);
}

function handleViewport(
  snapshot: PhoneMachineSnapshot,
  event: Extract<PhoneStoryEvent, { type: 'viewport-sampled' }>
): PhoneMachineResult {
  if (event.change === 'unsupported' || !event.viewport.supported) {
    const attempt = snapshot.status === 'transaction' ? snapshot.transaction.attempt : null;
    const effects: readonly PhoneStoryEffect[] = attempt
      ? [{ type: 'invalidate-attempt', attempt }, {
          type: 'pause-closure', attempt, reason: 'superseded' }]
      : [];
    if (snapshot.stableCommit && snapshot.presentationProof) {
      return freezeOwned({
        snapshot: {
          ...snapshot, status: 'stable', stateRevision: snapshot.stateRevision + 1,
          transaction: null, viewport: event.viewport,
          scroll: snapshot.scroll ?? { x: 0, y: 0, sampledAt: 0, origin: 'runtime' },
          input: emptyInput(), stableCommit: snapshot.stableCommit,
          presentationProof: snapshot.presentationProof
        },
        effects
      });
    }
    return freezeOwned({
      snapshot: { ...snapshot, stateRevision: snapshot.stateRevision + 1,
        viewport: event.viewport, input: emptyInput() },
      effects
    });
  }
  if (event.change === 'toolbar' && snapshot.status === 'transaction'
    && !['presenting-target', 'aligning', 'verifying', 'rolling-back']
      .includes(snapshot.transaction.phase)) {
    return freezeOwned({
      snapshot: { ...snapshot, stateRevision: snapshot.stateRevision + 1,
        viewport: event.viewport },
      effects: []
    });
  }
  const invalidated = snapshot.status === 'transaction' ? snapshot.transaction.attempt : null;
  return recoverForViewport(snapshot, event.viewport, invalidated);
}

function handlePageHidden(
  snapshot: PhoneMachineSnapshot,
  persisted: boolean
): PhoneMachineResult {
  const visibility = persisted ? 'persisted' : 'hidden';
  if (snapshot.status !== 'transaction') {
    return freezeOwned({ snapshot: {
      ...snapshot, stateRevision: snapshot.stateRevision + 1,
      visibility, input: emptyInput()
    }, effects: [] });
  }
  const deadline = snapshot.transaction.deadline;
  const effects: PhoneStoryEffect[] = [{
    type: 'pause-closure', attempt: snapshot.transaction.attempt, reason: 'hidden'
  }];
  if (deadline) effects.push({
    type: 'cancel-deadline', attempt: snapshot.transaction.attempt,
    operation: deadline.operation
  });
  return freezeOwned({
    snapshot: {
      ...snapshot, stateRevision: snapshot.stateRevision + 1,
      visibility, input: emptyInput(),
      transaction: { ...snapshot.transaction, evidence: [],
        deadline: deadline ? { ...deadline, suspended: true } : null }
    },
    effects
  });
}

function handlePageShown(
  snapshot: PhoneMachineSnapshot,
  persisted: boolean
): PhoneMachineResult {
  if (!persisted && snapshot.visibility === 'foreground') {
    return freezeOwned({ snapshot, effects: [] });
  }
  return recoverForViewport(
    snapshot,
    snapshot.viewport,
    snapshot.status === 'transaction' ? snapshot.transaction.attempt : null
  );
}

export function reducePhoneStory(
  snapshot: PhoneMachineSnapshot,
  event: PhoneStoryEvent
): PhoneMachineResult {
  switch (event.type) {
    case 'entry-requested': return handleEntry(snapshot, event.request);
    case 'retry-requested': return handleRetry(snapshot);
    case 'segment-requested': return handleSegment(
      snapshot, event.direction, event.physicalEpoch, event.reducedMotion ?? false
    );
    case 'physical-intent':
      return handleSegment(snapshot, event.direction, event.epoch, false);
    case 'evidence-reported': return snapshot.status === 'transaction'
      ? handleEvidence(snapshot, event.slot, event.report.kind, event.report.token)
      : freezeOwned({ snapshot, effects: [] });
    case 'prepared-reported': return snapshot.status === 'transaction'
      ? handleEvidence(snapshot, event.slot, event.report.kind, event.report.token)
      : freezeOwned({ snapshot, effects: [] });
    case 'frame-reported': return snapshot.status === 'transaction'
      ? handleEvidence(snapshot, event.slot, event.slot.kind, event.report.token)
      : freezeOwned({ snapshot, effects: [] });
    case 'failure-reported': return snapshot.status === 'transaction'
      ? handleFailure(snapshot, event.slot, event.failure)
      : freezeOwned({ snapshot, effects: [] });
    case 'deadline-fired': return snapshot.status === 'transaction'
      ? handleDeadline(snapshot, event) : freezeOwned({ snapshot, effects: [] });
    case 'transition-progressed': return snapshot.status === 'transaction'
      ? handleProgress(snapshot, event.attempt, event.progress)
      : freezeOwned({ snapshot, effects: [] });
    case 'transition-completed': return snapshot.status === 'transaction'
      ? handleTransitionComplete(snapshot, event.attempt)
      : freezeOwned({ snapshot, effects: [] });
    case 'dwell-completed': return snapshot.status === 'transaction'
      ? handleBoundaryAdvance(snapshot, event.attempt, 'dwelling', null)
      : freezeOwned({ snapshot, effects: [] });
    case 'leg-intent': return snapshot.status === 'transaction'
      ? handleBoundaryAdvance(snapshot, event.attempt, 'awaiting-leg-intent', event.physicalEpoch)
      : freezeOwned({ snapshot, effects: [] });
    case 'scroll-sampled': return handleScroll(snapshot, event.sample);
    case 'viewport-sampled': return handleViewport(snapshot, event);
    case 'page-hidden': return handlePageHidden(snapshot, event.persisted);
    case 'page-shown': return handlePageShown(snapshot, event.persisted);
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
