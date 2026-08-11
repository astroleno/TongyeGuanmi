import { createPhoneStoryBoot, phoneTransactionActivationSurfaceIds,
  reducePhoneStory, sameAttempt,
  type PhoneMachineResult, type PhoneMachineSnapshot } from './machine';
import { phoneManifest, phoneSceneById, phoneSceneStableHold,
  phoneSegmentChoreographyFrame, type PhoneSceneId, type PhoneSegmentChoreographyFrame } from './manifest';
import type { PhoneLeafMountRegistration, PhoneLeafReportBinding, PhoneLeafReportPort,
  PhoneLeafMountLease, PhonePlaneApplyResult, PhonePresentation } from './presentation';
import { assertPhoneLeafReportBindingContract, bindPhoneLeafGeneration,
  claimPhoneActivationDecoders, clearPhoneOwnershipRegistries, closePhoneLeafReportBinding,
  createPhonePlaneRequest, createPhoneRetainedLeafBinding, createPhoneSupersedingLeafBinding,
  invokePhoneActivationBatch,
  phoneActivationSurfaceIds, phoneIdentitySignature, phoneLeafMountKey, phonePlaneResultIsExact,
  phoneRetainedMountLeg, runPhoneLeafRetirement,
  runPhoneCleanupSteps, settlePhoneActivationBatch } from './presentation';
import type { PhoneAttemptKey, PhoneDependencyRef, PhoneEntryRequest, PhoneFailure,
  PhoneLeafDisposeReason, PhoneStoryEffect, PhoneRejectedChunkFailure,
  PhoneRuntimeLifecycleStep, PhoneRuntimeResourceCounts, PhoneRuntimeHostEvent,
  PhoneRuntimeInputEvent, PhoneStableRecoveryProof, PhoneSurfaceId,
  PhoneStoryEvent, PhoneStorySnapshot, PhoneViewportSnapshot
} from './protocol';
export type { PhoneRejectedChunkFailure, PhoneRuntimeLifecycleStep, PhoneRuntimeHostEvent, PhoneRuntimeInputEvent, PhoneRuntimeResourceCounts, PhoneStableRecoveryProof } from './protocol';

export type PhoneRuntimeTimerHandle = string | number | Readonly<{ id: string }>;
export type PhoneChunkRecoveryPort = Readonly<{ reportRejectedChunk(failure: PhoneRejectedChunkFailure): Promise<'reloading' | 'fail-closed'>; markStable(proof: PhoneStableRecoveryProof): void; manualReload?(): void }>;

export type PhoneRuntimeEffectPorts = Readonly<{
  loadDependencies?(
    effect: Extract<PhoneStoryEffect, { type: 'load-dependencies' }>,
    signal: AbortSignal
  ): Promise<PhoneDependencyLoadResult>;
  prewarmDependencies?(
    effect: Extract<PhoneStoryEffect, { type: 'load-dependencies' }>,
    signal: AbortSignal
  ): Promise<PhoneDependencyLoadResult>;
  releaseDependencies?(dependencies: readonly PhoneDependencyRef[]): void;
}>;

export type PhoneDependencyLoadResult = Readonly<{ status: 'loaded' }> | Readonly<{ status: 'rejected'; dependency: PhoneDependencyRef; moduleUrl: string; reason: string }>;

export type PhoneStoryRuntimeEnvironment = Readonly<{
  nextAuthorityId(): string; readViewport(): PhoneViewportSnapshot; activeNow(): number;
  readReducedMotion(): boolean; subscribeHost(listener: (event: PhoneRuntimeHostEvent) => void): () => void;
  scheduleTimer(callback: () => void, delayMs: number): PhoneRuntimeTimerHandle;
  cancelTimer(handle: PhoneRuntimeTimerHandle): void; cancelFrame(handle: PhoneRuntimeTimerHandle): void;
  requestFrame(callback: () => void): PhoneRuntimeTimerHandle;
  writeUrl(mode: 'push' | 'replace', pathname: string, hash: string): void;
  observePublish?(snapshot: PhoneStorySnapshot): void; performEffect?(effect: PhoneStoryEffect, enqueue: (event: PhoneStoryEvent) => void): void;
  observeLifecycle?(step: PhoneRuntimeLifecycleStep): void; observeResources?(counts: PhoneRuntimeResourceCounts): void;
}>;

export type PhoneStoryRuntimeConfig = Readonly<{ initialEntry: PhoneEntryRequest; environment: PhoneStoryRuntimeEnvironment; presentation: PhonePresentation; ports?: PhoneRuntimeEffectPorts; chunkRecovery?: PhoneChunkRecoveryPort }>;
export type PhonePresentationPreparedReport = Readonly<{ surfaceId: string; attempt: PhoneAttemptKey; generation: number; token: string }>;
export type PhonePresentationFailureReport = Readonly<{ surfaceId: string; attempt: PhoneAttemptKey; generation: number; failure: PhoneFailure }>;

export type PhoneStoryRuntime = Readonly<{
  getSnapshot(): PhoneMachineSnapshot;
  subscribe(listener: () => void): () => void;
  connect(): () => void;
  requestEntry(entry: PhoneEntryRequest): void;
  retry(): void;
  reportPresentationPrepared(report: PhonePresentationPreparedReport): void; reportPresentationFailure(report: PhonePresentationFailureReport): void;
  startVisibleEntrance(): void;
  createLeafReportPort(binding: PhoneLeafReportBinding): PhoneLeafReportPort;
  createPrewarmLeafReportPort(sceneId: PhoneSceneId): PhoneLeafReportPort; promotePrewarmLeaf(binding: PhoneLeafReportBinding): boolean;
}>;

export type PhoneReadingScrollOwner = Readonly<{
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}>;

export function phoneReadingEdges(owner: PhoneReadingScrollOwner): Readonly<{
  top: boolean;
  bottom: boolean;
}> {
  const maximum = Math.max(0, owner.scrollHeight - owner.clientHeight);
  return { top: owner.scrollTop <= 1, bottom: owner.scrollTop >= maximum - 1 };
}

type QueuedEvent = Readonly<{ sequence: number; event: PhoneStoryEvent }>;
type DeadlineLease = Readonly<{ key: string; handle: PhoneRuntimeTimerHandle; connection: number }>;
type ReportState = { valid: boolean; binding: PhoneLeafReportBinding; p?: true | 'ready' };
type LeafLease = { key: string; reports: ReportState; mount: PhoneLeafMountLease; activeDecoders: number; disposed: boolean; frameToken: string | null };
type PendingLoad = { controller: AbortController; waiters: Array<Readonly<{ effect: Extract<PhoneStoryEffect, { type: 'load-dependencies' }>; connection: number }>> };
type PlaybackLease = Readonly<{ handle: PhoneRuntimeTimerHandle; attempt: PhoneAttemptKey; stageIndex: number; startedAt: number; durationMs: number; from: number; to: number; connection: number }>;
type ActivationLease = Readonly<{ invocationId: string; attempt: PhoneAttemptKey; surfaceIds: readonly string[]; leaves: readonly LeafLease[]; connection: number }>;

function mediaRunToken(attempt: PhoneAttemptKey, direction: 'forward' | 'reverse'): string { return [attempt.authorityId, attempt.transactionId, attempt.transactionGeneration, attempt.segmentId ?? 'entry', direction].join(':'); }

function attemptIdentity(attempt: PhoneAttemptKey): string { return [attempt.authorityId, attempt.transactionId, attempt.transactionGeneration, attempt.mode, attempt.segmentId ?? '', attempt.direction ?? ''].join('|'); }

const deadlineKey = (
  attempt: PhoneAttemptKey,
  operation: string
) => `${attemptIdentity(attempt)}|${operation}`;

function inputDirection(event: PhoneRuntimeInputEvent): 'forward' | 'reverse' | null { if (event.kind === 'keyboard') { if (['ArrowDown', 'PageDown', ' ', 'Enter'].includes(event.key ?? '')) return 'forward'; if (['ArrowUp', 'PageUp'].includes(event.key ?? '')) return 'reverse'; return null; } const delta = event.delta ?? 0; return delta > 0 ? 'forward' : delta < 0 ? 'reverse' : null; }

function invokePhoneProjector(
  project: () => PhonePlaneApplyResult
): PhonePlaneApplyResult {
  try {
    return project();
  } catch (error) {
    return {
      records: [],
      failure: {
        code: 'presentation-projector-threw',
        message: error instanceof Error ? error.message : String(error),
        recoverable: true
      }
    };
  }
}

export function phoneEventPriority(event: PhoneStoryEvent): number {
  switch (event.type) {
    case 'disconnect-requested': return 0;
    case 'page-hidden': return 1;
    case 'viewport-sampled': return event.change === 'toolbar' ? 4 : 1;
    case 'failure-reported': return event.slot.attempt.mode === 'rollback' ? 1 : 5;
    case 'deadline-fired': return event.attempt?.mode === 'rollback' ? 1 : 5;
    case 'evidence-reported': return event.slot.attempt.mode === 'rollback' ? 2 : 5;
    case 'terminal-fault': return 2;
    case 'entry-requested': return 3;
    case 'page-shown': return 4;
    case 'segment-requested':
    case 'leg-intent':
    case 'activation-requested':
    case 'scroll-sampled': return 6;
    default: return 5;
  }
}

function adjacentPrewarmDependencies(sceneId: string): readonly PhoneDependencyRef[] {
  return [...new Set(phoneManifest.segments.flatMap((segment) => (
    segment.source === sceneId
      ? segment.forward.closure.prewarm
      : segment.target === sceneId
        ? segment.reverse.closure.prewarm
        : []
  )))];
}

function progressForLeg(
  frame: PhoneSegmentChoreographyFrame,
  leg: PhoneLeafReportBinding['leg']
): number {
  if (leg === 'effect') return frame.effectProgress;
  return leg === 'source' ? frame.sourceProgress : frame.targetProgress;
}

function commandProgress(
  transaction: Extract<PhoneMachineSnapshot, { status: 'transaction' }>['transaction'],
  leg: PhoneLeafReportBinding['leg']
): number {
  const { segmentId, direction } = transaction.attempt;
  if (!segmentId || !direction) return transaction.progress;
  return progressForLeg(
    phoneSegmentChoreographyFrame(segmentId, transaction.progress, direction,
      transaction.stageIndex),
    leg
  );
}

export const segmentEndpoint = (transaction: Extract<PhoneMachineSnapshot, { status: 'transaction' }>['transaction'], leg: PhoneLeafReportBinding['leg']): 0 | 1 | null => { const { segmentId, direction } = transaction.attempt; if (transaction.mode !== 'segment' || leg === 'effect' || !segmentId || !direction) return null; return progressForLeg(phoneSegmentChoreographyFrame(segmentId, transaction.progress, direction, transaction.stageIndex), leg) >= .5 ? 1 : 0; };

export function createPhoneStoryRuntime(config: PhoneStoryRuntimeConfig): PhoneStoryRuntime {
  const { environment, presentation } = config, ports = config.ports ?? {};
  const sampleViewport = (identity: PhoneViewportSnapshot): PhoneViewportSnapshot => ({
    ...identity, layout: presentation.sampleLayoutViewport(),
    visual: presentation.sampleVisualViewport()
  });
  const chunkRecovery = Object.freeze(config.chunkRecovery ?? {
    reportRejectedChunk: async () => 'fail-closed' as const, markStable: () => undefined });
  const inert = createPhoneStoryBoot({
    authorityId: 'disconnected-phone-authority', request: config.initialEntry,
    viewport: sampleViewport(environment.readViewport()), reducedMotion: environment.readReducedMotion()
  });
  let snapshot = inert.snapshot;
  let connected = false, connection = 0, draining = false;
  let sequence = 0, physicalEpoch = 0, activationSequence = 0, frameSequence = 0;
  let queue: QueuedEvent[] = [];
  let removeHostListener: (() => void) | null = null, sampleFrame: PhoneRuntimeTimerHandle | null = null;
  let playback: PlaybackLease | null = null, planeFrame: PhoneRuntimeTimerHandle | null = null;
  let prewarmController: AbortController | null = null;
  let visibleEntranceCommitSequence: number | null = null;
  let pendingViewport: Extract<PhoneRuntimeHostEvent, { type: 'viewport' }> | null = null;
  let pendingScroll: Extract<PhoneRuntimeHostEvent, { type: 'scroll' }> | null = null;
  let stableDependencyAttempt: PhoneAttemptKey | null = null;
  type DeferredActivation = Readonly<{ attempt: PhoneAttemptKey; surfaceIds: readonly PhoneSurfaceId[];
    credit: Extract<PhoneStoryEffect, { type: 'activate-surfaces' }>['credit'] }>;
  type FailClosedLineage = { connection: number; failureAttempt: PhoneAttemptKey; settleAttempt: PhoneAttemptKey | null; stableCommit: PhoneMachineSnapshot['stableCommit']; armed: boolean };
  let deferredActivation: DeferredActivation | null = null;
  const listeners = new Set<() => void>();
  const deadlines = new Map<string, DeadlineLease>();
  const leaves = new Map<string, LeafLease>();
  const reportStates = new Set<ReportState>();
  const dependencyLeases = new Map<string, readonly PhoneDependencyRef[]>();
  const fulfilledLoads = new Set<string>();
  const rejectedLoads = new Set<string>();
  const pendingLoads = new Map<string, PendingLoad>();
  const activations = new Map<string, ActivationLease>();
  const activationClaims = new WeakMap<LeafLease, string>();
  const rejectedClosures = new Set<string>();
  let resources: PhoneRuntimeResourceCounts = {
    videos: 0, activeDecoders: 0, canvases: 0, webglContexts: 0 };

  const publish = (): void => {
    environment.observePublish?.(snapshot);
    for (const listener of [...listeners]) listener();
  };
  const publishPrewarm = (): void => { snapshot = { ...snapshot }; publish(); };

  const cancelDeadline = (key: string): void => {
    const lease = deadlines.get(key);
    if (!lease) return;
    environment.cancelTimer(lease.handle);
    deadlines.delete(key);
  };

  const cancelDeadlines = (predicate: (lease: DeadlineLease) => boolean): void => {
    runPhoneCleanupSteps('Phone deadline cancellation failed', [...deadlines.values()]
      .filter(predicate).map((lease) => () => cancelDeadline(lease.key)));
  };

  const syncDeadlines = (): void => {
    const active = snapshot.status === 'transaction' && snapshot.transaction.deadline
      && !snapshot.transaction.deadline.suspended
      ? deadlineKey(snapshot.transaction.attempt, snapshot.transaction.deadline.operation) : null;
    cancelDeadlines((lease) => lease.key !== active);
  };

  const notifyResources = (): void => {
    resources = Object.freeze({ ...resources });
    environment.observeResources?.(resources);
  };

  const ownsConnection = (expected: number): boolean => (
    connected && expected === connection
  );

  const cancelPlayback = (): void => {
    if (playback) environment.cancelFrame(playback.handle);
    playback = null;
  };

  const syncPlayback = (activeConnection: number): void => {
    if (!ownsConnection(activeConnection)) return cancelPlayback();
    const active = snapshot.status === 'transaction' ? snapshot.transaction : null;
    if (!active || active.phase !== 'playing' || active.reducedMotion
      || snapshot.visibility !== 'foreground') return cancelPlayback();
    if (playback && sameAttempt(playback.attempt, active.attempt)
      && playback.stageIndex === active.stageIndex) return;
    cancelPlayback();
    const segment = phoneManifest.segments.find(({ id }) => id === active.attempt.segmentId);
    if (!segment) return;
    const policy = segment.timing.policy;
    const reverse = active.attempt.direction === 'reverse';
    const playIndex = policy.kind === 'stagedSnap' && reverse
      ? policy.playMs.length - 1 - active.stageIndex : active.stageIndex;
    const durationMs = Math.max(1, policy.kind === 'stagedSnap'
      ? policy.playMs[playIndex] ?? 1 : segment.timing.virtualDuration);
    const from = active.progress;
    const boundaryIndex = policy.kind === 'stagedSnap' && reverse
      ? policy.stops.length - 1 - active.stageIndex : active.stageIndex;
    const to = policy.kind === 'stagedSnap' && active.stageIndex < policy.playMs.length - 1
      ? policy.stops[boundaryIndex] ?? from : reverse ? 0 : 1;
    const startedAt = environment.activeNow();
    const tick = (): void => {
      if (!ownsConnection(activeConnection)) return cancelPlayback();
      const handle = environment.requestFrame(() => {
        const lease = playback;
        if (!ownsConnection(activeConnection) || !lease || lease.handle !== handle
          || lease.connection !== activeConnection) return;
        const ratio = Math.min(1, Math.max(0,
          (environment.activeNow() - lease.startedAt) / lease.durationMs));
        enqueueFor({ type: 'transition-progressed', attempt: lease.attempt,
          progress: lease.from + (lease.to - lease.from) * ratio }, activeConnection);
        if (ratio < 1 && ownsConnection(activeConnection) && playback?.handle === handle) tick();
        else if (playback?.handle === handle) {
          playback = null;
          enqueueFor({ type: 'transition-completed', attempt: lease.attempt }, activeConnection);
        }
      });
      playback = { handle, attempt: active.attempt, stageIndex: active.stageIndex,
        startedAt, durationMs, from, to, connection: activeConnection };
    };
    tick();
  };

  const assertResourceBudget = (next: PhoneRuntimeResourceCounts): void => {
    if (snapshot.status !== 'transaction') return;
    const budget = snapshot.transaction.closure.resourceBudget;
    for (const field of ['videos', 'activeDecoders', 'canvases', 'webglContexts'] as const) {
      if (next[field] > budget[field]) {
        throw new Error(`budget ${field}: ${next[field]} > ${budget[field]}`);
      }
    }
  };

  const updateResources = (delta: PhoneRuntimeResourceCounts, direction: 1 | -1): void => {
    const next = {
      videos: resources.videos + direction * delta.videos,
      activeDecoders: resources.activeDecoders + direction * delta.activeDecoders,
      canvases: resources.canvases + direction * delta.canvases,
      webglContexts: resources.webglContexts + direction * delta.webglContexts
    };
    if (direction > 0) assertResourceBudget(next);
    resources = next;
    notifyResources();
  };

  const mountedLease = (state: ReportState): LeafLease | null => (
    [...leaves.values()].find((lease) => (
      !lease.disposed && lease.reports === state
    )) ?? null
  );

  const closeReports = (state: ReportState, observe = true): void => {
    if (!state.valid) return;
    state.valid = false;
    reportStates.delete(state);
    if (observe) environment.observeLifecycle?.('invalidate');
  };

  const acceptPreparedProof = (
    state: ReportState,
    lease: LeafLease,
    fact: Parameters<PhonePresentation['verifyPrepared']>[0]['fact']
  ): void => {
    const proof = presentation.verifyPrepared({ binding: state.binding,
      lease: lease.mount, fact });
    for (const record of proof.records) enqueueFor({
      type: 'evidence-reported', slot: record.slot,
      report: { kind: record.slot.kind, token: record.token, accepted: true }
    }, connection);
  };

  const bindLeafGeneration = (
    lease: LeafLease, state: ReportState, rebindMount: boolean
  ): void => {
    lease.reports = state;
    lease.frameToken = bindPhoneLeafGeneration(
      lease.mount, state.binding, createReportPort(state), ++frameSequence, rebindMount,
      (token) => { lease.frameToken = token; }
    );
    acceptPreparedProof(state, lease, null);
  };

  const reviveLateReportState = (stale: ReportState): ReportState | null => {
    const binding = connected && snapshot.status === 'transaction'
      ? createPhoneSupersedingLeafBinding(snapshot.transaction, stale.binding) : null;
    if (!binding) return null;
    closeReports(stale);
    if (leaves.get(phoneLeafMountKey(binding))?.mount.isAttached()) return null;
    const revived: ReportState = { valid: true, binding };
    reportStates.add(revived); return revived;
  };

  const promoteLease = (lease: LeafLease, binding: PhoneLeafReportBinding): void => { const state = lease.reports; const previousKey = lease.key; closeReports(state, false); leaves.delete(previousKey); state.valid = true; state.binding = closePhoneLeafReportBinding(binding); delete state.p; reportStates.add(state); lease.key = phoneLeafMountKey(state.binding); if (leaves.has(lease.key)) throw new Error(`rebind collision: ${lease.key}`); leaves.set(lease.key, lease); bindLeafGeneration(lease, state, true); };

  const rebindReportState = (state: ReportState, binding: PhoneLeafReportBinding): ReportState => { const lease = mountedLease(state); closeReports(state); state.valid = true; state.binding = closePhoneLeafReportBinding(binding); reportStates.add(state); if (!lease) return state; leaves.delete(lease.key); lease.key = phoneLeafMountKey(state.binding); leaves.set(lease.key, lease); bindLeafGeneration(lease, state, true); return state; };

  function createReportPort(state: ReportState): PhoneLeafReportPort {
    return Object.freeze({
      rebind: (binding: PhoneLeafReportBinding) => { if (!connected || snapshot.status !== 'transaction') return; const closed = closePhoneLeafReportBinding(binding); if (!sameAttempt(closed.attempt, snapshot.transaction.attempt) || closed.stageIndex !== snapshot.transaction.stageIndex || closed.planeRevision !== snapshot.transaction.planeRevision) return; assertPhoneLeafReportBindingContract(closed, snapshot.transaction); state = rebindReportState(state, closed); },
      registerMount: (registration: PhoneLeafMountRegistration) => {
        state = reviveLateReportState(state) ?? state;
        if (!state.valid) return;
        const key = phoneLeafMountKey(state.binding);
        const existing = leaves.get(key);
        if (existing?.mount.isAttached()) throw new Error(`already registered: ${key}`);
        if (existing) {
          const replacesOwnState = existing.reports === state;
          const binding = state.binding;
          retireLease(existing, 'generation-replaced');
          if (replacesOwnState) { state = { valid: true, binding }; reportStates.add(state); }
        }
        const mount = presentation.registerLeafMount({ binding: state.binding, registration });
        const expected = phoneIdentitySignature(state.binding.allowedSurfaceIds);
        if (phoneIdentitySignature(mount.surfaceIds) !== expected
          || mount.resources.activeDecoders !== 0) {
          mount.release();
          throw new Error(`mismatch: ${key}`);
        }
        try { updateResources(mount.resources, 1); } catch (error) {
          mount.release();
          throw error;
        }
        const lease: LeafLease = {
          key, reports: state, mount, activeDecoders: 0, disposed: false, frameToken: null
        };
        leaves.set(key, lease);
        bindLeafGeneration(lease, state, false);
        const active = snapshot.status === 'transaction' ? snapshot.transaction : null; if (state.p && active) { const promoted = createPhoneSupersedingLeafBinding(active, state.binding); if (promoted) promoteLease(lease, promoted); } if (state.p) publishPrewarm(); if (state.p && mount.activationSurfaceIds.length > 0) mount.commands.activate({ invocationId: `prewarm:${state.binding.attempt.sceneId}`, surfaceIds: mount.activationSurfaceIds, credit: 'direct-muted-autoplay', runToken: `prewarm:${lease.frameToken ?? state.binding.attempt.transactionId}`, direction: 'forward', stageIndex: 0, prewarm: true });
        if (active) {
          lease.mount.commands.render(commandProgress(active, state.binding.leg));
        }
        if (active && deferredActivation
          && sameAttempt(deferredActivation.attempt, active.attempt)) {
          const { credit, surfaceIds } = deferredActivation;
          const candidates = rebindForActivation(active.attempt, surfaceIds);
          if (activationCoverageComplete(candidates, surfaceIds)) {
            deferredActivation = null;
            invokeActivation(candidates, active.attempt, credit, surfaceIds, connection);
          }
        }
        const reducedStaticFigure2 = active?.reducedMotion && active.candidateSceneId === 'figure2-animation'; if (active && !reducedStaticFigure2 && state.binding.leg === 'target' && mount.resources.videos > 0) {
          if (['boot', 'entry'].includes(active.mode)
            && phoneSceneById(active.candidateSceneId).directEntry.mediaActivation.directEntry
              === 'muted-plays-inline-then-covered-cta') {
            invokeActivation([lease], active.attempt, 'direct-muted-autoplay');
          } else if (active.phase === 'awaiting-media-activation') {
            environment.performEffect?.(
              { type: 'show-activation-cta', attempt: active.attempt, enabled: true },
              (event) => enqueueFor(event, connection)
            );
          }
        }
      },
      reportPrepared: (surfaceId, report) => {
        const lease = mountedLease(state);
        if (state.p) { if (!report.ready || report.kind !== 'video-decoded' || !lease || !lease.mount.surfaceIds.includes(surfaceId) || lease.mount.surfaceIds.some((id) => id.includes('canvas'))) return; state.p = 'ready'; publishPrewarm(); return; }
        if (!report.ready || !lease || !lease.mount.surfaceIds.includes(surfaceId)
          || !['image-decoded', 'video-decoded', 'canvas-drawn', 'static-ready']
            .includes(report.kind)) return;
        acceptPreparedProof(state, lease, { surfaceId, report });
      },
      reportFrame: (surfaceId, report) => {
        const lease = mountedLease(state);
        if (!report.presented || !lease || report.token !== lease.frameToken
          || !lease.mount.surfaceIds.includes(surfaceId)) return;
        if (state.p) { state.p = 'ready'; publishPrewarm(); return; }
        acceptPreparedProof(state, lease, { surfaceId, report });
      },
      reportProgress: () => undefined,
      reportComplete: () => undefined,
      reportFailure: (failure: PhoneFailure) => { if (state.p) return;
        if (!state.valid || !mountedLease(state) || snapshot.status !== 'transaction') return;
        if (failure.code === 'media-activation-rejected') return;
        const slot = [...snapshot.transaction.requiredPrepared,
          ...snapshot.transaction.requiredFinal].find((candidate) => (
          candidate.leg === state.binding.leg
        ));
        if (slot) enqueueFor({ type: 'failure-reported', slot, failure }, connection);
      }
    });
  }

  function invokeActivation(
    candidates: readonly LeafLease[],
    attempt: PhoneAttemptKey,
    credit: 'physical-epoch' | 'direct-muted-autoplay',
    requested?: readonly string[], activeConnection = connection
  ): void {
    const invocationId = `${attempt.transactionId}:activation:${++activationSequence}`;
    const active = snapshot.status === 'transaction' && sameAttempt(snapshot.transaction.attempt, attempt) ? snapshot.transaction : null;
    const direction = attempt.direction ?? 'forward'; const stageIndex = active?.stageIndex ?? 0; const runToken = mediaRunToken(attempt, direction);
    for (const owner of candidates) activationClaims.set(owner, attemptIdentity(attempt));
    if (candidates.length > 0 && candidates.every(({ reports }) => reports.p === 'ready')) { for (const owner of candidates) { delete owner.reports.p; owner.mount.commands.setMediaPhase?.({ phase: 'primed', runToken, direction, stageIndex }); } enqueueFor({ type: 'activation-settled', invoked: true, attempt }, activeConnection); return; }
    const targets = candidates.map((owner) => ({ owner, commands: owner.mount.commands, surfaceIds: phoneActivationSurfaceIds(owner.mount, requested) }));
    const batch = invokePhoneActivationBatch(
      invocationId,
      credit,
      requested,
      targets,
      (authorized) => {
        const additional = authorized.reduce((sum, { owner, surfaceIds }) => (
          sum + Math.max(0, surfaceIds.length - owner.activeDecoders)
        ), 0);
        if (additional > 0) assertResourceBudget({
          ...resources, activeDecoders: resources.activeDecoders + additional
        });
      }, runToken, direction, stageIndex
    );
    if (!ownsConnection(activeConnection)) return;
    const activation: ActivationLease | null = batch.invoked && batch.pending.length > 0
      ? { invocationId, attempt, surfaceIds: batch.surfaceIds,
          leaves: batch.targets.map(({ owner }) => owner), connection: activeConnection }
      : null;
    if (activation) activations.set(invocationId, activation);
    const ownsActivation = () => ownsConnection(activeConnection)
      && (!activation || activations.get(invocationId) === activation);
    settlePhoneActivationBatch(batch, {
      activated: (targets) => {
        const activeDecoders = claimPhoneActivationDecoders(targets);
        if (activeDecoders > 0) updateResources({
          videos: 0, activeDecoders, canvases: 0, webglContexts: 0
        }, 1);
      },
      fulfilled: () => {
        if (!ownsActivation()) return;
        for (const { owner } of batch.targets) owner.mount.commands.setMediaPhase?.({ phase: 'primed', runToken, direction, stageIndex });
        if (activation) activations.delete(invocationId);
        enqueueFor({ type: 'activation-settled', invoked: true, attempt }, activeConnection);
      },
      rejected: (targets) => {
        if (!ownsActivation()) return;
        if (activation) activations.delete(invocationId);
        for (const { owner } of targets) if (!owner.disposed) pauseLease(owner, 'outside-closure');
        enqueueFor({ type: 'activation-settled', invoked: false, attempt }, activeConnection);
      }
    });
  }

  const pauseLease = (lease: LeafLease, reason: Parameters<
    PhoneLeafMountRegistration['commands']['pause']
  >[0]): void => {
    const activeDecoders = lease.activeDecoders;
    runPhoneCleanupSteps('Phone leaf pause failed', [
      () => lease.mount.commands.pause(reason),
      () => environment.observeLifecycle?.('pause'),
      () => activeDecoders > 0 && updateResources({
        videos: 0, activeDecoders, canvases: 0, webglContexts: 0
      }, -1),
      () => { lease.activeDecoders = 0; }
    ]);
  };

  const renewLeaseBinding = (
    lease: LeafLease,
    binding: PhoneLeafReportBinding,
    pause = false
  ): void => {
    if (lease.reports.p) return promoteLease(lease, binding);
    closeReports(lease.reports);
    if (pause) pauseLease(lease, 'superseded');
    leaves.delete(lease.key);
    const state: ReportState = { valid: true, binding: closePhoneLeafReportBinding(binding) };
    reportStates.add(state);
    lease.key = phoneLeafMountKey(state.binding);
    if (leaves.has(lease.key)) throw new Error(`rebind collision: ${lease.key}`);
    leaves.set(lease.key, lease);
    bindLeafGeneration(lease, state, true);
  };

  const retireLease = (
    lease: LeafLease,
    reason: PhoneLeafDisposeReason,
    paused = false
  ): void => {
    if (lease.disposed) return;
    runPhoneLeafRetirement({
      invalidate: () => closeReports(lease.reports),
      pause: () => pauseLease(lease, 'outside-closure'),
      dispose: () => {
        lease.mount.commands.dispose(reason);
        environment.observeLifecycle?.('dispose');
      },
      markDisposed: () => { lease.disposed = true; leaves.delete(lease.key); },
      unregister: () => environment.observeLifecycle?.('unregister'),
      releaseMount: () => lease.mount.release(),
      releaseResources: () => updateResources({
        ...lease.mount.resources, activeDecoders: lease.activeDecoders
      }, -1),
      released: () => environment.observeLifecycle?.('release')
    }, paused);
  };

  const invalidateAttempt = (attempt: PhoneAttemptKey): void => {
    if (deferredActivation && sameAttempt(deferredActivation.attempt, attempt)) deferredActivation = null;
    for (const [invocationId, activation] of activations) {
      if (sameAttempt(activation.attempt, attempt)) activations.delete(invocationId);
    }
    for (const state of [...reportStates]) {
      if (sameAttempt(state.binding.attempt, attempt)) closeReports(state);
    }
    for (const lease of [...leaves.values()]) {
      if (!sameAttempt(lease.reports.binding.attempt, attempt)) continue;
      const retained = attempt.mode === 'recovery'
        || ['source', 'rollback'].includes(lease.reports.binding.leg);
      if (!retained) retireLease(lease, 'generation-replaced');
    }
  };

  const pauseAttempt = (
    attempt: PhoneAttemptKey,
    reason: 'hidden' | 'superseded' | 'rollback' | 'outside-closure'
  ): void => {
    for (const lease of [...leaves.values()]) {
      if (!sameAttempt(lease.reports.binding.attempt, attempt)) continue;
      pauseLease(lease, reason);
      if (reason !== 'hidden' && lease.reports.binding.leg !== 'source') {
        retireLease(lease, 'generation-replaced', true);
      }
    }
  };

  const activationCoverageComplete = (
    candidates: readonly LeafLease[], surfaceIds: readonly PhoneSurfaceId[]
  ): boolean => {
    const covered = new Set(candidates.flatMap((lease) => (
      phoneActivationSurfaceIds(lease.mount, surfaceIds)
    )));
    return surfaceIds.every((id) => covered.has(id));
  };

  const rebindForActivation = (
    attempt: PhoneLeafReportBinding['attempt'],
    surfaceIds: readonly string[]
  ): readonly LeafLease[] => {
    const candidates = [...leaves.values()].filter((lease) => (
      !lease.disposed
        && lease.reports.binding.attempt.authorityId === attempt.authorityId
        && (sameAttempt(lease.reports.binding.attempt, attempt)
          || lease.reports.binding.attempt.transactionGeneration + 1 === attempt.transactionGeneration
          || lease.reports.p)
        && phoneActivationSurfaceIds(lease.mount, surfaceIds).length > 0
    ));
    for (const lease of candidates) {
      if (sameAttempt(lease.reports.binding.attempt, attempt)) continue;
      const binding: PhoneLeafReportBinding = {
        ...lease.reports.binding, attempt, planeRevision: null
      };
      renewLeaseBinding(lease, binding, true);
    }
    return candidates;
  };

  const rebindRetainedClosure = (
    effect: Extract<PhoneStoryEffect, { type: 'load-dependencies' }>
  ): void => {
    if (snapshot.status !== 'transaction'
      || !sameAttempt(snapshot.transaction.attempt, effect.attempt)) return;
    const transaction = snapshot.transaction;
    for (const lease of [...leaves.values()]) {
      if (lease.disposed || sameAttempt(lease.reports.binding.attempt, transaction.attempt)) continue;
      const actual = [...lease.mount.surfaceIds];
      const leg = phoneRetainedMountLeg(transaction.closure, transaction.mode, actual);
      if (!leg) {
        retireLease(lease, 'closure-retired');
        continue;
      }
      const binding = createPhoneRetainedLeafBinding(transaction, leg, actual);
      renewLeaseBinding(lease, binding, true);
      if (transaction.mode === 'segment' && transaction.attempt.segmentId && transaction.attempt.direction && leg !== 'effect') lease.mount.commands.render(commandProgress(transaction, leg));
    }
  };

  const dequeue = (): QueuedEvent | null => {
    if (queue.length === 0) return null;
    const selected = queue.reduce((best, item) => {
      const priority = phoneEventPriority(item.event);
      const bestPriority = phoneEventPriority(best.event);
      return priority < bestPriority
        || (priority === bestPriority && item.sequence < best.sequence)
        ? item
        : best;
    });
    queue = queue.filter((item) => item !== selected);
    return selected;
  };

  const dependencyKey = (dependencies: readonly PhoneDependencyRef[]) => phoneIdentitySignature(dependencies);

  const releaseDependencyLease = (attempt: PhoneAttemptKey): void => {
    const key = attemptIdentity(attempt);
    const dependencies = dependencyLeases.get(key);
    if (!dependencies) return;
    dependencyLeases.delete(key);
    ports.releaseDependencies?.(dependencies);
  };

  const abortAttemptLoads = (attempt: PhoneAttemptKey): void => {
    for (const [key, load] of pendingLoads) {
      load.waiters = load.waiters.filter(({ effect }) => (
        !sameAttempt(effect.attempt, attempt)
      ));
      if (load.waiters.length === 0) {
        load.controller.abort();
        pendingLoads.delete(key);
      }
    }
  };

  const reportLoadedModules = (
    effect: Extract<PhoneStoryEffect, { type: 'load-dependencies' }>,
    activeConnection: number
  ): void => {
    if (snapshot.status !== 'transaction'
      || !sameAttempt(snapshot.transaction.attempt, effect.attempt)) return;
    for (const slot of snapshot.transaction.requiredPrepared.filter(({ kind }) => (
      kind === 'module-loaded'
    ))) enqueueFor({
      type: 'evidence-reported', slot,
      report: { kind: 'module-loaded', token: `${effect.attempt.transactionId}:module`,
        accepted: true }
    }, activeConnection);
  };

  let failClosedPending: FailClosedLineage | null = null; const reportLoadFailure = (effect: Extract<PhoneStoryEffect, { type: 'load-dependencies' }>, reason: string, activeConnection: number): FailClosedLineage | null => {
    const transaction = snapshot.status === 'transaction' ? snapshot.transaction : null;
    if (!transaction || !sameAttempt(transaction.attempt, effect.attempt)) return null; const stableCommit = snapshot.stableCommit; if (!stableCommit) { enqueueFor({ type: 'terminal-fault', code: 'module-load-rejected' }, activeConnection); return null; }
    const settleAttempt = transaction.attempt;
    const lineage: FailClosedLineage = { connection: activeConnection, failureAttempt: effect.attempt, stableCommit, settleAttempt, armed: false }; failClosedPending = lineage; const slot = [...transaction.requiredPrepared, ...transaction.requiredFinal].find(({ kind }) => kind === 'module-loaded');
    if (slot) enqueueFor({ type: 'failure-reported', slot, failure: { code: 'module-load-rejected', message: reason, recoverable: true } }, activeConnection); else enqueueFor({ type: 'terminal-fault', code: 'module-load-rejected' }, activeConnection);
    return lineage;
  };
  const failClosedSettled = (lineage: FailClosedLineage): boolean => ownsConnection(lineage.connection) && lineage.armed && snapshot.status === 'stable' && lineage.settleAttempt !== null && snapshot.stableCommit === lineage.stableCommit && stableDependencyAttempt !== null && sameAttempt(stableDependencyAttempt, lineage.settleAttempt);
  const exposeFailClosed = (lineage: FailClosedLineage): void => { if (failClosedPending !== lineage || !ownsConnection(lineage.connection) || snapshot.status === 'faulted') return; if (failClosedSettled(lineage)) { failClosedPending = null; enqueueFor({ type: 'terminal-fault', code: 'module-load-rejected' }, lineage.connection); return; } if (snapshot.status === 'transaction' && snapshot.stableCommit === lineage.stableCommit && (snapshot.transaction.mode === 'rollback' || sameAttempt(snapshot.transaction.attempt, lineage.settleAttempt!))) lineage.settleAttempt = snapshot.transaction.attempt; };
  const resolveFailClosed = (lineage: FailClosedLineage, status: 'reloading' | 'fail-closed'): void => { if (failClosedPending !== lineage) return; if (status !== 'fail-closed') { failClosedPending = null; return; } lineage.armed = true; exposeFailClosed(lineage); };

  const loadDependencies = (effect: Extract<PhoneStoryEffect, { type: 'load-dependencies' }>, activeConnection: number): void => {
    if (!ports.loadDependencies) return;
    const key = dependencyKey(effect.dependencies);
    if (fulfilledLoads.has(key)) {
      reportLoadedModules(effect, activeConnection);
      return;
    }
    if (rejectedClosures.has(key)
      || effect.dependencies.some((dependency) => rejectedLoads.has(dependency))) {
      const reason = 'native module URL already rejected in this Document'; const lineage = reportLoadFailure(effect, reason, activeConnection);
      void chunkRecovery.reportRejectedChunk({
        authorityId: effect.attempt.authorityId, transactionId: effect.attempt.transactionId,
        moduleUrl: 'unknown-phone-module', dependencies: effect.dependencies, reason
      }).then((status) => lineage && resolveFailClosed(lineage, status)).catch(() => lineage && resolveFailClosed(lineage, 'fail-closed'));
      return;
    }
    const pending = pendingLoads.get(key);
    if (pending) {
      pending.waiters.push({ effect, connection: activeConnection });
      return;
    }
    const controller = new AbortController(); const load: PendingLoad = { controller, waiters: [{ effect, connection: activeConnection }] };
    pendingLoads.set(key, load);
    const reject = (failure: Readonly<{
      moduleUrl: string; reason: string; dependency?: PhoneDependencyRef;
    }>): void => {
      if (failure.dependency) rejectedLoads.add(failure.dependency);
      else rejectedClosures.add(key);
      let lineage: FailClosedLineage | null = null; for (const waiter of load.waiters) { const next = reportLoadFailure(waiter.effect, failure.reason, waiter.connection); if (next) lineage = next; }
      void chunkRecovery.reportRejectedChunk({
        authorityId: effect.attempt.authorityId,
        transactionId: effect.attempt.transactionId,
        moduleUrl: failure.moduleUrl,
        dependencies: effect.dependencies,
        reason: failure.reason
      }).then((status) => lineage && resolveFailClosed(lineage, status)).catch(() => lineage && resolveFailClosed(lineage, 'fail-closed'));
    };
    void ports.loadDependencies(effect, controller.signal).then((result) => {
      if (pendingLoads.get(key) === load) pendingLoads.delete(key);
      if (result.status === 'rejected') {
        reject(result);
        return;
      }
      fulfilledLoads.add(key);
      for (const waiter of load.waiters) {
        reportLoadedModules(waiter.effect, waiter.connection);
      }
    }).catch((error: unknown) => {
      if (pendingLoads.get(key) === load) pendingLoads.delete(key);
      const errorName = error && typeof error === 'object' && 'name' in error
        ? (error as { name?: unknown }).name : undefined;
      if (controller.signal.aborted
        && (error === controller.signal.reason || errorName === 'AbortError')) return;
      const reason = error instanceof Error ? error.message : String(error);
      reject({ moduleUrl: 'unknown-phone-module', reason });
    });
  };

  const enqueueFor = (event: PhoneStoryEvent, expectedConnection: number): void => {
    if (!connected || expectedConnection !== connection) return;
    if (event.type === 'scroll-sampled') {
      queue = queue.filter(({ event: queued }) => queued.type !== 'scroll-sampled');
    } else if (event.type === 'viewport-sampled' && event.change === 'toolbar') {
      queue = queue.filter(({ event: queued }) => (
        queued.type !== 'viewport-sampled' || queued.change !== 'toolbar'
      ));
    }
    queue.push({ sequence: ++sequence, event });
    drain();
  };

  const schedulePlane = (
    effect: Extract<PhoneStoryEffect, { type: 'apply-presentation-plane' }>,
    activeConnection: number
  ): void => {
    if (planeFrame !== null) environment.cancelFrame(planeFrame);
    const handle = environment.requestFrame(() => {
      if (planeFrame !== handle || !ownsConnection(activeConnection)) return;
      planeFrame = null;
      const transaction = snapshot.status === 'transaction' ? snapshot.transaction : null;
      if (!transaction || !sameAttempt(transaction.attempt, effect.attempt)
        || transaction.planeRevision !== effect.planeRevision) return;
      const request = createPhonePlaneRequest(
        transaction, sampleViewport(snapshot.viewport), snapshot.stableCommit !== null,
        snapshot.stableCommit
      );
      const first = request?.required[0];
      if (!request || !first || request.planeRevision !== effect.planeRevision) return;
      const result = invokePhoneProjector(() => (
        request.leg === 'source' ? presentation.applyPlane(request)
          : request.leg === 'rollback' ? presentation.verifyRollback(request)
            : transaction.commitIntent === 'reproject' ? presentation.verifyReproject(request)
              : presentation.verifyVisibleCandidate(request)
      ));
      if (transaction.commitIntent === 'reproject'
        && result.failure?.code === 'presentation-coverage-invalid') {
        schedulePlane(effect, activeConnection);
        return;
      }
      if (result.failure || !phonePlaneResultIsExact(request, result)) enqueueFor({
        type: 'failure-reported', slot: first,
        failure: result.failure ?? {
          code: 'presentation-proof-invalid',
          message: 'Projector proof does not match the active final slots', recoverable: true
        }
      }, activeConnection);
      else for (const record of result.records) enqueueFor({
        type: 'evidence-reported', slot: record.slot,
        report: { kind: record.slot.kind, token: record.token, accepted: true }
      }, activeConnection);
    });
    planeFrame = handle;
  };

  const interpret = (effect: PhoneStoryEffect, activeConnection: number): void => {
    if (!connected || activeConnection !== connection) return;
    if (effect.type === 'apply-presentation-plane') {
      schedulePlane(effect, activeConnection);
      return;
    }
    let observedEffect = effect;
    if (effect.type === 'load-dependencies') {
      if (stableDependencyAttempt
        && !sameAttempt(stableDependencyAttempt, effect.attempt)) {
        releaseDependencyLease(stableDependencyAttempt);
        stableDependencyAttempt = null;
      }
      dependencyLeases.set(attemptIdentity(effect.attempt), effect.dependencies);
      rebindRetainedClosure(effect);
      loadDependencies(effect, activeConnection);
    } else if (effect.type === 'refresh-stable-viewport') {
      if (snapshot.status === 'stable' && snapshot.stableCommit) {
        presentation.refreshStableViewport(sampleViewport(snapshot.viewport));
      }
    } else if (effect.type === 'schedule-deadline') {
      if (effect.timeoutMs <= 0) return;
      const key = deadlineKey(effect.attempt, effect.operation);
      cancelDeadline(key);
      const handle = environment.scheduleTimer(() => {
        const lease = deadlines.get(key);
        if (!lease || lease.handle !== handle || lease.connection !== activeConnection) return;
        deadlines.delete(key);
        enqueueFor({
          type: 'deadline-fired',
          operation: effect.operation as Extract<PhoneStoryEvent, {
            type: 'deadline-fired'
          }>['operation'],
          attempt: effect.attempt
        }, activeConnection);
      }, effect.timeoutMs);
      deadlines.set(key, { key, handle, connection: activeConnection });
    } else if (effect.type === 'cancel-deadline') {
      cancelDeadline(deadlineKey(effect.attempt, effect.operation));
    } else if (effect.type === 'invalidate-attempt') {
      cancelDeadlines((lease) => lease.key.startsWith(attemptIdentity(effect.attempt)));
      abortAttemptLoads(effect.attempt);
      invalidateAttempt(effect.attempt);
      releaseDependencyLease(effect.attempt);
    } else if (effect.type === 'pause-closure') {
      if (effect.reason === 'hidden') abortAttemptLoads(effect.attempt);
      pauseAttempt(effect.attempt, effect.reason);
    } else if (effect.type === 'dispose-closure') {
      for (const lease of [...leaves.values()]) {
        if (sameAttempt(lease.reports.binding.attempt, effect.attempt)) {
          retireLease(lease, effect.reason);
        }
      }
    } else if (effect.type === 'release-dependencies') {
      releaseDependencyLease(effect.attempt);
    } else if (effect.type === 'activate-surfaces') {
      if (snapshot.status === 'transaction'
        && sameAttempt(snapshot.transaction.attempt, effect.attempt)) {
        const attempt = snapshot.transaction.attempt;
        const candidates = rebindForActivation(attempt, effect.surfaceIds);
        if (activationCoverageComplete(candidates, effect.surfaceIds)) {
          deferredActivation = null;
          invokeActivation(candidates, attempt, effect.credit, effect.surfaceIds, activeConnection);
        } else if (effect.credit === 'direct-muted-autoplay') {
          deferredActivation = { attempt, credit: effect.credit, surfaceIds: effect.surfaceIds };
        } else {
          deferredActivation = null;
          enqueueFor({ type: 'activation-settled', invoked: false, attempt }, activeConnection);
        }
      }
    } else if (effect.type === 'show-activation-cta') {
      const hasRegisteredVideo = [...leaves.values()].some((lease) => (
        !lease.disposed && sameAttempt(lease.reports.binding.attempt, effect.attempt)
          && phoneActivationSurfaceIds(lease.mount).length > 0
      ));
      observedEffect = { ...effect, enabled: effect.enabled && hasRegisteredVideo };
    } else if (effect.type === 'push-url' || effect.type === 'replace-url') {
      environment.writeUrl(
        effect.type === 'push-url' ? 'push' : 'replace',
        effect.pathname,
        effect.hash
      );
    } else if (effect.type === 'defer-entry') {
      enqueueFor({ type: 'entry-requested', request: effect.request,
        ...(effect.urlWasReplaced ? { urlWasReplaced: true } : {}) }, activeConnection);
    }
    environment.performEffect?.(
      observedEffect, (event) => enqueueFor(event, activeConnection)
    );
  };

  const driveCommandHandles = (
    previous: PhoneMachineSnapshot,
    next: PhoneMachineSnapshot, activeConnection: number
  ): void => {
    const setPhase = (leasesToUpdate: readonly LeafLease[], leg: 'source' | 'target' | 'rollback' | null, phase: 'playing' | 'held', attempt: PhoneAttemptKey, stageIndex: number, endpoint?: 0 | 1): void => { if (!leg) return; const direction = attempt.direction ?? 'forward'; const command = { phase, runToken: mediaRunToken(attempt, direction), direction, stageIndex, ...(endpoint === undefined ? {} : { endpoint }) } as const; for (const lease of leasesToUpdate) if (lease.reports.binding.leg === leg) lease.mount.commands.setMediaPhase?.(command); };
    const frameFor = (transaction: Extract<PhoneMachineSnapshot, { status: 'transaction' }>['transaction']): PhoneSegmentChoreographyFrame | null => transaction.attempt.segmentId && transaction.attempt.direction ? phoneSegmentChoreographyFrame(transaction.attempt.segmentId, transaction.progress, transaction.attempt.direction, transaction.stageIndex) : null;
    if (previous.status !== 'transaction' || next.status !== 'transaction' || !sameAttempt(previous.transaction.attempt, next.transaction.attempt)) {
      if (previous.status === 'transaction') {
        const previousLeases = [...leaves.values()].filter(({ reports }) => sameAttempt(reports.binding.attempt, previous.transaction.attempt));
        const owner = frameFor(previous.transaction)?.mediaClockOwner;
        setPhase(previousLeases, owner && owner !== 'none' ? owner : null, 'held', previous.transaction.attempt, previous.transaction.stageIndex, owner && owner !== 'none' ? segmentEndpoint(previous.transaction, owner) ?? undefined : undefined);
      }
      return;
    }
    const transaction = next.transaction;
    const leases = [...leaves.values()].filter(({ reports }) => sameAttempt(reports.binding.attempt, transaction.attempt));
    if (previous.transaction.stageIndex !== transaction.stageIndex) {
      for (const lease of leases) {
        if (!ownsConnection(activeConnection)) return;
        renewLeaseBinding(lease, { ...lease.reports.binding, stageIndex: transaction.stageIndex, planeRevision: transaction.planeRevision });
      }
    }
    if (transaction.phase === 'playing' && (previous.transaction.phase !== 'playing' || previous.transaction.progress !== transaction.progress)) {
      const { segmentId, direction } = transaction.attempt;
      if (!segmentId || !direction) return;
      const frame = phoneSegmentChoreographyFrame(segmentId, transaction.progress, direction, transaction.stageIndex);
      let ownership = null;
      for (const lease of leases) {
        if (!ownsConnection(activeConnection)) return;
        const leg = lease.reports.binding.leg;
        const result = lease.mount.commands.render(progressForLeg(frame, leg));
        if (leg === 'effect' && result) ownership = result.ownership;
      }
      presentation.applyTransitionFrame({ sourceOpacity: frame.sourceOpacity, targetOpacity: frame.targetOpacity, ownership, direction, foregroundOwner: frame.foregroundOwner });
    }
    const previousFrame = frameFor(previous.transaction);
    const nextFrame = frameFor(transaction);
    const previousOwner = previous.transaction.phase === 'playing' && previousFrame?.mediaClockOwner && previousFrame.mediaClockOwner !== 'none' ? previousFrame.mediaClockOwner : null;
    const nextOwner = transaction.phase === 'playing' && nextFrame?.mediaClockOwner && nextFrame.mediaClockOwner !== 'none' ? nextFrame.mediaClockOwner : null;
    const stageChanged = previous.transaction.stageIndex !== transaction.stageIndex;
    if (previousOwner && (previousOwner !== nextOwner || transaction.phase !== 'playing' || stageChanged)) setPhase(leases, previousOwner, 'held', previous.transaction.attempt, previous.transaction.stageIndex, segmentEndpoint(previous.transaction, previousOwner) ?? undefined);
    if (nextOwner && transaction.phase === 'playing' && (previous.transaction.phase !== 'playing' || previousOwner !== nextOwner || stageChanged)) setPhase(leases, nextOwner, 'playing', transaction.attempt, transaction.stageIndex);
    if (transaction.phase === 'presenting-target' && previous.transaction.phase !== 'presenting-target') {
      for (const lease of leases) {
        if (!ownsConnection(activeConnection)) return;
        const leg = lease.reports.binding.leg;
        const choreographedEndpoint = segmentEndpoint(transaction, leg);
        const endpoint = leg === 'effect' ? transaction.attempt.direction === 'reverse' ? 0 : 1 : choreographedEndpoint ?? (transaction.attempt.mode === 'boot' && transaction.candidateSceneId === 'hero' ? 0 : phoneSceneStableHold(leg === 'source' && transaction.sourceSceneId ? transaction.sourceSceneId : transaction.candidateSceneId));
        const settled = lease.mount.commands.settle(endpoint);
        if (settled?.prewarmReusable === false) delete lease.reports.p;
      }
    }
  };

  const closeFinishedAttempt = (
    previous: PhoneMachineSnapshot,
    next: PhoneMachineSnapshot
  ): void => {
    if (previous.status !== 'transaction') return;
    const transaction = previous.transaction;
    const matching = [...leaves.values()].filter((lease) => (
      sameAttempt(lease.reports.binding.attempt, transaction.attempt)
    ));
    if (next.status !== 'transaction') for (const state of [...reportStates]) {
      if (sameAttempt(state.binding.attempt, transaction.attempt)) closeReports(state);
    }
    if (next.status === 'stable') {
      const completed = transaction.commitIntent === 'semantic'
        ? next.stableCommit !== previous.stableCommit
        : next.presentationProof !== previous.presentationProof;
      if (!completed) return;
      stableDependencyAttempt = transaction.attempt;
      const retainedLeg = transaction.commitIntent === 'rollback' ? 'rollback'
        : 'target';
      const retainsPair = transaction.closure.retireAfter === 'pair-exit-or-route-dispose';
      for (const lease of matching) {
      const keepsStableMount = lease.reports.binding.attempt.sceneId === next.stableCommit.sceneId && lease.reports.binding.leg === retainedLeg; if (keepsStableMount || retainsPair) { if (retainsPair && lease.reports.binding.leg !== 'effect') lease.reports.p = 'ready'; closeReports(lease.reports); } else retireLease(lease, 'closure-retired');
      }
      if (next.stableCommit !== previous.stableCommit) chunkRecovery.markStable(Object.freeze({
        authorityId: next.authorityId,
        sceneId: next.stableCommit.sceneId,
        commitSequence: next.stableCommit.commitSequence
      }));
      if (next.stableCommit !== previous.stableCommit && ports.prewarmDependencies) {
        prewarmController?.abort();
        const controller = new AbortController();
        prewarmController = controller;
        const dependencies = adjacentPrewarmDependencies(next.stableCommit.sceneId);
        const effect: Extract<PhoneStoryEffect, { type: 'load-dependencies' }> = {
          type: 'load-dependencies',
          attempt: transaction.attempt,
          dependencies
        };
        const prewarmKey = dependencyKey(dependencies);
        if (dependencies.length === 0 || rejectedClosures.has(prewarmKey)
          || dependencies.some((dependency) => rejectedLoads.has(dependency))) {
          if (prewarmController === controller) prewarmController = null;
          return;
        }
        void ports.prewarmDependencies(effect, controller.signal)
          .then((result) => {
            if (result.status !== 'rejected') return;
            rejectedLoads.add(result.dependency);
            void chunkRecovery.reportRejectedChunk({
              authorityId: effect.attempt.authorityId,
              transactionId: effect.attempt.transactionId,
              moduleUrl: result.moduleUrl,
              dependencies: effect.dependencies,
              reason: result.reason
            }).catch(() => undefined);
          })
          .catch((error: unknown) => {
            const errorName = error && typeof error === 'object' && 'name' in error
              ? (error as { name?: unknown }).name : undefined;
            if (controller.signal.aborted && (
              error === controller.signal.reason || errorName === 'AbortError'
            )) return;
            rejectedClosures.add(prewarmKey);
            void chunkRecovery.reportRejectedChunk({
              authorityId: effect.attempt.authorityId,
              transactionId: effect.attempt.transactionId,
              moduleUrl: 'unknown-phone-module',
              dependencies: effect.dependencies,
              reason: error instanceof Error ? error.message : String(error)
            }).catch(() => undefined);
          })
          .finally(() => {
            if (prewarmController === controller) prewarmController = null;
          });
      }
    } else if (next.status === 'faulted') {
      abortAttemptLoads(transaction.attempt);
      const stableSurfaces = next.stableCommit
        ? phoneIdentitySignature(phoneSceneById(next.stableCommit.sceneId).surfaces) : null;
      for (const lease of matching) {
        const leaseSurfaces = phoneIdentitySignature(lease.mount.surfaceIds);
        if (stableSurfaces !== null && leaseSurfaces === stableSurfaces) {
          closeReports(lease.reports);
          pauseLease(lease, 'rollback');
        } else retireLease(lease, 'faulted');
      }
      releaseDependencyLease(transaction.attempt);
    }
  };

  const applyResult = (result: PhoneMachineResult, activeConnection: number): void => {
    const previous = snapshot;
    snapshot = result.snapshot;
    if (planeFrame !== null && (snapshot.status !== 'transaction'
      || snapshot.transaction.requiredFinal.length === 0)) {
      environment.cancelFrame(planeFrame);
      planeFrame = null;
    }
    if (snapshot !== previous) publish();
    const candidate = failClosedPending; if (candidate && !candidate.armed && previous.status === 'transaction' && sameAttempt(previous.transaction.attempt, candidate.failureAttempt) && snapshot.status === 'transaction' && snapshot.stableCommit === candidate.stableCommit) candidate.settleAttempt = snapshot.transaction.attempt;
    if (!ownsConnection(activeConnection)) return;
    syncDeadlines();
    if (!ownsConnection(activeConnection)) return;
    driveCommandHandles(previous, snapshot, activeConnection);
    if (!ownsConnection(activeConnection)) return;
    syncPlayback(activeConnection);
    if (!ownsConnection(activeConnection)) return;
    for (const effect of result.effects) {
      interpret(effect, activeConnection);
      if (!ownsConnection(activeConnection)) return;
    }
    closeFinishedAttempt(previous, snapshot);
    const pending = failClosedPending; if (pending && snapshot.status === 'transaction' && snapshot.transaction.mode === 'rollback' && snapshot.stableCommit === pending.stableCommit) pending.settleAttempt = snapshot.transaction.attempt;
    if (pending && failClosedSettled(pending)) enqueueFor({ type: 'terminal-fault', code: 'module-load-rejected' }, activeConnection); else if (pending && (snapshot.status === 'faulted' || (pending.armed && (snapshot.status !== 'transaction' || !sameAttempt(snapshot.transaction.attempt, pending.settleAttempt!))))) failClosedPending = null;
  };

  const drain = (): void => {
    if (draining || !connected) return;
    draining = true;
    try {
      for (let item = dequeue(); item && connected; item = dequeue()) {
        applyResult(reducePhoneStory(snapshot, item.event), connection);
      }
    } finally {
      draining = false;
    }
  };

  const flushSamples = (expectedConnection: number): void => {
    if (!connected || expectedConnection !== connection) return;
    sampleFrame = null;
    const viewport = pendingViewport;
    const scroll = pendingScroll;
    pendingViewport = null;
    pendingScroll = null;
    if (viewport) enqueueFor({
      type: 'viewport-sampled',
      viewport: sampleViewport(viewport.viewport),
      change: viewport.change
    }, expectedConnection);
    if (scroll) enqueueFor({ type: 'scroll-sampled', sample: scroll.sample }, expectedConnection);
  };

  const scheduleSamples = (expectedConnection: number): void => {
    if (sampleFrame !== null) return;
    sampleFrame = environment.requestFrame(() => flushSamples(expectedConnection));
  };

  const cancelSamples = (): void => {
    if (sampleFrame !== null) environment.cancelFrame(sampleFrame);
    sampleFrame = null;
    pendingViewport = null;
    pendingScroll = null;
  };

  const disconnectConnection = (expectedConnection: number): void => {
    if (!connected || expectedConnection !== connection) return;
    connected = false;
    runPhoneCleanupSteps('Phone runtime disconnect failed', [
      () => removeHostListener?.(),
      () => cancelDeadlines(() => true),
      () => cancelPlayback(),
      () => cancelSamples(),
      () => planeFrame !== null && environment.cancelFrame(planeFrame),
      () => prewarmController?.abort(),
      ...[...pendingLoads.values()].map((load) => () => load.controller.abort()),
      ...[...leaves.values()].map((lease) => () => retireLease(lease, 'route-dispose')),
      ...[...reportStates].map((state) => () => closeReports(state, false)),
      ...[...dependencyLeases.values()].map((dependencies) => (
        () => ports.releaseDependencies?.(dependencies)
      )),
      () => {
        removeHostListener = null;
        playback = null;
        sampleFrame = null;
        planeFrame = null;
        pendingViewport = null;
        pendingScroll = null;
        stableDependencyAttempt = null; failClosedPending = null;
        deferredActivation = null;
        prewarmController = null;
        clearPhoneOwnershipRegistries([
          deadlines, pendingLoads, activations, leaves,
          reportStates, dependencyLeases, listeners
        ]);
        queue = [];
      }
    ]);
  };

  const handleHost = (event: PhoneRuntimeHostEvent, expectedConnection: number): void => {
    if (!connected || expectedConnection !== connection) return;
    if ((event.type === 'visibility' && event.hidden) || event.type === 'pagehide') cancelSamples();
    if (event.type === 'input') {
      if (!event.fresh || event.target !== 'story' || event.trusted === false) return;
      const direction = inputDirection(event);
      if (direction) {
        const epoch = ++physicalEpoch;
        const active = snapshot.status === 'transaction' ? snapshot.transaction : null;
        enqueueFor(active?.phase === 'awaiting-leg-intent' && active.attempt.direction === direction
          ? { type: 'leg-intent', attempt: active.attempt, physicalEpoch: epoch }
          : { type: 'segment-requested', direction, physicalEpoch: epoch,
              reducedMotion: environment.readReducedMotion() }, expectedConnection);
      }
    } else if (event.type === 'entry') {
      enqueueFor({ type: 'entry-requested', request: event.request }, expectedConnection);
    } else if (event.type === 'viewport') {
      if (planeFrame !== null) environment.cancelFrame(planeFrame);
      planeFrame = null;
      if (event.change === 'toolbar') {
        pendingViewport = event;
        scheduleSamples(expectedConnection);
      } else {
        pendingViewport = null;
        if (sampleFrame !== null && pendingScroll === null) {
          environment.cancelFrame(sampleFrame);
          sampleFrame = null;
        }
        enqueueFor({ type: 'viewport-sampled', viewport: sampleViewport(event.viewport), change: event.change },
          expectedConnection);
      }
    } else if (event.type === 'scroll') {
      pendingScroll = event;
      scheduleSamples(expectedConnection);
    } else if (event.type === 'visibility') {
      if (event.hidden && snapshot.status === 'stable') {
        for (const lease of leaves.values()) pauseLease(lease, 'hidden');
      }
      enqueueFor(event.hidden
        ? { type: 'page-hidden', persisted: false }
        : { type: 'page-shown', persisted: false,
            viewport: sampleViewport(environment.readViewport()) },
      expectedConnection);
    } else if (event.type === 'pagehide' && event.persisted) {
      if (snapshot.status === 'stable') {
        for (const lease of leaves.values()) pauseLease(lease, 'hidden');
      }
      enqueueFor({ type: 'page-hidden', persisted: true }, expectedConnection);
    } else if (event.type === 'pagehide') {
      disconnectConnection(expectedConnection);
    } else if (event.type === 'pageshow') {
      enqueueFor({ type: 'page-shown', persisted: event.persisted,
        viewport: sampleViewport(environment.readViewport()) }, expectedConnection);
    } else if (event.trusted) {
      enqueueFor(
        { type: 'activation-requested', epoch: ++physicalEpoch },
        expectedConnection
      );
    }
  };

  const connect = (): (() => void) => {
    if (connected) throw new Error('runtime already connected');
    const activeConnection = ++connection;
    connected = true;
    physicalEpoch = 0;
    visibleEntranceCommitSequence = null;
    sequence = 0;
    queue = [];
    notifyResources();
    removeHostListener = environment.subscribeHost(
      (event) => handleHost(event, activeConnection)
    );
    const boot = createPhoneStoryBoot({
      authorityId: environment.nextAuthorityId(),
      request: config.initialEntry,
      viewport: sampleViewport(environment.readViewport()), reducedMotion: environment.readReducedMotion()
    });
    draining = true;
    try {
      applyResult(boot, activeConnection);
    } finally {
      draining = false;
    }
    drain();
    return () => disconnectConnection(activeConnection);
  };

  const reportPresentationPrepared = (report: PhonePresentationPreparedReport): void => {
    if (!connected || report.generation !== report.attempt.transactionGeneration || snapshot.status !== 'transaction' || !sameAttempt(snapshot.transaction.attempt, report.attempt)) return;
    [...snapshot.transaction.requiredPrepared, ...snapshot.transaction.requiredFinal].filter((candidate) => candidate.surfaceId === report.surfaceId && candidate.kind === 'image-decoded' && sameAttempt(candidate.attempt, report.attempt)).forEach((slot) => enqueueFor({ type: 'evidence-reported', slot, report: { kind: 'image-decoded', token: report.token, accepted: true, detail: { surfaceId: report.surfaceId, generation: report.generation } } }, connection));
  };
  const reportPresentationFailure = (report: PhonePresentationFailureReport): void => {
    if (!connected || report.generation !== report.attempt.transactionGeneration || snapshot.status !== 'transaction' || !sameAttempt(snapshot.transaction.attempt, report.attempt)) return;
    const slot = [...snapshot.transaction.requiredPrepared, ...snapshot.transaction.requiredFinal].find((candidate) => candidate.surfaceId === report.surfaceId && sameAttempt(candidate.attempt, report.attempt));
    if (slot) enqueueFor({ type: 'failure-reported', slot, failure: report.failure }, connection);
  };

  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    connect,
    requestEntry: (entry: PhoneEntryRequest) => enqueueFor(
      { type: 'entry-requested', request: entry },
      connection
    ),
    retry: () => enqueueFor({ type: 'retry-requested' }, connection), reportPresentationPrepared, reportPresentationFailure,
    startVisibleEntrance: () => { if (!connected || snapshot.status !== 'stable' || snapshot.stableCommit.sceneId !== 'hero' || visibleEntranceCommitSequence === snapshot.stableCommit.commitSequence) return; const surfaces = phoneIdentitySignature(phoneSceneById('hero').surfaces); const hero = [...leaves.values()].find((lease) => !lease.disposed && phoneIdentitySignature(lease.mount.surfaceIds) === surfaces); if (!hero) return; visibleEntranceCommitSequence = snapshot.stableCommit.commitSequence; hero.mount.commands.settle(1); },
    promotePrewarmLeaf: (binding: PhoneLeafReportBinding) => {
      const closed = closePhoneLeafReportBinding(binding);
      if (!connected || snapshot.status !== 'transaction' || !sameAttempt(closed.attempt, snapshot.transaction.attempt) || closed.stageIndex !== snapshot.transaction.stageIndex || closed.planeRevision !== snapshot.transaction.planeRevision) return false;
      assertPhoneLeafReportBindingContract(closed, snapshot.transaction);
      const matchingLeases = [...leaves.values()].filter((candidate) => !candidate.disposed && phoneIdentitySignature(candidate.mount.surfaceIds) === phoneIdentitySignature(closed.allowedSurfaceIds));
      const lease = matchingLeases.find((candidate) => candidate.reports.binding.leg === closed.leg && sameAttempt(candidate.reports.binding.attempt, closed.attempt)) ?? matchingLeases.find((candidate) => candidate.reports.p) ?? matchingLeases.find((candidate) => sameAttempt(candidate.reports.binding.attempt, closed.attempt));
      if (!lease) return false;
      if (sameAttempt(lease.reports.binding.attempt, closed.attempt)) {
        if (lease.reports.binding.stageIndex !== closed.stageIndex || lease.reports.binding.planeRevision !== closed.planeRevision) promoteLease(lease, closed);
        const active = snapshot.transaction;
        const pending = deferredActivation && sameAttempt(deferredActivation.attempt, closed.attempt)
          ? deferredActivation : null;
        const identity = attemptIdentity(active.attempt);
        if (pending) deferredActivation = null;
        const directActivation = active.mode === 'entry'
          && phoneTransactionActivationSurfaceIds(active).length > 0;
        if ((pending || directActivation) && activationClaims.get(lease) !== identity) queueMicrotask(() => {
          if (!connected || snapshot.status !== 'transaction'
            || !sameAttempt(snapshot.transaction.attempt, closed.attempt)
            || lease.disposed) return;
          invokeActivation([lease], closed.attempt,
            pending?.credit ?? 'direct-muted-autoplay', pending?.surfaceIds);
        });
        return true;
      }
      if (!lease.reports.p) return false; promoteLease(lease, closed);
      const active = snapshot.transaction;
      const pending = deferredActivation && sameAttempt(deferredActivation.attempt, closed.attempt)
        ? deferredActivation : null;
      if (pending) deferredActivation = null;
      const directActivation = active.mode === 'entry'
        && phoneTransactionActivationSurfaceIds(active).length > 0;
      if (pending || directActivation) queueMicrotask(() => {
        if (!connected || snapshot.status !== 'transaction'
          || !sameAttempt(snapshot.transaction.attempt, closed.attempt)
          || lease.disposed) return;
        invokeActivation([lease], closed.attempt,
          pending?.credit ?? 'direct-muted-autoplay', pending?.surfaceIds);
      });
      return true;
    },
    createLeafReportPort: (binding: PhoneLeafReportBinding) => { const closed = closePhoneLeafReportBinding(binding); if (!connected || snapshot.status !== 'transaction' || !sameAttempt(closed.attempt, snapshot.transaction.attempt) || closed.stageIndex !== snapshot.transaction.stageIndex || closed.planeRevision !== snapshot.transaction.planeRevision) throw new Error('not active transaction'); const transaction = snapshot.transaction; assertPhoneLeafReportBindingContract(closed, transaction); const state: ReportState = { valid: true, binding: closed }; reportStates.add(state); return createReportPort(state); },
    createPrewarmLeafReportPort: (sceneId: PhoneSceneId) => { const scene = phoneSceneById(sceneId); const state: ReportState = { p: true, valid: true, binding: { attempt: { authorityId: snapshot.authorityId, transactionId: `prewarm:${sceneId}`, transactionGeneration: 0, mode: 'recovery', sceneId, segmentId: null, direction: 'forward' }, stageIndex: 0, leg: 'target', allowedReports: [], allowedSurfaceIds: scene.surfaces, planeRevision: null } }; reportStates.add(state); return createReportPort(state); }
  });
}
