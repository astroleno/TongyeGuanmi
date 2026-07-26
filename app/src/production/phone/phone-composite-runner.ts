import type {
  ScenePresentationAdapterHandle
} from '../../story/presentation';
import { phoneRun, type PhoneRunId } from './phone-story-runs';
import type {
  PhoneOrchestratedRunSession,
  PhoneStoryOrchestrator
} from './phone-story-orchestrator';
import type { PhoneTransitionDirection } from './phone-transition-coordinator';
import type {
  PhoneCapabilityRegistry,
  PhoneCapabilityRetention
} from './phone-transition-readiness';
import type { PhoneTransitionAdapterHandle } from './types';

export type PhoneCompositeRunStep =
  | 'preparing-target'
  | 'entry-ink'
  | 'media'
  | 'exit-ink';

export type PhoneCompositeRunView<Visual extends string> = Readonly<{
  scene: Visual;
  direction: PhoneTransitionDirection;
  session: PhoneOrchestratedRunSession;
  step: PhoneCompositeRunStep;
}>;

export type PhoneCompositeDirectConfig = Readonly<{
  visual: ScenePresentationAdapterHandle;
  final: ScenePresentationAdapterHandle;
  media: PhoneTransitionAdapterHandle;
}>;

export type PhoneCompositeRuntimeConfig = PhoneCompositeDirectConfig & Readonly<{
  prior: ScenePresentationAdapterHandle;
  entry: PhoneTransitionAdapterHandle;
}>;

type ActiveRun<Visual extends string> = {
  scene: Visual;
  direction: PhoneTransitionDirection;
  session: PhoneOrchestratedRunSession;
  step: PhoneCompositeRunStep;
  direct: boolean;
  abortController: AbortController;
  retention: PhoneCapabilityRetention;
};

type MediaStartContext<
  Visual extends string
> = Readonly<{
  run: PhoneCompositeRunView<Visual>;
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
  orchestrator: PhoneStoryOrchestrator;
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
  onRunState(run: PhoneCompositeRunView<Visual> | null, retry: boolean): void;
  onRunBegin(run: PhoneCompositeRunView<Visual>): void;
  onMediaActive(run: PhoneCompositeRunView<Visual>): void;
  startMedia?(context: MediaStartContext<Visual>): void;
  acquireReverseEntry?(
    run: PhoneCompositeRunView<Visual>,
    config: PhoneCompositeRuntimeConfig
  ): Readonly<{ release(): void }> | undefined;
}>;

export type PhoneCompositeRunner<Visual extends string> = Readonly<{
  heartbeat(scene: Visual, direction: PhoneTransitionDirection): void;
  progressMedia(
    scene: Visual,
    direction: PhoneTransitionDirection,
    progress: number
  ): void;
  animateMedia(
    scene: Visual,
    direction: PhoneTransitionDirection,
    start: number,
    end: number,
    durationMs: number,
    complete: () => void
  ): void;
  completeMedia(scene: Visual, direction: PhoneTransitionDirection): void;
  failMedia(scene: Visual): void;
  dispose(): void;
}>;

const clamp = (value: number) => Math.min(1, Math.max(0, value));

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
  let active: ActiveRun<Visual> | null = null;
  let timeout = 0;
  let releaseExtra: (() => void) | undefined;

  const configFor = (run: ActiveRun<Visual>): DirectConfig | null => (
    run.direct ? options.directConfig(run.scene) : options.config(run.scene)
  );
  const clearTimer = () => {
    window.clearTimeout(timeout);
    timeout = 0;
  };
  const armTimeout = (run: ActiveRun<Visual>) => {
    clearTimer();
    timeout = window.setTimeout(() => rollback(run), options.timeoutMs);
  };
  const releaseRoles = (
    run: ActiveRun<Visual>,
    endpoint?: 'source' | 'receiver'
  ) => {
    if (endpoint) run.session.reportEndpointCommit(endpoint);
    else run.session.reportEndpointRelease();
  };
  const claimRoles = (
    run: ActiveRun<Visual>,
    source: HTMLElement,
    receiver: HTMLElement
  ) => {
    releaseRoles(run);
    run.session.reportEndpoints(source, receiver);
  };
  const releaseRun = (
    run: ActiveRun<Visual>,
    config: DirectConfig
  ) => {
    clearTimer();
    run.abortController.abort();
    if (!run.direct) (config as FullConfig).entry.releaseEndpoint();
    config.media.releaseEndpoint();
    releaseRoles(run);
    releaseExtra?.();
    releaseExtra = undefined;
    run.retention.dispose();
  };
  const settle = (retry: boolean) => {
    active = null;
    options.onRunState(null, retry);
  };
  const rollback = (run: ActiveRun<Visual>) => {
    if (active !== run) return;
    clearTimer();
    run.abortController.abort();
    const config = configFor(run);
    const endpoint = run.direction === 1 ? 0 : 1;
    if (config) {
      if (!run.direct) (config as FullConfig).entry.commitEndpoint(endpoint);
      config.media.commitEndpoint(endpoint);
      releaseRoles(run, 'source');
      config.visual.update(endpoint);
      releaseRun(run, config);
    } else {
      releaseRoles(run, 'source');
      releaseExtra?.();
      releaseExtra = undefined;
      run.retention.dispose();
    }
    settle(true);
    run.session.reportFailure();
  };
  const commitTerminalEndpoint = (
    run: ActiveRun<Visual>,
    config: DirectConfig
  ) => {
    if (active !== run || !run.session.valid()) return;
    clearTimer();
    active = null;
    run.session.provideRelease(() => {
      releaseRun(run, config);
      options.onRunState(null, false);
    });
    releaseRoles(run, 'receiver');
  };
  const runAnimation = (
    run: ActiveRun<Visual>,
    transition: PhoneTransitionAdapterHandle,
    start: number,
    end: number,
    durationMs: number | undefined,
    complete: () => void
  ) => {
    run.session.animate(
      start,
      end,
      durationMs,
      (progress) => {
        if (active !== run) return;
        transition.render(progress);
      },
      () => {
        if (active !== run) return;
        complete();
      }
    );
    armTimeout(run);
  };
  const startMedia = (
    run: ActiveRun<Visual>,
    config: DirectConfig,
    prepared = false
  ) => {
    if (active !== run || !run.session.valid()) return;
    if (run.direction === 1 && !prepared) {
      const source = config.visual.root();
      const receiver = config.final.root();
      if (!source || !receiver) return rollback(run);
      claimRoles(run, source, receiver);
      config.media.begin(run.session);
      config.media.commitEndpoint(0);
    }
    run.step = 'media';
    options.onRunState(run, false);
    run.session.reportPresentedFrame();
    options.onMediaActive(run);
    if (options.startMedia) {
      options.startMedia({
        run,
        config,
        animate: (start, end, durationMs, complete) => (
          runAnimation(run, config.media, start, end, durationMs, complete)
        )
      });
    } else if (run.direction === 1) {
      config.media.enter?.();
      config.visual.enter?.();
    } else {
      config.media.reverse?.();
      config.visual.reverse?.();
    }
    armTimeout(run);
  };
  const startEntry = (run: ActiveRun<Visual>, config: FullConfig) => {
    if (active !== run || !run.session.valid()) return;
    run.step = run.direction === 1 ? 'entry-ink' : 'exit-ink';
    options.onRunState(run, false);
    run.session.reportPresentedFrame();
    if (run.direction === 1) config.entry.enter?.();
    else config.entry.reverse?.();
    const endpoint = run.direction === 1 ? 1 : 0;
    runAnimation(
      run,
      config.entry,
      1 - endpoint,
      endpoint,
      undefined,
      () => {
        if (active !== run) return;
        config.entry.commitEndpoint(endpoint);
        if (run.direction === -1) {
          config.visual.update(0);
          commitTerminalEndpoint(run, config);
          return;
        }
        releaseRoles(run, 'receiver');
        window.requestAnimationFrame(() => {
          if (active !== run || !run.session.valid()) return;
          config.entry.releaseEndpoint();
          startMedia(run, config);
        });
      }
    );
  };
  const finishMedia = (run: ActiveRun<Visual>, config: DirectConfig) => {
    if (active !== run || run.step !== 'media' || !run.session.valid()) return;
    clearTimer();
    const endpoint = run.direction === 1 ? 1 : 0;
    config.media.commitEndpoint(endpoint);
    if (run.direct || run.direction === 1) {
      config.visual.leave?.();
      commitTerminalEndpoint(run, config);
      return;
    }
    const full = config as FullConfig;
    releaseRoles(run, 'receiver');
    window.requestAnimationFrame(() => {
      if (active !== run || !run.session.valid()) return;
      full.media.releaseEndpoint();
      const source = full.visual.root();
      const receiver = full.prior.root();
      if (!source || !receiver) return rollback(run);
      const extra = options.acquireReverseEntry?.(run, full);
      if (extra) releaseExtra = () => extra.release();
      claimRoles(run, source, receiver);
      full.entry.begin(run.session);
      full.entry.commitEndpoint(1);
      startEntry(run, full);
    });
  };
  const settleReduced = (run: ActiveRun<Visual>, config: DirectConfig) => {
    if (run.direct) {
      config.media.commitEndpoint(1);
      config.visual.update(1);
      config.visual.leave?.();
      commitTerminalEndpoint(run, config);
      return;
    }
    const full = config as FullConfig;
    if (run.direction === 1) {
      full.entry.commitEndpoint(1);
      releaseRoles(run, 'receiver');
      run.session.reportPresentedFrame();
      run.session.reportProgress(1);
      const source = full.visual.root();
      const receiver = full.final.root();
      if (!source || !receiver) return rollback(run);
      claimRoles(run, source, receiver);
      full.media.begin(run.session);
      full.media.commitEndpoint(1);
      full.visual.update(1);
      full.visual.leave?.();
      commitTerminalEndpoint(run, full);
    } else {
      full.media.commitEndpoint(0);
      releaseRoles(run, 'receiver');
      run.session.reportPresentedFrame();
      run.session.reportProgress(0);
      const source = full.visual.root();
      const receiver = full.prior.root();
      if (!source || !receiver) return rollback(run);
      const extra = options.acquireReverseEntry?.(run, full);
      if (extra) releaseExtra = () => extra.release();
      claimRoles(run, source, receiver);
      full.entry.begin(run.session);
      full.entry.commitEndpoint(0);
      full.visual.update(0);
      commitTerminalEndpoint(run, full);
    }
  };
  const prepare = async (
    run: ActiveRun<Visual>,
    dependencies: readonly CapabilityId[]
  ) => {
    try {
      await options.capabilities.waitFor(dependencies, {
        signal: run.abortController.signal,
        timeoutMs: options.timeoutMs
      });
      if (active !== run || !run.session.valid()) return;
      const config = configFor(run);
      if (!config) return rollback(run);
      const full = config as FullConfig;
      const source = (
        run.direct ? config.visual : run.direction === 1 ? full.prior : full.final
      ).root();
      const receiver = (run.direct ? config.final : config.visual).root();
      if (!source || !receiver) return rollback(run);
      claimRoles(run, source, receiver);
      const transition = run.direct || run.direction === -1
        ? config.media
        : full.entry;
      transition.begin(run.session);
      transition.commitEndpoint(run.direction === 1 ? 0 : 1);
      const prepareTarget = config.visual.prepareTargetPresentation;
      if (!prepareTarget) return rollback(run);
      await prepareTarget({
        progress: run.direction === 1 ? 0 : 1,
        direction: run.direction,
        runId: `${run.session.sessionId}:${run.session.generation}`,
        signal: run.abortController.signal
      });
      if (
        run.abortController.signal.aborted
        || active !== run
        || !run.session.valid()
      ) return;
      run.session.reportPresentedFrame();
      clearTimer();
      if (options.reducedMotion) settleReduced(run, config);
      else if (!run.direct && run.direction === 1) startEntry(run, full);
      else startMedia(run, config, true);
    } catch {
      rollback(run);
    }
  };
  const dependenciesFor = (
    scene: Visual,
    directLegIndex?: number
  ): readonly CapabilityId[] => {
    const definition = phoneRun(options.runForVisual(scene));
    const leg = directLegIndex === undefined
      ? undefined
      : definition.legs[directLegIndex];
    return (leg
      ? [leg.from, leg.to, leg.segment]
      : [
          ...definition.dependencies.scenes,
          ...definition.dependencies.transitions
        ]) as CapabilityId[];
  };
  const begin = (
    scene: Visual,
    direction: PhoneTransitionDirection,
    session: PhoneOrchestratedRunSession,
    directLegIndex?: number
  ) => {
    if (active || !session.valid()) return false;
    const definition = phoneRun(options.runForVisual(scene));
    const directLeg = directLegIndex === undefined
      ? undefined
      : definition.legs[directLegIndex];
    if (directLegIndex !== undefined && directLeg?.from !== scene) return false;
    const dependencies = dependenciesFor(scene, directLegIndex);
    const run: ActiveRun<Visual> = {
      scene,
      direction,
      session,
      step: 'preparing-target',
      direct: directLegIndex !== undefined,
      abortController: new AbortController(),
      retention: options.capabilities.retain(dependencies)
    };
    active = run;
    options.onRunBegin(run);
    options.onRunState(run, false);
    armTimeout(run);
    void prepare(run, dependencies);
    return true;
  };

  const registrations = options.visualScenes.map((scene) => (
    options.orchestrator.registerRunCapability(
      options.runForVisual(scene),
      `${options.ownerId}:${scene}`,
      {
        position: (direction) => options.position(scene, direction),
        canStart: () => !active,
        start: (direction, session) => begin(scene, direction, session),
        startAtLeg: (legIndex, session) => begin(scene, 1, session, legIndex)
      }
    )
  ));
  const activeMedia = (
    scene: Visual,
    direction: PhoneTransitionDirection
  ) => {
    const run = active;
    return run
      && run.scene === scene
      && run.direction === direction
      && run.step === 'media'
      && run.session.valid()
      ? run
      : null;
  };

  return {
    heartbeat(scene, direction) {
      const run = activeMedia(scene, direction);
      if (run) armTimeout(run);
    },
    progressMedia(scene, direction, progress) {
      const run = activeMedia(scene, direction);
      if (!run) return;
      const config = configFor(run);
      if (!config) return rollback(run);
      const sampled = clamp(progress);
      run.session.reportProgress(sampled);
      config.media.render(sampled);
    },
    animateMedia(scene, direction, start, end, durationMs, complete) {
      const run = activeMedia(scene, direction);
      if (!run) return;
      const config = configFor(run);
      if (!config) return rollback(run);
      runAnimation(run, config.media, start, end, durationMs, complete);
    },
    completeMedia(scene, direction) {
      const run = activeMedia(scene, direction);
      if (!run) return;
      const config = configFor(run);
      if (config) finishMedia(run, config);
      else rollback(run);
    },
    failMedia(scene) {
      if (active?.scene === scene) rollback(active);
    },
    dispose() {
      for (const registration of registrations) registration.dispose();
      if (active) rollback(active);
    }
  };
}
