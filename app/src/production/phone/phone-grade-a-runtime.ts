import { canonicalSceneIds } from '../../story/canonical-spine';
import type { SceneId } from '../../story/types';
import type { PhoneStoryRuntimePort } from './phone-story-orchestrator';
import {
  registerPhoneCompositeRunCapability,
  type PhoneCompositeSession
} from './phone-story-runtime';
import {
  phoneRun,
  type PhoneRunId
} from './phone-story-runs';
import { phoneSegmentPresentationTuple } from './phone-presentation-contract';
import type {
  PhoneExecutionToken,
  PhoneStorySnapshot
} from './phone-story-state';
import type { PhoneTransitionDirection } from './phone-transition-coordinator';
import type { PhoneTransitionAdapterHandle } from './types';

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
}>;

export type PhoneGradeARunner = Readonly<{
  dispose(): void;
}>;

type TargetPresentationRequest = Readonly<{
  progress: number;
  direction: PhoneTransitionDirection;
  runId: string;
  signal: AbortSignal;
}>;

function identityFor(
  session: PhoneCompositeSession,
  direction: PhoneTransitionDirection
): PhoneExecutionToken {
  return [session[0], session[1], session[2], session[3](), direction];
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

function reportRenderedBoundaryFrame(
  boundary: PhoneGradeABoundaryCapability,
  session: PhoneCompositeSession
): void {
  const run = phoneRun(phoneGradeARunForBoundary(boundary.id));
  const leg = run.legs[session[3]()];
  const requirement = leg
    ? phoneSegmentPresentationTuple(leg.segment)
    : undefined;
  if (!requirement) return;
  session[5](requirement[8], requirement[9]);
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

  const begin = (
    boundary: PhoneGradeABoundaryCapability,
    direction: PhoneTransitionDirection,
    session: PhoneCompositeSession
  ) => {
    if (!session[4]()) return false;

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
    const rollback = () => {
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
      if (session[4]()) session[13]();
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
      session[12](releaseEndpoint, releaseResources);
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
    const startRenderedTransition = () => {
      if (
        firstFrameReported
        || terminal
        || !transition
        || !session[4]()
      ) return;
      firstFrameReported = true;
      reportRenderedBoundaryFrame(boundary, session);
      if (!session[4]()) return;
      clearTimeoutResource();
      if (direction === 1) transition.enter?.();
      else transition.reverse?.();
      if (reducedMotion) complete();
      else animate();
    };
    const prepare = async () => {
      try {
        await waitForBoundaryReady(boundary, preparation.signal);
        if (preparation.signal.aborted || !session[4]() || terminal) return;
        transition = boundary.transition();
        const from = boundary.from();
        const to = boundary.to();
        if (!transition || !from || !to) {
          throw new Error('Phone Grade A boundary became unready');
        }
        const source = direction === 1 ? from : to;
        const receiver = direction === 1 ? to : from;
        session[8](source, receiver);
        transition.begin(
          identityFor(session, direction),
          startRenderedTransition
        );
        transition.commitEndpoint(direction === 1 ? 0 : 1);
        if (boundary.prepareReceiver) {
          await boundary.prepareReceiver({
            progress: direction === 1 ? 0 : 1,
            direction,
            runId: `${session[1]}:${session[2]}`,
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
      } catch {
        rollback();
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
      () => false
    )
));

  return {
    dispose() {
      for (const registration of registrations) registration.dispose();
      for (const dispose of [...disposeResources]) dispose();
    }
  };
}
