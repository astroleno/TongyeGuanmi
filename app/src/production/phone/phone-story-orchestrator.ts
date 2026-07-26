import type { SceneId } from '../../story/types';
import {
  phoneEntryPlan,
  phoneRun,
  phoneRunForHold,
  phoneScrollRun,
  type PhoneEntryPlan,
  type PhoneRunDefinition,
  type PhoneRunId,
  type PhoneScrollRunId
} from './phone-story-runs';
import {
  createPhoneStoryHold,
  type PhoneStoryCursor,
  type PhoneStoryTransition
} from './phone-story-state';
import {
  createPhoneOrchestratorPublisher
} from './phone-orchestrator-publisher';
import {
  createPhoneOrchestratedSessionController,
  type PhoneActiveRun
} from './phone-orchestrated-session';
import {
  phoneTransitionCrossesBoundary,
  type PhoneIntent
} from './phone-transition-coordinator';
import { createPhoneRunCapabilityRegistry } from './phone-run-capability-registry';
import { resolvePhoneRunLanding } from './phone-run-landing';
import type {
  PhoneRunCapability,
  PhoneStableSceneAdapter,
  PhoneStoryOrchestrator,
  PhoneStoryOrchestratorOptions
} from './phone-story-orchestrator.types';

export type { PhonePresentationEvidence } from './phone-story-presentation';
export type {
  PhoneCapabilityLease,
  PhoneOrchestratedRunSession,
  PhoneRunCapability,
  PhoneStableSceneAdapter,
  PhoneStoryOrchestrator,
  PhoneStoryOrchestratorOptions
} from './phone-story-orchestrator.types';

export function createPhoneStoryOrchestrator(
  options: PhoneStoryOrchestratorOptions
): PhoneStoryOrchestrator {
  const capabilities = createPhoneRunCapabilityRegistry();
  let consumedInputEpoch = 0;
  const entryPlan = phoneEntryPlan(options.initialScene);
  let pendingDirectEntry: Extract<
    PhoneEntryPlan,
    { kind: 'cinematic' }
  > | null = entryPlan.kind === 'cinematic' ? entryPlan : null;
  let directEntryActivated = pendingDirectEntry === null;
  let current: PhoneStoryCursor = createPhoneStoryHold(
    entryPlan.kind === 'cinematic'
      ? phoneRun(entryPlan.run).from
      : entryPlan.scene
  );
  let pendingIntent: PhoneIntent | null = null;
  let disposed = false;
  let scrollGeneration = 0;
  let scrollRun: PhoneScrollRunId | null = null;
  let scrollDirection: 1 | -1 = 1;
  const subscribers = new Set<(cursor: PhoneStoryCursor) => void>();
  const stableSceneAdapters = new Map<SceneId, PhoneStableSceneAdapter>();
  const resolveLanding = (scene: SceneId, fallbackY: number) => {
    const root = stableSceneAdapters.get(scene)?.root() as HTMLElement | null;
    return root ? Math.max(0, options.scrollY() + root.getBoundingClientRect().top) : fallbackY;
  };
  const commitStableScene = (scene: SceneId) => {
    for (const [registeredScene, adapter] of stableSceneAdapters) {
      const root = adapter.root();
      if (!root) continue;
      root.dataset.phoneSurfaceRole = registeredScene === scene
        ? 'native-stable'
        : 'native-under-stage';
      delete root.dataset.phoneBoundarySession;
      delete root.dataset.phoneBoundaryGeneration;
      delete root.dataset.phoneBoundaryEndpoint;
    }
    stableSceneAdapters.get(scene)?.commit();
  };
  let getActiveRun = (): PhoneActiveRun | null => null;
  const presentationSceneIsCurrent = (scene: SceneId) => {
    if (
      pendingDirectEntry?.scene === scene
      || getActiveRun()?.directScene === scene
    ) {
      return true;
    }
    if (current.kind === 'hold') return current.scene === scene;
    return current.from === scene || current.to === scene;
  };
  const publisher = createPhoneOrchestratorPublisher({
    root: options.root,
    onCursor: options.onCursor,
    onPresentation: options.onPresentation,
    onLockChange: options.onLockChange,
    presentationSceneIsCurrent
  });
  const publishPresentation: typeof publisher.presentation = (evidence) => {
    if (!disposed) publisher.presentation(evidence);
  };
  const publishCursor = (
    next: PhoneStoryCursor,
    publishHoldPresentation = true
  ) => {
    current = next;
    if (next.kind === 'hold') {
      commitStableScene(next.scene);
    }
    publisher.cursor(next, publishHoldPresentation);
    for (const subscriber of subscribers) subscriber(next);
  };
  const publishLock = publisher.lock;
  const publishAnchor = publisher.anchor;
  const sessions = createPhoneOrchestratedSessionController({
    cursor: () => current,
    publishCursor,
    publishPresentation,
    publishLock,
    publishAnchor,
    scrollTo: options.scrollTo,
    resolveLanding,
    onRetryable: options.onRetryable,
    scheduleFrame: options.scheduleFrame,
    disposed: () => disposed
  });
  getActiveRun = sessions.active;
  const scrollMayReconcile = () => {
    if (disposed || sessions.active()) return false;
    if (current.kind === 'transition') {
      return current.run.endsWith('-scroll');
    }
    return current.scene === 'hero'
      || current.scene === 'pattern'
      || current.scene === 'star-map'
      || current.scene === 'aod-animation';
  };
  const startAdjacentRun = (
    definition: PhoneRunDefinition,
    capability: PhoneRunCapability,
    direction: 1 | -1,
    position: number
  ): boolean => {
    if (!capability.canStart(direction)) return false;
    const session = sessions.activate(definition, direction, position);
    // Claim the boundary before changing document position. A readiness wait
    // now belongs to this session, so native scrolling cannot pass the next
    // boundary while an adapter is still preparing its target frame.
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
      || current.kind !== 'hold'
    ) return false;
    const definition = phoneRunForHold(current.scene, intent.direction);
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
      anchorY
    )) {
      return false;
    }
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
    const anchorY = options.scrollY();
    const session = sessions.activate(
      definition,
      plan.direction,
      anchorY,
      plan.legIndex,
      plan.scene
    );
    pendingDirectEntry = null;
    publishPresentation({ scene: plan.scene });
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
    cursor: () => current,
    subscribe(listener) {
      subscribers.add(listener);
      return {
        dispose() {
          subscribers.delete(listener);
        }
      };
    },
    syncDiagnostics() {
      const active = sessions.active();
      publishCursor(current, false);
      publishLock(Boolean(active));
      publishAnchor(active?.anchorY);
    },
    activateDirectEntry() {
      if (disposed) return;
      directEntryActivated = true;
      const plan = pendingDirectEntry;
      if (!plan) return;
      const capability = capabilities.get(plan.run);
      if (capability) startDirectEntry(plan.run, capability);
    },
    requestRun(direction) {
      if (disposed || sessions.active() || current.kind !== 'hold') {
        return false;
      }
      const definition = phoneRunForHold(current.scene, direction);
      if (!definition) return false;
      const capability = capabilities.get(definition.id);
      const position = capability?.position(direction) ?? null;
      const anchorY = position === null
        ? null
        : resolvePhoneRunLanding(options.scrollY(), position, direction);
      return Boolean(
        capability
        && anchorY !== null
        && startAdjacentRun(definition, capability, direction, anchorY)
      );
    },
    handleIntent(intent) {
      if (disposed) return false;
      const active = sessions.active();
      if (active) {
        options.scrollTo(active.anchorY);
        publishAnchor(active.anchorY);
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
      if (
        disposed
        || sessions.active()
        || current.kind !== 'hold'
      ) {
        return;
      }
      if (current.scene === scene) {
        publishCursor(current);
        return;
      }
      publishCursor(createPhoneStoryHold(scene, current.revision + 1));
      scrollRun = null;
      startPendingIntent();
    },
    reconcileScrollHold(scene) {
      if (!scrollMayReconcile()) return;
      scrollRun = null;
      if (current.kind === 'hold' && current.scene === scene) return;
      publishCursor(createPhoneStoryHold(scene, current.revision + 1));
      startPendingIntent();
    },
    reconcileScrollRun(runId, direction, rawProgress) {
      if (!scrollMayReconcile()) return;
      const definition = phoneScrollRun(runId);
      if (
        scrollRun !== runId
        || scrollDirection !== direction
      ) {
        scrollRun = runId;
        scrollDirection = direction;
        scrollGeneration += 1;
      }
      const next: PhoneStoryTransition = {
        kind: 'transition',
        revision: current.revision,
        sessionId: `phone-scroll-${scrollGeneration}`,
        generation: scrollGeneration,
        run: runId,
        legIndex: 0,
        runSource: direction === 1 ? definition.from : definition.to,
        runTarget: direction === 1 ? definition.to : definition.from,
        segment: definition.segment,
        from: definition.from,
        to: definition.to,
        direction,
        phase: 'animating',
        progress: Math.min(1, Math.max(0, rawProgress))
      };
      publishCursor(next);
    },
    registerRunCapability(run, ownerId, capability) {
      if (disposed) throw new Error('Disposed phone story');
      const registration = capabilities.register(run, ownerId, capability);
      startDirectEntry(run, capability);
      startPendingIntent();
      return registration;
    },
    registerStableSceneAdapter(scene, _ownerId, adapter) {
      if (disposed) throw new Error('Disposed phone story');
      stableSceneAdapters.set(scene, adapter);
      if (current.kind === 'hold' && current.scene === scene) {
        commitStableScene(scene);
      }
      return {
        dispose() {
          if (stableSceneAdapters.get(scene) === adapter) {
            stableSceneAdapters.delete(scene);
          }
        }
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      capabilities.clear();
      sessions.dispose();
      pendingIntent = null;
      subscribers.clear();
      stableSceneAdapters.clear();
      publishLock(false);
    }
  };
}
