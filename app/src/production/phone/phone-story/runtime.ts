import {
  HERO_PATTERN_INK_MS,
  HERO_PATTERN_MOTION_MS,
  HERO_PATTERN_MOTION_STOP,
  PATTERN_COLLAPSE_MS,
  PATTERN_STAR_MAP_INK_MS
} from '../../../story/timings';
import type { SceneId } from '../../../story/types';
import {
  phoneRunDependencies,
  phoneRunLegTuple,
  type PhoneRunId,
  type PhoneScrollRunId
} from '../phone-story-runs';
import { createPhoneStoryRuntimeEngine } from './runtime/engine';
import type {
  PhoneAodExecution,
  PhoneAodRunSession,
  PhoneCapabilityLease,
  PhoneOrchestratedRunSession,
  PhoneStoryRuntimePort
} from './runtime/types';
import type { PhoneRouteScope } from '../phone-route-scope';
import {
  createPhoneIntentCoordinator,
  type PhoneTransitionDirection
} from '../phone-transition-coordinator';
import type {
  PhoneDirectEntryPresentationRequest,
  PhoneEffectRegistration,
  PhonePresentationAdapter,
  PhoneRenderedPresentationFrame,
  PhoneSurfaceKind
} from './presentation';
import { createPhoneStoryPresentation } from './presentation';
import type {
  PhonePresentationProofKind,
  PhoneSurfaceId
} from './manifest';
import type {
  PhoneLandingReason,
  PhoneScrollCorridorLease
} from '../phone-scroll-corridor-registry';
import {
  createPhoneDocumentScrollRuntime
} from '../usePhoneDocumentScrollRuntime';
import type { PhoneDocumentScrollSample } from '../usePhoneDocumentScrollRuntime';
import type {
  PhoneStorySnapshot,
  PhoneFailureReason,
  PhoneTransactionPhase,
  PhoneExecutionToken,
  PresentationToken
} from './machine';
import type { PhoneAodStartResult } from '../aod-autoplay';
import type {
  PhoneHeroAdapterHandle,
  PhoneSceneAdapterHandle,
  PhoneTransitionAdapterHandle
} from '../types';

export type {
  PhoneCapabilityLease,
  PhoneOrchestratedRunSession,
  PhoneReleaseLease,
  PhoneRunCapability,
  PhoneStoryRuntimePort
} from './runtime/types';
export { phoneRuntimePresentationTokenKey } from './runtime/types';
export type {
  PhonePresentationAdapter,
  PhoneRenderedPresentationFrame
} from './presentation';
export type {
  PhoneExecutionToken,
  PhoneStorySnapshot,
  PresentationProof,
  PresentationReadiness,
  PresentationToken
} from './machine';
export type { PhoneAodExecution } from './runtime/types';

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
    // The formal shell deliberately starts its runtime on Hero while a
    // direct-entry visual plane is still closed. Initial admission must not
    // reinterpret that bootstrap hold as the target's visual source: the
    // target owns its own candidate fallback until its exact proof commits.
    fallbackScene: source === 'initial'
      ? target
      : snapshot.status === 'stable'
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
  [
    actualY,
    corridor,
    scene,
    run,
    progress,
    direction,
    reducedMotion,
    inputEpoch
  ]: PhoneDocumentScrollSample
): void {
  port.dispatch({
    type: 'SCROLL_SAMPLED',
    authorityId: port.getSnapshot().authorityId,
    actualY,
    corridor,
    ...(scene === null ? {} : { scene }),
    ...(run === null ? {} : { run }),
    progress,
    direction,
    ...(reducedMotion === undefined ? {} : { reducedMotion }),
    ...(inputEpoch === undefined ? {} : { inputEpoch })
  });
}

/** Positional run contracts for independently minified lazy executors. */
export function phoneRuntimeRunDependencies(
  run: PhoneRunId,
  legIndex?: number
): readonly string[] {
  const leg = legIndex === undefined ? null : phoneRunLegTuple(run, legIndex);
  return leg
    ? [leg[1], leg[2], leg[0]]
    : phoneRunDependencies(run);
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
  scrollRun: PhoneScrollRunId | null,
  /** Immutable revision carried by raw leaf frame tokens. */
  presentationRevision: number | null
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
    snapshot.status === 'scroll-run' ? snapshot.run : null,
    session?.presentationRevision ?? null
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
  /**
   * Tombstone retained for this positional lazy-chunk transport. New callers
   * cannot synthesize a frame: every proof path uses slots 15/16 below.
   */
  retiredRenderedFrame: null,
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
  reportFailure: (reason?: PhoneFailureReason) => void,
  presentationProofToken: (
    kind: PhonePresentationProofKind,
    subject: PhoneSurfaceId
  ) => PresentationToken | null,
  presentationFrameToken: (
    kind: PhonePresentationProofKind,
    subject: PhoneSurfaceId
  ) => PresentationToken | null,
  reportPresentationFrame: (
    frame: PhoneRenderedPresentationFrame
  ) => boolean,
  requestReducedTargetLayout: (targetY: number) => boolean
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
    null,
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
    session.reportFailure,
    session.presentationProofToken,
    session.presentationFrameToken,
    session.reportPresentationFrame,
    session.requestReducedTargetLayout
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
  ) => boolean | void,
  reducedMotion = false
): PhoneCapabilityLease {
  return port.registerRunCapability(run, ownerId, {
    reducedMotion,
    position,
    canStart: (direction) => canStart(direction),
    start: (direction, session) => start(direction, compositeSession(session)),
    startAtLeg: (legIndex, session) => startAtLeg(
      legIndex,
      compositeSession(session)
    )
  });
}

const PHONE_FRONT_STAGE_ADMISSION_TIMEOUT_MS = 8_000;

type PhoneFrontStageRunId = Extract<
  PhoneRunId,
  'hero-pattern' | 'pattern-collapse' | 'pattern-star-map'
>;

export type PhoneRuntimeFrontStageConfig = Readonly<{
  position(
    run: PhoneFrontStageRunId,
    direction: PhoneTransitionDirection
  ): number | null;
  hero(): PhoneHeroAdapterHandle | null;
  pattern(): PhoneSceneAdapterHandle | null;
  starMap(): PhoneSceneAdapterHandle | null;
  heroPattern(): PhoneTransitionAdapterHandle | null;
  patternStarMap(): PhoneTransitionAdapterHandle | null;
  reducedMotion: boolean;
}>;

export type PhoneRuntimeFrontStageRegistration = Readonly<{
  dispose(): void;
}>;

type ActiveFrontStageRun = [
  session: PhoneOrchestratedRunSession,
  transition: PhoneTransitionAdapterHandle | null,
  staticTarget: PhoneSceneAdapterHandle | null,
  staticToken: PresentationToken | null,
  admissionTimeout: ReturnType<typeof globalThis.setTimeout> | undefined
];

function frontStageTarget(
  config: PhoneRuntimeFrontStageConfig,
  run: PhoneFrontStageRunId,
  direction: PhoneTransitionDirection
): readonly [PhoneSceneAdapterHandle | null, PhoneSurfaceId] {
  switch (run) {
    case 'hero-pattern':
      return direction === 1
        ? [config.pattern(), 'front:pattern']
        : [config.hero(), 'front:hero'];
    case 'pattern-collapse':
      return [config.pattern(), 'front:pattern'];
    case 'pattern-star-map':
      return direction === 1
        ? [config.starMap(), 'front:star-map']
        : [config.pattern(), 'front:pattern'];
  }
}

function frontStageEndpoints(
  config: PhoneRuntimeFrontStageConfig,
  run: Exclude<PhoneFrontStageRunId, 'pattern-collapse'>
): readonly [HTMLElement, HTMLElement, PhoneTransitionAdapterHandle] | null {
  const transition = run === 'hero-pattern'
    ? config.heroPattern()
    : config.patternStarMap();
  const forward = run === 'hero-pattern'
    ? [config.hero(), config.pattern()]
    : [config.pattern(), config.starMap()];
  // Keep the transition's structural roles canonical in both directions. The
  // runner reverses only the authored progress clock; swapping these endpoints
  // here and again inside the ink bridge would invert the geometry twice.
  const [from, to] = forward;
  const source = from?.root() ?? null;
  const receiver = to?.root() ?? null;
  return transition && source && receiver
    ? [source, receiver, transition]
    : null;
}

/**
 * The machine is the exact token validator. The runner only accepts a leaf
 * static origin and forwards that original raw frame without rebuilding it.
 */
function isFrontStageStaticFrame(frame: PhoneRenderedPresentationFrame): boolean {
  return frame.origin === 'leaf-static-poster'
    || frame.origin === 'leaf-post-paint';
}

/**
 * One machine-owned front-stage runner replaces the old scroll-percent
 * writers. It owns admission, the authored playback clocks, terminal cleanup,
 * and all cancellation. Leaves only render their exact token-bound frames.
 */
export function registerPhoneRuntimeFrontStageCapability(
  port: PhoneStoryRuntimePort,
  config: PhoneRuntimeFrontStageConfig
): PhoneRuntimeFrontStageRegistration {
  let active: ActiveFrontStageRun | null = null;
  const leases: PhoneCapabilityLease[] = [];

  const clearAdmissionTimeout = (record: ActiveFrontStageRun) => {
    if (record[4] !== undefined) {
      globalThis.clearTimeout(record[4]);
      record[4] = undefined;
    }
  };
  const release = (record: ActiveFrontStageRun) => {
    if (active !== record) return;
    active = null;
    clearAdmissionTimeout(record);
    record[1]?.releaseEndpoint();
    if (record[2] && record[3]) {
      record[2].disposePresentation?.(record[3]);
    }
  };
  const owns = (record: ActiveFrontStageRun) => (
    active === record && record[0].valid()
  );
  const fail = (record: ActiveFrontStageRun) => {
    if (owns(record)) record[0].reportFailure('dependency-timeout');
  };
  const retain = (record: ActiveFrontStageRun) => {
    record[0].provideRelease({
      releaseGeometry: () => record[1]?.releaseEndpoint(),
      releaseResources: () => release(record)
    });
  };
  const armAdmissionTimeout = (record: ActiveFrontStageRun) => {
    clearAdmissionTimeout(record);
    record[4] = globalThis.setTimeout(() => fail(record),
      PHONE_FRONT_STAGE_ADMISSION_TIMEOUT_MS);
  };
  const startStatic = (
    target: PhoneSceneAdapterHandle,
    subject: PhoneSurfaceId,
    session: PhoneOrchestratedRunSession,
    deadline: boolean,
    accepted?: (record: ActiveFrontStageRun) => void
  ): boolean => {
    const token = session.presentationFrameToken('static-poster', subject);
    if (!token) return false;
    const record: ActiveFrontStageRun = [session, null, target, token, undefined];
    active = record;
    retain(record);
    if (deadline) armAdmissionTimeout(record);
    try {
      target.presentPresentation?.(token, (frame) => {
        if (
          !owns(record)
          || !isFrontStageStaticFrame(frame)
          || !session.reportPresentationFrame(frame)
        ) return;
        clearAdmissionTimeout(record);
        accepted?.(record);
      });
      return true;
    } catch {
      release(record);
      return false;
    }
  };
  const beginReducedStatic = (
    run: PhoneFrontStageRunId,
    direction: PhoneTransitionDirection,
    session: PhoneOrchestratedRunSession
  ): boolean => {
    const [target, subject] = frontStageTarget(config, run, direction);
    const targetY = config.position(run, direction);
    if (
      !target
      || targetY === null
      || !Number.isFinite(targetY)
      || !session.requestReducedTargetLayout(targetY)
    ) return false;
    return startStatic(target, subject, session, false);
  };
  const startCollapse = (
    direction: PhoneTransitionDirection,
    session: PhoneOrchestratedRunSession
  ): boolean => {
    const pattern = config.pattern();
    if (!pattern) return false;
    return startStatic(
      pattern,
      'front:pattern',
      session,
      true,
      (record) => {
        session.animate(
          direction === 1 ? 0 : 1,
          direction === 1 ? 1 : 0,
          PATTERN_COLLAPSE_MS,
          (progress) => config.pattern()?.update(progress),
          () => {
            if (!owns(record)) return;
            config.pattern()?.update(direction === 1 ? 1 : 0);
            session.reportAnimationComplete();
          }
        );
      }
    );
  };
  const startInk = (
    run: Exclude<PhoneFrontStageRunId, 'pattern-collapse'>,
    direction: PhoneTransitionDirection,
    session: PhoneOrchestratedRunSession
  ): boolean => {
    const endpoints = frontStageEndpoints(config, run);
    const token = session.presentationFrameToken('effect-frame', 'front:ink');
    if (!endpoints || !token) return false;
    const [from, to, transition] = endpoints;
    // Admission diagnostics still describe the physical source/receiver for
    // this direction, but the transition receives canonical geometry roles.
    const [source, receiver] = direction === 1
      ? [from, to]
      : [to, from];
    const record: ActiveFrontStageRun = [session, transition, null, null, undefined];
    active = record;
    retain(record);
    armAdmissionTimeout(record);
    const execution: PhoneExecutionToken = [
      session.authorityId,
      session.sessionId,
      session.generation,
      session.leg,
      direction,
      token
    ];
    const completeInk = () => {
      if (!owns(record)) return;
      const endpoint = direction === 1 ? 1 : 0;
      transition.render(endpoint);
      transition.commitEndpoint(endpoint);
      // The visual effect has reached its terminal endpoint. Retire the
      // transition endpoint lease before publishing LEG_COMPLETED so the
      // candidate projection can expose the target's own stable surface for
      // its exact post-paint proof. Resource/media cleanup remains owned by
      // the retained release lease and waits until the stable commit.
      session.reportEndpointRelease();
      session.reportAnimationComplete();
    };
    const animatePatternInk = () => {
      session.animate(
        direction === 1 ? 0 : 1,
        direction === 1 ? 1 : 0,
        PATTERN_STAR_MAP_INK_MS,
        (progress) => {
          config.pattern()?.update(1);
          config.starMap()?.update(progress);
          transition.render(progress);
        },
        () => {
          config.pattern()?.update(1);
          config.starMap()?.update(direction === 1 ? 1 : 0);
          completeInk();
        }
      );
    };
    const animateHeroPattern = () => {
      if (direction === 1) {
        session.animate(
          0,
          HERO_PATTERN_MOTION_STOP,
          HERO_PATTERN_MOTION_MS,
          (progress) => {
            config.hero()?.update(progress / HERO_PATTERN_MOTION_STOP);
            config.pattern()?.update(0);
            transition.render(0);
          },
          () => {
            if (!owns(record)) return;
            transition.enter?.();
            session.animate(
              HERO_PATTERN_MOTION_STOP,
              1,
              HERO_PATTERN_INK_MS,
              (progress) => {
                config.hero()?.update(1);
                config.pattern()?.update(0);
                transition.render(
                  (progress - HERO_PATTERN_MOTION_STOP)
                  / (1 - HERO_PATTERN_MOTION_STOP)
                );
              },
              completeInk
            );
          }
        );
        return;
      }
      transition.reverse?.();
      session.animate(
        1,
        HERO_PATTERN_MOTION_STOP,
        HERO_PATTERN_INK_MS,
        (progress) => {
          config.hero()?.update(1);
          config.pattern()?.update(0);
          transition.render(
            (progress - HERO_PATTERN_MOTION_STOP)
            / (1 - HERO_PATTERN_MOTION_STOP)
          );
        },
        () => {
          if (!owns(record)) return;
          session.animate(
            HERO_PATTERN_MOTION_STOP,
            0,
            HERO_PATTERN_MOTION_MS,
            (progress) => {
              config.hero()?.update(progress / HERO_PATTERN_MOTION_STOP);
              config.pattern()?.update(0);
              transition.render(0);
            },
            () => {
              config.hero()?.update(0);
              config.pattern()?.update(0);
              completeInk();
            }
          );
        }
      );
    };
    try {
      session.reportEndpoints(source, receiver);
      transition.begin(execution, (frame) => {
        if (!owns(record) || !frame || !session.reportPresentationFrame(frame)) {
          fail(record);
          return;
        }
        clearAdmissionTimeout(record);
        if (run === 'hero-pattern') animateHeroPattern();
        else {
          if (direction === 1) transition.enter?.();
          else transition.reverse?.();
          animatePatternInk();
        }
      });
      transition.commitEndpoint(direction === 1 ? 0 : 1);
      transition.prepareFirstFrame?.(direction);
      if (!transition.prepareFirstFrame) {
        transition.render(direction === 1 ? .002 : .998);
      }
      return true;
    } catch {
      release(record);
      return false;
    }
  };
  const start = (
    run: PhoneFrontStageRunId,
    direction: PhoneTransitionDirection,
    session: PhoneOrchestratedRunSession
  ) => {
    if (active) release(active);
    if (config.reducedMotion) return beginReducedStatic(run, direction, session);
    return run === 'pattern-collapse'
      ? startCollapse(direction, session)
      : startInk(run, direction, session);
  };
  for (const run of [
    'hero-pattern',
    'pattern-collapse',
    'pattern-star-map'
  ] as const satisfies readonly PhoneFrontStageRunId[]) {
    leases.push(port.registerRunCapability(run, `front-stage:${run}`, {
      reducedMotion: config.reducedMotion,
      position: (direction) => config.position(run, direction),
      canStart: () => {
        if (run === 'pattern-collapse') return config.pattern() !== null;
        return frontStageEndpoints(config, run) !== null;
      },
      start: (direction, session) => start(
        run,
        direction,
        session as PhoneOrchestratedRunSession
      )
    }));
  }
  return {
    dispose() {
      if (active) release(active);
      for (const lease of leases) lease.dispose();
    }
  };
}

export const PHONE_AOD_PREPARE_TIMEOUT_MS = 6_000;
export const PHONE_AOD_PROGRESS_WATCHDOG_MS = 2_400;

export type PhoneAodFailureReason = Extract<
  PhoneFailureReason,
  | 'media-failed'
  | 'aod-autoplay-blocked'
  | 'aod-prepare-timeout'
  | 'aod-progress-timeout'
  | 'aod-webgl-unavailable'
  | 'aod-frame-upload-failed'
  | 'aod-frame-draw-failed'
  | 'aod-context-lost'
>;

type ActiveAodRun = [
  session: PhoneAodRunSession,
  execution: PhoneAodExecution
];

/**
 * The runner owns reduced admission, while the selected endpoint leaf owns
 * only its post-paint raw frame. This is a callback contract, not a second
 * AOD lifecycle or proof builder.
 */
type PhoneAodReducedStaticTarget = Readonly<{
  /** Static admission readiness is independent from media autoplay readiness. */
  ready(direction: PhoneTransitionDirection): boolean;
  position(direction: PhoneTransitionDirection): number | null;
  present(
    execution: PhoneAodExecution,
    report: (frame: PhoneRenderedPresentationFrame) => void
  ): boolean;
  dispose(execution: PhoneAodExecution): void;
}>;

/**
 * The AOD runner is the only effect owner for admission → playback → settle.
 * The common session owner owns failure, rollback, and input release; the
 * leaf can only forward actual decoder/canvas facts.
 */
export type PhoneRuntimeAodRegistration = readonly [
  observeMediaProgress: (
    progress: number,
    execution: PhoneAodExecution
  ) => void,
  reportCompositorFrame: (
    frame: PhoneRenderedPresentationFrame,
    execution: PhoneAodExecution
  ) => void,
  complete: (execution: PhoneAodExecution) => void,
  fail: (
    execution: PhoneAodExecution,
    reason: PhoneAodFailureReason
  ) => void,
  /** Reconciles the effect lease to the current reducer-owned AOD state. */
  sync: () => void,
  dispose: () => void
];

export function registerPhoneRuntimeAodCapability(
  port: PhoneStoryRuntimePort,
  position: (direction: PhoneTransitionDirection) => number | null,
  canStart: (direction: PhoneTransitionDirection) => boolean,
  startAutoplay: (execution: PhoneAodExecution) => Promise<PhoneAodStartResult>,
  /** Runner-owned render command; leaf cannot release itself from admission. */
  renderPlayback: (execution: PhoneAodExecution, progress: number) => void,
  onReset: () => void,
  reducedMotion = false,
  staticTarget?: PhoneAodReducedStaticTarget
): PhoneRuntimeAodRegistration {
  let active: ActiveAodRun | null = null;
  let watchdog: ReturnType<typeof globalThis.setTimeout> | undefined;
  let startNonce = 0;
  const runtimeDocument = globalThis.document;

  const clearWatchdog = () => {
    if (watchdog !== undefined) globalThis.clearTimeout(watchdog);
    watchdog = undefined;
  };
  const stateFor = (record: ActiveAodRun | null = active) => {
    if (!record || !record[0].valid()) return null;
    const snapshot = port.getSnapshot();
    return snapshot.status === 'transaction' && snapshot.session.aod !== null
      ? snapshot
      : null;
  };
  const retire = (resetLeaf: boolean) => {
    const prior = active;
    active = null;
    startNonce += 1;
    clearWatchdog();
    if (prior?.[1][0].kind === 'static-poster') {
      staticTarget?.dispose(prior[1]);
    }
    if (prior && resetLeaf) onReset();
  };
  const reducedFor = (session: PhoneOrchestratedRunSession) => {
    if (!reducedMotion) return false;
    const snapshot = port.getSnapshot();
    return snapshot.status === 'transaction'
      && snapshot.session.reducedMotion
      && snapshot.session.sessionId === session.sessionId
      && snapshot.session.generation === session.generation
      && snapshot.session.operation.run === 'aod-method';
  };
  const acceptsWatchdogStage = (
    stage: 'admission' | 'playback',
    current: ReturnType<typeof stateFor>
  ) => current !== null && (
    stage === 'admission'
      ? current.session.aod!.stage === 'admission'
      : current.session.aod!.stage === 'playback'
  );
  const armWatchdog = (stage: 'admission' | 'playback') => {
    const record = active;
    const current = stateFor(record);
    if (!record || !current || !acceptsWatchdogStage(stage, current)) return;
    clearWatchdog();
    watchdog = globalThis.setTimeout(() => {
      watchdog = undefined;
      if (runtimeDocument?.hidden) {
        armWatchdog(stage);
        return;
      }
      const latest = stateFor(record);
      if (
        !latest
        || !acceptsWatchdogStage(stage, latest)
      ) return;
      record[0].reportAodFailure(
        stage === 'admission' ? 'aod-prepare-timeout' : 'aod-progress-timeout'
      );
      retire(true);
    }, stage === 'admission'
      ? PHONE_AOD_PREPARE_TIMEOUT_MS
      : PHONE_AOD_PROGRESS_WATCHDOG_MS);
  };
  /** Reducer facts join play/frame; only its playback stage grants rendering. */
  const synchronizePlayback = (record: ActiveAodRun): boolean => {
    const current = stateFor(record);
    if (!current || current.session.aod!.stage !== 'playback') return false;
    armWatchdog('playback');
    renderPlayback(record[1], current.session.progress);
    return true;
  };
  const attempt = (record: ActiveAodRun): boolean => {
    const current = stateFor(record);
    if (!current || current.session.aod!.stage !== 'admission') return false;
    const nonce = ++startNonce;
    armWatchdog('admission');
    const settleAutoplay = (result: PhoneAodStartResult) => {
      if (nonce !== startNonce || !stateFor(record)) return;
      if (result === 'playing') {
        record[0].reportAodPlayConfirmed();
        synchronizePlayback(record);
        return;
      }
      if (result === 'blocked') {
        record[0].reportAodFailure('aod-autoplay-blocked');
        retire(true);
        return;
      }
      record[0].reportAodFailure('media-failed');
      retire(true);
    };
    void startAutoplay(record[1]).then(settleAutoplay, () => settleAutoplay('error'));
    return true;
  };
  const beginReducedAdmission = (record: ActiveAodRun): boolean => {
    const current = stateFor(record);
    const target = staticTarget;
    if (
      !current
      || !current.session.reducedMotion
      || current.session.aod!.stage !== 'admission'
      || !target
    ) return false;
    const targetY = target.position(record[1][1]);
    if (
      targetY === null
      || !Number.isFinite(targetY)
      || !record[0].requestReducedTargetLayout(targetY)
    ) return false;
    try {
      return target.present(record[1], (frame) => {
        const latest = stateFor(record);
        if (
          !latest
          || !latest.session.reducedMotion
          || latest.session.aod!.stage !== 'admission'
          || frame.origin !== 'leaf-static-poster'
          || frame.token !== record[1][0]
        ) return;
        record[0].reportPresentationFrame(frame);
        // The reduced reducer commits directly from the exact target fact.
        // Release the target binding only after that machine decision, never
        // from the leaf callback itself.
        if (!stateFor(record)) retire(false);
      });
    } catch {
      return false;
    }
  };
  const onVisibilityChange = () => {
    if (runtimeDocument?.hidden) {
      clearWatchdog();
      return;
    }
    const current = stateFor();
    const stage = current?.session.aod?.stage;
    if (!current || current.session.reducedMotion || !stage) return;
    armWatchdog(stage === 'playback' ? 'playback' : 'admission');
  };
  runtimeDocument?.addEventListener('visibilitychange', onVisibilityChange);

  const capability = port.registerRunCapability('aod-method', 'aod:method', {
    reducedMotion,
    position,
    // Reduced motion still uses the same transaction, but it never creates a
    // media autoplay lease. Keep that readiness contract separate from the
    // dynamic decoder path so a static target can admit while PhoneAod's
    // autoplayRef is intentionally absent.
    canStart(direction) {
      return reducedMotion
        ? staticTarget?.ready(direction) === true
        : canStart(direction);
    },
    start(direction, session) {
      const aodSession = session as PhoneAodRunSession;
      const reduced = reducedFor(aodSession);
      const token = reduced
        ? aodSession.presentationFrameToken(
            'static-poster',
            direction === 1 ? 'native:method' : 'front:aod'
          )
        : aodSession.presentationProofToken('packed-canvas-frame', 'front:aod');
      if (!token) return false;
      retire(true);
      const record: ActiveAodRun = [
        aodSession,
        [token, direction]
      ];
      active = record;
      if (!reduced) return attempt(record);
      const admitted = beginReducedAdmission(record);
      if (!admitted) retire(true);
      return admitted;
    }
  });

  return [
    (progress, execution) => {
      const record = active;
      const current = stateFor(record);
      if (
        !record
        || !current
        || current.session.reducedMotion
        || (current.session.aod!.stage !== 'admission'
          && current.session.aod!.stage !== 'playback')
        || record[1] !== execution
      ) return;
      const before = current.session.progress;
      const beforeObserved = current.session.aod!.lastProgress;
      record[0].reportAodProgress(progress);
      const after = stateFor(record);
      if (!after || after.session.aod!.lastProgress !== progress) return;
      // An endpoint sample can atomically advance playback into settle when
      // completion arrived early. It is still a real, reducer-accepted
      // physical frame, so render it once before retiring the runner. This
      // avoids a terminal black/stale frame while keeping the leaf unable to
      // render or settle on its own.
      if (beforeObserved === after.session.aod!.lastProgress) return;
      if (after.session.aod!.stage === 'playback') {
        if (after.session.progress !== before) armWatchdog('playback');
        renderPlayback(record[1], after.session.progress);
        return;
      }
      if (after.session.aod!.stage === 'settling') {
        renderPlayback(record[1], after.session.progress);
        retire(false);
      }
    },
    (frame, execution) => {
      const record = active;
      const current = stateFor(record);
      if (
        !record
        || !current
        || current.session.reducedMotion
        || current.session.aod!.stage !== 'admission'
        || frame.origin !== 'segment-first-frame'
        || record[1] !== execution
        || frame.token !== execution[0]
      ) return;
      record[0].reportAodFirstFrame(frame);
      synchronizePlayback(record);
    },
    (execution) => {
      const record = active;
      const current = stateFor(record);
      if (
        !record
        || !current
        || current.session.reducedMotion
        || (current.session.aod!.stage !== 'admission'
          && current.session.aod!.stage !== 'playback')
        || record[1] !== execution
      ) return;
      record[0].reportAodCompleted();
      const after = stateFor(record);
      if (!after || after.session.aod!.stage === 'settling') retire(false);
    },
    (execution, reason) => {
      const record = active;
      if (!record || !stateFor(record) || record[1] !== execution) {
        return;
      }
      record[0].reportAodFailure(reason);
      retire(true);
    },
    () => {
      const record = active;
      const current = stateFor();
      if (!current) {
        retire(record?.[1][0].kind !== 'static-poster');
        return;
      }
      if (current.session.aod!.stage === 'settling') {
        retire(record?.[1][0].kind === 'static-poster');
        return;
      }
      if (current.session.aod!.stage === 'playback') synchronizePlayback(record!);
    },
    () => {
      runtimeDocument?.removeEventListener('visibilitychange', onVisibilityChange);
      retire(true);
      capability.dispose();
    }
  ];
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
  ) => Promise<void> | void,
  adapter?: PhonePresentationAdapter,
  staticPoster?: (token: PresentationToken) => boolean
): PhoneCapabilityLease {
  return port.registerSurface({
    id,
    scene,
    kind,
    root,
    coverageRoot,
    ...(prepareDirectEntry ? { prepareDirectEntry } : {}),
    ...(adapter ? { adapter } : {}),
    ...(staticPoster ? { staticPoster } : {})
  });
}

/** Explicitly registers an effect element; presentation never scans the DOM. */
export function registerPhoneRuntimeEffect(
  port: PhoneStoryRuntimePort,
  id: string,
  host: () => HTMLElement | null,
  element: () => HTMLElement | null
): PhoneCapabilityLease {
  const registration: PhoneEffectRegistration = [id, host, element];
  return port.registerEffect(registration);
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
  progress: number | null,
  /** Optional for frozen corridor callers; front rail always supplies it. */
  reducedMotion?: boolean
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
      const [actualY, scene, run, direction, progress, reducedMotion] = sample(
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
        ...(progress === null ? {} : { progress }),
        ...(reducedMotion === undefined ? {} : { reducedMotion })
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
  const presentation = createPhoneStoryPresentation({
    authorityId,
    scope: options.scope,
    root: options.root
  });
  const engine = createPhoneStoryRuntimeEngine({
    authorityId,
    initialScene: options.initialScene,
    root: options.root,
    scrollY: options.scrollY,
    scrollTo: options.scrollTo,
    presentation,
    ...(options.scheduleFrame ? { scheduleFrame: options.scheduleFrame } : {})
  });
  const port: PhoneStoryRuntimePort = engine;
  let attached = false;
  let disposed = false;
  let disposeCoordinator: (() => void) | undefined;
  let disposeDocumentScrollRuntime: (() => void) | undefined;
  let disposeBrowserReapply: (() => void) | undefined;
  let activeInputEpoch: number | null = null;

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
      presentation.attach();
      port.syncDiagnostics();
      const page = root.ownerDocument;
      const pageWindow = page?.defaultView;
      if (pageWindow && page) {
        const reapplyCurrentProjection = () => presentation.reapplyCurrent();
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
          getInputEpoch: () => activeInputEpoch,
          reportSample: (sample) => reportPhoneRuntimeScrollSample(port, sample),
          requestFrame: pageWindow.requestAnimationFrame.bind(pageWindow),
          cancelFrame: pageWindow.cancelAnimationFrame.bind(pageWindow)
        });
        disposeDocumentScrollRuntime = scrollRuntime.dispose;
        disposeCoordinator = createPhoneIntentCoordinator(
          root,
          (intent) => {
            activeInputEpoch = intent[0];
            return engine.resolveIntent(intent);
          },
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
