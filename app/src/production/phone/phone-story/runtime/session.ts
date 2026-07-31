import type { SceneId } from '../../../../story/types';
import type { PhoneRunId } from '../../phone-story-runs';
import { PHONE_SCROLL_ALIGNMENT_TOLERANCE_PX } from '../machine';
import type {
  PhoneExecutionIdentity,
  PhoneFailureReason,
  PresentationProof,
  PresentationReadiness,
  PhoneStoryEvent,
  PhoneStorySnapshot
} from '../machine';
import type { PhoneTransitionEndpoints } from '../presentation';
import type { PhoneRenderedPresentationFrame } from '../presentation';
import type { PhoneTransitionDirection } from '../../phone-transition-coordinator';
import { runPhoneProgressClock } from '../../phone-transition-coordinator';
import type {
  PhoneAodRunSession,
  PhoneOrchestratedRunSession,
  PhoneReleaseLease
} from './types';

export type PhoneActiveRun = Readonly<{
  sessionId: string;
  generation: number;
  run: PhoneRunId | null;
  anchorY: number;
}>;

type ManagedPhoneActiveRun = {
  sessionId: string;
  generation: number;
  run: PhoneRunId | null;
  direction: PhoneTransitionDirection;
  source: SceneId;
  target: SceneId;
  anchorY: number;
};

type SessionControllerOptions = Readonly<{
  getSnapshot(): PhoneStorySnapshot;
  dispatch(event: PhoneStoryEvent): void;
  scrollY(): number;
  scrollTo(y: number): void;
  resolveLanding(
    scene: SceneId,
    fallbackY: number,
    mode: 'forward' | 'rollback'
  ): number;
  registerEndpoints(endpoints: PhoneTransitionEndpoints): void;
  clearEndpoints(): void;
  proofForRenderedFrame(
    frame: PhoneRenderedPresentationFrame
  ): PresentationProof | null;
  scheduleFrame?: ((callback: () => void) => void) | undefined;
  disposed(): boolean;
}>;

export type PhoneOrchestratedSessionController = Readonly<{
  active(): PhoneActiveRun | null;
  resume(): PhoneOrchestratedRunSession | null;
  dispose(): void;
}>;

type CommitMode = 'forward' | 'rollback';

/** The controller, never a leaf runner, owns reduced static-proof expiry. */
export const PHONE_REDUCED_ADMISSION_TIMEOUT_MS = 6_000;

/**
 * Owns one execution clock and translates adapter evidence into immutable
 * reducer events. The shared forward/rollback alignment path keeps both
 * directions under the same candidate → measure → confirm → stable protocol.
 */
export function createPhoneOrchestratedSessionController(
  options: SessionControllerOptions
): PhoneOrchestratedSessionController {
  let active: ManagedPhoneActiveRun | null = null;
  let cancelAnimation: (() => void) | undefined;
  let scrollCommand = 0;
  let renderedFrameSequence = 0;
  let releaseLease: PhoneReleaseLease | undefined;
  let geometryReleased = false;
  let reducedAdmissionTimeout: ReturnType<typeof globalThis.setTimeout> | undefined;
  const clearReducedAdmissionTimeout = () => {
    if (reducedAdmissionTimeout === undefined) return;
    globalThis.clearTimeout(reducedAdmissionTimeout);
    reducedAdmissionTimeout = undefined;
  };

  const identityFor = (
    run: ManagedPhoneActiveRun,
    mode: CommitMode = 'forward'
  ): PhoneExecutionIdentity | null => {
    const snapshot = options.getSnapshot();
    if (options.disposed() || active !== run || snapshot.status !== 'transaction') {
      return null;
    }
    const { session } = snapshot;
    if (mode === 'rollback') {
      if (!session.phase.startsWith('rollback-')) return null;
    } else {
      const operation = session.operation;
      if (
        session.sessionId !== run.sessionId
        || session.generation !== run.generation
        || operation.run !== run.run
        || operation.direction !== run.direction
      ) return null;
    }
    const operation = session.operation;
    return {
      authorityId: snapshot.authorityId,
      sessionId: session.sessionId,
      generation: session.generation,
      leg: operation.legIndex,
      direction: operation.direction
    };
  };
  const owns = (run: ManagedPhoneActiveRun) => identityFor(run) !== null;
  const emit = (
    run: ManagedPhoneActiveRun,
    type: PhoneStoryEvent['type'],
    detail: Readonly<Record<string, unknown>> = {},
    mode: CommitMode = 'forward'
  ): boolean => {
    const identity = identityFor(run, mode);
    if (!identity) return false;
    options.dispatch({ ...identity, type, ...detail } as PhoneStoryEvent);
    return true;
  };
  const schedule = (callback: () => void) => {
    if (options.scheduleFrame) return options.scheduleFrame(callback);
    if (typeof window !== 'undefined') return window.requestAnimationFrame(callback);
    callback();
  };
  const observationTime = () => (
    typeof performance === 'undefined' || typeof performance.now !== 'function'
      ? 0
      : performance.now()
  );
  const releaseGeometry = () => {
    const lease = releaseLease;
    if (!lease || geometryReleased) return lease;
    geometryReleased = true;
    lease.releaseGeometry();
    return lease;
  };
  const releaseResources = (lease: PhoneReleaseLease | undefined) => {
    try {
      lease?.releaseResources();
    } finally {
      if (lease && releaseLease === lease) {
        releaseLease = undefined;
        geometryReleased = false;
      }
      options.clearEndpoints();
    }
  };
  const namesFor = (mode: CommitMode) => mode === 'rollback'
    ? {
        measuring: 'rollback-measuring-landing',
        aligning: 'rollback-aligning-scroll',
        verifying: 'rollback-verifying-stable',
        measured: 'ROLLBACK_LANDING_MEASURED',
        commanded: 'ROLLBACK_SCROLL_COMMANDED',
        confirmed: 'ROLLBACK_SCROLL_CONFIRMED'
      } as const
    : {
        measuring: 'measuring-landing',
        aligning: 'aligning-scroll',
        verifying: 'verifying-stable',
        measured: 'LANDING_MEASURED',
        commanded: 'SCROLL_COMMANDED',
        confirmed: 'SCROLL_CONFIRMED'
      } as const;
  const releaseAfterStable = (
    run: ManagedPhoneActiveRun,
    lease: PhoneReleaseLease | undefined
  ) => {
    if (options.disposed() || active !== run) return;
    try {
      releaseResources(lease);
    } finally {
      if (active === run) active = null;
    }
  };
  const finish = (
    run: ManagedPhoneActiveRun,
    lease: PhoneReleaseLease | undefined,
    mode: CommitMode
  ) => {
    if (!emit(run, 'PRESENTATION_COMMITTED', {
      now: observationTime()
    }, mode)) return;
    if (lease) schedule(() => releaseAfterStable(run, lease));
    else releaseAfterStable(run, lease);
  };
  const fail = (
    run: ManagedPhoneActiveRun,
    reason: PhoneFailureReason = 'capability-failed'
  ) => {
    const identity = identityFor(run);
    if (!identity) return;
    clearReducedAdmissionTimeout();
    cancelAnimation?.();
    cancelAnimation = undefined;
    const lease = releaseLease;
    try {
      releaseGeometry();
    } catch {
      // A throwing adapter cleanup must still invalidate stale evidence.
    }
    options.clearEndpoints();
    options.dispatch({ ...identity, type: 'FAILED', reason });
    if (
      !emit(run, 'ROLLBACK_RENDERED', {}, 'rollback')
      || !emit(run, 'ROLLBACK_LAYOUT_RELEASED', {}, 'rollback')
    ) {
      releaseAfterStable(run, lease);
      return;
    }
    measure(run, lease, 'rollback');
  };
  const armReducedAdmissionTimeout = (run: ManagedPhoneActiveRun) => {
    clearReducedAdmissionTimeout();
    const snapshot = options.getSnapshot();
    if (
      !owns(run)
      || snapshot.status !== 'transaction'
      || !snapshot.session.reducedMotion
      || snapshot.session.phase !== 'preparing'
    ) return;
    reducedAdmissionTimeout = globalThis.setTimeout(() => {
      reducedAdmissionTimeout = undefined;
      const current = options.getSnapshot();
      if (
        !owns(run)
        || current.status !== 'transaction'
        || !current.session.reducedMotion
        || current.session.phase !== 'preparing'
      ) return;
      fail(run, 'reduced-proof-timeout');
    }, PHONE_REDUCED_ADMISSION_TIMEOUT_MS);
  };
  const requestReducedTargetLayout = (
    run: ManagedPhoneActiveRun,
    targetY: number
  ) => {
    const snapshot = options.getSnapshot();
    if (
      !Number.isFinite(targetY)
      || !owns(run)
      || snapshot.status !== 'transaction'
      || !snapshot.session.reducedMotion
      || snapshot.session.phase !== 'preparing'
    ) return false;
    try {
      // Only the route runtime owns the physical scroll command. A runner can
      // ask for this one candidate-layout fact, but it cannot commit, unlock,
      // or change transaction phase by doing so.
      options.scrollTo(targetY);
      return true;
    } catch {
      return false;
    }
  };
  const align = (
    run: ManagedPhoneActiveRun,
    lease: PhoneReleaseLease | undefined,
    landing: number,
    mode: CommitMode
  ) => {
    const names = namesFor(mode);
    const commandId = ++scrollCommand;
    if (!emit(run, names.commanded, { commandId }, mode)) return;
    options.scrollTo(landing);
    schedule(() => {
      const snapshot = options.getSnapshot();
      if (
        snapshot.status !== 'transaction'
        || snapshot.session.phase !== names.aligning
        || !snapshot.session.alignment
      ) return;
      const actualY = typeof window === 'undefined' && !options.scheduleFrame
        ? landing
        : options.scrollY();
      const mismatch = Math.abs(actualY - landing)
        > PHONE_SCROLL_ALIGNMENT_TOLERANCE_PX;
      if (mismatch && snapshot.session.alignment.correctionCount === 1) {
        if (mode === 'forward') fail(run, 'scroll-confirmation-failed');
        return;
      }
      if (!emit(run, names.confirmed, { commandId, actualY }, mode)) return;
      const next = options.getSnapshot();
      if (
        next.status === 'transaction'
        && next.session.phase === names.aligning
        && next.session.alignment?.correctionCount === 1
      ) return align(run, lease, landing, mode);
      // The runtime observes manifest-scoped target proof in this exact
      // verifying phase, then calls reportPresentationCommitted(). No
      // controller path may publish stable merely because scroll aligned.
      if (next.status === 'transaction' && next.session.phase === names.verifying) return;
    });
  };
  const measure = (
    run: ManagedPhoneActiveRun,
    lease: PhoneReleaseLease | undefined,
    mode: CommitMode
  ) => schedule(() => {
    const names = namesFor(mode);
    const snapshot = options.getSnapshot();
    if (snapshot.status !== 'transaction' || snapshot.session.phase !== names.measuring) {
      return;
    }
    const target = mode === 'forward' ? run.target : run.source;
    const landing = options.resolveLanding(target, run.anchorY, mode);
    run.anchorY = landing;
    if (!emit(run, names.measured, {
      targetY: landing,
      geometryRevision: 0,
      visualViewportOffsetTop: 0
    }, mode)) return;
    align(run, lease, landing, mode);
  });
  const settleTarget = (run: ManagedPhoneActiveRun) => {
    const snapshot = options.getSnapshot();
    if (!owns(run) || snapshot.status !== 'transaction'
      || snapshot.session.phase !== 'verifying-target') return;
    if (!emit(run, 'TARGET_PRESENTED')) return;
    let lease: PhoneReleaseLease | undefined;
    try {
      lease = releaseGeometry();
    } catch {
      fail(run);
      return;
    }
    if (emit(run, 'LAYOUT_RELEASED')) measure(run, lease, 'forward');
  };
  const sessionFor = (
    run: ManagedPhoneActiveRun,
    initialLeg: number,
    fallbackAuthorityId: string
  ): PhoneAodRunSession => {
    const presentationFrameToken = (
      kind: Parameters<PhoneOrchestratedRunSession['presentationFrameToken']>[0],
      subject: Parameters<PhoneOrchestratedRunSession['presentationFrameToken']>[1]
    ) => {
      const snapshot = options.getSnapshot();
      const identity = identityFor(run) ?? identityFor(run, 'rollback');
      if (!identity || snapshot.status !== 'transaction') return null;
      return {
        authorityId: identity.authorityId,
        sessionId: identity.sessionId,
        generation: identity.generation,
        leg: identity.leg,
        revision: snapshot.session.presentationRevision,
        subject,
        kind
      };
    };
    return {
    get authorityId() {
      return identityFor(run)?.authorityId ?? fallbackAuthorityId;
    },
    sessionId: run.sessionId,
    generation: run.generation,
    get leg() {
      return identityFor(run)?.leg ?? initialLeg;
    },
    direction: run.direction,
    valid: () => owns(run),
    reportRenderedFrame: (kind, subject, origin) => {
      if (
        kind === undefined
        || subject === undefined
      ) return false;
      const token = presentationFrameToken(kind, subject);
      if (!token) return false;
      const proof = options.proofForRenderedFrame({
        token,
        frameSequence: ++renderedFrameSequence,
        observedAt: observationTime(),
        ...(origin === undefined ? {} : { origin })
      });
      if (!proof) return false;
      emit(run, 'PRESENTATION_PROOF_REPORTED', { proof });
      const after = options.getSnapshot();
      return after.status === 'transaction'
        && (
          after.session.firstFrameProof === proof
          || after.session.proof === proof
        );
    },
    reportPresentationFrame: (frame: PhoneRenderedPresentationFrame) => {
      const proof = options.proofForRenderedFrame(frame);
      if (!proof) return false;
      const accepted = emit(run, 'PRESENTATION_PROOF_REPORTED', { proof });
      const after = options.getSnapshot();
      if (
        after.status !== 'transaction'
        || !after.session.reducedMotion
        || after.session.phase !== 'preparing'
      ) clearReducedAdmissionTimeout();
      return accepted;
    },
    reportPresentationProof: (proof: PresentationProof) => {
      const snapshot = options.getSnapshot();
      if (snapshot.status !== 'transaction') return;
      emit(run, 'PRESENTATION_PROOF_REPORTED', { proof });
    },
    reportPresentationReadiness: (readiness: PresentationReadiness) => {
      const snapshot = options.getSnapshot();
      if (snapshot.status !== 'transaction') return;
      emit(run, 'PRESENTATION_READY_REPORTED', { readiness });
    },
    presentationProofToken: presentationFrameToken,
    presentationFrameToken,
    requestReducedTargetLayout: (targetY) => (
      requestReducedTargetLayout(run, targetY)
    ),
    reportProgress: (progress) => { emit(run, 'PROGRESS_REPORTED', { progress }); },
    reportAodAutoplayBlocked: () => emit(run, 'AOD_AUTOPLAY_BLOCKED'),
    requestAodGestureRetry: () => emit(run, 'AOD_GESTURE_RETRY_REQUESTED'),
    reportAodWatchdog: (stage) => {
      emit(run, 'AOD_WATCHDOG_EXPIRED', { aodWatchdog: stage });
    },
    animate: (start, end, durationMs, render, complete) => {
      if (!owns(run)) return;
      cancelAnimation?.();
      const cancel = runPhoneProgressClock(
        { valid: () => owns(run) },
        start,
        end,
        durationMs,
        (progress) => {
          if (owns(run)) {
            emit(run, 'PROGRESS_REPORTED', { progress });
            render(progress);
          }
        },
        () => {
          if (cancelAnimation === cancel) cancelAnimation = undefined;
          if (owns(run)) complete();
        }
      );
      cancelAnimation = cancel;
    },
    reportEndpoints: (source, receiver) => {
      const identity = identityFor(run);
      if (identity) options.registerEndpoints({
        source,
        receiver,
        sessionId: identity.sessionId,
        generation: identity.generation
      });
    },
    reportEndpointCommit: (endpoint) => {
      if (endpoint === 'receiver') emit(run, 'LEG_COMPLETED');
    },
    reportTargetPresented: () => settleTarget(run),
    reportPresentationCommitted: () => {
      const snapshot = options.getSnapshot();
      if (
        !owns(run)
        || snapshot.status !== 'transaction'
        || (
          snapshot.session.phase !== 'verifying-stable'
          && snapshot.session.phase !== 'rollback-verifying-stable'
        )
      ) return;
      finish(
        run,
        releaseLease,
        snapshot.session.phase === 'rollback-verifying-stable'
          ? 'rollback'
          : 'forward'
      );
    },
    reportEndpointRelease: () => {
      if (owns(run)) options.clearEndpoints();
    },
    provideRelease: (lease) => {
      if (owns(run)) {
        releaseLease = lease;
        geometryReleased = false;
      }
    },
    reportAnimationComplete: () => { emit(run, 'LEG_COMPLETED'); },
    reportFailure: (reason) => fail(run, reason)
    };
  };

  return {
    active: () => active,
    resume() {
      const snapshot = options.getSnapshot();
      if (options.disposed() || snapshot.status !== 'transaction') return null;
      const { session } = snapshot;
      const operation = session.operation;
      if (active && owns(active)) {
        const resumed = active.sessionId === session.sessionId
          && active.generation === session.generation
          ? sessionFor(active, operation.legIndex, snapshot.authorityId)
          : null;
        if (resumed) armReducedAdmissionTimeout(active);
        return resumed;
      }
      const run: ManagedPhoneActiveRun = {
        sessionId: session.sessionId,
        generation: session.generation,
        run: operation.run,
        direction: operation.direction,
        source: operation.from,
        target: operation.to,
        anchorY: session.anchor.y ?? options.scrollY()
      };
      active = run;
      releaseLease = undefined;
      geometryReleased = false;
      const resumed = sessionFor(run, operation.legIndex, snapshot.authorityId);
      armReducedAdmissionTimeout(run);
      return resumed;
    },
    dispose() {
      cancelAnimation?.();
      cancelAnimation = undefined;
      clearReducedAdmissionTimeout();
      try {
        releaseResources(releaseGeometry());
      } finally {
        active = null;
        options.clearEndpoints();
      }
    }
  };
}
