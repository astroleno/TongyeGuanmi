import { createPhoneStoryBoot, reducePhoneStory, type PhoneMachineResult,
  type PhoneMachineSnapshot } from './machine';
import { phoneManifest, phoneSceneById } from './manifest';
import { PHONE_MEDIA_ACTIVATION_REJECTED } from './protocol';
import type { PhoneLeafMountRegistration, PhoneLeafReportBinding,
  PhoneLeafReportPort } from './presentation';
import type {
  PhoneAttemptKey, PhoneDependencyRef, PhoneEntryRequest, PhoneFailure,
  PhoneLeafDisposeReason, PhonePreparedEvidenceKind, PhoneStoryEffect,
  PhoneRejectedChunkFailure, PhoneRuntimeLifecycleStep, PhoneRuntimeResourceCounts,
  PhoneStableRecoveryProof, PhoneStoryEvent, PhoneStorySnapshot, PhoneViewportSnapshot
} from './protocol';
export type { PhoneRejectedChunkFailure, PhoneRuntimeLifecycleStep,
  PhoneRuntimeResourceCounts, PhoneStableRecoveryProof } from './protocol';

export type PhoneRuntimeTimerHandle = string | number | Readonly<{ id: string }>;
export type PhoneChunkRecoveryPort = Readonly<{
  reportRejectedChunk(failure: PhoneRejectedChunkFailure): Promise<'reloading' | 'fail-closed'>; markStable(proof: PhoneStableRecoveryProof): void;
}>;

export type PhoneRuntimeEffectPorts = Readonly<{
  loadDependencies?(effect: Extract<PhoneStoryEffect, { type: 'load-dependencies' }>, signal: AbortSignal): Promise<void>;
  releaseDependencies?(dependencies: readonly PhoneDependencyRef[]): void;
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
  | Readonly<{ type: 'scroll'; sample: Extract<PhoneStoryEvent, { type: 'scroll-sampled' }>['sample'] }>
  | Readonly<{ type: 'visibility'; hidden: boolean }>
  | Readonly<{ type: 'pagehide'; persisted: boolean }>
  | Readonly<{ type: 'pageshow'; persisted: boolean }>
  | Readonly<{ type: 'activation'; trusted: boolean }>;

export type PhoneStoryRuntimeEnvironment = Readonly<{
  nextAuthorityId(): string; readViewport(): PhoneViewportSnapshot; activeNow(): number;
  subscribeHost(listener: (event: PhoneRuntimeHostEvent) => void): () => void;
  scheduleTimer(callback: () => void, delayMs: number): PhoneRuntimeTimerHandle;
  cancelTimer(handle: PhoneRuntimeTimerHandle): void; cancelFrame(handle: PhoneRuntimeTimerHandle): void;
  requestFrame(callback: () => void): PhoneRuntimeTimerHandle;
  writeUrl(mode: 'push' | 'replace', pathname: string, hash: string): void;
  observePublish?(snapshot: PhoneStorySnapshot): void;
  performEffect?(effect: PhoneStoryEffect, enqueue: (event: PhoneStoryEvent) => void): void;
  observeLifecycle?(step: PhoneRuntimeLifecycleStep): void; observeResources?(counts: PhoneRuntimeResourceCounts): void;
}>;

export type PhoneStoryRuntimeConfig = Readonly<{
  initialEntry: PhoneEntryRequest; environment: PhoneStoryRuntimeEnvironment; ports?: PhoneRuntimeEffectPorts; chunkRecovery?: PhoneChunkRecoveryPort;
}>;

export type PhoneStoryRuntime = Readonly<{
  getSnapshot(): PhoneMachineSnapshot; subscribe(listener: () => void): () => void;
  connect(): () => void; requestEntry(entry: PhoneEntryRequest): void; retry(): void; createLeafReportPort(binding: PhoneLeafReportBinding): PhoneLeafReportPort;
}>;

type QueuedEvent = Readonly<{ sequence: number; event: PhoneStoryEvent }>;
type DeadlineLease = Readonly<{ key: string; handle: PhoneRuntimeTimerHandle; connection: number }>;
type ReportState = { valid: boolean; binding: PhoneLeafReportBinding };
type LeafLease = {
  key: string; reports: ReportState; registration: PhoneLeafMountRegistration; activeDecoders: number; disposed: boolean };
type PendingLoad = {
  controller: AbortController; waiters: Array<Readonly<{ effect: Extract<PhoneStoryEffect, { type: 'load-dependencies' }>;
    connection: number }>> };
type PlaybackLease = Readonly<{
  handle: PhoneRuntimeTimerHandle; attempt: PhoneAttemptKey; stageIndex: number; startedAt: number;
  durationMs: number; from: number; to: number; connection: number }>;

function closeBinding(binding: PhoneLeafReportBinding): PhoneLeafReportBinding {
  const { attempt, allowedReports, allowedSurfaceIds, ...identity } = binding; return Object.freeze({ ...identity, attempt: Object.freeze({ ...attempt }),
    allowedReports: Object.freeze([...allowedReports]), allowedSurfaceIds: Object.freeze([...allowedSurfaceIds]) });
}

const closeRegistration = (registration: PhoneLeafMountRegistration): PhoneLeafMountRegistration =>
  Object.freeze({ ...registration, surfaces: Object.freeze(registration.surfaces.map((surface) => Object.freeze({ ...surface }))) });

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

export function phoneEventPriority(event: PhoneStoryEvent): number {
  switch (event.type) {
    case 'disconnect-requested': return 0;
    case 'page-hidden': return 1;
    case 'viewport-sampled': return event.change === 'toolbar' ? 4 : 1;
    case 'failure-reported': return event.slot.attempt.mode === 'rollback' ? 1 : 5;
    case 'deadline-fired': return event.attempt?.mode === 'rollback' ? 1 : 5;
    case 'evidence-reported':
    case 'prepared-reported':
    case 'frame-reported': return event.slot.attempt.mode === 'rollback' ? 2 : 5;
    case 'terminal-fault': return 2;
    case 'entry-requested': return 3;
    case 'page-shown': return 4;
    case 'physical-intent':
    case 'segment-requested':
    case 'leg-intent':
    case 'activation-requested':
    case 'scroll-sampled': return 6;
    default: return 5;
  }
}

export function createPhoneStoryRuntime(config: PhoneStoryRuntimeConfig): PhoneStoryRuntime {
  const { environment } = config, ports = config.ports ?? {};
  const chunkRecovery = Object.freeze(config.chunkRecovery ?? {
    reportRejectedChunk: async () => 'fail-closed' as const, markStable: () => undefined });
  const inert = createPhoneStoryBoot({
    authorityId: 'disconnected-phone-authority', request: config.initialEntry,
    viewport: environment.readViewport()
  });
  let snapshot = inert.snapshot;
  let connected = false, connection = 0, draining = false;
  let sequence = 0, physicalEpoch = 0;
  let queue: QueuedEvent[] = [];
  let removeHostListener: (() => void) | null = null, sampleFrame: PhoneRuntimeTimerHandle | null = null;
  let playback: PlaybackLease | null = null;
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
    for (const lease of [...deadlines.values()]) {
      if (predicate(lease)) cancelDeadline(lease.key);
    }
  };

  const activeDeadlineKey = (): string | null => {
    if (snapshot.status !== 'transaction' || !snapshot.transaction.deadline
      || snapshot.transaction.deadline.suspended) return null;
    return deadlineKey(snapshot.transaction.attempt, snapshot.transaction.deadline.operation);
  };

  const syncDeadlines = (): void => {
    const active = activeDeadlineKey();
    cancelDeadlines((lease) => lease.key !== active);
  };

  const notifyResources = (): void => {
    resources = Object.freeze({ ...resources });
    environment.observeResources?.(resources);
  };

  const sameAttempt = (left: PhoneAttemptKey, right: PhoneAttemptKey): boolean => (
    left.authorityId === right.authorityId && left.transactionId === right.transactionId
      && left.transactionGeneration === right.transactionGeneration && left.mode === right.mode
      && left.sceneId === right.sceneId && left.segmentId === right.segmentId
      && left.direction === right.direction
  );

  const cancelPlayback = (): void => {
    if (playback) environment.cancelFrame(playback.handle); playback = null;
  };

  const syncPlayback = (activeConnection: number): void => {
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
      const handle = environment.requestFrame(() => {
        const lease = playback;
        if (!lease || lease.handle !== handle || lease.connection !== activeConnection) return;
        const ratio = Math.min(1, Math.max(0,
          (environment.activeNow() - lease.startedAt) / lease.durationMs));
        enqueueFor({ type: 'transition-progressed', attempt: lease.attempt,
          progress: lease.from + (lease.to - lease.from) * ratio }, activeConnection);
        if (ratio < 1 && playback?.handle === handle) tick();
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

  const leaseKey = (binding: PhoneLeafReportBinding): string => [
    binding.leg, binding.stageIndex, [...binding.allowedSurfaceIds].sort().join(',')
  ].join('|');

  const resourceDelta = (registration: PhoneLeafMountRegistration) => ({
    videos: registration.surfaces.filter(({ kind }) => kind === 'video').length,
    activeDecoders: 0,
    canvases: registration.surfaces.filter(({ kind }) => kind.startsWith('canvas')).length,
    webglContexts: registration.surfaces.filter(({ kind }) => kind === 'canvas-webgl').length
  });

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

  const isRegistered = (state: ReportState): boolean => (
    [...leaves.values()].some((lease) => !lease.disposed && lease.reports === state)
  );

  const activeSlot = (
    state: ReportState,
    kind: PhonePreparedEvidenceKind
  ) => {
    if (!state.valid || !isRegistered(state) || snapshot.status !== 'transaction'
      || !sameAttempt(state.binding.attempt, snapshot.transaction.attempt)
      || !state.binding.allowedReports.includes(kind)) return null;
    return snapshot.transaction.requiredPrepared.find((slot) => (
      slot.leg === state.binding.leg && slot.kind === kind
        && slot.stageIndex === state.binding.stageIndex
        && slot.planeRevision === state.binding.planeRevision
    )) ?? null;
  };

  const registeredSurface = (state: ReportState, surfaceId: string): boolean => (
    state.valid && isRegistered(state) && state.binding.allowedSurfaceIds.includes(surfaceId)
  );

  const controlsTransition = (state: ReportState): boolean => (
    state.valid && isRegistered(state) && state.binding.leg === 'effect'
      && snapshot.status === 'transaction'
      && snapshot.transaction.mode === 'segment'
      && sameAttempt(state.binding.attempt, snapshot.transaction.attempt)
      && state.binding.stageIndex === snapshot.transaction.stageIndex
  );

  const closeReports = (state: ReportState, observe = true): void => {
    if (!state.valid) return;
    state.valid = false;
    reportStates.delete(state);
    if (observe) environment.observeLifecycle?.('invalidate');
  };

  function createReportPort(state: ReportState): PhoneLeafReportPort {
    return Object.freeze({
      registerMount: (registration: PhoneLeafMountRegistration) => {
        if (!state.valid) return;
        registration = closeRegistration(registration);
        const key = leaseKey(state.binding);
        if (leaves.has(key)) throw new Error(`Phone leaf mount already registered: ${key}`);
        const allowed = [...state.binding.allowedSurfaceIds].sort();
        const actual = registration.surfaces.map(({ id }) => id).sort();
        const delta = resourceDelta(registration);
        const sceneId = snapshot.status !== 'transaction' || state.binding.leg === 'effect'
          ? null : state.binding.leg === 'source'
            ? snapshot.transaction.sourceSceneId : snapshot.transaction.candidateSceneId;
        const expected = sceneId ? phoneSceneById(sceneId).directEntry.closure.resourceBudget : null;
        if (new Set(actual).size !== actual.length || actual.join('|') !== allowed.join('|')
          || registration.surfaces.some(({ id, kind }) => (
            id.includes('video') && kind !== 'video'
              || id.includes('canvas') && !kind.startsWith('canvas')))
          || expected && (['videos', 'canvases', 'webglContexts'] as const)
            .some((field) => delta[field] !== expected[field])) {
          throw new Error(`Phone leaf surfaces differ from the closed binding: ${key}`);
        }
        updateResources(delta, 1);
        const lease: LeafLease = {
          key, reports: state, registration, activeDecoders: 0, disposed: false
        };
        leaves.set(key, lease);
        if (snapshot.status === 'transaction'
          && sameAttempt(snapshot.transaction.attempt, state.binding.attempt)
          && ['boot', 'entry'].includes(snapshot.transaction.mode)
          && state.binding.leg === 'target' && delta.videos > 0) {
          invokeActivation([lease], snapshot.transaction.attempt, 'direct-muted-autoplay');
        }
      },
      reportPrepared: (surfaceId, report) => {
        if (!report.ready || !registeredSurface(state, surfaceId)) return;
        const slot = activeSlot(state, report.kind);
        if (slot) enqueueFor({
          type: 'evidence-reported', slot,
          report: { kind: report.kind, token: report.token, accepted: true,
            ...(report.detail === undefined ? {} : { detail: report.detail }) }
        }, connection);
      },
      reportFrame: (surfaceId, report) => {
        if (!report.presented || !registeredSurface(state, surfaceId)) return;
        const kind = state.binding.allowedReports.find((candidate) => (
          candidate === 'canvas-drawn' || candidate === 'video-decoded'
            || candidate === 'image-decoded'
        ));
        const slot = kind ? activeSlot(state, kind as PhonePreparedEvidenceKind) : null;
        if (slot) enqueueFor({
          type: 'evidence-reported', slot,
          report: { kind: slot.kind, token: report.token, accepted: true }
        }, connection);
      },
      reportProgress: (progress) => {
        if (controlsTransition(state)) enqueueFor({
          type: 'transition-progressed', progress, attempt: state.binding.attempt
        }, connection);
      },
      reportComplete: () => {
        if (controlsTransition(state)) enqueueFor({
          type: 'transition-completed', attempt: state.binding.attempt
        }, connection);
      },
      reportFailure: (failure: PhoneFailure) => {
        if (!state.valid || !isRegistered(state) || snapshot.status !== 'transaction') return;
        if (failure.code === PHONE_MEDIA_ACTIVATION_REJECTED) {
          if (![...leaves.values()].some((lease) => (
            lease.reports === state && activationVideos(lease).length > 0))) return;
          enqueueFor({
            type: 'activation-settled', invoked: false, attempt: state.binding.attempt
          }, connection);
          return;
        }
        const slot = [...snapshot.transaction.requiredPrepared,
          ...snapshot.transaction.requiredFinal].find((candidate) => (
          candidate.leg === state.binding.leg
        ));
        if (slot) enqueueFor({ type: 'failure-reported', slot, failure }, connection);
      }
    });
  }

  const activationVideos = (lease: LeafLease, requested?: readonly string[]) => (
    lease.registration.surfaces.filter(({ id, kind }) => (
      kind === 'video' && (!requested || requested.includes(id))
    )).map(({ id }) => id)
  );

  function invokeActivation(
    candidates: readonly LeafLease[],
    attempt: PhoneAttemptKey,
    credit: 'physical-epoch' | 'direct-muted-autoplay',
    requested?: readonly string[]
  ): void {
    const calls = candidates.map((lease) => ({ lease, ids: activationVideos(lease, requested) }))
      .filter(({ ids }) => ids.length > 0);
    const additionalDecoders = calls.reduce((sum, { lease, ids }) => (
      sum + Math.max(0, ids.length - lease.activeDecoders)
    ), 0);
    if (additionalDecoders > 0) assertResourceBudget({
      ...resources, activeDecoders: resources.activeDecoders + additionalDecoders
    });
    const invocations = calls.map(({ lease, ids }) => {
      const result = lease.registration.commands.activate({
        invocationId: `${attempt.transactionId}:activation:${sequence + 1}`,
        surfaceIds: ids,
        credit
      });
      if (result.invoked && lease.activeDecoders < ids.length) {
        const activated = ids.length - lease.activeDecoders;
        lease.activeDecoders = ids.length;
        updateResources({
          videos: 0, activeDecoders: activated, canvases: 0, webglContexts: 0
        }, 1);
      }
      return result.invoked;
    });
    const invoked = invocations.length > 0 && invocations.every(Boolean);
    enqueueFor({ type: 'activation-settled', invoked, attempt }, connection);
  }

  const pauseLease = (lease: LeafLease, reason: Parameters<
    PhoneLeafMountRegistration['commands']['pause']
  >[0]): void => {
    lease.registration.commands.pause(reason);
    environment.observeLifecycle?.('pause');
    if (lease.activeDecoders > 0) {
      updateResources({
        videos: 0, activeDecoders: lease.activeDecoders, canvases: 0, webglContexts: 0
      }, -1);
      lease.activeDecoders = 0;
    }
  };

  const retireLease = (
    lease: LeafLease,
    reason: PhoneLeafDisposeReason,
    paused = false
  ): void => {
    if (lease.disposed) return;
    closeReports(lease.reports);
    if (!paused) {
      pauseLease(lease, 'outside-closure');
    }
    lease.registration.commands.dispose(reason);
    environment.observeLifecycle?.('dispose');
    lease.disposed = true;
    leaves.delete(lease.key);
    environment.observeLifecycle?.('unregister');
    const delta = resourceDelta(lease.registration);
    updateResources({ ...delta,
      activeDecoders: lease.activeDecoders }, -1);
    environment.observeLifecycle?.('release');
  };

  const invalidateAttempt = (attempt: PhoneAttemptKey): void => {
    for (const state of [...reportStates]) {
      if (sameAttempt(state.binding.attempt, attempt)) closeReports(state);
    }
    for (const lease of [...leaves.values()]) {
      if (!sameAttempt(lease.reports.binding.attempt, attempt)) continue;
      if (lease.reports.binding.leg !== 'source' && lease.reports.binding.leg !== 'rollback') {
        retireLease(lease, 'generation-replaced');
      }
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
        && activationVideos(lease, surfaceIds).length > 0
    ));
    for (const lease of candidates) {
      if (sameAttempt(lease.reports.binding.attempt, attempt)) continue;
      closeReports(lease.reports);
      const binding: PhoneLeafReportBinding = {
        ...lease.reports.binding, attempt, planeRevision: null
      };
      const state: ReportState = { valid: true, binding: closeBinding(binding) };
      reportStates.add(state);
      lease.reports = state;
      pauseLease(lease, 'superseded');
      lease.registration.commands.rebind({
        reports: createReportPort(state),
        frameToken: `${attempt.transactionId}:frame:${attempt.transactionGeneration}`
      });
    }
    return candidates;
  };

  const rebindRetainedClosure = (
    effect: Extract<PhoneStoryEffect, { type: 'load-dependencies' }>
  ): void => {
    if (snapshot.status !== 'transaction'
      || !sameAttempt(snapshot.transaction.attempt, effect.attempt)) return;
    const transaction = snapshot.transaction;
    const idsFor = (role: 'source' | 'effect' | 'receiver') => new Set(
      transaction.closure.mount.filter((mount) => (
        mount.startsWith(`${role}:`) && !mount.startsWith(`${role}:root:`)
      )).map((mount) => mount.slice(mount.indexOf(':') + 1))
    );
    const sourceIds = idsFor('source');
    const effectIds = idsFor('effect');
    const receiverIds = idsFor('receiver');
    for (const lease of [...leaves.values()]) {
      if (lease.disposed || sameAttempt(lease.reports.binding.attempt, transaction.attempt)) continue;
      const actual = lease.registration.surfaces.map(({ id }) => id);
      const inRole = (ids: ReadonlySet<string>) => (
        actual.length > 0 && actual.every((id) => ids.has(id))
      );
      const leg = inRole(sourceIds) ? 'source'
        : inRole(effectIds) ? 'effect'
          : inRole(receiverIds) ? (transaction.mode === 'rollback' ? 'rollback' : 'target')
            : null;
      if (!leg) {
        retireLease(lease, 'closure-retired');
        continue;
      }
      closeReports(lease.reports);
      pauseLease(lease, 'superseded');
      leaves.delete(lease.key);
      const binding: PhoneLeafReportBinding = {
        attempt: transaction.attempt,
        stageIndex: transaction.stageIndex,
        leg,
        allowedReports: transaction.requiredPrepared.filter(({ leg: slotLeg }) => (
          slotLeg === leg
        )).map(({ kind }) => kind),
        allowedSurfaceIds: actual,
        planeRevision: transaction.planeRevision
      };
      const state: ReportState = { valid: true, binding: closeBinding(binding) };
      reportStates.add(state);
      lease.reports = state;
      lease.key = leaseKey(binding);
      if (leaves.has(lease.key)) throw new Error(`Phone leaf rebind collision: ${lease.key}`);
      leaves.set(lease.key, lease);
      lease.registration.commands.rebind({
        reports: createReportPort(state),
        frameToken: `${transaction.attempt.transactionId}:frame:${transaction.attempt.transactionGeneration}`
      });
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

  const dependencyKey = (dependencies: readonly PhoneDependencyRef[]) => (
    [...dependencies].sort().join('|')
  );

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
    if (effect.dependencies.some((dependency) => rejectedLoads.has(dependency))) {
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
    void ports.loadDependencies(effect, controller.signal).then(() => {
      if (pendingLoads.get(key) !== load) return;
      pendingLoads.delete(key);
      fulfilledLoads.add(key);
      for (const waiter of load.waiters) {
        reportLoadedModules(waiter.effect, waiter.connection);
      }
    }).catch((error: unknown) => {
      if (pendingLoads.get(key) !== load) return;
      pendingLoads.delete(key);
      if (controller.signal.aborted) return;
      for (const dependency of effect.dependencies) rejectedLoads.add(dependency);
      const reason = error instanceof Error ? error.message : String(error);
      void chunkRecovery.reportRejectedChunk({
        authorityId: effect.attempt.authorityId,
        transactionId: effect.attempt.transactionId,
        moduleUrl: effect.dependencies[0] ?? 'unknown-phone-module',
        dependencies: effect.dependencies,
        reason
      }).catch(() => undefined);
      for (const waiter of load.waiters) {
        reportLoadFailure(waiter.effect, reason, waiter.connection);
      }
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

  const interpret = (effect: PhoneStoryEffect, activeConnection: number): void => {
    if (!connected || activeConnection !== connection) return;
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
        invokeActivation(candidates, attempt, effect.credit, effect.surfaceIds);
      }
    } else if (effect.type === 'show-activation-cta') {
      const hasRegisteredVideo = [...leaves.values()].some((lease) => (
        !lease.disposed && sameAttempt(lease.reports.binding.attempt, effect.attempt)
          && activationVideos(lease).length > 0
      ));
      observedEffect = { ...effect, enabled: effect.enabled && hasRegisteredVideo };
    } else if (effect.type === 'push-url' || effect.type === 'replace-url') {
      environment.writeUrl(
        effect.type === 'push-url' ? 'push' : 'replace',
        effect.pathname,
        effect.hash
      );
    } else if (effect.type === 'defer-entry') {
      enqueueFor({ type: 'entry-requested', request: effect.request }, activeConnection);
    }
    environment.performEffect?.(
      observedEffect, (event) => enqueueFor(event, activeConnection)
    );
  };

  const driveCommandHandles = (
    previous: PhoneMachineSnapshot,
    next: PhoneMachineSnapshot
  ): void => {
    if (previous.status !== 'transaction' || next.status !== 'transaction'
      || !sameAttempt(previous.transaction.attempt, next.transaction.attempt)) return;
    const leases = [...leaves.values()].filter((lease) => (
      sameAttempt(lease.reports.binding.attempt, next.transaction.attempt)
    ));
    if (previous.transaction.stageIndex !== next.transaction.stageIndex) {
      for (const lease of leases) {
        closeReports(lease.reports);
        leaves.delete(lease.key);
        const binding: PhoneLeafReportBinding = {
          ...lease.reports.binding,
          stageIndex: next.transaction.stageIndex,
          planeRevision: next.transaction.planeRevision
        };
        const state: ReportState = { valid: true, binding: closeBinding(binding) };
        reportStates.add(state);
        lease.reports = state;
        lease.key = leaseKey(binding);
        if (leaves.has(lease.key)) throw new Error(`Phone leaf stage collision: ${lease.key}`);
        leaves.set(lease.key, lease);
        lease.registration.commands.rebind({
          reports: createReportPort(state),
          frameToken: `${next.transaction.attempt.transactionId}:stage:${next.transaction.stageIndex}`
        });
      }
    }
    if (next.transaction.phase === 'playing'
      && (previous.transaction.phase !== 'playing'
        || previous.transaction.progress !== next.transaction.progress)) {
      for (const lease of leases) lease.registration.commands.render(next.transaction.progress);
    }
    if (next.transaction.phase === 'presenting-target'
      && previous.transaction.phase !== 'presenting-target') {
      const endpoint = next.transaction.attempt.direction === 'reverse' ? 0 : 1;
      for (const lease of leases) lease.registration.commands.settle(endpoint);
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
        ? [...phoneSceneById(next.stableCommit.sceneId).surfaces].sort().join('|') : null;
      for (const lease of matching) {
        const leaseSurfaces = lease.registration.surfaces.map(({ id }) => id).sort().join('|');
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
    if (snapshot !== previous) publish();
    syncDeadlines();
    driveCommandHandles(previous, snapshot);
    syncPlayback(activeConnection);
    for (const effect of result.effects) interpret(effect, activeConnection);
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
      viewport: viewport.viewport,
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
    removeHostListener?.();
    removeHostListener = null;
    cancelDeadlines(() => true);
    cancelPlayback();
    cancelSamples();
    for (const load of pendingLoads.values()) load.controller.abort();
    pendingLoads.clear();
    for (const lease of [...leaves.values()]) retireLease(lease, 'route-dispose');
    for (const state of [...reportStates]) closeReports(state, false);
    for (const dependencies of dependencyLeases.values()) {
      ports.releaseDependencies?.(dependencies);
    }
    dependencyLeases.clear();
    stableDependencyAttempt = null;
    listeners.clear();
    queue = [];
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
          : { type: 'physical-intent', direction, epoch }, expectedConnection);
      }
    } else if (event.type === 'entry') {
      enqueueFor({ type: 'entry-requested', request: event.request }, expectedConnection);
    } else if (event.type === 'viewport') {
      if (event.change === 'toolbar') {
        pendingViewport = event;
        scheduleSamples(expectedConnection);
      } else {
        pendingViewport = null;
        if (sampleFrame !== null && pendingScroll === null) {
          environment.cancelFrame(sampleFrame);
          sampleFrame = null;
        }
        enqueueFor({ type: 'viewport-sampled', viewport: event.viewport, change: event.change },
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
        : { type: 'page-shown', persisted: false, viewport: environment.readViewport() },
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
        viewport: environment.readViewport() }, expectedConnection);
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
      viewport: environment.readViewport()
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
      const closed = closeBinding(binding);
      if (!connected || snapshot.status !== 'transaction'
        || !sameAttempt(closed.attempt, snapshot.transaction.attempt)
        || closed.stageIndex !== snapshot.transaction.stageIndex
        || closed.planeRevision !== snapshot.transaction.planeRevision) {
        throw new Error('Phone leaf report binding does not match the active transaction');
      }
      const transaction = snapshot.transaction;
      const expectedKinds = [...transaction.requiredPrepared,
        ...transaction.requiredFinal].filter(({ leg }) => leg === closed.leg)
        .map(({ kind }) => kind);
      if (closed.allowedReports.some((kind) => !expectedKinds.includes(kind))) {
        throw new Error('Phone leaf report binding exceeds the active evidence contract');
      }
      const segment = transaction.attempt.segmentId
        ? phoneManifest.segments.find(({ id }) => id === transaction.attempt.segmentId)
        : null;
      const sceneId = closed.leg === 'source'
        ? transaction.sourceSceneId : transaction.candidateSceneId;
      const expectedSurfaces = closed.leg === 'effect'
        ? segment && transaction.attempt.direction
          ? [segment[transaction.attempt.direction].effectSurface] : []
        : sceneId ? [...phoneSceneById(sceneId).surfaces] : [];
      if (expectedSurfaces.sort().join('|') !== [...closed.allowedSurfaceIds].sort().join('|')) {
        throw new Error('Phone leaf report binding differs from manifest surfaces');
      }
      const state: ReportState = { valid: true, binding: closed };
      reportStates.add(state);
      return createReportPort(state);
    }
  });
}
