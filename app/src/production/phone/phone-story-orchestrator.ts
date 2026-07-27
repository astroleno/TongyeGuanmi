import type { SceneId } from '../../story/types';
import {
  phoneEntryPlan,
  phoneRun,
  phoneRunForHold,
  type PhoneRunId
} from './phone-story-runs';
import {
  createPhoneStorySnapshot,
  reducePhoneStorySnapshot,
  selectPhoneStoryCursor,
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
  const plan = phoneEntryPlan(target);
  return {
    type: 'DIRECT_ENTRY_REQUESTED',
    authorityId,
    target,
    source,
    fallbackScene: fallback,
    cinematic: plan.kind === 'cinematic'
      ? { run: plan.run, direction: plan.direction, legIndex: plan.legIndex }
      : null
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
  const initialPlan = phoneEntryPlan(options.initialScene);
  let currentSnapshot: PhoneStorySnapshot = createPhoneStorySnapshot({
    authorityId,
    scene: initialPlan.kind === 'cinematic'
      ? phoneRun(initialPlan.run).from
      : initialPlan.scene,
    actualY: options.scrollY()
  });
  let disposed = false;
  let applyingFailure = false;
  let startedCapabilitySession: string | null = null;
  const subscribers = new Set<() => void>();

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
      recoverProjectFailure();
      return { snapshot: currentSnapshot, effects: [] };
    }
    if (currentSnapshot.status !== 'transaction') startedCapabilitySession = null;
    afterDispatch();
    return reduction;
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
      ...(corridorLanding === null ? {} : { compositeY: corridorLanding })
    });
  };
  const syncDiagnostics = () => {
    if (disposed) return;
    if (!applySnapshot(currentSnapshot, false)) recoverProjectFailure();
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
    if (disposed || currentSnapshot.status !== 'transaction') return;
    const { session } = currentSnapshot;
    const operation = session.operation;
    if (onlyRun && operation.run !== onlyRun) return;

    if (!operation.run) {
      if (session.phase !== 'verifying-target') return;
      const landing = scrollCorridors.landing(
        currentSnapshot,
        operation.to,
        'direct-entry',
        operation.direction
      );
      // A stable direct entry must wait for its route-owned geometry instead
      // of publishing a target hold before the document target exists.
      if (landing === null || !projector.hasPresentedSurface(operation.to)) {
        return;
      }
      sessions.resume()?.reportTargetPresented();
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

  const resolveIntent = (intent: PhoneIntent): PhoneIntentDisposition => {
    if (disposed) return 'pass-native';
    const snapshot = currentSnapshot;
    if (snapshot.status === 'transaction') {
      return dispatch({
        type: 'INTENT_RESOLVED',
        authorityId: snapshot.authorityId,
        inputEpoch: intent.inputEpoch,
        direction: intent.direction,
        run: null,
        anchorY: null,
        boundaryKnown: false,
        crossedBoundary: false
      }).inputDisposition ?? 'block-active-session';
    }
    if (snapshot.status !== 'stable') return 'pass-native';
    const definition = phoneRunForHold(snapshot.scene, intent.direction);
    const boundaryY = definition
      ? scrollCorridors.boundary(snapshot, definition.id, intent.direction)
      : null;
    const boundaryKnown = boundaryY !== null;
    const crossedBoundary = boundaryY !== null && phoneTransitionCrossesBoundary(
      intent.startY,
      intent.projectedY,
      boundaryY,
      intent.direction
    );
    const reason: PhoneLandingReason = intent.direction === 1 ? 'forward' : 'reverse';
    const compositeY = definition
      ? scrollCorridors.landing(snapshot, snapshot.scene, reason, intent.direction)
      : null;
    const anchorY = definition && boundaryY !== null && crossedBoundary
      ? resolvePhoneRunLanding({
          policy: definition.anchor,
          direction: intent.direction,
          reason,
          currentY: options.scrollY(),
          boundaryY,
          ...(compositeY === null ? {} : { compositeY })
        })
      : null;
    const disposition = dispatch({
      type: 'INTENT_RESOLVED',
      authorityId: snapshot.authorityId,
      inputEpoch: intent.inputEpoch,
      direction: intent.direction,
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
    cursor: () => selectPhoneStoryCursor(currentSnapshot),
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
      startPreparedOperation();
      return lease;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      capabilities.clear();
      sessions.dispose();
      scrollCorridors.clear();
      subscribers.clear();
      projector.dispose();
    }
  };
}
