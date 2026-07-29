import type {
  ScenePresentationAdapterHandle
} from '../../story/presentation';
import {
  phoneRun,
  type PhoneRunId
} from './phone-story-runs';
import { phoneSegmentPresentationTuple } from './phone-presentation-contract';
import type {
  PhoneStoryRuntimePort
} from './phone-story-orchestrator';
import {
  phoneRuntimeRunDependencies,
  registerPhoneCompositeRunCapability,
  type PhoneCompositeSession
} from './phone-story-runtime';
import type { PhoneExecutionToken } from './phone-story-state';
import type { PhoneTransitionDirection } from './phone-transition-coordinator';
import type {
  PhoneCapabilityRegistry,
  PhoneCapabilityRetention
} from './phone-transition-readiness';
import type { PhoneTransitionAdapterHandle } from './types';

export type PhoneCompositeDirectConfig = Readonly<{
  visual: ScenePresentationAdapterHandle;
  final: ScenePresentationAdapterHandle;
  media: PhoneTransitionAdapterHandle;
}>;

export type PhoneCompositeRuntimeConfig = PhoneCompositeDirectConfig & Readonly<{
  prior: ScenePresentationAdapterHandle;
  entry: PhoneTransitionAdapterHandle;
}>;

type ExecutionResources<Visual extends string> = {
  scene: Visual;
  direction: PhoneTransitionDirection;
  session: PhoneCompositeSession;
  direct: boolean;
  abortController: AbortController;
  retention: PhoneCapabilityRetention;
  timeout: number;
  releaseExtra: (() => void) | undefined;
};

type MediaStartContext<
  Visual extends string
> = Readonly<{
  scene: Visual;
  identity: PhoneExecutionToken;
  config: PhoneCompositeDirectConfig;
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
   * Optional media resource starter. It receives an authority identity after
   * the immutable snapshot has entered the media leg. It must not publish
   * presentation state; visual components may instead read that snapshot.
   */
  startMedia?(context: MediaStartContext<Visual>): void;
  acquireReverseEntry?(
    identity: PhoneExecutionToken,
    config: PhoneCompositeRuntimeConfig
  ): Readonly<{ releaseGeometry(): void }> | undefined;
}>;

export type PhoneCompositeRunner<Visual extends string> = Readonly<{
  /** Snapshot-matching media identity for legacy event bridges. */
  execution(scene: Visual): PhoneExecutionToken | null;
  heartbeat(scene: Visual, identity: PhoneExecutionToken): void;
  reportMediaFrame(scene: Visual, identity: PhoneExecutionToken): void;
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

function identitiesMatch(left: PhoneExecutionToken, right: PhoneExecutionToken): boolean {
  return left[0] === right[0]
    && left[1] === right[1]
    && left[2] === right[2]
    && left[3] === right[3]
    && left[4] === right[4];
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
  ): PhoneExecutionToken => [
    resource.session[0],
    resource.session[1],
    resource.session[2],
    resource.session[3](),
    resource.direction
  ];
  const configFor = (
    resource: ExecutionResources<Visual>
  ): DirectConfig | null => (
    resource.direct
      ? options.directConfig(resource.scene)
      : options.config(resource.scene)
  );
  const firstFrameRequirement = (resource: ExecutionResources<Visual>) => {
    const run = phoneRun(options.runForVisual(resource.scene));
    const leg = run.legs[resource.session[3]()];
    return leg
      ? (() => {
          const contract = phoneSegmentPresentationTuple(leg.segment);
          return [contract[8], contract[9]] as const;
        })()
      : null;
  };
  const firstFrameUsesEffect = (resource: ExecutionResources<Visual>) => (
    firstFrameRequirement(resource)?.[0] === 'effect-frame'
  );
  const reportPresentedFrame = (resource: ExecutionResources<Visual>) => {
    if (resources !== resource || !resource.session[4]()) return false;
    const requirement = firstFrameRequirement(resource);
    if (!requirement) return false;
    resource.session[5](requirement[0], requirement[1]);
    return true;
  };
  const clearTimer = (resource: ExecutionResources<Visual>) => {
    if (!resource.timeout) return;
    window.clearTimeout(resource.timeout);
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
    resource.timeout = window.setTimeout(
      () => rollback(resource),
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
    let reported = false;
    transition.begin(identityFor(resource), () => {
      if (reported || resources !== resource || !resource.session[4]()) return;
      reported = true;
      if (!reportPresentedFrame(resource)) {
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
    if (resource.direction === 1 && !prepared) {
      const source = config.visual.root();
      const receiver = config.final.root();
      if (!source || !receiver) return rollback(resource);
      claimRoles(resource, source, receiver);
      config.media.begin(identityFor(resource));
      config.media.commitEndpoint(0);
    }
    if (options.startMedia) {
      options.startMedia({
        scene: resource.scene,
        identity: identityFor(resource),
        config,
        animate: (start, end, durationMs, complete) => (
          runAnimation(resource, config.media, start, end, durationMs, complete)
        )
      });
    } else if (resource.direction === 1) {
      config.media.enter?.();
      config.visual.enter?.();
    } else {
      config.media.reverse?.();
      config.visual.reverse?.();
    }
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
  const settleReduced = (
    resource: ExecutionResources<Visual>,
    config: DirectConfig
  ) => {
    if (resource.direct) {
      config.media.commitEndpoint(1);
      config.visual.update(1);
      config.visual.leave?.();
      commitTerminalEndpoint(resource, config);
      return;
    }
    const full = config as FullConfig;
    if (resource.direction === 1) {
      full.entry.commitEndpoint(1);
      releaseRoles(resource, 'receiver');
      if (!reportPresentedFrame(resource)) return rollback(resource);
      resource.session[6](1);
      const source = full.visual.root();
      const receiver = full.final.root();
      if (!source || !receiver) return rollback(resource);
      claimRoles(resource, source, receiver);
      full.media.begin(identityFor(resource));
      full.media.commitEndpoint(1);
      full.visual.update(1);
      full.visual.leave?.();
      commitTerminalEndpoint(resource, full);
    } else {
      full.media.commitEndpoint(0);
      releaseRoles(resource, 'receiver');
      if (!reportPresentedFrame(resource)) return rollback(resource);
      resource.session[6](0);
      const source = full.visual.root();
      const receiver = full.prior.root();
      if (!source || !receiver) return rollback(resource);
      const extra = options.acquireReverseEntry?.(identityFor(resource), full);
      if (extra) resource.releaseExtra = () => extra.releaseGeometry();
      claimRoles(resource, source, receiver);
      full.entry.begin(identityFor(resource));
      full.entry.commitEndpoint(0);
      full.visual.update(0);
      full.visual.leave?.();
      commitTerminalEndpoint(resource, full);
    }
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
      await prepareTarget({
        progress: resource.direction === 1 ? 0 : 1,
        direction: resource.direction,
        runId: resource.session[1] + ':' + resource.session[2],
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
        transition.begin(identityFor(resource));
        transition.commitEndpoint(resource.direction === 1 ? 0 : 1);
        // Reduced motion settles through an authored static endpoint; it still
        // reports the manifest requirement in the same authority revision.
        if (!reportPresentedFrame(resource)) return rollback(resource);
        clearTimer(resource);
        settleReduced(resource, config);
      } else if (firstFrameUsesEffect(resource)) {
        startEffectTransition(resource, transition, continueAfterPresented);
      } else {
        transition.begin(identityFor(resource));
        transition.commitEndpoint(resource.direction === 1 ? 0 : 1);
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
      releaseExtra: undefined
    };
    resources = resource;
    armTimeout(resource);
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
      (legIndex, session) => begin(scene, 1, session, legIndex)
    )
  ));

  return {
    execution: mediaIdentity,
    heartbeat(scene, identity) {
      const resource = resourcesForMedia(scene, identity);
      if (resource) armTimeout(resource);
    },
    reportMediaFrame(scene, identity) {
      const resource = resourcesForMedia(scene, identity);
      if (!resource || !reportPresentedFrame(resource)) return;
      armTimeout(resource);
    },
    progressMedia(scene, identity, progress) {
      const resource = resourcesForMedia(scene, identity);
      if (!resource) return;
      const config = configFor(resource);
      if (!config) return rollback(resource);
      const sampled = clamp(progress);
      resource.session[6](sampled);
      config.media.render(sampled);
    },
    animateMedia(scene, identity, start, end, durationMs, complete) {
      const resource = resourcesForMedia(scene, identity);
      if (!resource) return;
      const config = configFor(resource);
      if (!config) return rollback(resource);
      runAnimation(resource, config.media, start, end, durationMs, complete);
    },
    completeMedia(scene, identity) {
      const resource = resourcesForMedia(scene, identity);
      if (!resource) return;
      const config = configFor(resource);
      if (config) finishMedia(resource, config);
      else rollback(resource);
    },
    failMedia(scene, identity) {
      const resource = resourcesForMedia(scene, identity);
      if (resource) rollback(resource);
    },
    dispose() {
      for (const registration of registrations) registration.dispose();
      if (resources) rollback(resources);
    }
  };
}
