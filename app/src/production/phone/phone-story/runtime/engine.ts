import type { SceneId } from '../../../../story/types';
import {
  phoneRunForHoldTuple,
  phoneRunTuple,
  type PhoneRunId
} from '../../phone-story-runs';
import {
  createPhoneStorySnapshot,
  phoneExecutionOwnsSnapshot,
  phonePresentationSnapshot,
  reducePhoneStorySnapshot,
  type PhoneExecutionIdentity,
  type PhoneStoryEvent,
  type PhoneStoryReduction,
  type PhoneStorySnapshot
} from '../machine';
import {
  createPhoneStoryPresentation,
  type PhonePresentationAdapterLease,
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
  phoneScenePresentationTuple,
  phoneRunIntentClaimPolicy
} from '../manifest';
import type {
  PhoneAodDiagnostics,
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
const ADMISSION_TIMEOUT_MS = 8_000;
/**
 * Every claimed cinematic run owns a bounded preparation lease.  A leaf may
 * become ready later (for example after a WebGL restore), but a transaction
 * must never keep the input lock while waiting without an owner-side clock.
 */
export const PHONE_PREPARATION_LEASE_TIMEOUT_MS = ADMISSION_TIMEOUT_MS;

type DirectEntryPreparation = {
  key: string;
  controller: AbortController;
  ready: boolean | null;
  publishing: boolean;
};

/**
 * A terminal leaf can complete in the same React commit that transiently
 * unregisters its final receiver. Retain only this exact machine event until
 * the receiver returns; runners never get a second completion writer.
 */
type PendingTerminalCompletion = PhoneExecutionIdentity & Readonly<{
  type: 'LEG_COMPLETED';
}>;

function terminalCandidateCompletion(
  snapshot: PhoneStorySnapshot,
  event: PhoneStoryEvent
): PendingTerminalCompletion | null {
  if (
    event.type !== 'LEG_COMPLETED'
    || snapshot.status !== 'transaction'
    || snapshot.session.operation.run === null
    || snapshot.session.phase !== 'verifying-target'
    || snapshot.projection.commitState !== 'candidate'
  ) return null;
  return event as PendingTerminalCompletion;
}

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
  let pendingTerminalCompletion: PendingTerminalCompletion | null = null;
  let pendingTerminalCompletionTimeout:
    | ReturnType<typeof globalThis.setTimeout>
    | undefined;
  const subscribers = new Set<() => void>();
  let directEntryPreparation: DirectEntryPreparation | null = null;
  let preparationLease: {
    key: string;
    timeout: ReturnType<typeof globalThis.setTimeout>;
  } | null = null;
  let rollbackPresentationLease: PhonePresentationAdapterLease | null = null;
  /** Prevent synchronous proof dispatch from recursively re-observing it. */
  let publishingTargetProof = false;
  let afterDispatch: () => void = () => undefined;

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
    preparation.controller.abort();
    directEntryPreparation = null;
  };
  const clearPreparationLease = () => {
    if (!preparationLease) return;
    globalThis.clearTimeout(preparationLease.timeout);
    preparationLease = null;
  };
  const preparationLeaseKey = (
    snapshot: PhoneStorySnapshot
  ): string | null => {
    if (snapshot.status !== 'transaction') return null;
    const { session } = snapshot;
    if (session.phase === 'rollback-verifying-stable') {
      return [
        session.sessionId,
        session.generation,
        'rollback',
        session.operation.from
      ].join(':');
    }
    if (session.operation.run === null) {
      return session.operation.trigger === 'auto'
        ? null
        : directEntryPreparationKey(snapshot);
    }
    if (session.phase !== 'preparing') return null;
    return [
      session.sessionId,
      session.generation,
      session.operation.run,
      session.operation.direction
    ].join(':');
  };
  const syncPreparationLease = () => {
    const key = preparationLeaseKey(currentSnapshot);
    if (!key) {
      clearPreparationLease();
      return;
    }
    if (preparationLease?.key === key) return;
    clearPreparationLease();
    const rollbackVerification = currentSnapshot.status === 'transaction'
      && currentSnapshot.session.phase === 'rollback-verifying-stable';
    const lease: NonNullable<typeof preparationLease> = {
      key,
      timeout: undefined as unknown as ReturnType<typeof globalThis.setTimeout>
    };
    let rearm = rollbackVerification;
    const expire = () => {
      if (
        preparationLease !== lease
        || preparationLeaseKey(currentSnapshot) !== key
      ) return;
      if (rearm) {
        rearm = false;
        rollbackPresentationLease?.dispose();
        rollbackPresentationLease = null;
        lease.timeout = globalThis.setTimeout(
          expire,
          PHONE_PREPARATION_LEASE_TIMEOUT_MS / 2
        );
        afterDispatch();
        return;
      }
      preparationLease = null;
      const activeSession = sessions.resume();
      if (!activeSession?.valid()) return;
      if (rollbackVerification) activeSession.reportPresentationCommitted(true);
      else activeSession.reportFailure(
        currentSnapshot.status === 'transaction'
          && currentSnapshot.session.operation.run === 'aod-method'
          ? 'aod-prepare-timeout'
          : 'dependency-timeout'
      );
    };
    lease.timeout = globalThis.setTimeout(
      expire,
      rollbackVerification
        ? PHONE_PREPARATION_LEASE_TIMEOUT_MS / 2
        : PHONE_PREPARATION_LEASE_TIMEOUT_MS
    );
    preparationLease = lease;
  };
  const clearPendingTerminalCompletion = () => {
    if (pendingTerminalCompletionTimeout !== undefined) {
      globalThis.clearTimeout(pendingTerminalCompletionTimeout);
      pendingTerminalCompletionTimeout = undefined;
    }
    pendingTerminalCompletion = null;
  };
  const pendingTerminalCompletionIsCurrent = (
    completion: PendingTerminalCompletion
  ) => phoneExecutionOwnsSnapshot(currentSnapshot, completion)
    && currentSnapshot.session.phase === 'animating'
    && currentSnapshot.session.operation.run !== null;
  const retireStaleTerminalCompletion = () => {
    if (
      pendingTerminalCompletion
      && !pendingTerminalCompletionIsCurrent(pendingTerminalCompletion)
    ) clearPendingTerminalCompletion();
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
  const dispatch = (rawEvent: PhoneStoryEvent): PhoneStoryReduction => {
    if (disposed) return { snapshot: currentSnapshot, effects: [] as never[] };
    const event = normalize(rawEvent);
    const reduction = reducePhoneStorySnapshot(currentSnapshot, event);
    if (reduction.snapshot === currentSnapshot) return reduction;
    const preflightOptions = firstFrameProjectionOptions(
      currentSnapshot,
      reduction.snapshot,
      event
    );
    if (!applySnapshot(reduction.snapshot, true, preflightOptions)) {
      const terminalCompletion = terminalCandidateCompletion(
        reduction.snapshot,
        event
      );
      if (terminalCompletion) {
        clearPendingTerminalCompletion();
        pendingTerminalCompletion = terminalCompletion;
        pendingTerminalCompletionTimeout = globalThis.setTimeout(() => {
          if (pendingTerminalCompletion !== terminalCompletion) return;
          pendingTerminalCompletion = null;
          pendingTerminalCompletionTimeout = undefined;
          if (!pendingTerminalCompletionIsCurrent(terminalCompletion)) return;
          sessions.resume()?.reportFailure('target-verification-failed');
        }, ADMISSION_TIMEOUT_MS);
        return { snapshot: currentSnapshot, effects: [] as never[] };
      }
      if (
        event.type === 'DIRECT_ENTRY_REQUESTED'
        && currentSnapshot.status === 'stable'
      ) pendingDirectEntry = event;
      recoverProjectFailure();
      return { snapshot: currentSnapshot, effects: [] as never[] };
    }
    if (event.type === 'DIRECT_ENTRY_REQUESTED') pendingDirectEntry = null;
    retireStaleTerminalCompletion();
    if (currentSnapshot.status !== 'transaction') startedCapabilitySession = null;
    syncPreparationLease();
    afterDispatch();
    return reduction;
  };
  const replayPendingDirectEntry = () => {
    const event = pendingDirectEntry;
    if (disposed || !event || currentSnapshot.status !== 'stable') return;
    pendingDirectEntry = null;
    dispatch(event);
  };
  const replayPendingTerminalCompletion = () => {
    const completion = pendingTerminalCompletion;
    if (disposed || !completion) return;
    if (!pendingTerminalCompletionIsCurrent(completion)) {
      clearPendingTerminalCompletion();
      return;
    }
    clearPendingTerminalCompletion();
    dispatch(completion);
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
    replayPendingTerminalCompletion();
    // Route-owned geometry and lazy surface handles may become ready after a
    // direct-entry candidate has already been projected. Re-evaluate the
    // immutable transaction here so cold deep links do not require a later
    // browser scroll sample to enter the normal landing/verification path.
    startPreparedOperation();
  };
  const readAodDiagnostics = (): PhoneAodDiagnostics => {
    const snapshot = currentSnapshot;
    const session = snapshot.status === 'transaction' ? snapshot.session : null;
    const lifecycle = session?.aod ?? null;
    const rollback = snapshot.diagnostics.lastRollback?.run === 'aod-method'
      ? snapshot.diagnostics.lastRollback.reason
      : null;
    if (!session || !lifecycle) {
      return [null, 'idle', 'idle', null, null, null, rollback];
    }
    return [
      [
        session.sessionId,
        session.generation,
        session.operation.legIndex,
        session.operation.direction
      ].join(':'),
      session.phase,
      lifecycle.stage,
      lifecycle.playConfirmed,
      lifecycle.firstFramePresented,
      lifecycle.lastProgress,
      rollback
    ];
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
    const snapshot = currentSnapshot;
    const proofKind = phoneScenePresentationProofKind(scene);
    const proofSubject = contract[4];
    const rollback = snapshot.status === 'transaction'
      && snapshot.session.phase.startsWith('rollback-');
    const token = activeSession.presentationProofToken(
      proofKind,
      proofSubject
    );
    if (!token) return;
    // Visual leaves receive the immutable token after the candidate plane has
    // been projected. Their next real draw reports back through this closure;
    // no selector or dataset can manufacture that proof.
    const lease = presentation.activatePresentationAdapter(scene, token, (proof) => {
      return activeSession.reportPresentationProof(proof);
    }, (reason) => {
      activeSession.reportFailure(reason);
    });
    if (rollback) rollbackPresentationLease = lease;
    const readiness = presentation.readPresentationReadiness(scene, token);
    if (readiness) activeSession.reportPresentationReadiness(readiness);
    const projectedSnapshot = currentSnapshot;
    if (projectedSnapshot.status !== 'transaction') return;
    const hasTargetReadiness = Boolean(
      readiness || projectedSnapshot.session.readiness
    );
    const hasTargetProof = Boolean(projectedSnapshot.session.proof);
    // Candidate coverage can release alignment/landing geometry, but only a
    // token-bound renderer/post-paint proof may publish a stable scene.
    if (projectedSnapshot.session.phase === 'verifying-target') {
      if (hasTargetReadiness || hasTargetProof) {
        activeSession.reportTargetPresented();
      }
      return;
    }
    if (
      (projectedSnapshot.session.phase === 'verifying-stable'
        || projectedSnapshot.session.phase === 'rollback-verifying-stable')
      && hasTargetProof
    ) activeSession.reportPresentationCommitted();
    } finally {
      publishingTargetProof = false;
    }
  };
  /**
   * A manifest-declared sampled static front admission has no cinematic
   * runner or direct-entry lifecycle. The target leaf receives the raw
   * immutable frame token; this branch never reads readiness, commands a
   * landing, or manufactures a browser frame. The current scroll position is
   * the authored rail landing, so Safari must not be asked to fight an active
   * touch scroll after its exact leaf proof arrives.
   */
  const reportSampledTargetPresentation = (
    activeSession: PhoneOrchestratedRunSession,
    scene: SceneId
  ) => {
    if (publishingTargetProof) return;
    publishingTargetProof = true;
    try {
      const contract = phoneScenePresentationTuple(scene);
      const token = activeSession.presentationFrameToken(
        phoneScenePresentationProofKind(scene),
        contract[4]
      );
      if (!token) return;
      presentation.activatePresentationAdapter(scene, token, (proof) => {
        return activeSession.reportPresentationProof(proof);
      }, (reason) => {
        activeSession.reportFailure(reason);
      });
    } finally {
      publishingTargetProof = false;
    }
  };
  const startPreparedOperation = (onlyRun?: PhoneRunId) => {
    syncPreparationLease();
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
      && (
        // Keep the already-qualified reduced Pattern → Star Map admission
        // contract intact. Reduced static candidates begin in preparing.
        (session.reducedMotion
          && (operation.to === 'star-map' || operation.to === 'aod-animation')
          && session.phase === 'preparing')
        || (!session.reducedMotion
          && session.phase === 'verifying-target'
          && (operation.to === 'star-map' || operation.to === 'aod-animation'))
      )
    ) {
      const activeSession = sessions.resume();
      if (activeSession?.valid()) {
        reportSampledTargetPresentation(activeSession, operation.to);
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
          ready: null,
          publishing: false
        };
        directEntryPreparation = prepared;
        preparation = prepared;
      }
      const landing = scrollCorridors.landing(
        currentSnapshot,
        operation.to,
        'direct-entry',
        operation.direction
      );
      const receiverRoot = presentation.rootForScene(operation.to);
      // The lease starts with the projected transaction. Geometry and the
      // receiver may arrive later, but neither can leave input locked forever.
      if (landing === null || !receiverRoot) return;
      if (preparation.ready === null) {
        preparation.ready = false;
        const prepared = preparation;
        const { controller } = prepared;
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
        reportTargetPresentation(
          activeSession,
          operation.to
        );
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
    const activeSession = sessions.resume();
    if (!activeSession?.valid()) return;
    if (!capability) return;
    let ready = false;
    try {
      ready = capability.canStart(operation.direction);
    } catch {
      activeSession.reportFailure('capability-failed');
      return;
    }
    if (!ready) return;
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
        crossedBoundary: false,
        claimReason: 'none'
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
    const claimPolicy = definition
      ? phoneRunIntentClaimPolicy(definition[0], direction)
      : 'cross-boundary';
    const claimReason = crossedBoundary
      ? 'crossed-boundary'
      : claimPolicy === 'first-intent'
        ? 'first-intent'
        : 'none';
    const claimsBoundary = claimReason !== 'none';
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
    const anchorY = definition && boundaryY !== null && claimsBoundary
      ? resolvePhoneRunLanding({
          policy: definition[4],
          direction,
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
      claimReason,
      reducedMotion
    }).inputDisposition ?? 'pass-native';
    if (disposition === 'claim-boundary') startPreparedOperation(definition?.[0]);
    return disposition;
  };

  return {
    getSnapshot: () => currentSnapshot,
    readAodDiagnostics,
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
      replayPendingTerminalCompletion();
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
      clearPreparationLease();
      pendingDirectEntry = null;
      clearPendingTerminalCompletion();
      capabilities.clear();
      sessions.dispose();
      scrollCorridors.clear();
      subscribers.clear();
      presentation.dispose();
    }
  };
}
