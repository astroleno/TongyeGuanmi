import type { SceneId } from '../../story/types';
import type { PhonePresentationEvidence } from './phone-story-presentation';
import type {
  PhoneRunDefinition,
  PhoneRunId
} from './phone-story-runs';
import {
  reducePhoneStoryCursor,
  startPhoneStoryRun,
  type PhoneStoryCursor
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
  /** Input is held at this anchor until the atomic endpoint landing replaces it. */
  anchorY: number;
  directScene?: SceneId | undefined;
};

type SessionControllerOptions = Readonly<{
  cursor(): PhoneStoryCursor;
  publishCursor(
    cursor: PhoneStoryCursor,
    publishHoldPresentation?: boolean
  ): void;
  publishPresentation(evidence: PhonePresentationEvidence): void;
  publishLock(locked: boolean): void;
  publishAnchor(anchorY?: number): void;
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
    directScene?: SceneId
  ): PhoneOrchestratedRunSession;
  dispose(): void;
}>;

export function createPhoneOrchestratedSessionController(
  options: SessionControllerOptions
): PhoneOrchestratedSessionController {
  let active: ManagedPhoneActiveRun | null = null;
  let surfaceRoles: PhoneSurfaceRoleTransaction | undefined;
  let cancelAnimation: (() => void) | undefined;
  let generation = 0;
  let sequence = 0;
  const owns = (run: ManagedPhoneActiveRun) => {
    const cursor = options.cursor();
    return !options.disposed()
      && active === run
      && cursor.kind === 'transition'
      && cursor.sessionId === run.sessionId
      && cursor.generation === run.generation;
  };
  const dispatch = (
    run: ManagedPhoneActiveRun,
    event: Parameters<typeof reducePhoneStoryCursor>[1]
  ) => {
    if (!owns(run)) return;
    options.publishCursor(reducePhoneStoryCursor(options.cursor(), event));
  };
  const commit = (
    run: ManagedPhoneActiveRun,
    anchorY?: number,
    releaseAfterCommit?: () => void
  ) => {
    if (!owns(run)) return;
    cancelAnimation?.();
    cancelAnimation = undefined;
    if (surfaceRoles) return;
    const committing = reducePhoneStoryCursor(options.cursor(), {
      type: 'COMMIT',
      sessionId: run.sessionId,
      generation: run.generation
    });
    if (
      committing.kind !== 'transition'
      || committing.phase !== 'committing'
    ) return;
    options.publishCursor(committing);
    const landing = reducePhoneStoryCursor(committing, {
      type: 'LAND',
      sessionId: run.sessionId,
      generation: run.generation
    });
    if (landing.kind !== 'transition' || landing.phase !== 'landing') return;
    options.publishCursor(landing);
    if (anchorY !== undefined) {
      run.anchorY = anchorY;
      options.publishAnchor(anchorY);
      options.scrollTo(anchorY);
    }
    const settle = () => {
      const releasing = reducePhoneStoryCursor(options.cursor(), {
        type: 'RELEASE',
        sessionId: run.sessionId,
        generation: run.generation
      });
      if (releasing.kind !== 'transition' || releasing.phase !== 'releasing') {
        return;
      }
      options.publishCursor(releasing);
      const settled = reducePhoneStoryCursor(options.cursor(), {
        type: 'SETTLE',
        sessionId: run.sessionId,
        generation: run.generation
      });
      if (settled.kind !== 'hold') return;
      // Hold publishes the target visual owner and its landing before the
      // source compositor is allowed to release. This keeps one stable frame
      // between handoff and teardown.
      options.publishCursor(settled);
      const releaseSource = () => {
        if (options.disposed() || active !== run) return;
        try {
          releaseAfterCommit?.();
          // Endpoint release can change document flow. Reassert the committed
          // position after that mutation so browser scroll anchoring cannot
          // move the newly committed receiver out of the viewport.
          if (anchorY !== undefined) options.scrollTo(anchorY);
        } finally {
          if (active !== run) return;
          active = null;
          options.publishAnchor();
          options.publishLock(false);
        }
      };
      if (releaseAfterCommit) {
        (options.scheduleFrame
          ?? ((callback) => window.requestAnimationFrame(callback)))(releaseSource);
      } else {
        releaseSource();
      }
    };
    if (releaseAfterCommit) {
      (options.scheduleFrame
        ?? ((callback) => window.requestAnimationFrame(callback)))(settle);
    } else {
      settle();
    }
  };
  const rollback = (run: ManagedPhoneActiveRun, anchorY?: number) => {
    if (!owns(run)) return;
    cancelAnimation?.();
    cancelAnimation = undefined;
    surfaceRoles?.rollback();
    surfaceRoles?.release();
    surfaceRoles = undefined;
    let cursor = reducePhoneStoryCursor(options.cursor(), {
      type: 'FAIL',
      sessionId: run.sessionId,
      generation: run.generation
    });
    options.publishCursor(cursor);
    cursor = reducePhoneStoryCursor(cursor, {
      type: 'ROLLBACK_COMMITTED',
      sessionId: run.sessionId,
      generation: run.generation
    });
    options.publishCursor(cursor, !run.directScene);
    if (run.directScene) {
      options.publishPresentation({ scene: run.directScene });
    }
    options.scrollTo(anchorY ?? run.anchorY);
    active = null;
    options.publishAnchor();
    options.publishLock(false);
    options.onRetryable?.(run.run);
  };
  return {
    active: () => active,
    activate(definition, direction, anchorY, legIndex, directScene) {
      const run: ManagedPhoneActiveRun = {
        sessionId: `phone-session-${++sequence}`,
        generation: ++generation,
        run: definition.id,
        anchorY,
        ...(directScene ? { directScene } : {})
      };
      active = run;
      options.publishAnchor(anchorY);
      const cursor = startPhoneStoryRun(
        options.cursor(),
        definition.id,
        direction,
        run,
        legIndex
      );
      options.publishCursor(cursor);
      options.publishLock(true);
      let releaseAfterCommit: (() => void) | undefined;
      const terminalLeg = () => {
        const cursor = options.cursor();
        return cursor.kind === 'transition'
          && cursor.sessionId === run.sessionId
          && cursor.generation === run.generation
          && (direction === 1
            ? cursor.legIndex === definition.legs.length - 1
            : cursor.legIndex === 0);
      };
      const commitTerminal = () => {
        if (!terminalLeg()) return;
        const target = direction === 1 ? definition.to : definition.from;
        commit(
          run,
          options.resolveLanding(target, run.anchorY),
          releaseAfterCommit
        );
      };
      return {
        sessionId: run.sessionId,
        generation: run.generation,
        valid: () => owns(run),
        reportPresentedFrame: () => dispatch(run, {
          type: 'PHASE',
          sessionId: run.sessionId,
          generation: run.generation,
          phase: 'presented-frame-ready'
        }),
        reportAnimationStarted: () => dispatch(run, {
          type: 'PHASE',
          sessionId: run.sessionId,
          generation: run.generation,
          phase: 'animating'
        }),
        reportProgress: (progress) => dispatch(run, {
          type: 'PROGRESS',
          sessionId: run.sessionId,
          generation: run.generation,
          progress
        }),
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
              dispatch(run, {
                type: 'PROGRESS',
                sessionId: run.sessionId,
                generation: run.generation,
                progress
              });
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
          if (terminalLeg()) {
            commitTerminal();
          } else {
            dispatch(run, {
              type: 'ADVANCE_LEG',
              sessionId: run.sessionId,
              generation: run.generation
            });
          }
        },
        reportEndpointRelease: () => {
          if (!owns(run) || !surfaceRoles) return;
          surfaceRoles.release();
          surfaceRoles = undefined;
        },
        provideRelease: (release) => {
          if (owns(run)) releaseAfterCommit = release;
        },
        reportAnimationComplete: () => commitTerminal(),
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
