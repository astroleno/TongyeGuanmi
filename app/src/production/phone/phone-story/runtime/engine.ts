import type { SceneId } from '../../../../story/types';
import {
  phoneRunForHoldTuple,
  phoneRunTuple,
  type PhoneRunId
} from '../../phone-story-runs';
import {
  createPhoneStorySnapshot,
  phonePresentationSnapshot,
  reducePhoneStorySnapshot,
  type PhoneExecutionIdentity,
  type PhoneStoryEvent,
  type PhoneStoryReduction,
  type PhoneStorySnapshot
} from '../machine';
import {
  createPhoneStoryPresentation,
  type PhonePresentationPreflightOptions
} from '../presentation';
import { createPhoneOrchestratedSessionController } from './session';
import {
  phoneTransitionCrossesBoundary,
  type PhoneIntent,
  type PhoneIntentDisposition
} from '../../phone-transition-coordinator';
import { createPhoneRunCapabilityRegistry } from '../../phone-run-capability-registry';
import { resolvePhoneRunLanding } from '../../phone-run-landing';
import {
  createPhoneScrollCorridorRegistry,
  type PhoneLandingReason
} from '../../phone-scroll-corridor-registry';
import {
  phoneScenePresentationProofKind,
  phoneScenePresentationTuple
} from '../manifest';
import type {
  PhoneOrchestratedRunSession,
  PhoneStoryRuntimeEngine,
  PhoneStoryRuntimeEngineOptions
} from './types';

export type { PhonePresentationEvidence } from '../presentation';
export type {
  PhoneCapabilityLease,
  PhoneOrchestratedRunSession,
  PhoneReleaseLease,
  PhoneRunCapability,
  PhoneStoryRuntimeEngine,
  PhoneStoryRuntimeEngineOptions,
  PhoneStoryRuntimePort
} from './types';
export type { PhoneSurfaceRegistration } from '../presentation';
export type {
  PhoneScrollCorridor,
  PhoneScrollCorridorLease
} from '../../phone-scroll-corridor-registry';

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

/**
 * The reducer has already validated the token-bound first-frame proof. Its
 * synchronous projection must be allowed to activate a receiver whose React
 * visibility update has not committed yet; later diagnostic passes stay
 * strict because they do not carry this option.
 */
function firstFrameProjectionOptions(
  before: PhoneStorySnapshot,
  after: PhoneStorySnapshot,
  event: PhoneStoryEvent
): PhonePresentationPreflightOptions | undefined {
  if (
    event.type !== 'PRESENTATION_PROOF_REPORTED'
    || before.status !== 'transaction'
    || after.status !== 'transaction'
    || before.session.phase !== 'preparing'
    || after.session.phase !== 'animating'
    || after.session.firstFrameProof === null
  ) return undefined;
  return { admitFirstFrameProjection: true };
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
export function createPhoneStoryRuntimeEngine(
  options: PhoneStoryRuntimeEngineOptions
): PhoneStoryRuntimeEngine {
  const authorityId = options.authorityId ?? `phone-authority-${++authoritySequence}`;
  const routeRoot = () => typeof options.root === 'function'
    ? options.root()
    : options.root ?? null;
  const presentation = options.presentation ?? createPhoneStoryPresentation({
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
  /** Prevent synchronous proof dispatch from recursively re-observing it. */
  let publishingTargetProof = false;

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
    notifySubscribers: boolean,
    preflightOptions?: PhonePresentationPreflightOptions
  ): boolean => {
    const plan = presentation.preflight(
      phonePresentationSnapshot(next),
      preflightOptions
    );
    if (!plan) return false;
    try {
      // Project first. Subscribers cannot observe a snapshot whose root roles,
      // edge, checkpoint, lock, or anchor have not been synchronously applied.
      presentation.apply(plan);
      currentSnapshot = next;
      if (notifySubscribers) notify();
      return true;
    } catch {
      presentation.reapplyCurrent();
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
    const preflightOptions = firstFrameProjectionOptions(
      currentSnapshot,
      reduction.snapshot,
      event
    );
    if (!applySnapshot(reduction.snapshot, true, preflightOptions)) {
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
      operation.direction,
      operation.run
    );
    if (!operation.run) return corridorLanding ?? fallbackY;
    return resolvePhoneRunLanding({
      policy: phoneRunTuple(operation.run)[4],
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
      presentation.registerTransitionEndpoints(endpoints);
      syncDiagnostics();
    },
    clearEndpoints() {
      presentation.clearTransitionEndpoints();
      syncDiagnostics();
    },
    proofForRenderedFrame(frame) {
      return presentation.proofForRenderedFrame(frame);
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
  /**
   * Requests a token-bound fact from the registered presentation boundary.
   * Engine owns reducer dispatch; presentation owns the concrete surface
   * observation. Animated adapters that have no static proof return null and
   * report their own frame proof through the active session.
   */
  const reportTargetPresentation = (
    activeSession: PhoneOrchestratedRunSession,
    scene: SceneId
  ) => {
    if (publishingTargetProof) return;
    publishingTargetProof = true;
    try {
    const contract = phoneScenePresentationTuple(scene);
    const token = activeSession.presentationProofToken(
      phoneScenePresentationProofKind(scene),
      contract[4]
    );
    if (!token) return;
    // Visual leaves receive the immutable token after the candidate plane has
    // been projected. Their next real draw reports back through this closure;
    // no selector or dataset can manufacture that proof.
    presentation.activatePresentationAdapter(scene, token, (proof) => {
      activeSession.reportPresentationProof(proof);
    });
    const readiness = presentation.readPresentationReadiness(scene, token);
    if (readiness) activeSession.reportPresentationReadiness(readiness);
    const snapshot = currentSnapshot;
    if (snapshot.status !== 'transaction') return;
    const hasTargetReadiness = Boolean(
      readiness || snapshot.session.readiness
    );
    const hasTargetProof = Boolean(snapshot.session.proof);
    // Candidate coverage can release alignment/landing geometry, but only a
    // token-bound renderer/post-paint proof may publish a stable scene.
    if (snapshot.session.phase === 'verifying-target') {
      if (hasTargetReadiness || hasTargetProof) {
        activeSession.reportTargetPresented();
      }
      return;
    }
    if (
      (snapshot.session.phase === 'verifying-stable'
        || snapshot.session.phase === 'rollback-verifying-stable')
      && hasTargetProof
    ) activeSession.reportPresentationCommitted();
    } finally {
      publishingTargetProof = false;
    }
  };
  /**
   * Reduced front holds use the same machine session as every other reduced
   * transaction, but they have no cinematic run or direct-entry lifecycle.
   * The target leaf receives the raw immutable frame token; this branch never
   * reads readiness, commands a landing, or manufactures a browser frame.
   */
  const reportReducedSampledTargetPresentation = (
    activeSession: PhoneOrchestratedRunSession,
    scene: SceneId
  ) => {
    if (publishingTargetProof) return;
    publishingTargetProof = true;
    try {
      const contract = phoneScenePresentationTuple(scene);
      const token = activeSession.presentationFrameToken(
        'static-poster',
        contract[4]
      );
      if (!token) return;
      presentation.activatePresentationAdapter(scene, token, (proof) => {
        activeSession.reportPresentationProof(proof);
      });
    } finally {
      publishingTargetProof = false;
    }
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

    if (
      operation.run === null
      && operation.trigger === 'auto'
      && session.reducedMotion
      && session.phase === 'preparing'
    ) {
      const activeSession = sessions.resume();
      if (activeSession?.valid()) {
        reportReducedSampledTargetPresentation(activeSession, operation.to);
      }
      return;
    }

    if (!operation.run) {
      const directVerification = session.phase === 'verifying-target'
        || session.phase === 'verifying-stable';
      const rollbackVerification = session.phase === 'rollback-verifying-stable';
      if (!directVerification && !rollbackVerification) return;
      if (rollbackVerification) {
        const activeSession = sessions.resume();
        if (activeSession?.valid()) {
          reportTargetPresentation(activeSession, operation.from);
        }
        return;
      }
      const landing = scrollCorridors.landing(
        currentSnapshot,
        operation.to,
        'direct-entry',
        operation.direction
      );
      const receiverRoot = presentation.rootForScene(operation.to);
      // Candidate admission requires route geometry and a registered receiver
      // root—not the receiver's already committed visibility. The atomic
      // projection makes it eligible to produce its own proof afterwards.
      if (
        landing === null
        || !receiverRoot
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
          const token = activeSession.presentationProofToken(
            phoneScenePresentationProofKind(operation.to),
            phoneScenePresentationTuple(operation.to)[4]
          );
          if (!token) {
            failPreparation();
            return;
          }
          const result = presentation.prepareDirectEntry(operation.to, {
            scene: operation.to,
            sessionId: session.sessionId,
            generation: session.generation,
            token,
            signal: controller.signal
          });
          if (result === undefined) finishPreparation();
          else void Promise.resolve(result).then(finishPreparation).catch(failPreparation);
        } catch {
          failPreparation();
        }
        return;
      }
      if (!preparation.ready) return;
      if (
        operation.trigger === 'entry'
        && session.phase === 'verifying-target'
      ) {
        // A direct target can be mounted below the browser's initial hash
        // scroll attempt. Align its machine-owned landing before asking a
        // leaf for a real proof frame; an offscreen frame is not admissible
        // evidence and must never consume the leaf's one-shot callback.
        // Do not hold `publishing` across this dispatch: deterministic
        // schedulers may reach verifying-stable synchronously.
        sessions.requestDirectEntryTargetLayout();
        return;
      }
      if (preparation.publishing) return;
      preparation.publishing = true;
      try {
        reportTargetPresentation(activeSession, operation.to);
      } finally {
        if (directEntryPreparation === preparation) preparation.publishing = false;
      }
      return;
    }
    if (
      session.phase === 'verifying-target'
      || session.phase === 'verifying-stable'
      || session.phase === 'rollback-verifying-stable'
    ) {
      const activeSession = sessions.resume();
      if (activeSession?.valid()) {
        reportTargetPresentation(
          activeSession,
          session.phase === 'rollback-verifying-stable'
            ? operation.from
            : operation.to
        );
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
    const definition = phoneRunForHoldTuple(snapshot.scene, direction);
    const reducedMotion = definition
      ? capabilities.get(definition[0])?.reducedMotion === true
      : false;
    const boundaryY = definition
      ? scrollCorridors.boundary(snapshot, definition[0], direction)
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
      ? scrollCorridors.landing(
          snapshot,
          snapshot.scene,
          reason,
          direction,
          definition[0]
        )
      : null;
    const anchorY = definition && boundaryY !== null && crossedBoundary
      ? resolvePhoneRunLanding({
          policy: definition[4],
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
      run: definition?.[0] ?? null,
      anchorY,
      boundaryKnown,
      crossedBoundary,
      reducedMotion
    }).inputDisposition ?? 'pass-native';
    if (disposition === 'claim-boundary') startPreparedOperation(definition?.[0]);
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
      const lease = presentation.registerSurface(registration);
      syncDiagnostics();
      startPreparedOperation();
      return lease;
    },
    registerEffect(registration) {
      if (disposed) throw new Error('Disposed phone story');
      const lease = presentation.registerEffect(registration);
      syncDiagnostics();
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
      presentation.dispose();
    }
  };
}
