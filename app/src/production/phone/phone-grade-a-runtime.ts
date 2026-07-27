import { canonicalSceneIds } from '../../story/canonical-spine';
import type { SceneId } from '../../story/types';
import type {
  PhoneOrchestratedRunSession,
  PhoneStoryRuntimePort
} from './phone-story-orchestrator';
import type { PhoneRunId } from './phone-story-runs';
import type { PhoneStorySnapshot } from './phone-story-state';
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

  const begin = (
    boundary: PhoneGradeABoundaryCapability,
    direction: PhoneTransitionDirection,
    session: PhoneOrchestratedRunSession
  ) => {
    if (!session.valid()) return false;

    const preparation = new AbortController();
    let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
    let transition: PhoneTransitionAdapterHandle | null = null;
    let terminal = false;
    let released = false;

    const clearTimeoutResource = () => {
      if (timeout === undefined) return;
      globalThis.clearTimeout(timeout);
      timeout = undefined;
    };
    const releaseEndpoint = () => {
      if (released) return;
      released = true;
      transition?.releaseEndpoint();
      if (transition) session.reportEndpointRelease();
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
        session.reportEndpointCommit('source');
        releaseEndpoint();
      }
      disposeResources.delete(cancel);
      if (session.valid()) session.reportFailure();
    };
    const complete = () => {
      if (terminal || !session.valid() || !transition) {
        rollback();
        return;
      }
      terminal = true;
      clearTimeoutResource();
      const endpoint = direction === 1 ? 1 : 0;
      session.reportProgress(endpoint);
      transition.commitEndpoint(endpoint);
      session.provideRelease({
        releaseGeometry() {
          releaseEndpoint();
        },
        releaseResources
      });
      session.reportEndpointCommit('receiver');
      session.reportTargetPresented();
    };
    const animate = () => {
      if (!transition) {
        rollback();
        return;
      }
      session.animate(
        direction === 1 ? 0 : 1,
        direction === 1 ? 1 : 0,
        boundary.durationMs,
        (progress) => transition?.render(progress),
        complete
      );
    };
    const prepare = async () => {
      try {
        await waitForBoundaryReady(boundary, preparation.signal);
        if (preparation.signal.aborted || !session.valid() || terminal) return;
        transition = boundary.transition();
        const from = boundary.from();
        const to = boundary.to();
        if (!transition || !from || !to) {
          throw new Error('Phone Grade A boundary became unready');
        }
        const source = direction === 1 ? from : to;
        const receiver = direction === 1 ? to : from;
        session.reportEndpoints(source, receiver);
        transition.begin({ identity: session });
        transition.commitEndpoint(direction === 1 ? 0 : 1);
        if (boundary.prepareReceiver) {
          await boundary.prepareReceiver({
            progress: direction === 1 ? 0 : 1,
            direction,
            runId: `${session.sessionId}:${session.generation}`,
            signal: preparation.signal
          });
        }
        await transition.prepare?.(direction, preparation.signal);
        if (preparation.signal.aborted || !session.valid() || terminal) return;
        session.reportPresentedFrame();
        clearTimeoutResource();
        if (direction === 1) transition.enter?.();
        else transition.reverse?.();
        if (reducedMotion) complete();
        else animate();
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
    orchestrator.registerRunCapability(
      phoneGradeARunForBoundary(boundary.id),
      `grade-a-${boundary.id}`,
      {
        position: boundary.position,
        canStart: () => true,
        start: (direction, session) => begin(boundary, direction, session)
      }
    )
 ));

  return {
    dispose() {
      for (const registration of registrations) registration.dispose();
      for (const dispose of [...disposeResources]) dispose();
    }
  };
}
