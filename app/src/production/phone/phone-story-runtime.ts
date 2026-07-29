import type { SceneId } from '../../story/types';
import {
  phoneRun,
  type PhoneRunId,
  type PhoneScrollRunId
} from './phone-story-runs';
import { createPhoneStoryOrchestrator } from './phone-story-orchestrator';
import type {
  PhoneCapabilityLease,
  PhoneOrchestratedRunSession,
  PhoneStoryRuntimePort
} from './phone-story-orchestrator.types';
import { createPhoneStoryProjector } from './phone-story-projector';
import type { PhoneRouteScope } from './phone-route-scope';
import {
  createPhoneIntentCoordinator,
  type PhoneTransitionDirection
} from './phone-transition-coordinator';
import type {
  PhoneDirectEntryPresentationRequest,
  PhoneSurfaceKind
} from './phone-story-projector';
import type {
  PhonePresentationEvidenceKind,
  PhoneSurfaceId
} from './phone-presentation-contract';
import type {
  PhoneLandingReason,
  PhoneScrollCorridorLease
} from './phone-scroll-corridor-registry';
import {
  createPhoneDocumentScrollRuntime
} from './usePhoneDocumentScrollRuntime';
import type { PhoneDocumentScrollSample } from './usePhoneDocumentScrollRuntime';
import type {
  PhoneStorySnapshot,
  PhoneTransactionPhase
} from './phone-story-state';

export type PhoneStoryAuthority = Readonly<{
  authorityId: string;
  scope: PhoneRouteScope;
  /** The only value route descendants may receive through Context. */
  port: PhoneStoryRuntimePort;
  attach(): void;
  dispose(): void;
}>;

export type CreatePhoneStoryRuntimeOptions = Readonly<{
  scope: PhoneRouteScope;
  initialScene: SceneId;
  root: () => HTMLElement | null;
  scrollY: () => number;
  scrollTo: (y: number) => void;
  scheduleFrame?: ((callback: () => void) => void) | undefined;
}>;

/** Positional bridge for the independently minified React runtime chunk. */
export function createPhoneStoryRuntimeForReact(
  scope: PhoneRouteScope,
  initialScene: SceneId,
  root: () => HTMLElement | null,
  scrollY: () => number,
  scrollTo: (y: number) => void
): PhoneStoryAuthority {
  return createPhoneStoryRuntime({ scope, initialScene, root, scrollY, scrollTo });
}

/**
 * Builds a direct-entry event in the same minification unit as the runtime
 * port, so the event graph never crosses an independently mangled chunk.
 */
export function requestPhoneRuntimeDirectEntry(
  port: PhoneStoryRuntimePort,
  target: SceneId,
  source: 'initial' | 'hash' | 'menu' | 'history'
): void {
  const snapshot = port.getSnapshot();
  port.dispatch({
    type: 'DIRECT_ENTRY_REQUESTED',
    authorityId: snapshot.authorityId,
    target,
    source,
    fallbackScene: snapshot.status === 'stable'
      ? snapshot.scene
      : snapshot.projection.semanticScene,
    cinematic: null
  });
}

/** Builds navigation events beside the runtime-owned snapshot graph. */
export function requestPhoneRuntimeNavigation(
  port: PhoneStoryRuntimePort,
  scene: SceneId,
  source: 'hash' | 'menu' | 'history'
): void {
  port.dispatch({
    type: 'NAVIGATE_REQUESTED',
    authorityId: port.getSnapshot().authorityId,
    scene,
    source
  });
}

/** Bootstrap remains a runtime event so lazy shells never read authorityId. */
export function requestPhoneRuntimeBootstrap(port: PhoneStoryRuntimePort): void {
  port.dispatch({
    type: 'BOOTSTRAP_REQUESTED',
    authorityId: port.getSnapshot().authorityId,
    target: 'hero',
    fallbackScene: 'hero',
    cinematic: null
  });
}

/**
 * Own the reducer event shape beside the runtime port. Lazy samplers cross
 * this boundary with a positional sample, so property mangling cannot split
 * `SCROLL_SAMPLED` between independently minified chunks.
 */
export function reportPhoneRuntimeScrollSample(
  port: PhoneStoryRuntimePort,
  [actualY, corridor, scene, run, progress, direction]: PhoneDocumentScrollSample
): void {
  port.dispatch({
    type: 'SCROLL_SAMPLED',
    authorityId: port.getSnapshot().authorityId,
    actualY,
    corridor,
    ...(scene === null ? {} : { scene }),
    ...(run === null ? {} : { run }),
    progress,
    direction
  });
}

/** Positional run contracts for independently minified lazy executors. */
export function phoneRuntimeRunDependencies(
  run: PhoneRunId,
  legIndex?: number
): readonly string[] {
  const definition = phoneRun(run);
  const leg = legIndex === undefined ? null : definition.legs[legIndex];
  return leg
    ? [leg.from, leg.to, leg.segment]
    : [...definition.dependencies.scenes, ...definition.dependencies.transitions];
}

/**
 * A primitive-only view for lazy continuation modules. The selector executes
 * beside the snapshot producer, so independently minified lazy chunks never
 * need to know the physical names of the internal snapshot graph.
 */
export type PhoneCinematicSnapshot = readonly [
  semanticScene: SceneId,
  sourceSurface: string | null,
  receiverSurface: string,
  authorityId: string,
  sessionId: string | null,
  generation: number | null,
  run: PhoneRunId | null,
  direction: 1 | -1 | null,
  legIndex: number | null,
  phase: PhoneTransactionPhase | null,
  progress: number | null,
  status: PhoneStorySnapshot['status'],
  navigationScene: SceneId,
  stageOwner: PhoneStorySnapshot['projection']['stageOwner'],
  scrollActualY: number,
  scrollCorridor: PhoneStorySnapshot['scroll']['corridor'],
  scrollProgress: number,
  scrollRun: PhoneScrollRunId | null
];

export function selectPhoneCinematicSnapshot(
  snapshot: PhoneStorySnapshot
): PhoneCinematicSnapshot {
  const {
    semanticScene,
    sourceSurface,
    receiverSurface,
    navigationScene,
    stageOwner
  } = snapshot.projection;
  const session = snapshot.status === 'transaction' ? snapshot.session : null;
  const operation = session?.operation;
  return [
    semanticScene,
    sourceSurface,
    receiverSurface,
    snapshot.authorityId,
    session?.sessionId ?? null,
    session?.generation ?? null,
    operation?.run ?? null,
    operation?.direction ?? null,
    operation?.legIndex ?? null,
    session?.phase ?? null,
    session?.progress ?? null,
    snapshot.status,
    navigationScene,
    stageOwner,
    snapshot.scroll.actualY,
    snapshot.scroll.corridor,
    snapshot.scroll.progress,
    snapshot.status === 'scroll-run' ? snapshot.run : null
  ];
}

/**
 * Opaque session transport for lazy executors. Every callback is bound while
 * the runtime's own chunk still owns the concrete session object.
 */
export type PhoneCompositeSession = readonly [
  authorityId: string,
  sessionId: string,
  generation: number,
  leg: () => number,
  valid: () => boolean,
  reportPresentedFrame: (
    kind?: PhonePresentationEvidenceKind,
    subject?: PhoneSurfaceId
  ) => void,
  reportProgress: (progress: number) => void,
  animate: PhoneOrchestratedRunSession['animate'],
  reportEndpoints: (source: HTMLElement, receiver: HTMLElement) => void,
  reportEndpointCommit: (endpoint: 'source' | 'receiver') => void,
  reportTargetPresented: () => void,
  reportEndpointRelease: () => void,
  provideRelease: (
    releaseGeometry: () => void,
    releaseResources: () => void
  ) => void,
  reportFailure: () => void
];

function compositeSession(
  session: PhoneOrchestratedRunSession
): PhoneCompositeSession {
  return [
    session.authorityId,
    session.sessionId,
    session.generation,
    () => session.leg,
    session.valid,
    session.reportPresentedFrame,
    session.reportProgress,
    session.animate,
    session.reportEndpoints,
    session.reportEndpointCommit,
    session.reportTargetPresented,
    session.reportEndpointRelease,
    (releaseGeometry, releaseResources) => session.provideRelease({
      releaseGeometry,
      releaseResources
    }),
    session.reportFailure
  ];
}

export function registerPhoneCompositeRunCapability(
  port: PhoneStoryRuntimePort,
  run: PhoneRunId,
  ownerId: string,
  position: (direction: PhoneTransitionDirection) => number | null,
  canStart: (direction: PhoneTransitionDirection) => boolean,
  start: (
    direction: PhoneTransitionDirection,
    session: PhoneCompositeSession
  ) => boolean | void,
  startAtLeg: (
    legIndex: number,
    session: PhoneCompositeSession
  ) => boolean | void
): PhoneCapabilityLease {
  return port.registerRunCapability(run, ownerId, {
    position,
    canStart: (direction) => canStart(direction),
    start: (direction, session) => start(direction, compositeSession(session)),
    startAtLeg: (legIndex, session) => startAtLeg(
      legIndex,
      compositeSession(session)
    )
  });
}

export function syncPhoneRuntimeDiagnostics(port: PhoneStoryRuntimePort): void {
  port.syncDiagnostics();
}

export function registerPhoneRuntimeSurface(
  port: PhoneStoryRuntimePort,
  id: string,
  scene: SceneId,
  kind: PhoneSurfaceKind,
  root: () => HTMLElement | null,
  coverageRoot: () => HTMLElement | null,
  prepareDirectEntry?: (
    request: PhoneDirectEntryPresentationRequest
  ) => Promise<void> | void
): PhoneCapabilityLease {
  return port.registerSurface({
    id,
    scene,
    kind,
    root,
    coverageRoot,
    ...(prepareDirectEntry ? { prepareDirectEntry } : {})
  });
}

export function registerPhoneRuntimeScrollCorridor(
  port: PhoneStoryRuntimePort,
  id: string,
  scenes: readonly SceneId[],
  sampleDirection: (actualY: number, priorY: number) => -1 | 0 | 1,
  boundary: (
    run: PhoneRunId,
    direction: PhoneTransitionDirection
  ) => number | null,
  landing: (
    scene: SceneId,
    reason: PhoneLandingReason,
    direction: PhoneTransitionDirection,
    snapshot: PhoneCinematicSnapshot
  ) => number | null
): PhoneScrollCorridorLease {
  return port.registerScrollCorridor({
    id,
    scenes,
    sample(viewport) {
      return {
        actualY: viewport.actualY,
        direction: sampleDirection(
          viewport.actualY,
          port.getSnapshot().scroll.actualY
        )
      };
    },
    boundary,
    landing: (scene, reason, direction) => landing(
      scene,
      reason,
      direction,
      selectPhoneCinematicSnapshot(port.getSnapshot())
    )
  });
}

/**
 * Primitive-only scroll transport for lazy modules whose sampler needs more
 * than a direction. The named corridor object is assembled in this runtime
 * chunk so property mangling cannot split the protocol across chunks.
 */
export type PhoneRuntimeScrollSample = readonly [
  actualY: number,
  scene: SceneId | null,
  run: PhoneScrollRunId | null,
  direction: -1 | 0 | 1,
  progress: number | null
];

export function registerPhoneRuntimeSampledScrollCorridor(
  port: PhoneStoryRuntimePort,
  id: string,
  scenes: readonly SceneId[],
  sample: (
    actualY: number,
    viewportWidth: number,
    viewportHeight: number,
    visualViewportOffsetTop: number,
    snapshot: PhoneCinematicSnapshot
  ) => PhoneRuntimeScrollSample,
  boundary: (
    run: PhoneRunId,
    direction: PhoneTransitionDirection
  ) => number | null,
  landing: (
    scene: SceneId,
    reason: PhoneLandingReason,
    direction: PhoneTransitionDirection,
    snapshot: PhoneCinematicSnapshot
  ) => number | null
): PhoneScrollCorridorLease {
  return port.registerScrollCorridor({
    id,
    scenes,
    sample(viewport) {
      const [actualY, scene, run, direction, progress] = sample(
        viewport.actualY,
        viewport.viewportWidth,
        viewport.viewportHeight,
        viewport.visualViewportOffsetTop,
        selectPhoneCinematicSnapshot(port.getSnapshot())
      );
      return {
        actualY,
        ...(scene === null ? {} : { scene }),
        ...(run === null ? {} : { run }),
        direction,
        ...(progress === null ? {} : { progress })
      };
    },
    boundary,
    landing: (scene, reason, direction) => landing(
      scene,
      reason,
      direction,
      selectPhoneCinematicSnapshot(port.getSnapshot())
    )
  });
}

let authoritySequence = 0;
// This is a lifetime guard, not a shared runtime: each value is a distinct
// route-local authority and the weak key vanishes with its mounted root.
const attachedAuthorityByRoot = new WeakMap<HTMLElement, PhoneStoryAuthority>();

/**
 * The only route-local phone authority assembly root. Construction creates no
 * listeners, timers, media lease, DOM token, or global singleton; attach()
 * owns the route lifetime and dispose() invalidates every child handle.
 */
export function createPhoneStoryRuntime(
  options: CreatePhoneStoryRuntimeOptions
): PhoneStoryAuthority {
  const authorityId = `phone-authority-${++authoritySequence}`;
  const projector = createPhoneStoryProjector({
    authorityId,
    scope: options.scope,
    root: options.root
  });
  const engine = createPhoneStoryOrchestrator({
    authorityId,
    initialScene: options.initialScene,
    root: options.root,
    scrollY: options.scrollY,
    scrollTo: options.scrollTo,
    projector,
    ...(options.scheduleFrame ? { scheduleFrame: options.scheduleFrame } : {})
  });
  const port: PhoneStoryRuntimePort = engine;
  let attached = false;
  let disposed = false;
  let disposeCoordinator: (() => void) | undefined;
  let disposeDocumentScrollRuntime: (() => void) | undefined;
  let disposeBrowserReapply: (() => void) | undefined;

  const authority: PhoneStoryAuthority = {
    authorityId,
    scope: options.scope,
    port,
    attach() {
      if (disposed || attached) return;
      const root = options.root();
      if (!root) return;
      const prior = attachedAuthorityByRoot.get(root);
      if (prior && prior !== authority) prior.dispose();
      attachedAuthorityByRoot.set(root, authority);
      attached = true;
      projector.attach();
      port.syncDiagnostics();
      const page = root.ownerDocument;
      const pageWindow = page?.defaultView;
      if (pageWindow && page) {
        const reapplyCurrentProjection = () => projector.reapplyCurrent();
        pageWindow.addEventListener('pageshow', reapplyCurrentProjection);
        page.addEventListener('visibilitychange', reapplyCurrentProjection);
        disposeBrowserReapply = () => {
          pageWindow.removeEventListener('pageshow', reapplyCurrentProjection);
          page.removeEventListener('visibilitychange', reapplyCurrentProjection);
        };
      }
      if (pageWindow) {
        const scrollRuntime = createPhoneDocumentScrollRuntime({
          page: pageWindow,
          document: page,
          visualViewport: pageWindow.visualViewport,
          registry: engine.scrollCorridors,
          getSnapshot: port.getSnapshot,
          reportSample: (sample) => reportPhoneRuntimeScrollSample(port, sample),
          requestFrame: pageWindow.requestAnimationFrame.bind(pageWindow),
          cancelFrame: pageWindow.cancelAnimationFrame.bind(pageWindow)
        });
        disposeDocumentScrollRuntime = scrollRuntime.dispose;
        disposeCoordinator = createPhoneIntentCoordinator(
          root,
          engine.resolveIntent,
          {
            scrollY: options.scrollY,
            scrollTo: options.scrollTo,
            scrollState: () => {
              const snapshot = port.getSnapshot();
              return {
                revision: snapshot.revision,
                corridor: snapshot.scroll.corridor
              };
            },
            onNativeScrollCorrection: scrollRuntime.sampleNow
          }
        ).dispose;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeCoordinator?.();
      disposeCoordinator = undefined;
      disposeDocumentScrollRuntime?.();
      disposeDocumentScrollRuntime = undefined;
      disposeBrowserReapply?.();
      disposeBrowserReapply = undefined;
      const root = options.root();
      if (root && attachedAuthorityByRoot.get(root) === authority) {
        attachedAuthorityByRoot.delete(root);
      }
      engine.dispose();
    }
  };
  return authority;
}
