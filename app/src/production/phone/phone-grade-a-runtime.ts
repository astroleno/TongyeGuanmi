import { canonicalSceneIds } from '../../story/canonical-spine';
import type { TargetPresentationRequest } from '../../story/presentation';
import type { SceneId } from '../../story/types';
import { MediaPreparationError } from '../../media/media-preparation';
import type { PhoneStoryRuntimePort } from './phone-story/runtime';
import {
  registerPhoneCompositeRunCapability,
  type PhoneCompositeSession,
  type PhoneExecutionToken,
  type PhoneRenderedPresentationFrame,
  type PhoneStorySnapshot
} from './phone-story/runtime';
import {
  phoneRunLegTuple,
  type PhoneRunId
} from './phone-story-runs';
import {
  phoneSegmentPresentationTuple,
  type PhoneSurfaceId
} from './phone-story/manifest';
import type { PhoneFailureReason } from './phone-story/machine';
import type { PhoneTransitionDirection } from './phone-transition-coordinator';
import type {
  PhonePresentationAdapterHandle,
  PhoneTransitionAdapterHandle
} from './types';

export type PhoneGradeABoundaryId = 0 | 1 | 2;

const gradeARuns = [
  'method-figure2',
  'figure2-proof',
  'proof-brand'
] as const satisfies readonly PhoneRunId[];

const gradeATargetSceneIndex = gradeARuns.map((run) => {
  if (run === 'method-figure2') return canonicalSceneIds.indexOf('figure2-animation');
  if (run === 'figure2-proof') return canonicalSceneIds.indexOf('figure2-proof');
  return canonicalSceneIds.indexOf('brand');
});

function sceneIndex(scene: SceneId): number {
  return (canonicalSceneIds as readonly SceneId[]).indexOf(scene);
}

export function phoneGradeARunForBoundary(
  boundary: PhoneGradeABoundaryId
): PhoneRunId {
  return gradeARuns[boundary];
}

/**
 * Grade A has no independent completed/run view. Terminal endpoints and an
 * in-flight ink frame are projections of the authority's one snapshot.
 */
export function phoneGradeABoundaryProgress(
  snapshot: PhoneStorySnapshot,
  boundary: PhoneGradeABoundaryId
): number {
  const run = phoneGradeARunForBoundary(boundary);
  if (
    snapshot.status === 'transaction'
    && snapshot.session.operation.run === run
  ) {
    return snapshot.session.progress;
  }
  return sceneIndex(snapshot.projection.semanticScene)
      >= (gradeATargetSceneIndex[boundary] ?? Number.POSITIVE_INFINITY)
    ? 1
    : 0;
}

export type PhoneGradeABoundaryCapability = Readonly<{
  id: PhoneGradeABoundaryId;
  ready(): boolean;
  subscribeReady?(listener: () => void): () => void;
  position(direction: PhoneTransitionDirection): number | null;
  /** Authored playback duration; omitted only for boundaries with default ink timing. */
  durationMs?: number;
  transition(): PhoneTransitionAdapterHandle | null;
  from(): HTMLElement | null;
  to(): HTMLElement | null;
  prepareReceiver?(
    request: TargetPresentationRequest
  ): Promise<void>;
  /** The runner hands the exact static target token directly to this leaf. */
  reducedStaticTarget?(
    direction: PhoneTransitionDirection
  ): PhonePresentationAdapterHandle | null;
  /** The exact target surface for a reduced static token; never inferred. */
  reducedStaticSubject?(
    direction: PhoneTransitionDirection
  ): PhoneSurfaceId | null;
  /** Candidate-only target landing; route runtime owns the physical scroll. */
  reducedTargetPosition?(direction: PhoneTransitionDirection): number | null;
}>;

export type PhoneGradeARunner = Readonly<{
  dispose(): void;
}>;

function identityFor(
  boundary: PhoneGradeABoundaryCapability,
  session: PhoneCompositeSession,
  direction: PhoneTransitionDirection
): PhoneExecutionToken | null {
  const leg = phoneRunLegTuple(
    phoneGradeARunForBoundary(boundary.id),
    session[3]()
  );
  if (!leg) return null;
  const contract = phoneSegmentPresentationTuple(leg[0]);
  const token = session[15](contract[8], contract[9]);
  if (!token) return null;
  return [session[0], session[1], session[2], session[3](), direction, token];
}

function waitForBoundaryReady(
  boundary: PhoneGradeABoundaryCapability,
  signal: AbortSignal
): Promise<void> {
  if (boundary.ready()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let unsubscribe: () => void = () => undefined;
    let settled = false;
    const finish = (error?: DOMException) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      signal.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve();
    };
    const inspect = () => {
      if (signal.aborted) {
        finish(new DOMException(
          'Phone Grade A readiness aborted',
          'AbortError'
        ));
      } else if (boundary.ready()) {
        finish();
      }
    };
    const onAbort = () => finish(new DOMException(
      'Phone Grade A readiness aborted',
      'AbortError'
    ));
    unsubscribe = boundary.subscribeReady?.(inspect) ?? unsubscribe;
    signal.addEventListener('abort', onAbort, { once: true });
    inspect();
  });
}

/**
 * Registers Grade A's adapter effects with the shared session controller.
 * The controller owns phases, progress, and the active session; this module
 * retains only abortable adapter resources until their session releases them.
 */
export function createPhoneGradeARunner({
  orchestrator,
  boundaries,
  reducedMotion,
  timeoutMs
}: Readonly<{
  orchestrator: PhoneStoryRuntimePort;
  boundaries: readonly PhoneGradeABoundaryCapability[];
  reducedMotion: boolean;
  timeoutMs: number;
}>): PhoneGradeARunner {
  const disposeResources = new Set<() => void>();

  /*
   * An explicitly migrated boundary is hard-cut to the shared reduced
   * candidate contract. This branch owns admission only: it requests candidate
   * layout, hands the exact raw token to one endpoint leaf, and forwards that
   * leaf's post-paint fact. The shared machine owns timeout, rollback,
   * settling, and input.
   */
  const beginReducedStaticAdmission = (
    boundary: PhoneGradeABoundaryCapability,
    direction: PhoneTransitionDirection,
    session: PhoneCompositeSession
  ) => {
    const target = boundary.reducedStaticTarget?.(direction);
    const subject = boundary.reducedStaticSubject?.(direction);
    const targetY = boundary.reducedTargetPosition?.(direction);
    const requestReducedTargetLayout = session[17];
    const presentationFrameToken = session[15];
    const reportPresentationFrame = session[16];
    if (
      !session[4]()
      || !target
      || !subject
      || targetY === null
      || targetY === undefined
      || !Number.isFinite(targetY)
      || !requestReducedTargetLayout(targetY)
    ) return false;

    const token = presentationFrameToken('static-poster', subject);
    if (!token) return false;

    let disposed = false;
    let cancel = () => undefined;
    const disposeTarget = () => {
      if (disposed) return;
      disposed = true;
      target.disposePresentation?.(token);
      disposeResources.delete(cancel);
    };
    cancel = () => {
      disposeTarget();
      if (session[4]()) session[13]();
    };

    try {
      // Release follows the machine's stable/rollback decision, never a leaf
      // callback. This retires the token before the next admission can start.
      session[12](() => undefined, disposeTarget);
      disposeResources.add(cancel);
      target.presentPresentation(token, (frame) => {
        if (
          disposed
          || !session[4]()
          || frame.origin !== 'leaf-static-poster'
          || frame.token !== token
        ) return;
        reportPresentationFrame(frame);
      });
      return true;
    } catch {
      disposeTarget();
      return false;
    }
  };

  const begin = (
    boundary: PhoneGradeABoundaryCapability,
    direction: PhoneTransitionDirection,
    session: PhoneCompositeSession
  ) => {
    if (!session[4]()) return false;
    if (reducedMotion && boundary.reducedStaticTarget) {
      return beginReducedStaticAdmission(boundary, direction, session);
    }

    const preparation = new AbortController();
    let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
    let transition: PhoneTransitionAdapterHandle | null = null;
    let terminal = false;
    let released = false;
    let firstFrameReported = false;

    const clearTimeoutResource = () => {
      if (timeout === undefined) return;
      globalThis.clearTimeout(timeout);
      timeout = undefined;
    };
    const releaseEndpoint = () => {
      if (released) return;
      released = true;
      transition?.releaseEndpoint();
      if (transition) session[11]();
    };
    const releaseResources = () => {
      clearTimeoutResource();
      preparation.abort();
      disposeResources.delete(cancel);
    };
    const rollback = (reason: PhoneFailureReason = 'capability-failed') => {
      if (terminal) return;
      terminal = true;
      clearTimeoutResource();
      preparation.abort();
      const endpoint = direction === 1 ? 0 : 1;
      transition?.commitEndpoint(endpoint);
      if (transition) {
        session[9]('source');
        releaseEndpoint();
      }
      disposeResources.delete(cancel);
      if (session[4]()) session[13](reason);
    };
    const complete = () => {
      if (terminal || !session[4]() || !transition) {
        rollback();
        return;
      }
      terminal = true;
      clearTimeoutResource();
      const endpoint = direction === 1 ? 1 : 0;
      session[6](endpoint);
      transition.commitEndpoint(endpoint);
      // The endpoint lease is retired before the authority is told that the
      // receiver completed. The release callback remains idempotent and is
      // retained for the later resource-disposal phase.
      session[12](releaseEndpoint, releaseResources);
      releaseEndpoint();
      session[9]('receiver');
      session[10]();
    };
    const animate = () => {
      if (!transition) {
        rollback();
        return;
      }
      session[7](
        direction === 1 ? 0 : 1,
        direction === 1 ? 1 : 0,
        boundary.durationMs,
        (progress) => transition?.render(progress),
        complete
      );
    };
    const startRenderedTransition = (
      frame?: PhoneRenderedPresentationFrame
    ) => {
      if (
        firstFrameReported
        || terminal
        || !transition
        || !session[4]()
      ) return;
      if (!frame || !session[16](frame)) {
        rollback();
        return;
      }
      firstFrameReported = true;
      if (!session[4]()) return;
      clearTimeoutResource();
      if (direction === 1) transition.enter?.();
      else transition.reverse?.();
      // Boundaries without an explicit reduced static admission retain their
      // authored media/Ink lifecycle, so this path is controller-clocked
      // playback even when the global preference is reduced motion.
      animate();
    };
    const prepare = async () => {
      try {
        await waitForBoundaryReady(boundary, preparation.signal);
        if (preparation.signal.aborted || !session[4]() || terminal) return;
        transition = boundary.transition();
        const from = boundary.from();
        const to = boundary.to();
        if (!transition || !from || !to) {
          throw new Error('Grade A boundary unavailable');
        }
        const source = direction === 1 ? from : to;
        const receiver = direction === 1 ? to : from;
        session[8](source, receiver);
        const execution = identityFor(boundary, session, direction);
        if (!execution) {
          throw new Error('Grade A token stale');
        }
        transition.begin(
          execution,
          startRenderedTransition
        );
        transition.commitEndpoint(direction === 1 ? 0 : 1);
        if (boundary.prepareReceiver) {
          await boundary.prepareReceiver({
            progress: direction === 1 ? 0 : 1,
            direction,
            runId: `${session[1]}:${session[2]}`,
            presentationToken: execution[5]!,
            signal: preparation.signal
          });
        }
        await transition.prepare?.(direction, preparation.signal);
        if (preparation.signal.aborted || !session[4]() || terminal) return;
        // The reducer remains in prepare until the adapter confirms a real
        // in-between Ink frame for this exact execution token.
        transition.prepareFirstFrame?.(direction);
        if (!transition.prepareFirstFrame) {
          transition.render(direction === 1 ? .003 : .997);
        }
      } catch (error) {
        rollback(
          error instanceof MediaPreparationError
            ? 'media-failed'
            : 'capability-failed'
        );
      }
    };
    const cancel = () => rollback();
    disposeResources.add(cancel);
    timeout = globalThis.setTimeout(rollback, timeoutMs);
    void prepare();
    return true;
  };

  const registrations = boundaries.map((boundary) => (
    registerPhoneCompositeRunCapability(
      orchestrator,
      phoneGradeARunForBoundary(boundary.id),
      `grade-a-${boundary.id}`,
      boundary.position,
      () => true,
      (direction, session) => begin(boundary, direction, session),
      () => false,
      reducedMotion && Boolean(boundary.reducedStaticTarget)
    )
  ));

  return {
    dispose() {
      for (const registration of registrations) registration.dispose();
      for (const dispose of [...disposeResources]) dispose();
    }
  };
}
