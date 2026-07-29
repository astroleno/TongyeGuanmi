import type { SceneId } from '../../story/types';
import {
  phoneRun,
  phoneRunForHold,
  type PhoneRunId
} from './phone-story-runs';
import {
  createPhoneStorySnapshot,
  reducePhoneStorySnapshot,
  type PhoneExecutionIdentity,
  type PhoneStoryEvent,
  type PhoneStoryReduction,
  type PhoneStorySnapshot
} from './phone-story-state';
import { createPhoneStoryProjector } from './phone-story-projector';
import { createPhoneOrchestratedSessionController } from './phone-orchestrated-session';
import {
  phoneTransitionCrossesBoundary,
  type PhoneIntent,
  type PhoneIntentDisposition
} from './phone-transition-coordinator';
import { createPhoneRunCapabilityRegistry } from './phone-run-capability-registry';
import { resolvePhoneRunLanding } from './phone-run-landing';
import {
  createPhoneScrollCorridorRegistry,
  type PhoneLandingReason
} from './phone-scroll-corridor-registry';
import { phoneScenePresentationTuple } from './phone-presentation-contract';
import { phoneSurfaceSupportsEvidence } from './phone-presentation-evidence';
import type {
  PhoneStoryOrchestrator,
  PhoneStoryOrchestratorOptions
} from './phone-story-orchestrator.types';

export type { PhonePresentationEvidence } from './phone-story-presentation';
export type {
  PhoneCapabilityLease,
  PhoneOrchestratedRunSession,
  PhoneReleaseLease,
  PhoneRunCapability,
  PhoneStoryOrchestrator,
  PhoneStoryOrchestratorOptions,
  PhoneStoryRuntimePort
} from './phone-story-orchestrator.types';
export type { PhoneSurfaceRegistration } from './phone-story-projector';
export type {
  PhoneScrollCorridor,
  PhoneScrollCorridorLease
} from './phone-scroll-corridor-registry';

let authoritySequence = 0;
const DIRECT_ENTRY_PREPARATION_TIMEOUT_MS = 8_000;

type DirectEntryPreparation = {
  key: string;
  controller: AbortController;
  timeout: ReturnType<typeof globalThis.setTimeout>;
  ready: boolean;
  publishing: boolean;
};

function projectFailureEvent(snapshot: PhoneStorySnapshot): PhoneStoryEvent | null {
  if (snapshot.status !== 'transaction') return null;
  const { session } = snapshot;
  const operation = session.operation;
  const identity: PhoneExecutionIdentity = {
    authorityId: snapshot.authorityId,
    sessionId: session.sessionId,
    generation: session.generation,
    leg: operation.legIndex,
    direction: operation.direction
  };
  return { ...identity, type: 'FAILED', reason: 'projector-failed' };
}

function fallbackScene(snapshot: PhoneStorySnapshot): SceneId {
  return snapshot.status === 'stable'
    ? snapshot.scene
    : snapshot.projection.semanticScene;
}

function directEntryEvent(
  authorityId: string,
  target: SceneId,
  source: 'initial' | 'hash' | 'menu' | 'history',
  fallback: SceneId
): Extract<PhoneStoryEvent, { type: 'DIRECT_ENTRY_REQUESTED' }> {
  return {
    type: 'DIRECT_ENTRY_REQUESTED',
    authorityId,
    target,
    source,
    fallbackScene: fallback,
    cinematic: null
  };
}

/**
 * Internal execution engine. Route components construct it only through
 * createPhoneStoryRuntime(); production descendants receive RuntimePort.
 */
export function createPhoneStoryOrchestrator(
  options: PhoneStoryOrchestratorOptions
): PhoneStoryOrchestrator {
  const authorityId = options.authorityId ?? `phone-authority-${++authoritySequence}`;
  const routeRoot = () => typeof options.root === 'function'
    ? options.root()
    : options.root ?? null;
  const projector = options.projector ?? createPhoneStoryProjector({
    authorityId,
    scope: 'formal',
    root: routeRoot
  });
  const capabilities = createPhoneRunCapabilityRegistry();
  const scrollCorridors = createPhoneScrollCorridorRegistry();
  let currentSnapshot: PhoneStorySnapshot = createPhoneStorySnapshot({
    authorityId,
    scene: options.initialScene,
    actualY: options.scrollY()
  });
  let disposed = false;
  let applyingFailure = false;
  let startedCapabilitySession: string | null = null;
  let pendingDirectEntry: Extract<
    PhoneStoryEvent,
    { type: 'DIRECT_ENTRY_REQUESTED' }
  > | null = null;
  const subscribers = new Set<() => void>();
  let directEntryPreparation: DirectEntryPreparation | null = null;

  const directEntryPreparationKey = (
    snapshot: PhoneStorySnapshot
  ): string | null => {
    if (
      snapshot.status !== 'transaction'
      || snapshot.session.operation.run !== null
      || !(
        snapshot.session.phase === 'verifying-target'
        || snapshot.session.phase === 'releasing-layout'
        || snapshot.session.phase === 'measuring-landing'
        || snapshot.session.phase === 'aligning-scroll'
        || snapshot.session.phase === 'verifying-stable'
      )
    ) return null;
    return [
      snapshot.session.sessionId,
      snapshot.session.generation,
      snapshot.session.operation.to
    ].join(':');
  };
  const clearDirectEntryPreparation = () => {
    const preparation = directEntryPreparation;
    if (!preparation) return;
    globalThis.clearTimeout(preparation.timeout);
    preparation.controller.abort();
    directEntryPreparation = null;
  };

  const notify = () => {
    for (const subscriber of subscribers) subscriber();
  };
  const applySnapshot = (
    next: PhoneStorySnapshot,
    notifySubscribers: boolean
  ): boolean => {
    const plan = projector.preflight(next);
    if (!plan) return false;
    try {
      // Project first. Subscribers cannot observe a snapshot whose root roles,
      // edge, checkpoint, lock, or anchor have not been synchronously applied.
      projector.apply(plan);
      currentSnapshot = next;
      if (notifySubscribers) notify();
      return true;
    } catch {
      projector.reapplyCurrent();
      return false;
    }
  };
  const recoverProjectFailure = () => {
    if (applyingFailure) return;
    const failure = projectFailureEvent(currentSnapshot);
    if (!failure) return;
    const recovery = reducePhoneStorySnapshot(currentSnapshot, failure).snapshot;
    if (recovery === currentSnapshot) return;
    applyingFailure = true;
    applySnapshot(recovery, true);
    applyingFailure = false;
  };
  const normalize = (event: PhoneStoryEvent): PhoneStoryEvent => {
    if (event.type !== 'NAVIGATE_REQUESTED') return event;
    if (currentSnapshot.status === 'stable' && currentSnapshot.scene === event.scene) {
      return event;
    }
    return directEntryEvent(
      event.authorityId,
      event.scene,
      event.source,
      fallbackScene(currentSnapshot)
    );
  };
  let afterDispatch: () => void = () => undefined;
  const dispatch = (rawEvent: PhoneStoryEvent): PhoneStoryReduction => {
    if (disposed) return { snapshot: currentSnapshot, effects: [] };
    const event = normalize(rawEvent);
    const reduction = reducePhoneStorySnapshot(currentSnapshot, event);
    if (reduction.snapshot === currentSnapshot) return reduction;
    if (!applySnapshot(reduction.snapshot, true)) {
      if (
        event.type === 'DIRECT_ENTRY_REQUESTED'
        && currentSnapshot.status === 'stable'
      ) pendingDirectEntry = event;
      recoverProjectFailure();
      return { snapshot: currentSnapshot, effects: [] };
    }
    if (event.type === 'DIRECT_ENTRY_REQUESTED') pendingDirectEntry = null;
    if (currentSnapshot.status !== 'transaction') startedCapabilitySession = null;
    afterDispatch();
    return reduction;
  };
  const replayPendingDirectEntry = () => {
    const event = pendingDirectEntry;
    if (disposed || !event || currentSnapshot.status !== 'stable') return;
    pendingDirectEntry = null;
    dispatch(event);
  };
  const resolveLanding = (
    scene: SceneId,
    fallbackY: number,
    mode: 'forward' | 'rollback'
  ) => {
    const snapshot = currentSnapshot;
    if (snapshot.status !== 'transaction') return fallbackY;
    const operation = snapshot.session.operation;
    const reason: PhoneLandingReason = mode === 'rollback'
      ? 'rollback'
      : operation.trigger === 'entry'
        ? 'direct-entry'
        : operation.direction === 1 ? 'forward' : 'reverse';
    const corridorLanding = scrollCorridors.landing(
      snapshot,
      scene,
      reason,
      operation.direction
    );
    if (!operation.run) return corridorLanding ?? fallbackY;
    return resolvePhoneRunLanding({
      policy: phoneRun(operation.run).anchor,
      direction: operation.direction,
      reason,
      currentY: options.scrollY(),
      boundaryY: snapshot.session.anchor.y ?? fallbackY,
      ...(corridorLanding === null ? {} : {
        targetY: corridorLanding,
        compositeY: corridorLanding
      })
    });
  };
  const syncDiagnostics = () => {
    if (disposed) return;
    if (!applySnapshot(currentSnapshot, false)) recoverProjectFailure();
    replayPendingDirectEntry();
    // Route-owned geometry and lazy surface handles may become ready after a
    // direct-entry candidate has already been projected. Re-evaluate the
    // immutable transaction here so cold deep links do not require a later
    // browser scroll sample to enter the normal landing/verification path.
    startPreparedOperation();
  };
  const sessions = createPhoneOrchestratedSessionController({
    getSnapshot: () => currentSnapshot,
    dispatch,
    scrollY: options.scrollY,
    scrollTo: options.scrollTo,
    resolveLanding,
    registerEndpoints(endpoints) {
      projector.registerTransitionEndpoints(endpoints);
      syncDiagnostics();
    },
    clearEndpoints() {
      projector.clearTransitionEndpoints();
      syncDiagnostics();
    },
    scheduleFrame: options.scheduleFrame,
    disposed: () => disposed
  });

  const transactionKey = () => {
    if (currentSnapshot.status !== 'transaction') return null;
    const operation = currentSnapshot.session.operation;
    return [
      currentSnapshot.session.sessionId,
      currentSnapshot.session.generation,
      operation.run ?? 'entry'
    ].join(':');
  };
  const startPreparedOperation = (onlyRun?: PhoneRunId) => {
    const directKey = directEntryPreparationKey(currentSnapshot);
    if (
      directEntryPreparation
      && directEntryPreparation.key !== directKey
    ) clearDirectEntryPreparation();
    if (disposed || currentSnapshot.status !== 'transaction') return;
    const { session } = currentSnapshot;
    const operation = session.operation;
    if (onlyRun && operation.run !== onlyRun) return;

    if (!operation.run) {
      if (
        session.phase !== 'verifying-target'
        && session.phase !== 'verifying-stable'
      ) return;
      const landing = scrollCorridors.landing(
        currentSnapshot,
        operation.to,
        'direct-entry',
        operation.direction
      );
      const existingPresentation = projector.readSurfacePresentation(operation.to);
      // A stable direct entry must wait for route-owned geometry and the
      // selected receiver root before its scene-local preparation can run.
      if (
        landing === null
        || !existingPresentation?.[0]
        || !existingPresentation[1]
        || !existingPresentation[2]
      ) {
        return;
      }
      const activeSession = sessions.resume();
      if (!activeSession?.valid()) return;
      const key = directEntryPreparationKey(currentSnapshot);
      if (!key) return;
      let preparation = directEntryPreparation;
      if (!preparation) {
        const controller = new AbortController();
        const prepared: DirectEntryPreparation = {
          key,
          controller,
          timeout: globalThis.setTimeout(() => {
            if (directEntryPreparation !== prepared) return;
            directEntryPreparation = null;
            controller.abort();
            activeSession.reportFailure();
          }, DIRECT_ENTRY_PREPARATION_TIMEOUT_MS),
          ready: false,
          publishing: false
        };
        directEntryPreparation = prepared;
        const finishPreparation = () => {
          if (
            directEntryPreparation !== prepared
            || controller.signal.aborted
          ) return;
          prepared.ready = true;
          startPreparedOperation();
        };
        const failPreparation = () => {
          if (
            directEntryPreparation !== prepared
            || controller.signal.aborted
          ) return;
          directEntryPreparation = null;
          globalThis.clearTimeout(prepared.timeout);
          activeSession.reportFailure();
        };
        try {
          const result = projector.prepareDirectEntry(operation.to, {
            scene: operation.to,
            sessionId: session.sessionId,
            generation: session.generation,
            signal: controller.signal
          });
          if (result === undefined) finishPreparation();
          else void Promise.resolve(result).then(finishPreparation).catch(failPreparation);
        } catch {
          failPreparation();
        }
        return;
      }
      if (!preparation.ready || preparation.publishing) return;
      const presentation = projector.readSurfacePresentation(operation.to);
      if (!presentation) return;
      const contract = phoneScenePresentationTuple(operation.to);
      const visual = contract[6] === 'visual';
      const coverage = phoneSurfaceSupportsEvidence(presentation, 'coverage');
      const complete = phoneSurfaceSupportsEvidence(presentation, 'direct-entry');
      const needsComplete = session.phase !== 'verifying-target' || visual;
      preparation.publishing = true;
      try {
        if (coverage) {
          activeSession.reportPresentationEvidence('coverage', contract[4]);
        }
        if (needsComplete && complete) {
          activeSession.reportPresentationEvidence('direct-entry', contract[4]);
        }
        const evidenceSatisfied = needsComplete ? complete : coverage;
        if (!evidenceSatisfied) return;
        if (session.phase === 'verifying-target') {
          activeSession.reportTargetPresented();
        } else {
          activeSession.reportStablePresentationVerified();
        }
      } finally {
        if (directEntryPreparation === preparation) preparation.publishing = false;
      }
      return;
    }
    if (session.phase !== 'preparing') return;
    const key = transactionKey();
    if (!key || startedCapabilitySession === key) return;
    const capability = capabilities.get(operation.run);
    if (!capability || !capability.canStart(operation.direction)) return;
    const activeSession = sessions.resume();
    if (!activeSession?.valid()) return;
    startedCapabilitySession = key;
    try {
      const started = operation.trigger === 'entry'
        ? capability.startAtLeg?.(operation.legIndex, activeSession)
        : capability.start(operation.direction, activeSession);
      if (started === false || (operation.trigger === 'entry' && started === undefined
        && !capability.startAtLeg)) {
        activeSession.reportFailure();
      }
    } catch {
      activeSession.reportFailure();
    }
  };
  afterDispatch = () => startPreparedOperation();

  const resolveIntent = ([
    inputEpoch,
    direction,
    startY,
    projectedY
  ]: PhoneIntent): PhoneIntentDisposition => {
    if (disposed) return 'pass-native';
    const snapshot = currentSnapshot;
    if (snapshot.status === 'transaction') {
      return dispatch({
        type: 'INTENT_RESOLVED',
        authorityId: snapshot.authorityId,
        inputEpoch,
        direction,
        run: null,
        anchorY: null,
        boundaryKnown: false,
        crossedBoundary: false
      }).inputDisposition ?? 'block-active-session';
    }
    if (snapshot.status !== 'stable') return 'pass-native';
    const definition = phoneRunForHold(snapshot.scene, direction);
    const boundaryY = definition
      ? scrollCorridors.boundary(snapshot, definition.id, direction)
      : null;
    const boundaryKnown = boundaryY !== null;
    const crossedBoundary = boundaryY !== null && phoneTransitionCrossesBoundary(
      startY,
      projectedY,
      boundaryY,
      direction
    );
    const reason: PhoneLandingReason = direction === 1 ? 'forward' : 'reverse';
    const compositeY = definition
      ? scrollCorridors.landing(snapshot, snapshot.scene, reason, direction)
      : null;
    const anchorY = definition && boundaryY !== null && crossedBoundary
      ? resolvePhoneRunLanding({
          policy: definition.anchor,
          direction,
          reason,
          currentY: options.scrollY(),
          boundaryY,
          ...(compositeY === null ? {} : { compositeY })
        })
      : null;
    const disposition = dispatch({
      type: 'INTENT_RESOLVED',
      authorityId: snapshot.authorityId,
      inputEpoch,
      direction,
      run: definition?.id ?? null,
      anchorY,
      boundaryKnown,
      crossedBoundary
    }).inputDisposition ?? 'pass-native';
    if (disposition === 'claim-boundary') startPreparedOperation(definition?.id);
    return disposition;
  };

  return {
    getSnapshot: () => currentSnapshot,
    dispatch,
    subscribe(listener) {
      subscribers.add(listener);
      return { dispose: () => subscribers.delete(listener) };
    },
    syncDiagnostics,
    resolveIntent,
    scrollCorridors,
    registerRunCapability(run, ownerId, capability) {
      if (disposed) throw new Error('Disposed phone story');
      const registration = capabilities.register(run, ownerId, capability);
      replayPendingDirectEntry();
      startPreparedOperation(run);
      return registration;
    },
    registerSurface(registration) {
      if (disposed) throw new Error('Disposed phone story');
      const lease = projector.registerSurface(registration);
      syncDiagnostics();
      startPreparedOperation();
      return lease;
    },
    registerScrollCorridor(corridor) {
      if (disposed) throw new Error('Disposed phone story');
      const lease = scrollCorridors.register(corridor);
      replayPendingDirectEntry();
      startPreparedOperation();
      return lease;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearDirectEntryPreparation();
      pendingDirectEntry = null;
      capabilities.clear();
      sessions.dispose();
      scrollCorridors.clear();
      subscribers.clear();
      projector.dispose();
    }
  };
}
