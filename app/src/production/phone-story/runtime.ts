import { createPhoneStoryBoot, reducePhoneStory, sameAttempt, type PhoneMachineResult, type PhoneMachineSnapshot } from './machine';
import { phoneManifest, phoneSceneById } from './manifest';
import type { PhoneLeafMountRegistration, PhoneLeafReportBinding, PhoneLeafReportPort,
  PhoneLeafMountLease, PhonePlaneApplyResult,
  PhonePresentation } from './presentation';
import { assertPhoneLeafReportBindingContract, bindPhoneLeafGeneration,
  claimPhoneActivationDecoders, clearPhoneOwnershipRegistries, closePhoneLeafReportBinding,
  createPhonePlaneRequest, createPhoneRetainedLeafBinding, createPhoneSupersedingLeafBinding,
  invokePhoneActivationBatch,
  phoneActivationSurfaceIds, phoneIdentitySignature, phoneLeafMountKey, phonePlaneResultIsExact,
  phoneRetainedMountLeg, runPhoneCleanupSteps, runPhoneLeafRetirement,
  settlePhoneActivationBatch } from './presentation';
import type { PhoneAttemptKey, PhoneDependencyRef, PhoneEntryRequest, PhoneFailure,
  PhoneLeafDisposeReason, PhoneStoryEffect, PhoneRejectedChunkFailure,
  PhoneRuntimeLifecycleStep, PhoneRuntimeResourceCounts, PhoneRuntimeHostEvent,
  PhoneRuntimeInputEvent, PhoneStableRecoveryProof,
  PhoneStoryEvent, PhoneStorySnapshot, PhoneViewportSnapshot
} from './protocol';
export type { PhoneRejectedChunkFailure, PhoneRuntimeLifecycleStep, PhoneRuntimeHostEvent, PhoneRuntimeInputEvent, PhoneRuntimeResourceCounts, PhoneStableRecoveryProof } from './protocol';

export type PhoneRuntimeTimerHandle = string | number | Readonly<{ id: string }>;
export type PhoneChunkRecoveryPort = Readonly<{ reportRejectedChunk(failure: PhoneRejectedChunkFailure): Promise<'reloading' | 'fail-closed'>; markStable(proof: PhoneStableRecoveryProof): void }>;

export type PhoneRuntimeEffectPorts = Readonly<{ loadDependencies?(effect: Extract<PhoneStoryEffect, { type: 'load-dependencies' }>, signal: AbortSignal): Promise<PhoneDependencyLoadResult>; releaseDependencies?(dependencies: readonly PhoneDependencyRef[]): void }>;

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

export type PhoneStoryRuntime = Readonly<{
  getSnapshot(): PhoneMachineSnapshot; subscribe(listener: () => void): () => void; connect(): () => void; requestEntry(entry: PhoneEntryRequest): void; retry(): void;
  createLeafReportPort(binding: PhoneLeafReportBinding): PhoneLeafReportPort;
}>;

type QueuedEvent = Readonly<{ sequence: number; event: PhoneStoryEvent }>;
type DeadlineLease = Readonly<{ key: string; handle: PhoneRuntimeTimerHandle; connection: number }>;
type ReportState = { valid: boolean; binding: PhoneLeafReportBinding };
type LeafLease = { key: string; reports: ReportState; mount: PhoneLeafMountLease;
  activeDecoders: number; disposed: boolean; frameToken: string | null };
type PendingLoad = { controller: AbortController; waiters: Array<Readonly<{ effect: Extract<PhoneStoryEffect, { type: 'load-dependencies' }>; connection: number }>> };
type PlaybackLease = Readonly<{ handle: PhoneRuntimeTimerHandle; attempt: PhoneAttemptKey; stageIndex: number; startedAt: number; durationMs: number; from: number; to: number; connection: number }>;
type ActivationLease = Readonly<{ invocationId: string; attempt: PhoneAttemptKey; surfaceIds: readonly string[]; leaves: readonly LeafLease[]; connection: number }>;

function attemptIdentity(attempt: PhoneAttemptKey): string {
  return [
    attempt.authorityId, attempt.transactionId, attempt.transactionGeneration, attempt.mode, attempt.segmentId ?? '', attempt.direction ?? ''
  ].join('|');
}

const deadlineKey = (attempt: PhoneAttemptKey, operation: string) => `${attemptIdentity(attempt)}|${operation}`;

function inputDirection(event: PhoneRuntimeInputEvent): 'forward' | 'reverse' | null {
  if (event.kind === 'keyboard') {
    if (['ArrowDown', 'PageDown', ' ', 'Enter'].includes(event.key ?? '')) return 'forward';
    if (['ArrowUp', 'PageUp'].includes(event.key ?? '')) return 'reverse';
    return null;
  }
  const delta = event.delta ?? 0; return delta > 0 ? 'forward' : delta < 0 ? 'reverse' : null;
}

function invokePhoneProjector(project: () => PhonePlaneApplyResult): PhonePlaneApplyResult {
  try {
    return project();
  } catch (error) {
    return { records: [], failure: { code: 'presentation-projector-threw',
      message: error instanceof Error ? error.message : String(error), recoverable: true } };
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
    viewport: sampleViewport(environment.readViewport())
  });
  let snapshot = inert.snapshot;
  let connected = false, connection = 0, draining = false;
  let sequence = 0, physicalEpoch = 0, activationSequence = 0, frameSequence = 0;
  let queue: QueuedEvent[] = [];
  let removeHostListener: (() => void) | null = null, sampleFrame: PhoneRuntimeTimerHandle | null = null;
  let playback: PlaybackLease | null = null, planeFrame: PhoneRuntimeTimerHandle | null = null;
  let pendingViewport: Extract<PhoneRuntimeHostEvent, { type: 'viewport' }> | null = null;
  let pendingScroll: Extract<PhoneRuntimeHostEvent, { type: 'scroll' }> | null = null;
  let stableDependencyAttempt: PhoneAttemptKey | null = null;
  const listeners = new Set<() => void>();
  const deadlines = new Map<string, DeadlineLease>();
  const leaves = new Map<string, LeafLease>();
  const reportStates = new Set<ReportState>();
  const dependencyLeases = new Map<string, readonly PhoneDependencyRef[]>();
  const fulfilledLoads = new Set<string>();
  const rejectedLoads = new Set<string>();
  const pendingLoads = new Map<string, PendingLoad>();
  const activations = new Map<string, ActivationLease>();
  const rejectedClosures = new Set<string>();
  let resources: PhoneRuntimeResourceCounts = {
    videos: 0, activeDecoders: 0, canvases: 0, webglContexts: 0 };

  const publish = (): void => {
    environment.observePublish?.(snapshot);
    for (const listener of [...listeners]) listener();
  };

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
    if (playback) environment.cancelFrame(playback.handle); playback = null;
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
    if (snapshot.status !== 'transaction') throw new Error('No active closure resource budget');
    const budget = snapshot.transaction.closure.resourceBudget;
    for (const field of ['videos', 'activeDecoders', 'canvases', 'webglContexts'] as const) {
      if (next[field] > budget[field]) {
        throw new Error(`Phone closure exceeds ${field} budget: ${next[field]} > ${budget[field]}`);
      }
    }
  };

  const updateResources = (
    delta: PhoneRuntimeResourceCounts,
    direction: 1 | -1
  ): void => {
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
    [...leaves.values()].find((lease) => !lease.disposed && lease.reports === state) ?? null
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
    if (!binding || leaves.has(phoneLeafMountKey(binding))) return null;
    const revived: ReportState = { valid: true, binding };
    reportStates.add(revived); return revived;
  };

  function createReportPort(state: ReportState): PhoneLeafReportPort {
    return Object.freeze({
      registerMount: (registration: PhoneLeafMountRegistration) => {
        if (!state.valid) state = reviveLateReportState(state) ?? state;
        if (!state.valid) return;
        const key = phoneLeafMountKey(state.binding);
        if (leaves.has(key)) throw new Error(`Phone leaf mount already registered: ${key}`);
        const mount = presentation.registerLeafMount({ binding: state.binding, registration });
        const expected = phoneIdentitySignature(state.binding.allowedSurfaceIds);
        if (phoneIdentitySignature(mount.surfaceIds) !== expected
          || mount.resources.activeDecoders !== 0) {
          mount.release();
          throw new Error(`Phone presentation lease differs from the closed binding: ${key}`);
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
        const active = snapshot.status === 'transaction' && sameAttempt(snapshot.transaction.attempt, state.binding.attempt)
          ? snapshot.transaction : null;
        if (active) lease.mount.commands.render(active.progress);
        if (active && state.binding.leg === 'target' && mount.resources.videos > 0) {
          if (['boot', 'entry'].includes(active.mode)) {
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
        if (!report.ready || !lease || !lease.mount.surfaceIds.includes(surfaceId)
          || !['image-decoded', 'video-decoded', 'canvas-drawn', 'static-ready']
            .includes(report.kind)) return;
        acceptPreparedProof(state, lease, { surfaceId, report });
      },
      reportFrame: (surfaceId, report) => {
        const lease = mountedLease(state);
        if (!report.presented || !lease || report.token !== lease.frameToken
          || !lease.mount.surfaceIds.includes(surfaceId)) return;
        acceptPreparedProof(state, lease, { surfaceId, report });
      },
      reportProgress: () => undefined,
      reportComplete: () => undefined,
      reportFailure: (failure: PhoneFailure) => {
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
    const batch = invokePhoneActivationBatch(invocationId, credit, requested,
      candidates.map((owner) => ({ owner, commands: owner.mount.commands,
        surfaceIds: phoneActivationSurfaceIds(owner.mount, requested) })), (targets) => {
        const additional = targets.reduce((sum, { owner, surfaceIds }) => (
          sum + Math.max(0, surfaceIds.length - owner.activeDecoders)
        ), 0);
        if (additional > 0) assertResourceBudget({
          ...resources, activeDecoders: resources.activeDecoders + additional
        });
      });
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
    closeReports(lease.reports);
    if (pause) pauseLease(lease, 'superseded');
    leaves.delete(lease.key);
    const state: ReportState = { valid: true, binding: closePhoneLeafReportBinding(binding) };
    reportStates.add(state);
    lease.key = phoneLeafMountKey(state.binding);
    if (leaves.has(lease.key)) throw new Error(`Phone leaf rebind collision: ${lease.key}`);
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

  const rebindForActivation = (
    attempt: PhoneLeafReportBinding['attempt'],
    surfaceIds: readonly string[]
  ): readonly LeafLease[] => {
    const candidates = [...leaves.values()].filter((lease) => (
      !lease.disposed
        && lease.reports.binding.attempt.authorityId === attempt.authorityId
        && (sameAttempt(lease.reports.binding.attempt, attempt)
          || (lease.reports.binding.attempt.transactionGeneration + 1
            === attempt.transactionGeneration))
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
    }
  };

  const dequeue = (): QueuedEvent | null => {
    if (queue.length === 0) return null;
    const selected = queue.reduce((best, item) => {
      const priority = phoneEventPriority(item.event);
      const bestPriority = phoneEventPriority(best.event);
      return priority < bestPriority
        || (priority === bestPriority && item.sequence < best.sequence)
        ? item : best;
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

  const reportLoadFailure = (
    effect: Extract<PhoneStoryEffect, { type: 'load-dependencies' }>,
    reason: string,
    activeConnection: number
  ): void => {
    if (snapshot.status !== 'transaction'
      || !sameAttempt(snapshot.transaction.attempt, effect.attempt)) return;
    const slot = snapshot.transaction.requiredPrepared.find(({ kind }) => (
      kind === 'module-loaded'
    )) ?? snapshot.transaction.requiredPrepared[0];
    if (slot) enqueueFor({
      type: 'failure-reported', slot,
      failure: { code: 'module-load-rejected', message: reason, recoverable: true }
    }, activeConnection);
  };

  const loadDependencies = (
    effect: Extract<PhoneStoryEffect, { type: 'load-dependencies' }>,
    activeConnection: number
  ): void => {
    if (!ports.loadDependencies) return;
    const key = dependencyKey(effect.dependencies);
    if (fulfilledLoads.has(key)) {
      reportLoadedModules(effect, activeConnection);
      return;
    }
    if (rejectedClosures.has(key)
      || effect.dependencies.some((dependency) => rejectedLoads.has(dependency))) {
      reportLoadFailure(effect, 'native module URL already rejected in this Document', activeConnection);
      return;
    }
    const pending = pendingLoads.get(key);
    if (pending) {
      pending.waiters.push({ effect, connection: activeConnection });
      return;
    }
    const controller = new AbortController();
    const load: PendingLoad = {
      controller,
      waiters: [{ effect, connection: activeConnection }]
    };
    pendingLoads.set(key, load);
    const reject = (failure: Readonly<{
      moduleUrl: string; reason: string; dependency?: PhoneDependencyRef;
    }>): void => {
      if (failure.dependency) rejectedLoads.add(failure.dependency);
      else rejectedClosures.add(key);
      void chunkRecovery.reportRejectedChunk({
        authorityId: effect.attempt.authorityId,
        transactionId: effect.attempt.transactionId,
        moduleUrl: failure.moduleUrl,
        dependencies: effect.dependencies,
        reason: failure.reason
      }).catch(() => undefined);
      for (const waiter of load.waiters) {
        reportLoadFailure(waiter.effect, failure.reason, waiter.connection);
      }
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
      if (controller.signal.aborted && (error === controller.signal.reason || (error instanceof Error && error.name === 'AbortError'))) return;
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
        transaction, sampleViewport(snapshot.viewport), snapshot.stableCommit !== null
      );
      const first = request?.required[0];
      if (!request || !first || request.planeRevision !== effect.planeRevision) return;
      const result = invokePhoneProjector(() => (
        request.leg === 'source' ? presentation.applyPlane(request)
          : request.leg === 'rollback' ? presentation.verifyRollback(request)
            : transaction.commitIntent === 'reproject' ? presentation.verifyReproject(request)
              : presentation.verifyVisibleCandidate(request)
      ));
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
        invokeActivation(candidates, attempt, effect.credit, effect.surfaceIds, activeConnection);
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
    if (previous.status !== 'transaction' || next.status !== 'transaction'
      || !sameAttempt(previous.transaction.attempt, next.transaction.attempt)) return;
    const leases = [...leaves.values()].filter((lease) => (
      sameAttempt(lease.reports.binding.attempt, next.transaction.attempt)
    ));
    if (previous.transaction.stageIndex !== next.transaction.stageIndex) {
      for (const lease of leases) {
        if (!ownsConnection(activeConnection)) return;
        const binding: PhoneLeafReportBinding = {
          ...lease.reports.binding,
          stageIndex: next.transaction.stageIndex,
          planeRevision: next.transaction.planeRevision
        };
        renewLeaseBinding(lease, binding);
      }
    }
    if (next.transaction.phase === 'playing'
      && (previous.transaction.phase !== 'playing'
        || previous.transaction.progress !== next.transaction.progress)) {
      for (const lease of leases) {
        if (!ownsConnection(activeConnection)) return;
        lease.mount.commands.render(next.transaction.progress);
      }
    }
    if (next.transaction.phase === 'presenting-target'
      && previous.transaction.phase !== 'presenting-target') {
      const endpoint = next.transaction.attempt.direction === 'reverse' ? 0 : 1;
      for (const lease of leases) {
        if (!ownsConnection(activeConnection)) return;
        lease.mount.commands.settle(endpoint);
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
      const retainPair = transaction.closure.retireAfter === 'pair-exit-or-route-dispose';
      for (const lease of matching) {
        if (retainPair || lease.reports.binding.leg === retainedLeg) closeReports(lease.reports);
        else retireLease(lease, 'closure-retired');
      }
      if (next.stableCommit !== previous.stableCommit) chunkRecovery.markStable(Object.freeze({
        authorityId: next.authorityId,
        sceneId: next.stableCommit.sceneId,
        commitSequence: next.stableCommit.commitSequence
      }));
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
        stableDependencyAttempt = null;
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
      enqueueFor({ type: 'activation-requested', epoch: ++physicalEpoch }, expectedConnection);
    }
  };

  const connect = (): (() => void) => {
    if (connected) throw new Error('Phone story runtime already has an active connection');
    const activeConnection = ++connection;
    connected = true;
    physicalEpoch = 0;
    sequence = 0;
    queue = [];
    notifyResources();
    removeHostListener = environment.subscribeHost(
      (event) => handleHost(event, activeConnection)
    );
    const boot = createPhoneStoryBoot({
      authorityId: environment.nextAuthorityId(),
      request: config.initialEntry,
      viewport: sampleViewport(environment.readViewport())
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
    retry: () => enqueueFor({ type: 'retry-requested' }, connection),
    createLeafReportPort: (binding: PhoneLeafReportBinding) => {
      const closed = closePhoneLeafReportBinding(binding);
      if (!connected || snapshot.status !== 'transaction'
        || !sameAttempt(closed.attempt, snapshot.transaction.attempt)
        || closed.stageIndex !== snapshot.transaction.stageIndex
        || closed.planeRevision !== snapshot.transaction.planeRevision) {
        throw new Error('Phone leaf report binding does not match the active transaction');
      }
      const transaction = snapshot.transaction;
      assertPhoneLeafReportBindingContract(closed, transaction);
      const state: ReportState = { valid: true, binding: closed };
      reportStates.add(state);
      return createReportPort(state);
    }
  });
}
