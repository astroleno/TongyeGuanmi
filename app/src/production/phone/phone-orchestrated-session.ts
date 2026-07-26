import type { SceneId } from '../../story/types';
import {
  phoneRun,
  type PhoneRunDefinition,
  type PhoneRunId
} from './phone-story-runs';
import type {
  PhoneExecutionIdentity,
  PhoneStoryEvent,
  PhoneStorySnapshot
} from './phone-story-state';
import type { PhoneTransitionDirection } from './phone-transition-coordinator';
import { runPhoneProgressClock } from './phone-transition-coordinator';
import {
  beginPhoneSurfaceRoleTransaction,
  type PhoneSurfaceRoleTransaction
} from './phone-surface-roles';
import type {
  PhoneOrchestratedRunSession
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
  /** Input is held at this anchor until the transaction reaches a stable hold. */
  anchorY: number;
  directScene?: SceneId | undefined;
};

type SessionControllerOptions = Readonly<{
  getSnapshot(): PhoneStorySnapshot;
  dispatch(event: PhoneStoryEvent): void;
  scrollTo(y: number): void;
  /** The Orchestrator resolves a committed receiver's natural document top. */
  resolveLanding(scene: SceneId, fallbackY: number): number;
  onRetryable?: ((run: PhoneRunId) => void) | undefined;
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

/**
 * This controller intentionally owns no cursor, lock, anchor, or presentation
 * state. It only turns adapter callbacks and the owned progress clock into
 * identity-bearing reducer events.
 */
export function createPhoneOrchestratedSessionController(
  options: SessionControllerOptions
): PhoneOrchestratedSessionController {
  let active: ManagedPhoneActiveRun | null = null;
  let surfaceRoles: PhoneSurfaceRoleTransaction | undefined;
  let cancelAnimation: (() => void) | undefined;
  let generation = 0;
  let sequence = 0;
  let scrollCommand = 0;

  const snapshotIdentity = (
    run: ManagedPhoneActiveRun
  ): PhoneExecutionIdentity | null => {
    const snapshot = options.getSnapshot();
    if (options.disposed() || active !== run || snapshot.status !== 'transaction') {
      return null;
    }
    const { session } = snapshot;
    if (
      session.sessionId !== run.sessionId
      || session.generation !== run.generation
      || session.operation.run !== run.run
    ) return null;
    return {
      authorityId: snapshot.authorityId,
      sessionId: session.sessionId,
      generation: session.generation,
      leg: session.operation.legIndex
    };
  };

  const owns = (run: ManagedPhoneActiveRun) => snapshotIdentity(run) !== null;

  const dispatch = (
    run: ManagedPhoneActiveRun,
    type: Exclude<PhoneStoryEvent['type'], 'RUN_STARTED' | 'HOLD_RECONCILED' | 'SCROLL_RUN_RECONCILED' | 'SCROLL_SAMPLED'>,
    detail: Readonly<Record<string, unknown>> = {}
  ): PhoneExecutionIdentity | null => {
    const identity = snapshotIdentity(run);
    if (!identity) return null;
    options.dispatch({ ...identity, type, ...detail } as PhoneStoryEvent);
    return identity;
  };

  const schedule = (callback: () => void) => {
    (options.scheduleFrame
      ?? ((next) => window.requestAnimationFrame(next)))(callback);
  };

  const settleTerminal = (
    run: ManagedPhoneActiveRun,
    releaseAfterCommit: (() => void) | undefined
  ) => {
    if (!owns(run) || surfaceRoles) return;
    const snapshot = options.getSnapshot();
    if (
      snapshot.status !== 'transaction'
      || snapshot.session.phase !== 'verifying-target'
    ) {
      return;
    }
    const target = snapshot.session.operation.direction === 1
      ? phoneRun(run.run).to
      : phoneRun(run.run).from;
    const landing = options.resolveLanding(target, run.anchorY);
    run.anchorY = landing;

    if (!dispatch(run, 'TARGET_PRESENTED')) return;
    // A selected endpoint may change document flow. Preserve the old behavior
    // of pinning before the post-layout measurement, while the reducer keeps
    // the transaction visibly non-stable until confirmation.
    options.scrollTo(landing);
    if (!dispatch(run, 'LAYOUT_RELEASED')) return;

    const settle = () => {
      if (!owns(run)) return;
      if (!dispatch(run, 'LANDING_MEASURED', {
        targetY: landing,
        geometryRevision: 0,
        visualViewportOffsetTop: 0
      })) return;
      const commandId = ++scrollCommand;
      if (!dispatch(run, 'SCROLL_COMMANDED', { commandId })) return;
      if (!dispatch(run, 'SCROLL_CONFIRMED', {
        commandId,
        actualY: landing
      })) return;
      if (!dispatch(run, 'STABLE_PRESENTATION_VERIFIED')) return;

      const releaseSource = () => {
        if (options.disposed() || active !== run) return;
        try {
          releaseAfterCommit?.();
          // Endpoint release can change document flow. Reassert the committed
          // position after that mutation so scroll anchoring cannot move it.
          options.scrollTo(landing);
        } finally {
          if (active === run) active = null;
        }
      };
      if (releaseAfterCommit) schedule(releaseSource);
      else if (active === run) {
        options.scrollTo(landing);
        active = null;
      }
    };

    if (releaseAfterCommit) schedule(settle);
    else settle();
  };

  const rollback = (run: ManagedPhoneActiveRun) => {
    const identity = snapshotIdentity(run);
    if (!identity) return;
    cancelAnimation?.();
    cancelAnimation = undefined;
    surfaceRoles?.rollback();
    surfaceRoles?.release();
    surfaceRoles = undefined;
    options.dispatch({
      ...identity,
      type: 'FAILED',
      reason: 'capability-failed'
    });
    const snapshot = options.getSnapshot();
    if (snapshot.status === 'transaction' && snapshot.session.phase === 'rollback-rendering') {
      const operation = snapshot.session.operation;
      options.dispatch({
        authorityId: snapshot.authorityId,
        sessionId: snapshot.session.sessionId,
        generation: snapshot.session.generation,
        leg: operation.legIndex,
        type: 'ROLLBACK_COMMITTED'
      });
    }
    options.scrollTo(run.anchorY);
    if (active === run) active = null;
    options.onRetryable?.(run.run);
  };

  return {
    active: () => active,
    activate(definition, direction, anchorY, legIndex, directScene, inputEpoch = null) {
      const run: ManagedPhoneActiveRun = {
        sessionId: `phone-session-${++sequence}`,
        generation: ++generation,
        run: definition.id,
        anchorY,
        ...(directScene ? { directScene } : {})
      };
      active = run;
      const snapshot = options.getSnapshot();
      options.dispatch({
        authorityId: snapshot.authorityId,
        sessionId: run.sessionId,
        generation: run.generation,
        leg: legIndex ?? (direction === 1 ? 0 : definition.legs.length - 1),
        type: 'RUN_STARTED',
        run: definition.id,
        direction,
        anchorY,
        inputEpoch,
        ...(legIndex === undefined ? {} : { legIndex }),
        trigger: inputEpoch === null ? 'auto' : 'input'
      });
      if (!owns(run)) active = null;
      let releaseAfterCommit: (() => void) | undefined;

      return {
        sessionId: run.sessionId,
        generation: run.generation,
        valid: () => owns(run),
        reportPresentedFrame: () => {
          dispatch(run, 'PRESENTED_FRAME');
        },
        reportProgress: (progress) => {
          dispatch(run, 'PROGRESS_REPORTED', { progress });
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
              if (!owns(run)) return;
              dispatch(run, 'PROGRESS_REPORTED', { progress });
              render(progress);
            },
            () => {
              if (cancelAnimation === cancel) cancelAnimation = undefined;
              if (owns(run)) complete();
            }
          );
          cancelAnimation = cancel;
        },
        reportEndpoints: (source, receiver) => {
          if (!owns(run)) return;
          surfaceRoles?.rollback();
          surfaceRoles?.release();
          surfaceRoles = beginPhoneSurfaceRoleTransaction({
            source,
            receiver,
            sessionId: run.sessionId,
            generation: run.generation
          });
        },
        reportEndpointCommit: (endpoint) => {
          if (!owns(run)) return;
          if (surfaceRoles) {
            surfaceRoles.commit(endpoint);
            surfaceRoles.release();
            surfaceRoles = undefined;
          }
          if (endpoint !== 'receiver') return;
          if (!dispatch(run, 'LEG_COMPLETED')) return;
          settleTerminal(run, releaseAfterCommit);
        },
        reportEndpointRelease: () => {
          if (!owns(run) || !surfaceRoles) return;
          surfaceRoles.release();
          surfaceRoles = undefined;
        },
        provideRelease: (release) => {
          if (owns(run)) releaseAfterCommit = release;
        },
        reportAnimationComplete: () => {
          // Endpoint roles are authoritative evidence. A clock completion while
          // the receiver is still an endpoint must remain animating.
          if (surfaceRoles) return;
          if (!dispatch(run, 'LEG_COMPLETED')) return;
          settleTerminal(run, releaseAfterCommit);
        },
        reportFailure: () => rollback(run)
      };
    },
    dispose() {
      active = null;
      cancelAnimation?.();
      cancelAnimation = undefined;
      surfaceRoles?.release();
      surfaceRoles = undefined;
    }
  };
}
