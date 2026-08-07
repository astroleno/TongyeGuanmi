import {
  phoneAdjacentTarget, phoneEntryForLocation, phoneManifest, phoneSceneById,
  phonePreparedSurfaceIds, phoneSegmentBetween, phoneSegmentChoreographyFrame,
  phoneWarmEntryPolicy,
  type PhoneSceneId, type PhoneSegmentId
} from './manifest';
import {
  PHONE_FINAL_EVIDENCE_KINDS, type PhoneAttemptKey, type PhoneDirection,
  type PhoneEvidenceKind, type PhonePreparedEvidenceKind, type PhoneEvidenceRecord,
  type PhoneEvidenceSlot,
  type PhoneEntryRequest, type PhoneFailure, type PhonePresentationProof,
  type PhoneReduceResult, type PhoneStableCommit, type PhoneStoryEffect,
  type PhoneStoryEvent, type PhoneStorySnapshot, type PhoneTransaction,
  type PhoneTransactionLeg, type PhoneTransactionMode,
  type PhoneTransactionSnapshot, type PhoneViewportSnapshot,
  type PhoneDeadlinePolicy, type PhoneSurfaceId
} from './protocol';

export type PhoneMachineSnapshot = PhoneStorySnapshot<PhoneSceneId, PhoneSegmentId>;
export type PhoneMachineTransactionSnapshot = PhoneTransactionSnapshot<PhoneSceneId, PhoneSegmentId>;
export type PhoneMachineResult = PhoneReduceResult<PhoneSceneId, PhoneSegmentId>;

type BootOptions = Readonly<{
  authorityId: string; request: PhoneEntryRequest; viewport: PhoneViewportSnapshot;
}>;

type TransactionOptions = Readonly<{
  mode: PhoneTransactionMode; sourceSceneId: PhoneSceneId | null;
  candidateSceneId: PhoneSceneId; segmentId: PhoneSegmentId | null;
  direction: PhoneDirection | null; request: PhoneEntryRequest;
  commitIntent: 'semantic' | 'reproject' | 'rollback'; generation: number;
  fallbackFromSceneId?: PhoneSceneId | null; pendingEntry?: PhoneEntryRequest | null;
  restoreUrlOnRollback?: boolean;
  deadlinePolicy?: PhoneDeadlinePolicy; canonicalizeUrlOnCommit?: boolean;
  physicalEpoch?: number | null; reducedMotion?: boolean; activation?: 'offered' | 'spent';
  failure?: PhoneFailure | null;
}>;

function freezeOwned<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  for (const nested of Object.values(value)) freezeOwned(nested);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

const emptyInput = () => ({ enabled: false, claimedEpoch: null, arrivingTailBlocked: true } as const);

type TransactionPatch = Partial<PhoneTransaction<PhoneSceneId, PhoneSegmentId>>;
type TransactionSnapshotPatch = Partial<Pick<PhoneMachineTransactionSnapshot,
  'input' | 'lastPlaneRevision' | 'scroll' | 'viewport' | 'visibility'>>;
function reviseTransaction(
  snapshot: PhoneMachineTransactionSnapshot,
  transaction: TransactionPatch,
  outer: TransactionSnapshotPatch = {},
  effects: readonly PhoneStoryEffect[] = [],
  increment = true
): PhoneMachineResult & Readonly<{ snapshot: PhoneMachineTransactionSnapshot }> {
  return freezeOwned({
    snapshot: { ...snapshot, ...outer,
      stateRevision: snapshot.stateRevision + (increment ? 1 : 0),
      transaction: { ...snapshot.transaction, ...transaction } },
    effects
  });
}

export function sameAttempt(left: PhoneAttemptKey, right: PhoneAttemptKey): boolean {
  return left.authorityId === right.authorityId && left.transactionId === right.transactionId
    && left.transactionGeneration === right.transactionGeneration && left.mode === right.mode
    && left.sceneId === right.sceneId && left.segmentId === right.segmentId
    && left.direction === right.direction;
}

function sameSlot(left: PhoneEvidenceSlot, right: PhoneEvidenceSlot): boolean {
  return sameAttempt(left.attempt, right.attempt) && left.stageIndex === right.stageIndex
    && left.leg === right.leg && left.kind === right.kind
    && left.surfaceId === right.surfaceId
    && left.planeRevision === right.planeRevision;
}

function evidenceSlot(
  attempt: PhoneAttemptKey<PhoneSceneId, PhoneSegmentId>,
  stageIndex: number,
  leg: PhoneTransactionLeg,
  kind: PhoneEvidenceKind,
  planeRevision: number | null,
  surfaceId: PhoneSurfaceId | null = null
): PhoneEvidenceSlot<PhoneSceneId, PhoneSegmentId> {
  return freezeOwned({ attempt, stageIndex, leg, kind, surfaceId, planeRevision });
}

function preparedSlots(
  attempt: PhoneAttemptKey<PhoneSceneId, PhoneSegmentId>,
  sceneId: PhoneSceneId,
  leg: PhoneTransactionLeg,
  kinds: readonly PhonePreparedEvidenceKind[]
): readonly PhoneEvidenceSlot<PhoneSceneId, PhoneSegmentId>[] {
  return kinds.flatMap((kind) => phonePreparedSurfaceIds(sceneId, kind).map((surfaceId) => (
    evidenceSlot(attempt, 0, leg, kind, null, surfaceId)
  )));
}

function attemptFor(
  authorityId: string,
  options: TransactionOptions
): PhoneAttemptKey<PhoneSceneId, PhoneSegmentId> {
  return freezeOwned({
    authorityId, transactionId: [authorityId, options.generation, options.mode,
      options.candidateSceneId, options.segmentId ?? 'entry'].join(':'),
    transactionGeneration: options.generation, mode: options.mode,
    sceneId: options.candidateSceneId,
    segmentId: options.segmentId, direction: options.direction
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

function activationSurfaceIdsFor(
  mode: PhoneTransactionMode,
  candidateSceneId: PhoneSceneId,
  segmentId: PhoneSegmentId | null,
  direction: PhoneDirection | null,
  progress: number,
  closure: PhoneTransaction<PhoneSceneId, PhoneSegmentId>['closure']
): readonly PhoneSurfaceId[] {
  if (mode === 'segment' && segmentId && direction) {
    const owner = phoneSegmentChoreographyFrame(segmentId, progress, direction).mediaClockOwner;
    // A physical gesture may only activate media that is already mounted as
    // the departing plane. Incoming media enters on a prepared static frame;
    // a reverse target is never allowed to turn a missing mount into a CTA.
    if (owner !== 'source') return [];
    const role = owner;
    return closure.mount.flatMap((mount) => (
      mount.startsWith(`${role}:`) && mount.includes('video')
        ? [mount.slice(mount.indexOf(':') + 1) as PhoneSurfaceId] : []
    ));
  }
  if (phoneSceneById(candidateSceneId).directEntry.mediaActivation.directEntry === 'none') {
    return [];
  }
  return closure.mount.flatMap((mount) => (
    mount.includes('video') ? [mount.slice(mount.indexOf(':') + 1) as PhoneSurfaceId] : []
  ));
}

export function phoneTransactionActivationSurfaceIds(
  transaction: PhoneTransaction<PhoneSceneId, PhoneSegmentId>
): readonly PhoneSurfaceId[] {
  return activationSurfaceIdsFor(
    transaction.mode,
    transaction.candidateSceneId,
    transaction.attempt.segmentId,
    transaction.attempt.direction,
    transaction.progress,
    transaction.closure
  );
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
  const warmPolicy = options.mode === 'entry' && options.sourceSceneId
    ? phoneWarmEntryPolicy(options.sourceSceneId, options.candidateSceneId) : null;
  const closure = options.mode === 'segment' && legPolicy
    ? legPolicy.closure
    : warmPolicy?.closure ?? scene.directEntry.closure;
  const leg: PhoneTransactionLeg = options.mode === 'rollback' ? 'rollback' : 'target';
  const targetPrepared = preparedSlots(
    attempt, options.candidateSceneId, leg, closure.exposeReceiverAfter
  );
  const requiredPrepared = options.mode === 'segment'
    ? [
        evidenceSlot(attempt, 0, 'source', 'root-connected', null,
          options.sourceSceneId ? `root:${options.sourceSceneId}` : null),
        evidenceSlot(attempt, 0, 'effect', 'module-loaded', null),
        evidenceSlot(attempt, 0, 'effect', 'root-connected', null,
          legPolicy?.effectSurface ?? null),
        ...targetPrepared
      ]
    : targetPrepared;
  const deadlinePolicy = options.deadlinePolicy ?? (options.mode === 'rollback' && segment
    ? segment.rollback.deadlinePolicy
    : legPolicy?.deadlinePolicy ?? warmPolicy?.deadlinePolicy ?? scene.directEntry.deadlinePolicy);
  const deadlineOperation = options.mode === 'rollback' ? 'rollback' : 'moduleLoad';
  const initialProgress = options.mode === 'segment' && options.direction === 'reverse' ? 1 : 0;
  const activationSurfaceIds = activationSurfaceIdsFor(
    options.mode, options.candidateSceneId, options.segmentId, options.direction,
    initialProgress, closure
  );
  return freezeOwned({
    mode: options.mode, phase: options.mode === 'rollback' ? 'rolling-back' : 'preparing',
    attempt, sourceSceneId: options.sourceSceneId, candidateSceneId: options.candidateSceneId,
    stageIndex: 0, planeRevision: null, requiredPrepared, requiredFinal: [], evidence: [],
    closure, dependencies: closure.load,
    requestedEntry: options.request,
    canonicalPathname: options.request.pathname, canonicalHash: scene.directEntry.canonicalHash,
    urlEffect: options.canonicalizeUrlOnCommit
      ? 'replace' : urlEffectFor(options.request, scene.directEntry.canonicalHash, warm),
    restoreUrlOnRollback: options.restoreUrlOnRollback
      ?? (warm && (options.request.origin === 'hash' || options.request.origin === 'popstate')),
    fallbackFromSceneId: options.fallbackFromSceneId ?? null, commitIntent: options.commitIntent,
    pendingEntry: options.pendingEntry ?? null, deadlinePolicy,
    deadline: {
      operation: deadlineOperation,
      remainingMs: deadlinePolicy[deadlineOperation],
      startedAtActiveMs: 0,
      suspended: false
    },
    progress: initialProgress,
    claimedPhysicalEpoch: options.physicalEpoch ?? null,
    activation: options.activation && activationSurfaceIds.length > 0
      ? options.activation : 'none',
    retainedTopology: false,
    reducedMotion: options.reducedMotion ?? false,
    failure: options.failure ?? null
  });
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
    },
    ...(transaction.activation === 'offered' ? [{
      type: 'activate-surfaces' as const, attempt: transaction.attempt,
      credit: 'physical-epoch' as const,
      surfaceIds: phoneTransactionActivationSurfaceIds(transaction)
    }] : [])
  ] satisfies readonly PhoneStoryEffect[]);
}

function initialBase(options: BootOptions): PhoneMachineSnapshot {
  return freezeOwned({
    status: 'faulted',
    authorityId: options.authorityId, stateRevision: 0,
    stableCommit: null, presentationProof: null, transaction: null,
    fault: { code: 'not-connected', message: 'Phone story is not connected', retryable: true },
    safeCover: { kind: 'loader', opaque: true },
    scroll: null, viewport: options.viewport, input: emptyInput(),
    visibility: 'foreground', lastTransactionGeneration: 0, lastPlaneRevision: 0,
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
    authorityId: base.authorityId, stateRevision: base.stateRevision + 1,
    stableCommit: base.stableCommit, presentationProof: base.presentationProof,
    transaction, scroll: base.scroll, viewport: base.viewport,
    input: {
      enabled: false,
      claimedEpoch: transaction.claimedPhysicalEpoch,
      arrivingTailBlocked: true
    },
    visibility: base.visibility, lastTransactionGeneration: generation,
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
  transaction: PhoneTransaction<PhoneSceneId, PhoneSegmentId>, slots: readonly PhoneEvidenceSlot[]
): boolean {
  return slots.length > 0 && slots.every((slot) => hasEvidence(transaction, slot));
}

function beginFinalProof(snapshot: PhoneMachineTransactionSnapshot): PhoneMachineResult {
  const planeRevision = snapshot.lastPlaneRevision + 1;
  const transaction = snapshot.transaction;
  const rollback = transaction.mode === 'rollback';
  const segmentSource = transaction.mode === 'segment';
  const leg: PhoneTransactionLeg = rollback ? 'rollback'
    : segmentSource ? 'source' : 'target';
  const kinds: readonly PhoneEvidenceKind[] = segmentSource ? ['plane-acknowledged']
    : PHONE_FINAL_EVIDENCE_KINDS;
  const requiredFinal = kinds.map((kind) => (
    evidenceSlot(transaction.attempt, transaction.stageIndex, leg, kind, planeRevision)
  ));
  const timeoutMs = transaction.deadlinePolicy.planeApply;
  const next = freezeOwned({
    ...snapshot, lastPlaneRevision: planeRevision,
    transaction: {
      ...transaction, phase: rollback ? 'rolling-back'
        : segmentSource ? 'presenting-source' : 'presenting-target',
      planeRevision, requiredFinal,
      deadline: rollback ? transaction.deadline : {
        operation: 'planeApply', remainingMs: timeoutMs,
        startedAtActiveMs: 0, suspended: false
      }
    }
  } satisfies PhoneMachineTransactionSnapshot);
  return freezeOwned({
    snapshot: next,
    effects: [{ type: 'apply-presentation-plane', attempt: transaction.attempt, planeRevision },
      ...(!rollback ? [{ type: 'schedule-deadline', attempt: transaction.attempt,
        operation: 'planeApply', timeoutMs } as const] : [])]
  });
}

function segmentFor(transaction: PhoneTransaction<PhoneSceneId, PhoneSegmentId>) {
  return transaction.attempt.segmentId
    ? phoneManifest.segments.find(({ id }) => id === transaction.attempt.segmentId) ?? null
    : null;
}

function beginPlayback(snapshot: PhoneMachineTransactionSnapshot): PhoneMachineResult {
  return reviseTransaction(snapshot,
    { phase: 'playing', requiredFinal: [], deadline: null }, {}, [], false);
}

function beginTargetPresentation(snapshot: PhoneMachineTransactionSnapshot): PhoneMachineResult {
  const transaction = snapshot.transaction;
  const planeRevision = snapshot.lastPlaneRevision + 1;
  const requiredFinal = PHONE_FINAL_EVIDENCE_KINDS.map((kind) => (
    evidenceSlot(transaction.attempt, transaction.stageIndex, 'target', kind, planeRevision)
  ));
  const timeoutMs = transaction.deadlinePolicy.planeApply;
  return freezeOwned({
    snapshot: {
      ...snapshot, stateRevision: snapshot.stateRevision + 1,
      lastPlaneRevision: planeRevision,
      transaction: {
        ...transaction, phase: 'presenting-target',
        progress: transaction.attempt.direction === 'reverse' ? 0 : 1,
        planeRevision, requiredFinal,
        deadline: {
          operation: 'planeApply', remainingMs: timeoutMs,
          startedAtActiveMs: 0, suspended: false
        }
      }
    },
    effects: [{ type: 'apply-presentation-plane', attempt: transaction.attempt, planeRevision },
      { type: 'schedule-deadline', attempt: transaction.attempt,
        operation: 'planeApply', timeoutMs }]
  });
}

function advanceEvidenceDeadline(
  snapshot: PhoneMachineTransactionSnapshot
): PhoneMachineResult & Readonly<{ snapshot: PhoneMachineTransactionSnapshot }> {
  const transaction = snapshot.transaction;
  if (transaction.mode === 'rollback') return freezeOwned({ snapshot, effects: [] });
  const required = transaction.requiredFinal.length > 0
    ? transaction.requiredFinal : transaction.requiredPrepared;
  const missing = required.filter((slot) => !hasEvidence(transaction, slot));
  const operation = transaction.requiredFinal.length === 0
    ? missing.some(({ kind }) => kind === 'module-loaded') ? 'moduleLoad' : 'mediaPrepare'
    : missing.some(({ kind }) => kind === 'plane-acknowledged') ? 'planeApply'
      : missing.some(({ kind }) => ['content-visible', 'frame-visible', 'coverage-visible']
        .includes(kind)) ? 'firstFrame' : 'scrollConfirm';
  if (transaction.deadline?.operation === operation) {
    return freezeOwned({ snapshot, effects: [] });
  }
  const timeoutMs = transaction.deadlinePolicy[operation];
  if (timeoutMs <= 0) {
    return freezeOwned({ snapshot, effects: [] });
  }
  return reviseTransaction(snapshot, { deadline: {
    operation, remainingMs: timeoutMs, startedAtActiveMs: 0, suspended: false
  } }, {}, [{ type: 'schedule-deadline', attempt: transaction.attempt, operation, timeoutMs }], false);
}

function evidenceByKind(
  transaction: PhoneTransaction<PhoneSceneId, PhoneSegmentId>, kind: PhoneEvidenceKind
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
  commitSequence: number, role: 'committed' | 'rollback'
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
    sceneId: scene.id, landing: scene.landing, commitSequence
  });
  const proof = presentationProof(transaction, commitSequence, 'committed');
  const stable = freezeOwned({
    ...snapshot, status: 'stable', stableCommit, presentationProof: proof, transaction: null,
    scroll: snapshot.scroll ?? { x: 0, y: 0, sampledAt: 0, origin: 'runtime' },
    input: {
      enabled: true, claimedEpoch: transaction.claimedPhysicalEpoch,
      arrivingTailBlocked: transaction.claimedPhysicalEpoch !== null
    }
  } as const);
  return freezeOwned({ snapshot: stable, effects: urlEffects(transaction, 'commit') });
}

function finishReproject(snapshot: PhoneMachineTransactionSnapshot): PhoneMachineResult {
  const stableCommit = snapshot.stableCommit;
  if (!stableCommit) return terminalFault(snapshot, {
    code: 'missing-rollback-anchor', message: 'Cannot settle proof without a stable commit',
    recoverable: false
  });
  const rollback = snapshot.transaction.commitIntent === 'rollback';
  const proof = presentationProof(snapshot.transaction, stableCommit.commitSequence,
    rollback ? 'rollback' : 'committed');
  const stable = freezeOwned({
    ...snapshot, status: 'stable', stableCommit, presentationProof: proof, transaction: null,
    scroll: snapshot.scroll ?? { x: 0, y: 0, sampledAt: 0, origin: 'runtime' },
    input: {
      enabled: true, claimedEpoch: snapshot.transaction.claimedPhysicalEpoch,
      arrivingTailBlocked: snapshot.transaction.claimedPhysicalEpoch !== null
    }
  } as const);
  const pendingEntryEffect: readonly PhoneStoryEffect[] = snapshot.transaction.pendingEntry
    ? [{
        type: 'defer-entry', request: snapshot.transaction.pendingEntry,
        ...(rollback && snapshot.transaction.restoreUrlOnRollback
          && ['hash', 'popstate'].includes(snapshot.transaction.pendingEntry.origin)
          ? { urlWasReplaced: true } : {})
      }]
    : [];
  return freezeOwned({ snapshot: stable, effects: [
    ...(rollback ? urlEffects(snapshot.transaction, 'rollback') : []), ...pendingEntryEffect
  ] });
}

export function reprojectCommittedPlane(
  snapshot: PhoneMachineSnapshot,
  request: PhoneEntryRequest = snapshot.originalEntry
): PhoneMachineResult {
  if (!snapshot.stableCommit) return freezeOwned({ snapshot, effects: [] });
  return beginTransaction(snapshot, {
    mode: 'recovery',
    sourceSceneId: snapshot.stableCommit.sceneId,
    candidateSceneId: snapshot.stableCommit.sceneId,
    segmentId: null,
    direction: null,
    request,
    commitIntent: 'reproject',
    physicalEpoch: snapshot.input.claimedEpoch,
    activation: 'spent'
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
        retryable: true
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
  invalidatedAttempt?: PhoneAttemptKey<PhoneSceneId, PhoneSegmentId>,
  urlWasReplaced = false
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
      commitIntent: 'semantic', canonicalizeUrlOnCommit: urlWasReplaced
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
    commitIntent: 'semantic', canonicalizeUrlOnCommit: urlWasReplaced
  }, invalidatedAttempt ? [{ type: 'invalidate-attempt', attempt: invalidatedAttempt }] : []);
}

function handleEntry(
  snapshot: PhoneMachineSnapshot,
  request: PhoneEntryRequest,
  urlWasReplaced = false
): PhoneMachineResult {
  const target = phoneEntryForLocation(request.pathname, request.hash).sceneId;
  if (snapshot.status === 'transaction') {
    if (snapshot.transaction.mode === 'rollback') {
      return reviseTransaction(snapshot, { pendingEntry: request });
    }
    return startWarmEntry(snapshot, request, target, snapshot.transaction.attempt,
      urlWasReplaced);
  }
  return startWarmEntry(snapshot, request, target, undefined, urlWasReplaced);
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
      deadlinePolicy: transaction.deadlinePolicy,
      physicalEpoch: transaction.claimedPhysicalEpoch,
      activation: 'spent',
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
  const deadline = snapshot.transaction.deadline;
  if (!event.attempt || !sameAttempt(snapshot.transaction.attempt, event.attempt)
    || !deadline || deadline.suspended || deadline.operation !== event.operation) {
    return freezeOwned({ snapshot, effects: [] });
  }
  if (event.operation === 'dwell') {
    return handleBoundaryAdvance(snapshot, event.attempt, 'dwelling', null);
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
    activation: 'offered',
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
  progress = snapshot.transaction.progress,
  dwellMs?: number
): PhoneMachineResult {
  const deadline = dwellMs === undefined ? null : {
    operation: 'dwell' as const, remainingMs: dwellMs, startedAtActiveMs: 0, suspended: false
  };
  return reviseTransaction(snapshot, { phase, stageIndex, progress, deadline }, {}, deadline ? [{
    type: 'schedule-deadline', attempt: snapshot.transaction.attempt,
    operation: 'dwell', timeoutMs: deadline.remainingMs
  }] : []);
}

function handleProgress(
  snapshot: PhoneMachineTransactionSnapshot,
  attempt: PhoneAttemptKey,
  progress: number
): PhoneMachineResult {
  const current = snapshot.transaction;
  const next = Math.max(0, Math.min(1, progress));
  const advances = current.attempt.direction === 'reverse'
    ? next < current.progress : next > current.progress;
  if (!Number.isFinite(progress) || !matchingActiveAttempt(snapshot, attempt) || current.phase !== 'playing'
    || !advances) {
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
    const boundaryIndex = transaction.attempt.direction === 'reverse'
      ? policy.stops.length - 1 - transaction.stageIndex : transaction.stageIndex;
    const advance = policy.advance[boundaryIndex] ?? { kind: 'immediate' as const };
    const progress = policy.stops[boundaryIndex] ?? transaction.progress;
    if (advance.kind === 'delay') {
      return updateSegmentPhase(snapshot, 'dwelling', transaction.stageIndex, progress, advance.ms);
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
  return reviseTransaction(snapshot, {
    phase: 'playing', stageIndex: transaction.stageIndex + 1,
    progress: transaction.progress, deadline: null,
    ...(physicalEpoch === null ? {} : { claimedPhysicalEpoch: physicalEpoch })
  }, physicalEpoch === null ? {} : {
    input: { ...snapshot.input, claimedEpoch: physicalEpoch }
  });
}

function awaitMediaActivation(
  snapshot: PhoneMachineTransactionSnapshot
): PhoneMachineResult {
  if (snapshot.transaction.mode === 'segment') {
    return failTransaction(snapshot, {
      code: 'media-activation-rejected',
      message: 'Continuous story media activation was rejected',
      recoverable: true
    });
  }
  return reviseTransaction(snapshot, {
    phase: 'awaiting-media-activation', deadline: null, activation: 'awaiting', retainedTopology: true
  }, { input: emptyInput() }, [{
      type: 'show-activation-cta', attempt: snapshot.transaction.attempt, enabled: true
  }], false);
}

function handleActivationRequest(
  snapshot: PhoneMachineTransactionSnapshot,
  epoch: number
): PhoneMachineResult {
  const current = snapshot.transaction;
  if (current.phase !== 'awaiting-media-activation'
    || (current.claimedPhysicalEpoch !== null && epoch <= current.claimedPhysicalEpoch)) {
    return freezeOwned({ snapshot, effects: [] });
  }
  const renewed = beginTransaction(snapshot, {
    mode: current.mode, sourceSceneId: current.sourceSceneId,
    candidateSceneId: current.candidateSceneId,
    segmentId: current.attempt.segmentId, direction: current.attempt.direction,
    request: current.requestedEntry, commitIntent: current.commitIntent,
    pendingEntry: current.pendingEntry, restoreUrlOnRollback: current.restoreUrlOnRollback,
    deadlinePolicy: current.deadlinePolicy,
    physicalEpoch: epoch, activation: 'offered', reducedMotion: current.reducedMotion,
    fallbackFromSceneId: current.fallbackFromSceneId, failure: current.failure
  });
  return renewed.snapshot.status === 'transaction'
    ? reviseTransaction(renewed.snapshot, { retainedTopology: true }, {}, renewed.effects, false)
    : renewed;
}

function handleActivationSettled(
  snapshot: PhoneMachineTransactionSnapshot,
  event: Extract<PhoneStoryEvent, { type: 'activation-settled' }>
): PhoneMachineResult {
  if (!sameAttempt(snapshot.transaction.attempt, event.attempt)) {
    return freezeOwned({ snapshot, effects: [] });
  }
  if (!event.invoked) {
    if (snapshot.transaction.mode === 'segment') {
      return failTransaction(snapshot, {
        code: 'media-activation-rejected',
        message: 'Continuous story media activation was rejected',
        recoverable: true
      });
    }
    return awaitMediaActivation(snapshot);
  }
  const prepared = quorumComplete(snapshot.transaction, snapshot.transaction.requiredPrepared);
  const settled = reviseTransaction(snapshot, {
    phase: 'preparing', activation: 'spent', retainedTopology: true
  }, {}, [{ type: 'show-activation-cta', attempt: event.attempt, enabled: false }]);
  if (!prepared) return settled;
  return beginFinalProof(settled.snapshot);
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
  let accepted = acceptedEvidence(snapshot, freezeOwned({ slot, token }));
  const sourceFinal = accepted.transaction.requiredFinal[0]?.leg === 'source';
  if (sourceFinal && accepted.transaction.phase === 'preparing'
    && quorumComplete(accepted.transaction, accepted.transaction.requiredFinal))
    accepted = reviseTransaction(accepted, { requiredFinal: [] }, {}, [], false).snapshot;
  if (accepted.transaction.activation === 'awaiting') {
    return awaitMediaActivation(accepted);
  }
  if (
    accepted.transaction.requiredFinal.length === 0
    && quorumComplete(accepted.transaction, accepted.transaction.requiredPrepared)
  ) {
    if (accepted.transaction.activation === 'offered') {
      return advanceEvidenceDeadline(accepted);
    }
    return beginFinalProof(accepted);
  }
  if (
    accepted.transaction.requiredFinal.length > 0
    && quorumComplete(accepted.transaction, accepted.transaction.requiredFinal)
  ) {
    if (sourceFinal) {
      return accepted.transaction.phase === 'presenting-source'
        ? accepted.transaction.reducedMotion
          ? beginTargetPresentation(accepted) : beginPlayback(accepted)
        : freezeOwned({ snapshot: accepted, effects: [] });
    }
    return accepted.transaction.commitIntent === 'semantic'
      ? commitStableCandidate(accepted)
      : finishReproject(accepted);
  }
  if (sourceFinal && accepted.transaction.requiredFinal.length > 0)
    return freezeOwned({ snapshot: accepted, effects: [] });
  const pending = advanceEvidenceDeadline(accepted);
  if (pending.snapshot.transaction.mode === 'segment'
    && (pending.snapshot.transaction.phase === 'presenting-target'
      || pending.snapshot.transaction.phase === 'aligning')) {
    const visibleKinds: readonly PhoneEvidenceKind[] = [
      'plane-acknowledged', 'content-visible', 'frame-visible', 'coverage-visible'
    ];
    const visible = visibleKinds.every((requiredKind) => (
      pending.snapshot.transaction.evidence.some(({ slot: evidence }) => (
        evidence.kind === requiredKind
          && evidence.planeRevision === pending.snapshot.transaction.planeRevision
      ))
    ));
    const landed = pending.snapshot.transaction.evidence.some(({ slot: evidence }) => (
      evidence.kind === 'landing-confirmed'
        && evidence.planeRevision === pending.snapshot.transaction.planeRevision
    ));
    if (visible || landed) {
      return reviseTransaction(
        pending.snapshot, { phase: landed ? 'verifying' : 'aligning' }, {}, pending.effects, false
      );
    }
  }
  return pending;
}

function handleRetry(snapshot: PhoneMachineSnapshot): PhoneMachineResult {
  if (snapshot.status !== 'faulted') return freezeOwned({ snapshot, effects: [] });
  if (snapshot.stableCommit) return reprojectCommittedPlane(snapshot);
  return beginTransaction(snapshot, {
    mode: 'boot', sourceSceneId: null, candidateSceneId: 'hero',
    segmentId: null, direction: null,
    request: { pathname: snapshot.originalEntry.pathname, hash: '#home', origin: 'programmatic' },
    commitIntent: 'semantic', fallbackFromSceneId: null
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

function reprojectActivePlane(
  snapshot: PhoneMachineTransactionSnapshot,
  viewport: PhoneViewportSnapshot
): PhoneMachineResult {
  const transaction = snapshot.transaction;
  const sourceCoverage = snapshot.stableCommit !== null && transaction.mode !== 'rollback'
    && transaction.phase !== 'presenting-source' && transaction.requiredFinal[0]?.leg !== 'target';
  if (transaction.planeRevision === null && !sourceCoverage) return reviseTransaction(snapshot, {}, { viewport: viewport });
  const planeRevision = snapshot.lastPlaneRevision + 1;
  const requiredFinal = sourceCoverage
    ? [evidenceSlot(transaction.attempt, transaction.stageIndex,
        'source', 'coverage-visible', planeRevision)]
    : transaction.requiredFinal.map((slot) => evidenceSlot(
        transaction.attempt, transaction.stageIndex, slot.leg, slot.kind, planeRevision
      ));
  const rollback = transaction.mode === 'rollback';
  const timeoutMs = transaction.deadlinePolicy.planeApply;
  const deadline = !rollback && !sourceCoverage ? {
    operation: 'planeApply' as const, remainingMs: timeoutMs,
    startedAtActiveMs: 0, suspended: false
  } : transaction.deadline;
  const phase = !sourceCoverage && ['aligning', 'verifying'].includes(transaction.phase)
    ? 'presenting-target' as const : transaction.phase;
  return reviseTransaction(snapshot, {
    phase, planeRevision, requiredFinal, deadline,
    evidence: transaction.evidence.filter(({ slot }) => slot.planeRevision === null)
  }, { viewport, lastPlaneRevision: planeRevision }, [{
    type: 'apply-presentation-plane', attempt: transaction.attempt, planeRevision
  }, ...(!rollback && !sourceCoverage ? [{
    type: 'schedule-deadline' as const, attempt: transaction.attempt,
    operation: 'planeApply', timeoutMs
  }] : [])]);
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
  if (base.status === 'transaction' && base.transaction.mode === 'rollback') {
    const rollback = base.transaction;
    return beginTransaction(base, {
      mode: 'rollback', sourceSceneId: base.stableCommit?.sceneId ?? rollback.sourceSceneId,
      candidateSceneId: base.stableCommit?.sceneId ?? rollback.candidateSceneId,
      segmentId: rollback.attempt.segmentId, direction: rollback.attempt.direction,
      request: rollback.requestedEntry, commitIntent: 'rollback',
      pendingEntry: rollback.pendingEntry, restoreUrlOnRollback: rollback.restoreUrlOnRollback,
      deadlinePolicy: rollback.deadlinePolicy,
      physicalEpoch: rollback.claimedPhysicalEpoch, activation: 'spent',
      reducedMotion: rollback.reducedMotion, failure: rollback.failure
    }, prefix);
  }
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
  if (snapshot.status === 'faulted') return freezeOwned({
    snapshot: { ...snapshot, stateRevision: snapshot.stateRevision + 1,
      viewport: event.viewport, input: emptyInput() },
    effects: []
  });
  if (event.change === 'unsupported' || !event.viewport.supported) {
    const attempt = snapshot.status === 'transaction' ? snapshot.transaction.attempt : null;
    const effects: readonly PhoneStoryEffect[] = attempt
      ? [{ type: 'invalidate-attempt', attempt }, {
          type: 'pause-closure', attempt, reason: 'superseded' }]
      : [];
    if (snapshot.status === 'transaction' && snapshot.transaction.mode === 'rollback') {
      const deadline = snapshot.transaction.deadline;
      return reviseTransaction(snapshot, { evidence: [],
        deadline: deadline ? { ...deadline, suspended: true } : null },
      { viewport: event.viewport, visibility: 'foreground', input: emptyInput() }, effects);
    }
    if (snapshot.stableCommit && snapshot.presentationProof) {
      return freezeOwned({
        snapshot: {
          ...snapshot, status: 'stable', stateRevision: snapshot.stateRevision + 1,
          transaction: null, viewport: event.viewport, visibility: 'foreground',
          scroll: snapshot.scroll ?? { x: 0, y: 0, sampledAt: 0, origin: 'runtime' },
          input: emptyInput(), stableCommit: snapshot.stableCommit,
          presentationProof: snapshot.presentationProof
        },
        effects
      });
    }
    return freezeOwned({
      snapshot: { ...snapshot, stateRevision: snapshot.stateRevision + 1,
        viewport: event.viewport, visibility: 'foreground', input: emptyInput() },
      effects
    });
  }
  if (event.change === 'toolbar' && snapshot.status === 'stable' && snapshot.stableCommit) {
    // Toolbar shifts only change visual geometry; refresh CSS variables in place.
    const next = { ...snapshot, stateRevision: snapshot.stateRevision + 1, viewport: event.viewport };
    return freezeOwned({ snapshot: next, effects: [{ type: 'refresh-stable-viewport' }] });
  }
  if (event.change === 'toolbar' && snapshot.status === 'transaction') return reprojectActivePlane(snapshot, event.viewport);
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
  return reviseTransaction(snapshot, {
    evidence: [], deadline: deadline ? { ...deadline, suspended: true } : null
  }, { visibility, input: emptyInput() }, effects);
}

function handlePageShown(
  snapshot: PhoneMachineSnapshot,
  persisted: boolean,
  viewport = snapshot.viewport
): PhoneMachineResult {
  if (!persisted && snapshot.visibility === 'foreground') {
    return freezeOwned({ snapshot, effects: [] });
  }
  if (snapshot.status === 'faulted') return freezeOwned({ snapshot: {
    ...snapshot, stateRevision: snapshot.stateRevision + 1,
    viewport, visibility: 'foreground', input: emptyInput() }, effects: [] });
  if (!viewport.supported) {
    return handleViewport(snapshot, { type: 'viewport-sampled', viewport, change: 'unsupported' });
  }
  return recoverForViewport(snapshot, viewport,
    snapshot.status === 'transaction' ? snapshot.transaction.attempt : null);
}

export function reducePhoneStory(
  snapshot: PhoneMachineSnapshot,
  event: PhoneStoryEvent
): PhoneMachineResult {
  switch (event.type) {
    case 'entry-requested': return handleEntry(snapshot, event.request, event.urlWasReplaced);
    case 'retry-requested': return handleRetry(snapshot);
    case 'segment-requested': return handleSegment(
      snapshot, event.direction, event.physicalEpoch, event.reducedMotion ?? false
    );
    case 'evidence-reported': return snapshot.status === 'transaction'
      ? handleEvidence(snapshot, event.slot, event.report.kind, event.report.token)
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
    case 'leg-intent': return snapshot.status === 'transaction'
      ? handleBoundaryAdvance(snapshot, event.attempt, 'awaiting-leg-intent', event.physicalEpoch)
      : freezeOwned({ snapshot, effects: [] });
    case 'scroll-sampled': return handleScroll(snapshot, event.sample);
    case 'viewport-sampled': return handleViewport(snapshot, event);
    case 'page-hidden': return handlePageHidden(snapshot, event.persisted);
    case 'page-shown': return handlePageShown(snapshot, event.persisted, event.viewport);
    case 'activation-requested': return snapshot.status === 'transaction'
      ? handleActivationRequest(snapshot, event.epoch)
      : freezeOwned({ snapshot, effects: [] });
    case 'activation-settled': return snapshot.status === 'transaction'
      ? handleActivationSettled(snapshot, event)
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

export function selectPhoneEdgeSurface(snapshot: PhoneMachineSnapshot): `#${string}` | null {
  const scene = snapshot.stableCommit?.sceneId ?? null;
  return scene ? phoneSceneById(scene).edgeSurface : null;
}

export function selectPhoneCheckpoint(snapshot: PhoneMachineSnapshot): string | null {
  const scene = snapshot.stableCommit?.sceneId ?? null;
  return scene ? phoneSceneById(scene).checkpoint : null;
}

export function selectPhoneNavigationScene(snapshot: PhoneMachineSnapshot): PhoneSceneId | null {
  const scene = snapshot.stableCommit?.sceneId ?? null;
  return scene ? phoneSceneById(scene).navigationId : null;
}
