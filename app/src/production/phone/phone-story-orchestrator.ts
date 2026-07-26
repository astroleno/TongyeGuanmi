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
  selectPhoneInputLocked,
  selectPhoneStoryCursor,
  type PhoneStoryEvent,
  type PhoneStoryReduction,
  type PhoneStorySnapshot
} from './phone-story-state';
import { createPhoneOrchestratorPublisher } from './phone-orchestrator-publisher';
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

let authoritySequence = 0;

export function createPhoneStoryOrchestrator(
  options: PhoneStoryOrchestratorOptions
): PhoneStoryOrchestrator {
  const capabilities = createPhoneRunCapabilityRegistry();
  let consumedInputEpoch = 0;
  const entryPlan = phoneEntryPlan(options.initialScene);
  let pendingDirectEntry: Extract<PhoneEntryPlan, { kind: 'cinematic' }> | null =
    entryPlan.kind === 'cinematic' ? entryPlan : null;
  let directEntryActivated = pendingDirectEntry === null;
  let currentSnapshot: PhoneStorySnapshot = createPhoneStorySnapshot({
    authorityId: `phone-authority-${++authoritySequence}`,
    scene: entryPlan.kind === 'cinematic'
      ? phoneRun(entryPlan.run).from
      : entryPlan.scene,
    actualY: options.scrollY()
  });
  let pendingIntent: PhoneIntent | null = null;
  let disposed = false;
  const subscribers = new Set<() => void>();
  const stableSceneAdapters = new Map<SceneId, PhoneStableSceneAdapter>();

  const resolveLanding = (scene: SceneId, fallbackY: number) => {
    const root = stableSceneAdapters.get(scene)?.root() as HTMLElement | null;
    return root
      ? Math.max(0, options.scrollY() + root.getBoundingClientRect().top)
      : fallbackY;
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
    const cursor = selectPhoneStoryCursor(currentSnapshot);
    if (
      pendingDirectEntry?.scene === scene
      || getActiveRun()?.directScene === scene
    ) return true;
    return cursor.kind === 'hold'
      ? cursor.scene === scene
      : cursor.from === scene || cursor.to === scene;
  };
  const publisher = createPhoneOrchestratorPublisher({
    root: options.root,
    onPresentation: options.onPresentation,
    presentationSceneIsCurrent
  });
  const publishSnapshot = (publishPresentation = true, notify = true) => {
    const cursor = selectPhoneStoryCursor(currentSnapshot);
    if (currentSnapshot.status === 'stable') {
      commitStableScene(currentSnapshot.scene);
    }
    publisher.cursor(cursor);
    if (publishPresentation) publisher.presentation(currentSnapshot.projection);
    publisher.lock(selectPhoneInputLocked(currentSnapshot));
    publisher.anchor(
      currentSnapshot.status === 'transaction'
        ? currentSnapshot.session.anchor.y ?? undefined
        : undefined
    );
    if (notify) {
      for (const subscriber of subscribers) subscriber();
    }
  };
  const dispatch = (event: PhoneStoryEvent): PhoneStoryReduction => {
    if (disposed) return { snapshot: currentSnapshot, effects: [] };
    const reduction = reducePhoneStorySnapshot(currentSnapshot, event);
    if (reduction.snapshot === currentSnapshot) return reduction;
    currentSnapshot = reduction.snapshot;
    publishSnapshot();
    return reduction;
  };
  const sessions = createPhoneOrchestratedSessionController({
    getSnapshot: () => currentSnapshot,
    dispatch: (event) => {
      dispatch(event);
    },
    scrollTo: options.scrollTo,
    resolveLanding,
    onRetryable: options.onRetryable,
    scheduleFrame: options.scheduleFrame,
    disposed: () => disposed
  });
  getActiveRun = sessions.active;

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
    // Claim the boundary before changing document position. The active
    // transaction now carries the anchor and native scrolling cannot pass it.
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
      return {
        dispose() {
          subscribers.delete(listener);
        }
      };
    },
    syncDiagnostics() {
      // Diagnostics intentionally replays the existing immutable snapshot.
      // It does not manufacture a cursor or invoke a state setter.
      publishSnapshot(false, false);
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
      if (currentSnapshot === before) publishSnapshot();
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
    registerStableSceneAdapter(scene, _ownerId, adapter) {
      if (disposed) throw new Error('Disposed phone story');
      stableSceneAdapters.set(scene, adapter);
      if (currentSnapshot.status === 'stable' && currentSnapshot.scene === scene) {
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
      publisher.anchor();
      publisher.lock(false);
    }
  };
}
