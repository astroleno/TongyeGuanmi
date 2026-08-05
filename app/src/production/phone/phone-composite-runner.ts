import type { SceneId } from '../../story/types';
import type { PhoneRunId } from './phone-story-runs';
import {
  phoneDirectEntryAdmissionTuple,
  phoneRunLegAdmissionTuple,
  type PhoneAdmissionStrategyTuple
} from './phone-story/manifest';
import type {
  PhoneStoryRuntimePort
} from './phone-story/runtime';
import {
  phoneRuntimeRunDependencies,
  registerPhoneCompositeRunCapability,
  type PhoneCompositeSession,
  type PhoneExecutionToken,
  type PhoneRenderedPresentationFrame,
  type PresentationToken
} from './phone-story/runtime';
import type { PhoneTransitionDirection } from './phone-transition-coordinator';
import type {
  PhoneCapabilityRegistry,
  PhoneCapabilityRetention
} from './phone-transition-readiness';
import type { PhoneTransitionAdapterHandle } from './types';
import type { PhoneSceneAdapterHandle } from './types';

export type PhoneCompositeDirectConfig = Readonly<{
  visual: PhoneSceneAdapterHandle;
  final: PhoneSceneAdapterHandle;
  media: PhoneTransitionAdapterHandle;
}>;

export type PhoneCompositeRuntimeConfig = PhoneCompositeDirectConfig & Readonly<{
  prior: PhoneSceneAdapterHandle;
  entry: PhoneTransitionAdapterHandle;
}>;

type ExecutionResources<Visual extends string> = {
  scene: Visual;
  direction: PhoneTransitionDirection;
  session: PhoneCompositeSession;
  direct: boolean;
  abortController: AbortController;
  retention: PhoneCapabilityRetention;
  timeout: ReturnType<typeof globalThis.setTimeout> | 0;
  releaseExtra: (() => void) | undefined;
  /** The physical first-frame gate is one accepted fact per immutable leg. */
  presentedLeg: number | null;
  /** Leaf-owned exact token and raw ingress for Group 4–5 hard cutover. */
  rawFrame: readonly [
    token: PresentationToken,
    report: (frame: PhoneRenderedPresentationFrame) => boolean
  ] | null;
  /** Only reduced admission owns a one-paint static target binding. */
  staticTarget: PhoneSceneAdapterHandle | null;
};

type MediaStartContext<
  Visual extends string
> = Readonly<{
  scene: Visual;
  identity: PhoneExecutionToken;
  config: PhoneCompositeDirectConfig;
  /**
   * Stages an authored non-terminal reverse endpoint before a visual decoder
   * can report the first physical frame for the active media leg.
   */
  prepareReverseMediaFirstFrame(): void;
  animate(
    start: number,
    end: number,
    durationMs: number,
    complete: () => void
  ): void;
}>;

export type PhoneCompositeRunnerOptions<
  Visual extends string,
  CapabilityId extends string,
  CapabilityHandle
> = Readonly<{
  ownerId: string;
  visualScenes: readonly Visual[];
  orchestrator: PhoneStoryRuntimePort;
  capabilities: PhoneCapabilityRegistry<CapabilityId, CapabilityHandle>;
  reducedMotion: boolean;
  timeoutMs: number;
  runForVisual(scene: Visual): PhoneRunId;
  config(scene: Visual): PhoneCompositeRuntimeConfig | null;
  directConfig(scene: Visual): PhoneCompositeDirectConfig | null;
  position(
    scene: Visual,
    direction: PhoneTransitionDirection
  ): number | null;
  /**
   * Resolves only the physical landing represented by an already-declared
   * manifest strategy. It cannot select proof kind, subject, producer, or a
   * compatibility path; those are immutable manifest facts.
   */
  targetLanding(
    scene: Visual,
    strategy: PhoneAdmissionStrategyTuple,
    direction: PhoneTransitionDirection
  ): number | null;
  /**
   * The sole media command bridge. It receives an authority identity after
   * the immutable snapshot has entered the media leg; no compatibility
   * fallback may start a visual outside this callback.
   */
  startMedia(context: MediaStartContext<Visual>): void;
  acquireReverseEntry?(
    identity: PhoneExecutionToken,
    config: PhoneCompositeRuntimeConfig
  ): Readonly<{ releaseGeometry(): void }> | undefined;
}>;

export type PhoneCompositeRunner<Visual extends string> = Readonly<{
  /** Snapshot-matching media identity for legacy event bridges. */
  execution(scene: Visual): PhoneExecutionToken | null;
  heartbeat(scene: Visual, identity: PhoneExecutionToken): void;
  reportMediaFrame(
    scene: string,
    frame: PhoneRenderedPresentationFrame
  ): void;
  progressMedia(
    scene: Visual,
    identity: PhoneExecutionToken,
    progress: number
  ): void;
  animateMedia(
    scene: Visual,
    identity: PhoneExecutionToken,
    start: number,
    end: number,
    durationMs: number,
    complete: () => void
  ): void;
  completeMedia(scene: Visual, identity: PhoneExecutionToken): void;
  failMedia(scene: Visual, identity: PhoneExecutionToken): void;
  dispose(): void;
}>;

const clamp = (value: number) => Math.min(1, Math.max(0, value));
// A reverse media leg must expose an authored in-between physical frame before
// it can prove admission. Near-terminal endpoint setup is not visual evidence.
const PHONE_REVERSE_RAW_FRAME_ADMISSION_PROGRESS = .996;

function identitiesMatch(left: PhoneExecutionToken, right: PhoneExecutionToken): boolean {
  return left[0] === right[0]
    && left[1] === right[1]
    && left[2] === right[2]
    && left[3] === right[3]
    && left[4] === right[4];
}

function presentationTokensMatch(
  left: PresentationToken,
  right: PresentationToken
): boolean {
  return left.authorityId === right.authorityId
    && left.sessionId === right.sessionId
    && left.generation === right.generation
    && left.leg === right.leg
    && left.revision === right.revision
    && left.subject === right.subject
    && left.kind === right.kind;
}

export function createPhoneCompositeRunner<
  Visual extends string,
  CapabilityId extends string,
  CapabilityHandle
>(
  options: PhoneCompositeRunnerOptions<
    Visual,
    CapabilityId,
    CapabilityHandle
  >
): PhoneCompositeRunner<Visual> {
  type DirectConfig = PhoneCompositeDirectConfig;
  type FullConfig = PhoneCompositeRuntimeConfig;
  let resources: ExecutionResources<Visual> | null = null;
  const identityFor = (
    resource: ExecutionResources<Visual>
  ): PhoneExecutionToken => {
    const identity = [
      resource.session[0],
      resource.session[1],
      resource.session[2],
      resource.session[3](),
      resource.direction
    ] as const;
    return resource.rawFrame
      ? [...identity, resource.rawFrame[0]]
      : identity;
  };
  const configFor = (
    resource: ExecutionResources<Visual>
  ): DirectConfig | null => (
    resource.direct
      ? options.directConfig(resource.scene)
      : options.config(resource.scene)
  );
  const admissionFor = (
    resource: ExecutionResources<Visual>,
    mode: 'normal' | 'reduced'
  ) => resource.direct
    ? phoneDirectEntryAdmissionTuple(resource.scene as SceneId)
    : phoneRunLegAdmissionTuple(
        options.runForVisual(resource.scene),
        resource.session[3](),
        resource.direction,
        mode
      );
  const firstFrameUsesEffect = (resource: ExecutionResources<Visual>) => (
    admissionFor(resource, 'normal')?.[0] === 'effect-leaf'
  );
  const bindAdmissionFrame = (
    resource: ExecutionResources<Visual>,
    mode: 'normal' | 'reduced'
  ) => {
    const strategy = admissionFor(resource, mode);
    if (!strategy || !strategy[6]) return null;
    const existing = resource.rawFrame;
    const leg = resource.session[3]();
    if (
      existing
      && existing[0].leg === leg
      && existing[0].kind === strategy[1]
      && existing[0].subject === strategy[2]
    ) return existing;
    const token = resource.session[15](strategy[1], strategy[2]);
    if (!token) return null;
    const binding = [token, resource.session[16]] as const;
    resource.rawFrame = binding;
    return binding;
  };
  const bindRawFrame = (resource: ExecutionResources<Visual>) => (
    bindAdmissionFrame(resource, 'normal')
  );
  const bindReducedStaticFrame = (resource: ExecutionResources<Visual>) => {
    return bindAdmissionFrame(resource, 'reduced');
  };
  const reportRawFrame = (
    resource: ExecutionResources<Visual>,
    frame: PhoneRenderedPresentationFrame
  ) => {
    if (resources !== resource || !resource.session[4]()) return false;
    const binding = resource.rawFrame;
    const leg = resource.session[3]();
    if (
      !binding
      || binding[0].leg !== leg
      || !presentationTokensMatch(binding[0], frame.token)
    ) return false;
    if (resource.presentedLeg === leg) return true;
    const accepted = binding[1](frame);
    if (accepted) resource.presentedLeg = leg;
    return accepted;
  };
  const clearTimer = (resource: ExecutionResources<Visual>) => {
    if (!resource.timeout) return;
    globalThis.clearTimeout(resource.timeout);
    resource.timeout = 0;
  };
  const releaseRoles = (
    resource: ExecutionResources<Visual>,
    endpoint?: 'source' | 'receiver'
  ) => {
    if (endpoint) resource.session[9](endpoint);
    else resource.session[11]();
  };
  const claimRoles = (
    resource: ExecutionResources<Visual>,
    source: HTMLElement,
    receiver: HTMLElement
  ) => {
    releaseRoles(resource);
    resource.session[8](source, receiver);
  };
  const releaseGeometry = (
    resource: ExecutionResources<Visual>,
    config: DirectConfig
  ) => {
    if (!resource.direct) (config as FullConfig).entry.releaseEndpoint();
    config.media.releaseEndpoint();
    releaseRoles(resource);
  };
  const releaseResources = (resource: ExecutionResources<Visual>) => {
    clearTimer(resource);
    resource.abortController.abort();
    if (resource.staticTarget && resource.rawFrame) {
      resource.staticTarget.disposePresentation?.(resource.rawFrame[0]);
    }
    resource.staticTarget = null;
    resource.releaseExtra?.();
    resource.releaseExtra = undefined;
    resource.retention.dispose();
    if (resources === resource) resources = null;
  };
  const rollback = (resource: ExecutionResources<Visual>) => {
    if (resources !== resource) return;
    clearTimer(resource);
    resource.abortController.abort();
    const config = configFor(resource);
    const endpoint = resource.direction === 1 ? 0 : 1;
    if (config) {
      if (!resource.direct) (config as FullConfig).entry.commitEndpoint(endpoint);
      config.media.commitEndpoint(endpoint);
      releaseRoles(resource, 'source');
      config.visual.update(endpoint);
      // Visual adapters are transient bridge owners, never durable endpoint
      // owners. A rollback must release a prepared decoder/compositor too.
      config.visual.leave?.();
      releaseGeometry(resource, config);
    } else {
      releaseRoles(resource, 'source');
    }
    releaseResources(resource);
    resource.session[13]();
  };
  const armTimeout = (resource: ExecutionResources<Visual>) => {
    clearTimer(resource);
    resource.timeout = globalThis.setTimeout(
      () => {
        rollback(resource);
      },
      options.timeoutMs
    );
  };
  const commitTerminalEndpoint = (
    resource: ExecutionResources<Visual>,
    config: DirectConfig
  ) => {
    if (resources !== resource || !resource.session[4]()) return;
    clearTimer(resource);
    resource.session[12](
      () => releaseGeometry(resource, config),
      () => releaseResources(resource)
    );
    releaseRoles(resource, 'receiver');
    resource.session[10]();
  };
  const runAnimation = (
    resource: ExecutionResources<Visual>,
    transition: PhoneTransitionAdapterHandle,
    start: number,
    end: number,
    durationMs: number | undefined,
    complete: () => void
  ) => {
    resource.session[7](
      start,
      end,
      durationMs,
      (progress) => {
        if (resources !== resource) return;
        transition.render(progress);
      },
      () => {
        if (resources !== resource) return;
        complete();
      }
    );
    armTimeout(resource);
  };
  const startEffectTransition = (
    resource: ExecutionResources<Visual>,
    transition: PhoneTransitionAdapterHandle,
    afterPresented: () => void
  ) => {
    // A physical effect frame is the only admission evidence for this leg.
    // Keep the bounded readiness timer armed while the leaf attempts to draw;
    // a lost callback must roll back rather than strand `preparing`.
    if (!bindRawFrame(resource)) return rollback(resource);
    armTimeout(resource);
    let reported = false;
    transition.begin(identityFor(resource), (frame) => {
      if (reported || resources !== resource || !resource.session[4]()) return;
      reported = true;
      const accepted = frame !== undefined && reportRawFrame(resource, frame);
      if (!accepted) {
        rollback(resource);
        return;
      }
      afterPresented();
    });
    transition.commitEndpoint(resource.direction === 1 ? 0 : 1);
    // An Ink adapter must draw an actual in-between frame before it can
    // advance the reducer. Endpoint/mask setup by itself is not evidence.
    transition.prepareFirstFrame?.(resource.direction);
    if (!transition.prepareFirstFrame) {
      transition.render(resource.direction === 1 ? .003 : .997);
    }
  };
  const startMedia = (
    resource: ExecutionResources<Visual>,
    config: DirectConfig,
    prepared = false
  ) => {
    if (resources !== resource || !resource.session[4]()) return;
    if (!bindRawFrame(resource)) return rollback(resource);
    if (resource.direction === 1 && !prepared) {
      const source = config.visual.root();
      const receiver = config.final.root();
      if (!source || !receiver) return rollback(resource);
      claimRoles(resource, source, receiver);
      config.media.begin(identityFor(resource));
      config.media.commitEndpoint(0);
    }
    const prepareReverseMediaFirstFrame = () => {
      const source = config.visual.root();
      const receiver = config.final.root();
      if (!source || !receiver) {
        rollback(resource);
        return;
      }
      // Clear the previous terminal endpoint and publish the incoming visual
      // surface before its leaf may seek/paint. Its callback is token-exact
      // and physically visible; the runner cannot manufacture a substitute.
      config.media.begin(identityFor(resource));
      claimRoles(resource, source, receiver);
      config.media.commitEndpoint(0);
      config.media.reverse?.();
      config.media.render(PHONE_REVERSE_RAW_FRAME_ADMISSION_PROGRESS);
    };
    options.startMedia({
      scene: resource.scene,
      identity: identityFor(resource),
      config,
      prepareReverseMediaFirstFrame,
      animate: (start, end, durationMs, complete) => (
        runAnimation(resource, config.media, start, end, durationMs, complete)
      )
    });
    armTimeout(resource);
  };
  const startEntry = (
    resource: ExecutionResources<Visual>,
    config: FullConfig
  ) => {
    if (resources !== resource || !resource.session[4]()) return;
    if (resource.direction === 1) config.entry.enter?.();
    else config.entry.reverse?.();
    const endpoint = resource.direction === 1 ? 1 : 0;
    runAnimation(
      resource,
      config.entry,
      1 - endpoint,
      endpoint,
      undefined,
      () => {
        if (resources !== resource) return;
        config.entry.commitEndpoint(endpoint);
        if (resource.direction === -1) {
          config.visual.update(0);
          config.visual.leave?.();
          commitTerminalEndpoint(resource, config);
          return;
        }
        releaseRoles(resource, 'receiver');
        window.requestAnimationFrame(() => {
          if (resources !== resource || !resource.session[4]()) return;
          config.entry.releaseEndpoint();
          startMedia(resource, config);
        });
      }
    );
  };
  const finishMedia = (
    resource: ExecutionResources<Visual>,
    config: DirectConfig
  ) => {
    if (resources !== resource || !resource.session[4]()) return;
    // Endpoint preparation can retain a decoded frame, but it is not proof for
    // the active media leg. Completion is admissible only after that leg has
    // reported a token-bound physical draw; otherwise a later effect frame
    // could be misattributed to this still-preparing media leg.
    if (resource.presentedLeg !== resource.session[3]()) {
      return rollback(resource);
    }
    clearTimer(resource);
    const endpoint = resource.direction === 1 ? 1 : 0;
    config.media.commitEndpoint(endpoint);
    if (resource.direct || resource.direction === 1) {
      config.visual.leave?.();
      commitTerminalEndpoint(resource, config);
      return;
    }
    const full = config as FullConfig;
    releaseRoles(resource, 'receiver');
    window.requestAnimationFrame(() => {
      if (resources !== resource || !resource.session[4]()) return;
      full.media.releaseEndpoint();
      const source = full.visual.root();
      const receiver = full.prior.root();
      if (!source || !receiver) return rollback(resource);
      const extra = options.acquireReverseEntry?.(identityFor(resource), full);
      if (extra) resource.releaseExtra = () => extra.releaseGeometry();
      claimRoles(resource, source, receiver);
      startEffectTransition(resource, full.entry, () => {
        startEntry(resource, full);
      });
    });
  };
  const releaseReducedAdmission = (resource: ExecutionResources<Visual>) => {
    if (resources !== resource) return;
    const config = configFor(resource);
    config?.visual.leave?.();
    releaseRoles(resource);
    releaseResources(resource);
  };
  const startReducedAdmission = (
    resource: ExecutionResources<Visual>,
    config: DirectConfig
  ) => {
    const binding = bindReducedStaticFrame(resource);
    const strategy = admissionFor(resource, 'reduced');
    const target = resource.direct
      ? config.visual
      : resource.direction === 1
        ? config.final
        : (config as FullConfig).prior;
    if (!binding || !strategy || !target.presentPresentation) {
      return rollback(resource);
    }
    resource.staticTarget = target;
    // Reduced motion has no playback clock, but its candidate may still wait
    // for a real endpoint paint. Bound that admission exactly as a dynamic
    // first-frame gate so a missing or rejected leaf callback reaches the
    // machine rollback instead of permanently retaining input and resources.
    armTimeout(resource);
    let landedTargetY: number | null = null;
    const targetLayout = () => {
      const targetY = options.targetLanding(
        resource.scene,
        strategy,
        resource.direction
      );
      return targetY !== null
        && targetY !== undefined
        && Number.isFinite(targetY)
        ? targetY
        : null;
    };
    const requestTargetLayout = () => {
      const targetY = targetLayout();
      if (targetY === null || !resource.session[17](targetY)) return false;
      landedTargetY = targetY;
      return true;
    };
    // Candidate layout remains part of runner admission, while the route
    // runtime remains the sole physical scroll owner. The request cannot
    // commit, unlock input, or change phase; it only makes the real endpoint
    // eligible for its post-paint leaf proof.
    if (!requestTargetLayout()) return rollback(resource);
    window.requestAnimationFrame(() => {
      if (
        resource.abortController.signal.aborted
        || resources !== resource
        || !resource.session[4]()
      ) return;
      // A declared native-reading anchor can move when the candidate
      // projection retires the preceding composite plane. Re-measure once on
      // the actual post-layout frame; the runner still owns each request and
      // the leaf remains a pure exact-token paint reporter.
      const remeasureNativeReading = strategy[4] === 'native-reading';
      let presentationAttempt = 0;
      const present = () => {
        if (
          resource.abortController.signal.aborted
          || resources !== resource
          || !resource.session[4]()
        ) return;
        const attempt = ++presentationAttempt;
        target.presentPresentation!(binding[0], (frame) => {
          if (attempt !== presentationAttempt) return;
          const accepted = reportRawFrame(resource, frame);
          if (
            accepted
            || !remeasureNativeReading
            || !presentationTokensMatch(frame.token, binding[0])
            || resource.abortController.signal.aborted
            || resources !== resource
            || !resource.session[4]()
          ) return;
          const targetY = targetLayout();
          if (
            targetY === null
            || landedTargetY === null
            || Math.abs(targetY - landedTargetY) < .5
            || !resource.session[17](targetY)
          ) return;
          // A candidate projection can settle a native reading rail after
          // the first request. Re-arm only when its declared anchor actually
          // moved; a malformed/stale proof never gains a retry path.
          landedTargetY = targetY;
          presentationAttempt += 1;
          target.disposePresentation?.(binding[0]);
          window.requestAnimationFrame(present);
        });
      };
      if (!remeasureNativeReading) {
        present();
        return;
      }
      if (!requestTargetLayout()) return rollback(resource);
      window.requestAnimationFrame(present);
    });
  };
  const prepare = async (
    resource: ExecutionResources<Visual>,
    dependencies: readonly CapabilityId[]
  ) => {
    try {
      await options.capabilities.waitFor(dependencies, {
        signal: resource.abortController.signal,
        timeoutMs: options.timeoutMs
      });
      if (resources !== resource || !resource.session[4]()) return;
      const config = configFor(resource);
      if (!config) return rollback(resource);
      const full = config as FullConfig;
      const source = (
        resource.direct
          ? config.visual
          : resource.direction === 1 ? full.prior : full.final
      ).root();
      const receiver = (resource.direct ? config.final : config.visual).root();
      if (!source || !receiver) return rollback(resource);
      claimRoles(resource, source, receiver);
      const transition = resource.direct || resource.direction === -1
        ? config.media
        : full.entry;
      const prepareTarget = config.visual.prepareTargetPresentation;
      if (!prepareTarget) return rollback(resource);
      const presentationIdentity = (
        options.reducedMotion
          ? bindReducedStaticFrame(resource)
          : bindRawFrame(resource)
      )?.[0] ?? null;
      if (!presentationIdentity) return rollback(resource);
      await prepareTarget({
        progress: resource.direction === 1 ? 0 : 1,
        direction: resource.direction,
        runId: resource.session[1] + ':' + resource.session[2],
        presentationToken: presentationIdentity,
        signal: resource.abortController.signal,
        directEntry: resource.direct
      });
      if (
        resource.abortController.signal.aborted
        || resources !== resource
        || !resource.session[4]()
      ) return;
      const continueAfterPresented = () => {
        if (resources !== resource || !resource.session[4]()) return;
        if (!resource.direct && resource.direction === 1) {
          startEntry(resource, full);
        } else {
          startMedia(resource, config, true);
        }
      };
      if (options.reducedMotion) {
        // A reduced run is still admitted by this runner, but its target leaf
        // owns the one post-paint static proof. It never starts a media clock
        // or manufactures progress/endpoint evidence.
        startReducedAdmission(resource, config);
      } else if (firstFrameUsesEffect(resource)) {
        startEffectTransition(resource, transition, continueAfterPresented);
      } else {
        // Reverse media admission must reclaim its visual source inside
        // startMedia before the exact leaf callback can be accepted.
        if (resource.direction !== -1) {
          transition.begin(identityFor(resource));
          transition.commitEndpoint(resource.direction === 1 ? 0 : 1);
        }
        // Packed/native media must call reportMediaFrame after a physical draw.
        startMedia(resource, config, true);
      }
    } catch {
      rollback(resource);
    }
  };
  const begin = (
    scene: Visual,
    direction: PhoneTransitionDirection,
    session: PhoneCompositeSession,
    directLegIndex?: number
  ) => {
    if (resources || !session[4]()) return false;
    const dependencies = phoneRuntimeRunDependencies(
      options.runForVisual(scene),
      directLegIndex
    ) as readonly CapabilityId[];
    if (directLegIndex !== undefined && (dependencies[0] as string) !== scene) {
      return false;
    }
    const resource: ExecutionResources<Visual> = {
      scene,
      direction,
      session,
      direct: directLegIndex !== undefined,
      abortController: new AbortController(),
      retention: options.capabilities.retain(dependencies),
      timeout: 0,
      releaseExtra: undefined,
      presentedLeg: null,
      rawFrame: null,
      staticTarget: null
    };
    resources = resource;
    if (!options.reducedMotion) armTimeout(resource);
    void prepare(resource, dependencies);
    return true;
  };
  const mediaIdentity = (
    scene: Visual
  ): PhoneExecutionToken | null => {
    const resource = resources;
    if (
      !resource
      || resource.scene !== scene
      || !resource.session[4]()
      || resource.session[3]() !== 1
    ) return null;
    return identityFor(resource);
  };
  const resourcesForMedia = (
    scene: Visual,
    identity: PhoneExecutionToken
  ): ExecutionResources<Visual> | null => {
    const resource = resources;
    const current = mediaIdentity(scene);
    return resource && current && identitiesMatch(current, identity)
      ? resource
      : null;
  };

  const registrations = options.visualScenes.map((scene) => (
    registerPhoneCompositeRunCapability(
      options.orchestrator,
      options.runForVisual(scene),
      `${options.ownerId}:${scene}`,
      (direction) => options.position(scene, direction),
      () => resources === null,
      (direction, session) => begin(scene, direction, session),
      (legIndex, session) => begin(scene, 1, session, legIndex),
      options.reducedMotion
    )
  ));
  const runtimeSubscription = options.orchestrator.subscribe?.(() => {
    const resource = resources;
    if (
      resource
      && resource.staticTarget
      && !resource.session[4]()
    ) releaseReducedAdmission(resource);
  });

  return {
    execution: mediaIdentity,
    heartbeat(scene, identity) {
      const resource = resourcesForMedia(scene, identity);
      if (resource) armTimeout(resource);
    },
    reportMediaFrame(scene, frame) {
      const resource = resources;
      if (
        !resource
        || resource.scene !== scene
        || !resource.session[4]()
      ) return;
      const accepted = reportRawFrame(resource, frame);
      if (!accepted) return;
      if (options.reducedMotion && !resource.session[4]()) {
        releaseReducedAdmission(resource);
        return;
      }
      armTimeout(resource);
    },
    progressMedia(scene, identity, progress) {
      const resource = resourcesForMedia(scene, identity);
      if (!resource) return;
      if (resource.presentedLeg !== resource.session[3]()) return;
      const config = configFor(resource);
      if (!config) return rollback(resource);
      const sampled = clamp(progress);
      resource.session[6](sampled);
      config.media.render(sampled);
    },
    animateMedia(scene, identity, start, end, durationMs, complete) {
      const resource = resourcesForMedia(scene, identity);
      if (!resource) return;
      if (resource.presentedLeg !== resource.session[3]()) return;
      const config = configFor(resource);
      if (!config) return rollback(resource);
      runAnimation(resource, config.media, start, end, durationMs, complete);
    },
    completeMedia(scene, identity) {
      const resource = resourcesForMedia(scene, identity);
      if (!resource) return;
      if (resource.presentedLeg !== resource.session[3]()) return;
      const config = configFor(resource);
      if (config) finishMedia(resource, config);
      else rollback(resource);
    },
    failMedia(scene, identity) {
      const resource = resourcesForMedia(scene, identity);
      if (resource) {
        rollback(resource);
      }
    },
    dispose() {
      runtimeSubscription?.dispose();
      for (const registration of registrations) registration.dispose();
      if (resources) rollback(resources);
    }
  };
}
