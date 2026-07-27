import { canonicalSceneIds } from '../../story/canonical-spine';
import type { SceneId } from '../../story/types';
import type { TargetPresentationRequest } from '../../story/presentation';
import type {
  PhoneOrchestratedRunSession,
  PhoneStoryRuntimePort
} from './phone-story-orchestrator';
import type { PhoneRunId } from './phone-story-runs';
import type { PhoneStoryCursor } from './phone-story-state';
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

export function phoneGradeABoundaryProgress(
  cursor: PhoneStoryCursor,
  boundary: PhoneGradeABoundaryId
): number {
  const run = phoneGradeARunForBoundary(boundary);
  if (cursor.kind === 'transition' && cursor.run === run) {
    return cursor.progress;
  }
  const stableScene = cursor.kind === 'hold'
    ? cursor.scene
    : cursor.runSource;
  return sceneIndex(stableScene)
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

export type PhoneGradeARunView = Readonly<{
  id: PhoneGradeABoundaryId;
  progress: number;
}>;

export type PhoneGradeARunner = Readonly<{
  dispose(): void;
}>;

type ActiveGradeARun = {
  boundary: PhoneGradeABoundaryCapability;
  direction: PhoneTransitionDirection;
  session: PhoneOrchestratedRunSession;
  transition?: PhoneTransitionAdapterHandle;
  preparation: AbortController;
  timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
  progress: number;
};

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

export function createPhoneGradeARunner({
  orchestrator,
  boundaries,
  reducedMotion,
  timeoutMs,
  onRunView
}: Readonly<{
  orchestrator: PhoneStoryRuntimePort;
  boundaries: readonly PhoneGradeABoundaryCapability[];
  reducedMotion: boolean;
  timeoutMs: number;
  onRunView(view: PhoneGradeARunView | null): void;
}>): PhoneGradeARunner {
  let active: ActiveGradeARun | null = null;

  const publish = (run: ActiveGradeARun | null) => {
    onRunView(run ? { id: run.boundary.id, progress: run.progress } : null);
  };
  const clear = (run: ActiveGradeARun) => {
    if (run.timeout !== undefined) globalThis.clearTimeout(run.timeout);
    run.timeout = undefined;
  };
  const release = (run: ActiveGradeARun) => {
    run.transition?.releaseEndpoint();
    delete run.transition;
    run.session.reportEndpointRelease();
  };
  const rollback = (run: ActiveGradeARun) => {
    if (active !== run) return;
    clear(run);
    run.preparation.abort();
    const endpoint = run.direction === 1 ? 0 : 1;
    run.progress = endpoint;
    run.transition?.commitEndpoint(endpoint);
    run.session.reportEndpointCommit('source');
    release(run);
    active = null;
    run.session.reportFailure();
    publish(null);
  };
  const complete = (run: ActiveGradeARun) => {
    if (active !== run || !run.session.valid()) return;
    const transition = run.transition;
    if (!transition) return rollback(run);
    clear(run);
    const endpoint = run.direction === 1 ? 1 : 0;
    run.progress = endpoint;
    run.session.reportProgress(endpoint);
    transition.commitEndpoint(endpoint);
    active = null;
    run.session.provideRelease({
      releaseGeometry() {
        release(run);
      },
      releaseResources() {
        publish(null);
      }
    });
    run.session.reportEndpointCommit('receiver');
    run.session.reportTargetPresented();
  };
  const animate = (run: ActiveGradeARun) => {
    const transition = run.transition;
    if (!transition) return rollback(run);
    run.session.animate(
      run.direction === 1 ? 0 : 1,
      run.direction === 1 ? 1 : 0,
      run.boundary.durationMs,
      (progress) => {
        if (active !== run) return;
        run.progress = progress;
        transition.render(progress);
        publish(run);
      },
      () => complete(run)
    );
  };
  const prepare = async (run: ActiveGradeARun) => {
    try {
      await waitForBoundaryReady(
        run.boundary,
        run.preparation.signal
      );
      if (
        active !== run
        || run.preparation.signal.aborted
        || !run.session.valid()
      ) return;
      const transition = run.boundary.transition();
      const from = run.boundary.from();
      const to = run.boundary.to();
      if (!transition || !from || !to) {
        throw new Error('Phone Grade A boundary became unready');
      }
      const source = run.direction === 1 ? from : to;
      const receiver = run.direction === 1 ? to : from;
      run.transition = transition;
      run.session.reportEndpoints(source, receiver);
      transition.begin({ identity: run.session });
      transition.commitEndpoint(run.progress as 0 | 1);
      if (run.boundary.prepareReceiver) {
        await run.boundary.prepareReceiver({
          progress: run.direction === 1 ? 0 : 1,
          direction: run.direction,
          runId: `${run.session.sessionId}:${run.session.generation}`,
          signal: run.preparation.signal
        });
      }
      await transition.prepare?.(
        run.direction,
        run.preparation.signal
      );
      if (
        active !== run
        || run.preparation.signal.aborted
        || !run.session.valid()
      ) return;
      run.session.reportPresentedFrame();
      if (run.timeout !== undefined) globalThis.clearTimeout(run.timeout);
      run.timeout = undefined;
      if (run.direction === 1) transition.enter?.();
      else transition.reverse?.();
      if (reducedMotion) complete(run);
      else animate(run);
    } catch {
      rollback(run);
    }
  };
  const begin = (
    boundary: PhoneGradeABoundaryCapability,
    direction: PhoneTransitionDirection,
    session: PhoneOrchestratedRunSession
  ) => {
    if (active || !session.valid()) return false;
    const preparation = new AbortController();
    const run: ActiveGradeARun = {
      boundary,
      direction,
      session,
      preparation,
      timeout: undefined,
      progress: direction === 1 ? 0 : 1
    };
    active = run;
    publish(run);
    run.timeout = globalThis.setTimeout(() => rollback(run), timeoutMs);
    void prepare(run);
    return true;
  };

  const registrations = boundaries.map((boundary) => (
    orchestrator.registerRunCapability(
      phoneGradeARunForBoundary(boundary.id),
      `grade-a-${boundary.id}`,
      {
        position: boundary.position,
        canStart: () => !active,
        start: (direction, session) => begin(boundary, direction, session)
      }
    )
  ));

  return {
    dispose() {
      for (const registration of registrations) registration.dispose();
      if (active) rollback(active);
    }
  };
}
