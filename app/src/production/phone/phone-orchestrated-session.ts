import type { SceneId } from '../../story/types';
import {
  phoneRun,
  type PhoneRunDefinition,
  type PhoneRunId
} from './phone-story-runs';
import { PHONE_SCROLL_ALIGNMENT_TOLERANCE_PX } from './phone-story-state';
import type {
  PhoneExecutionIdentity,
  PhoneStoryEvent,
  PhoneStorySnapshot
} from './phone-story-state';
import type { PhoneTransitionEndpoints } from './phone-story-projector';
import type { PhoneTransitionDirection } from './phone-transition-coordinator';
import { runPhoneProgressClock } from './phone-transition-coordinator';
import type {
  PhoneOrchestratedRunSession,
  PhoneReleaseLease
} from './phone-story-orchestrator.types';

export type PhoneActiveRun = Readonly<{
  sessionId: string;
  generation: number;
  run: PhoneRunId;
  anchorY: number;
  directScene?: SceneId | undefined;
}>;

type ManagedPhoneActiveRun = {
  sessionId: string;
  generation: number;
  run: PhoneRunId;
  direction: PhoneTransitionDirection;
  anchorY: number;
  directScene?: SceneId | undefined;
};

type SessionControllerOptions = Readonly<{
  getSnapshot(): PhoneStorySnapshot;
  dispatch(event: PhoneStoryEvent): void;
  scrollY(): number;
  scrollTo(y: number): void;
  resolveLanding(scene: SceneId, fallbackY: number): number;
  registerEndpoints(endpoints: PhoneTransitionEndpoints): void;
  clearEndpoints(): void;
  scheduleFrame?: ((callback: () => void) => void) | undefined;
  disposed(): boolean;
}>;

export type PhoneOrchestratedSessionController = Readonly<{
  active(): PhoneActiveRun | null;
  activate(
    definition: PhoneRunDefinition,
    direction: PhoneTransitionDirection,
    anchorY: number,
    legIndex?: number,
    directScene?: SceneId,
    inputEpoch?: number | null
  ): PhoneOrchestratedRunSession;
  dispose(): void;
}>;

type CommitMode = 'forward' | 'rollback';

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
  let generation = 0;
  let sequence = 0;
  let scrollCommand = 0;
  let releaseLease: PhoneReleaseLease | undefined;
  let geometryReleased = false;

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
    } else if (
      session.sessionId !== run.sessionId
      || session.generation !== run.generation
      || session.operation.run !== run.run
      || session.operation.direction !== run.direction
    ) return null;
    return {
      authorityId: snapshot.authorityId,
      sessionId: session.sessionId,
      generation: session.generation,
      leg: session.operation.legIndex,
      direction: session.operation.direction
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
        confirmed: 'ROLLBACK_SCROLL_CONFIRMED',
        settled: 'ROLLBACK_STABLE_PRESENTATION_VERIFIED'
      } as const
    : {
        measuring: 'measuring-landing',
        aligning: 'aligning-scroll',
        verifying: 'verifying-stable',
        measured: 'LANDING_MEASURED',
        commanded: 'SCROLL_COMMANDED',
        confirmed: 'SCROLL_CONFIRMED',
        settled: 'STABLE_PRESENTATION_VERIFIED'
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
    const names = namesFor(mode);
    if (!emit(run, names.settled, {}, mode)) return;
    if (lease) schedule(() => releaseAfterStable(run, lease));
    else releaseAfterStable(run, lease);
  };
  const fail = (
    run: ManagedPhoneActiveRun,
    reason: 'capability-failed' | 'scroll-confirmation-failed' = 'capability-failed'
  ) => {
    const identity = identityFor(run);
    if (!identity) return;
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
      if (next.status === 'transaction' && next.session.phase === names.verifying) {
        finish(run, lease, mode);
      }
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
    const target = mode === 'forward'
      ? run.direction === 1 ? phoneRun(run.run).to : phoneRun(run.run).from
      : run.direction === 1 ? phoneRun(run.run).from : phoneRun(run.run).to;
    const landing = options.resolveLanding(target, run.anchorY);
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

  return {
    active: () => active,
    activate(definition, direction, anchorY, legIndex, directScene, inputEpoch = null) {
      const run: ManagedPhoneActiveRun = {
        sessionId: `phone-session-${++sequence}`,
        generation: ++generation,
        run: definition.id,
        direction,
        anchorY,
        ...(directScene ? { directScene } : {})
      };
      active = run;
      releaseLease = undefined;
      geometryReleased = false;
      const snapshot = options.getSnapshot();
      const initialLeg = legIndex ?? (direction === 1 ? 0 : definition.legs.length - 1);
      options.dispatch({
        authorityId: snapshot.authorityId,
        sessionId: run.sessionId,
        generation: run.generation,
        leg: initialLeg,
        direction,
        type: 'RUN_STARTED',
        run: definition.id,
        anchorY,
        inputEpoch,
        ...(legIndex === undefined ? {} : { legIndex }),
        trigger: inputEpoch === null ? 'auto' : 'input'
      });
      if (!owns(run)) active = null;

      return {
        get authorityId() {
          return identityFor(run)?.authorityId ?? snapshot.authorityId;
        },
        sessionId: run.sessionId,
        generation: run.generation,
        get leg() {
          return identityFor(run)?.leg ?? initialLeg;
        },
        direction,
        valid: () => owns(run),
        reportPresentedFrame: () => { emit(run, 'PRESENTED_FRAME'); },
        reportProgress: (progress) => { emit(run, 'PROGRESS_REPORTED', { progress }); },
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
        reportFailure: () => fail(run)
      };
    },
    dispose() {
      cancelAnimation?.();
      cancelAnimation = undefined;
      try {
        releaseResources(releaseGeometry());
      } finally {
        active = null;
        options.clearEndpoints();
      }
    }
  };
}
