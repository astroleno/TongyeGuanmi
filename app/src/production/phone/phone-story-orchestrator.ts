import type { SceneId } from '../../story/types';
import {
  phoneEntryPlan,
  phoneRun,
  phoneRunForHold,
  type PhoneEntryPlan,
  type PhoneRunDefinition,
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
import {
  createPhoneStoryProjector
} from './phone-story-projector';
import {
  createPhoneOrchestratedSessionController
} from './phone-orchestrated-session';
import {
  phoneTransitionCrossesBoundary,
  type PhoneIntent
} from './phone-transition-coordinator';
import { createPhoneRunCapabilityRegistry } from './phone-run-capability-registry';
import { resolvePhoneRunLanding } from './phone-run-landing';
import type {
  PhoneRunCapability,
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

let authoritySequence = 0;

function projectFailureEvent(snapshot: PhoneStorySnapshot): PhoneStoryEvent | null {
  if (snapshot.status !== 'transaction') return null;
  const { session } = snapshot;
  const identity: PhoneExecutionIdentity = {
    authorityId: snapshot.authorityId,
    sessionId: session.sessionId,
    generation: session.generation,
    leg: session.operation.legIndex,
    direction: session.operation.direction
  };
  return { ...identity, type: 'FAILED', reason: 'projector-failed' };
}

/**
 * Internal execution engine. Route components construct it only through
 * createPhoneStoryRuntime(); this export remains for focused reducer tests
 * until the Task 9 compatibility removal.
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
  let consumedInputEpoch = 0;
  const entryPlan = phoneEntryPlan(options.initialScene);
  let pendingDirectEntry: Extract<PhoneEntryPlan, { kind: 'cinematic' }> | null =
    entryPlan.kind === 'cinematic' ? entryPlan : null;
  let directEntryActivated = pendingDirectEntry === null;
  let currentSnapshot: PhoneStorySnapshot = createPhoneStorySnapshot({
    authorityId,
    scene: entryPlan.kind === 'cinematic'
      ? phoneRun(entryPlan.run).from
      : entryPlan.scene,
    actualY: options.scrollY()
  });
  let pendingIntent: PhoneIntent | null = null;
  let disposed = false;
  let applyingFailure = false;
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
  const dispatch = (event: PhoneStoryEvent): PhoneStoryReduction => {
    if (disposed) return { snapshot: currentSnapshot, effects: [] };
    const reduction = reducePhoneStorySnapshot(currentSnapshot, event);
    if (reduction.snapshot === currentSnapshot) return reduction;
    if (!applySnapshot(reduction.snapshot, true)) {
      recoverProjectFailure();
      return { snapshot: currentSnapshot, effects: [] };
    }
    return reduction;
  };
  const resolveLanding = (scene: SceneId, fallbackY: number) => {
    const root = projector.rootForScene(scene);
    return root
      ? Math.max(0, options.scrollY() + root.getBoundingClientRect().top)
      : fallbackY;
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

  const cursor = () => selectPhoneStoryCursor(currentSnapshot);
  const scrollMayReconcile = () => {
    if (disposed || sessions.active()) return false;
    const current = cursor();
    if (current.kind === 'transition') return current.run.endsWith('-scroll');
    return current.scene === 'hero'
      || current.scene === 'pattern'
      || current.scene === 'star-map'
      || current.scene === 'aod-animation';
  };
  const startAdjacentRun = (
    definition: PhoneRunDefinition,
    capability: PhoneRunCapability,
    direction: 1 | -1,
    position: number,
    inputEpoch: number | null
  ): boolean => {
    if (!capability.canStart(direction)) return false;
    const session = sessions.activate(
      definition,
      direction,
      position,
      undefined,
      undefined,
      inputEpoch
    );
    if (!session.valid()) return false;
    options.scrollTo(position);
    try {
      if (capability.start(direction, session) === false) {
        session.reportFailure();
        return false;
      }
    } catch {
      session.reportFailure();
      return false;
    }
    return true;
  };
  const beginIntent = (intent: PhoneIntent): boolean => {
    if (
      disposed
      || sessions.active()
      || intent.inputEpoch <= consumedInputEpoch
      || currentSnapshot.status !== 'stable'
    ) return false;
    const definition = phoneRunForHold(currentSnapshot.scene, intent.direction);
    if (!definition) return false;
    const capability = capabilities.get(definition.id);
    if (!capability) return false;
    const position = capability.position(intent.direction);
    if (
      position === null
      || !phoneTransitionCrossesBoundary(
        intent.startY,
        intent.projectedY,
        position,
        intent.direction
      )
    ) return false;
    const anchorY = resolvePhoneRunLanding(
      options.scrollY(),
      position,
      intent.direction
    );
    if (!startAdjacentRun(
      definition,
      capability,
      intent.direction,
      anchorY,
      intent.inputEpoch
    )) return false;
    consumedInputEpoch = intent.inputEpoch;
    pendingIntent = null;
    return true;
  };
  const startDirectEntry = (
    registeredRun: PhoneRunId,
    capability: PhoneRunCapability
  ) => {
    const plan = pendingDirectEntry;
    if (
      !plan
      || !directEntryActivated
      || plan.run !== registeredRun
      || sessions.active()
      || !capability.startAtLeg
      || !capability.canStart(plan.direction)
    ) return;
    const definition = phoneRun(plan.run);
    const session = sessions.activate(
      definition,
      plan.direction,
      options.scrollY(),
      plan.legIndex,
      plan.scene
    );
    if (!session.valid()) return;
    pendingDirectEntry = null;
    try {
      if (capability.startAtLeg(plan.legIndex, session) === false) {
        session.reportFailure();
      }
    } catch {
      session.reportFailure();
    }
  };
  const retainPendingIntent = (intent: PhoneIntent) => {
    if (intent.inputEpoch <= consumedInputEpoch) return;
    if (!pendingIntent || intent.inputEpoch >= pendingIntent.inputEpoch) {
      pendingIntent = intent;
    }
  };
  const startPendingIntent = () => {
    const pending = pendingIntent;
    if (!pending || beginIntent(pending)) return;
    if (pending.inputEpoch <= consumedInputEpoch) pendingIntent = null;
  };

  return {
    getSnapshot: () => currentSnapshot,
    dispatch,
    cursor,
    subscribe(listener) {
      subscribers.add(listener);
      return { dispose: () => subscribers.delete(listener) };
    },
    syncDiagnostics,
    activateDirectEntry() {
      if (disposed) return;
      directEntryActivated = true;
      const plan = pendingDirectEntry;
      if (!plan) return;
      const capability = capabilities.get(plan.run);
      if (capability) startDirectEntry(plan.run, capability);
    },
    requestRun(direction) {
      if (disposed || sessions.active() || currentSnapshot.status !== 'stable') {
        return false;
      }
      const definition = phoneRunForHold(currentSnapshot.scene, direction);
      if (!definition) return false;
      const capability = capabilities.get(definition.id);
      const position = capability?.position(direction) ?? null;
      const anchorY = position === null
        ? null
        : resolvePhoneRunLanding(options.scrollY(), position, direction);
      return Boolean(
        capability
        && anchorY !== null
        && startAdjacentRun(definition, capability, direction, anchorY, null)
      );
    },
    handleIntent(intent) {
      if (disposed) return false;
      const active = sessions.active();
      if (active) {
        options.scrollTo(active.anchorY);
        return true;
      }
      if (intent.inputEpoch <= consumedInputEpoch) return true;
      const candidate = pendingIntent?.inputEpoch === intent.inputEpoch
        && pendingIntent.direction === intent.direction
        ? { ...intent, startY: pendingIntent.startY }
        : intent;
      if (beginIntent(candidate)) return true;
      retainPendingIntent(candidate);
      return false;
    },
    reconcileHold(scene) {
      if (disposed || sessions.active() || currentSnapshot.status !== 'stable') return;
      const before = currentSnapshot;
      dispatch({
        type: 'HOLD_RECONCILED',
        authorityId: currentSnapshot.authorityId,
        scene,
        actualY: options.scrollY()
      });
      if (currentSnapshot === before) syncDiagnostics();
      startPendingIntent();
    },
    reconcileScrollHold(scene) {
      if (!scrollMayReconcile()) return;
      dispatch({
        type: 'HOLD_RECONCILED',
        authorityId: currentSnapshot.authorityId,
        scene,
        actualY: options.scrollY()
      });
      startPendingIntent();
    },
    reconcileScrollRun(runId, direction, rawProgress) {
      if (!scrollMayReconcile()) return;
      dispatch({
        type: 'SCROLL_RUN_RECONCILED',
        authorityId: currentSnapshot.authorityId,
        run: runId,
        direction,
        progress: Math.min(1, Math.max(0, rawProgress)),
        actualY: options.scrollY()
      });
    },
    registerRunCapability(run, ownerId, capability) {
      if (disposed) throw new Error('Disposed phone story');
      const registration = capabilities.register(run, ownerId, capability);
      startDirectEntry(run, capability);
      startPendingIntent();
      return registration;
    },
    registerSurface(registration) {
      if (disposed) throw new Error('Disposed phone story');
      const lease = projector.registerSurface(registration);
      syncDiagnostics();
      return lease;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      capabilities.clear();
      sessions.dispose();
      pendingIntent = null;
      subscribers.clear();
      projector.dispose();
    }
  };
}
