import { createActor } from 'xstate';
import { canUseDOM } from './browser-guard';
import { createDirectorMachine, type DirectorContext, type DirectorMachineOptions } from './director.machine';
import { routeInput, type DirectorDiscreteState } from './input-router';
import { storyManifest } from '../story/manifest';
import { BuildTimeoutError, SegmentPlayer } from '../story/segment-player';
import { StorySpine } from '../story/spine';
import { toError } from './recovery';
import type {
  DirectorEvent,
  Direction,
  MilestoneKey,
  PrepareToken,
  SceneId,
  SegmentId,
  SegmentRunId,
  SegmentTimelineHandle,
  StageHandle,
  SpineSegmentNode,
  StoryManifest,
  TransitionModule
} from '../story/types';

export type DirectorEventRecord = {
  id: number;
  at: number;
  event: DirectorEvent;
  actorEpoch: string;
  activeRunId: DirectorContext['activeRunId'];
  prepareToken: DirectorContext['prepareToken'];
  queuedIntent: DirectorContext['queuedIntent'];
  pausePoint: DirectorContext['pausePoint'];
  recovery: DirectorContext['recovery'];
  cursor: DirectorContext['cursor'];
  layerWindow: DirectorContext['layerWindow'];
  milestone?: MilestoneKey;
};

export type StoryDebugSnapshot = {
  state: unknown;
  context: DirectorContext;
  eventLog: readonly DirectorEventRecord[];
  virtualProgress: number;
};

export type DirectorRuntimeOptions = DirectorMachineOptions & {
  autoStart?: boolean;
  ringBufferSize?: number;
  syntheticPlayMs?: number;
  syntheticBuildDelayMs?: number;
  transitions?: Partial<Record<SegmentId, TransitionModule>>;
  transitionLoader?: (id: SegmentId) => Promise<TransitionModule> | TransitionModule;
  useSyntheticTransitions?: boolean;
  prefersReducedMotion?: boolean | (() => boolean);
  stage?: StageHandle;
  readyGate?: DirectorRuntimeReadyGate;
};

export type RuntimeReadyGateArgs = {
  segment: SpineSegmentNode;
  prepareToken: PrepareToken;
  direction: Direction;
  targetScene: SceneId;
};

export type RuntimeBuildGateArgs = RuntimeReadyGateArgs & {
  prepareRunId: SegmentRunId;
};

export type DirectorRuntimeReadyGate = {
  waitForTargetReady?(args: RuntimeReadyGateArgs): Promise<void> | void;
  waitForMediaReady?(args: RuntimeReadyGateArgs): Promise<void> | void;
  beginBuild?(args: RuntimeBuildGateArgs): void;
  reportBuildReady?(args: RuntimeBuildGateArgs): boolean | void;
};

type RuntimeListener = () => void;

type RecoveryEndpoint = {
  segment: SegmentId;
  direction: Direction;
  scene: SceneId;
};

class EventRingBuffer {
  private readonly capacity: number;
  private records: DirectorEventRecord[] = [];
  private counter = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  push(record: Omit<DirectorEventRecord, 'id'>): void {
    this.counter += 1;
    this.records = [...this.records, { ...record, id: this.counter }].slice(-this.capacity);
  }

  snapshot(): readonly DirectorEventRecord[] {
    return this.records;
  }
}

function milestoneFromEvent(event: DirectorEvent): MilestoneKey | undefined {
  if (event.type === 'MEDIA_READY') {
    return event.key;
  }
  if (event.type === 'STAGE_PAUSED') {
    return 'stagePaused';
  }
  if (event.type === 'STAGE_RESUMED') {
    return 'stageResumed';
  }
  return undefined;
}

function findSegment(manifest: StoryManifest, segmentId: SegmentId): SpineSegmentNode {
  const segment = manifest.nodes.find((node): node is SpineSegmentNode => node.kind === 'segment' && node.id === segmentId);
  if (!segment) {
    throw new Error(`Unknown segment: ${segmentId}`);
  }
  return segment;
}

function segmentForHoldDirection(manifest: StoryManifest, scene: SceneId, direction: Direction): SpineSegmentNode | undefined {
  const index = manifest.nodes.findIndex((node) => node.kind === 'hold' && node.scene === scene);
  const candidate = manifest.nodes[index + direction];
  return candidate?.kind === 'segment' ? candidate : undefined;
}

function targetScene(segment: SpineSegmentNode, direction: Direction): SceneId {
  return direction === 1 ? segment.to : segment.from;
}

function recoveryEndpoint(context: DirectorContext): RecoveryEndpoint | undefined {
  const recovery = context.recovery;
  if (recovery?.scope !== 'segment' || recovery.status !== 'recovering') {
    return undefined;
  }
  return {
    segment: recovery.segment,
    direction: recovery.direction,
    scene: recovery.endpoint
  };
}

function syntheticDelay(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createSyntheticTimeline(playMs: number): SegmentTimelineHandle {
  let disposed = false;
  let resolvePlay: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const playWithDelay = () => new Promise<void>((resolve) => {
    if (disposed) {
      resolve();
      return;
    }
    resolvePlay = resolve;
    timer = setTimeout(() => {
      resolvePlay = undefined;
      timer = undefined;
      resolve();
    }, playMs);
  });

  return {
    play: playWithDelay,
    progress: () => undefined,
    reverse: playWithDelay,
    jumpToEnd: () => undefined,
    dispose: () => {
      disposed = true;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      resolvePlay?.();
      resolvePlay = undefined;
    }
  };
}

function createSyntheticTransitions(
  manifest: StoryManifest,
  playMs: number,
  buildDelayMs: number
): Partial<Record<SegmentId, TransitionModule>> {
  return Object.fromEntries(
    manifest.nodes.flatMap((node) => {
      if (node.kind !== 'segment') {
        return [];
      }
      const transition: TransitionModule = {
        id: node.id,
        buildTimeline: async () => {
          await syntheticDelay(buildDelayMs);
          return createSyntheticTimeline(playMs);
        }
      };
      return [[node.id, transition]];
    })
  ) as Partial<Record<SegmentId, TransitionModule>>;
}

function valueAsStateName(value: unknown): DirectorDiscreteState {
  return String(value) as DirectorDiscreteState;
}

function virtualProgressFor(context: DirectorContext): number {
  const spine = new StorySpine(context.manifest);
  if (context.cursor.status === 'hold') {
    spine.enterHold(context.cursor.scene);
  } else if (context.cursor.status === 'segment') {
    spine.enterSegment(context.cursor.segment);
  } else {
    spine.enterSettling(context.cursor.segment, context.cursor.target);
  }
  return spine.virtualProgress;
}

export function createDirectorRuntime(options: DirectorRuntimeOptions = {}) {
  const manifest = options.manifest ?? storyManifest;
  const machine = createDirectorMachine(options);
  let actor = createActor(machine);
  const ringBuffer = new EventRingBuffer(options.ringBufferSize ?? 120);
  const listeners = new Set<RuntimeListener>();
  let handledPrepareToken: DirectorContext['prepareToken'];
  let handledRunId: DirectorContext['activeRunId'];
  let handledRetiringKey = '';
  let pendingScrubDelta = 0;
  let isStarted = false;
  let recreateActorOnStart = false;
  let interactionGeneration = 0;
  const activeRecoveries = new Set<string>();
  let cachedSnapshot: StoryDebugSnapshot | undefined;
  let actorSubscription: { unsubscribe(): void } | undefined;
  const useSyntheticTransitions = options.useSyntheticTransitions ?? !options.transitionLoader;

  const runtime = {
    get actor() {
      return actor;
    },
    segmentPlayer: new SegmentPlayer({
      manifest,
      transitions: {
        ...(useSyntheticTransitions
          ? createSyntheticTransitions(manifest, options.syntheticPlayMs ?? 80, options.syntheticBuildDelayMs ?? 0)
          : {}),
        ...(options.transitions ?? {})
      },
      ...(options.transitionLoader ? { transitionLoader: options.transitionLoader } : {}),
      ...(options.stage ? { stage: options.stage } : {}),
      ...(options.prefersReducedMotion !== undefined ? { prefersReducedMotion: options.prefersReducedMotion } : {}),
      ...(options.actorEpoch ? { actorEpoch: options.actorEpoch } : {}),
      mailbox: {
        send(event) {
          if (!isStarted) {
            return;
          }
          runtime.send(event);
        }
      }
    }),
    start() {
      if (!isStarted) {
        if (recreateActorOnStart) {
          actor = createActor(machine);
          recreateActorOnStart = false;
          cachedSnapshot = undefined;
        }
        actorSubscription = actor.subscribe(handleActorSnapshot);
        actor.start();
        isStarted = true;
        refreshSnapshot();
        pumpMainLoop();
      }
      return runtime;
    },
    stop() {
      runtime.segmentPlayer.disposeAll();
      actorSubscription?.unsubscribe();
      actorSubscription = undefined;
      actor.stop();
      isStarted = false;
      recreateActorOnStart = true;
      handledPrepareToken = undefined;
      handledRunId = undefined;
      handledRetiringKey = '';
      pendingScrubDelta = 0;
      interactionGeneration += 1;
      activeRecoveries.clear();
    },
    send(event: DirectorEvent): void {
      let before = actor.getSnapshot();
      const startsNewInteraction =
        event.type === 'INPUT_DELTA'
        || event.type === 'CHARGE_FIRED'
        || (event.type === 'SEEK' && event.source !== 'recovery');
      if (startsNewInteraction) {
        interactionGeneration += 1;
        const recovery = before.context.recovery;
        if (recovery?.scope === 'segment') {
          runtime.segmentPlayer.dispose(recovery.segment);
          actor.send({ type: 'RECOVERY_CANCELLED' });
          before = actor.getSnapshot();
        }
      }
      const routed = routeEvent(event);
      if (event.type === 'SEEK') {
        runtime.segmentPlayer.abort('seek');
      }
      if (routed) {
        actor.send(routed);
        const after = actor.getSnapshot();
        const stagedResumeRunId = valueAsStateName(before.value) === 'staged-paused'
          && valueAsStateName(after.value) === 'playing'
          && before.context.activeRunId === after.context.activeRunId
          ? after.context.activeRunId
          : undefined;
        if (stagedResumeRunId && after.context.activeDirection) {
          runtime.segmentPlayer.resumeStaged(stagedResumeRunId, after.context.activeDirection);
        }
        if (
          routed.type === 'BOOT_FAILED'
          || routed.type === 'PREPARE_TIMEOUT'
          || routed.type === 'BUILD_TIMEOUT'
          || routed.type === 'PLAYBACK_FAILED'
        ) {
          runtime.segmentPlayer.abort('recovery');
        }
        handleScrubInput(routed);
      }
      recordEvent(event);
      notifyListeners();
    },
    getState(): StoryDebugSnapshot {
      return cachedSnapshot ?? refreshSnapshot();
    },
    subscribe(listener: RuntimeListener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };

  function handleActorSnapshot(): void {
    pumpMainLoop();
    refreshSnapshot();
    notifyListeners();
  }

  function refreshSnapshot(): StoryDebugSnapshot {
    const snapshot = actor.getSnapshot();
    cachedSnapshot = {
      state: snapshot.value,
      context: snapshot.context,
      eventLog: ringBuffer.snapshot(),
      virtualProgress: virtualProgressFor(snapshot.context)
    };
    return cachedSnapshot;
  }

  function notifyListeners(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  function routeEvent(event: DirectorEvent): DirectorEvent | null {
    if (event.type !== 'INPUT_DELTA') {
      return event;
    }

    const snapshot = actor.getSnapshot();
    const context = snapshot.context;
    const state = valueAsStateName(snapshot.value);
    const direction: Direction = event.delta >= 0 ? 1 : -1;
    const segment =
      context.cursor.status === 'hold'
        ? segmentForHoldDirection(context.manifest, context.cursor.scene, direction)
        : context.activeSegment
          ? findSegment(context.manifest, context.activeSegment)
          : undefined;
    const route = routeInput({
      state,
      cursor: context.cursor,
      delta: event.delta,
      ...(segment ? { segmentPolicy: segment.policy } : {})
    });

    if (route.path === 'none' || route.path === 'innerScroll') {
      if (state === 'preparing' && context.pendingDirection === -direction) {
        return event;
      }
      return null;
    }
    return event;
  }

  function recordEvent(event: DirectorEvent): void {
    const snapshot = actor.getSnapshot();
    const context = snapshot.context;
    const milestone = milestoneFromEvent(event);
    ringBuffer.push({
      at: Date.now(),
      event,
      actorEpoch: context.actorEpoch,
      activeRunId: context.activeRunId,
      prepareToken: context.prepareToken,
      queuedIntent: context.queuedIntent,
      pausePoint: context.pausePoint,
      recovery: context.recovery,
      cursor: context.cursor,
      layerWindow: context.layerWindow,
      ...(milestone ? { milestone } : {})
    });
    refreshSnapshot();
  }

  function pumpMainLoop(): void {
    const snapshot = actor.getSnapshot();
    const context = snapshot.context;
    const state = valueAsStateName(snapshot.value);

    if (state === 'preparing' && context.prepareToken && context.pendingSegment) {
      if (handledPrepareToken !== context.prepareToken) {
        handledPrepareToken = context.prepareToken;
        void prepareSegment(context.prepareToken, context.pendingSegment);
      }
      return;
    }

    if (
      state === 'playing' &&
      context.activeRunId &&
      context.activeSegment &&
      context.activeDirection
    ) {
      if (handledRunId !== context.activeRunId) {
        handledRunId = context.activeRunId;
        void runtime.segmentPlayer.play(context.activeSegment, context.activeDirection, {
          runId: context.activeRunId
        });
      }
      return;
    }

    if (
      state === 'scrubbing' &&
      context.activeRunId &&
      context.activeSegment &&
      context.activeDirection
    ) {
      if (handledRunId !== context.activeRunId) {
        handledRunId = context.activeRunId;
        void runtime.segmentPlayer.play(context.activeSegment, context.activeDirection, {
          runId: context.activeRunId
        });
      }
      return;
    }

    const endpoint = recoveryEndpoint(context);
    if (endpoint && (state === 'recovering' || state === 'hold')) {
      runtime.segmentPlayer.abort('recovery');
      void recoverToEndpoint(endpoint, interactionGeneration);
      return;
    }

    if (state === 'recovering') {
      runtime.segmentPlayer.abort('recovery');
      return;
    }

    if (state === 'hold' && context.layerWindow.retiring.length > 0) {
      const retiringKey = [
        context.cursor.status === 'hold' ? context.cursor.scene : 'non-hold',
        ...context.layerWindow.retiring
      ].join('|');
      if (handledRetiringKey !== retiringKey) {
        handledRetiringKey = retiringKey;
        scheduleRetiringRelease();
      }
    } else if (context.layerWindow.retiring.length === 0) {
      handledRetiringKey = '';
    }
  }

  function scheduleRetiringRelease(): void {
    const release = () => {
      if (actor.getSnapshot().context.layerWindow.retiring.length > 0) {
        runtime.send({ type: 'RETIRING_RELEASED' });
      }
    };
    if (canUseDOM() && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(release);
      return;
    }
    setTimeout(release, 0);
  }

  async function prepareSegment(prepareToken: NonNullable<DirectorContext['prepareToken']>, segmentId: SegmentId): Promise<void> {
    const preparingActor = actor;
    const context = preparingActor.getSnapshot().context;
    const segment = findSegment(context.manifest, segmentId);
    const direction = context.pendingDirection ?? 1;
    const target = targetScene(segment, direction);
    const prepareRunId = `${context.actorEpoch}:0` as const;
    const gateArgs: RuntimeReadyGateArgs = {
      segment,
      prepareToken,
      direction,
      targetScene: target
    };
    const buildGateArgs: RuntimeBuildGateArgs = {
      ...gateArgs,
      prepareRunId
    };
    const preparationIsCurrent = () => {
      const current = preparingActor.getSnapshot();
      return actor === preparingActor
        && current.value === 'preparing'
        && current.context.prepareToken === prepareToken;
    };

    try {
      await options.readyGate?.waitForTargetReady?.(gateArgs);
      if (!preparationIsCurrent()) {
        return;
      }
      await options.readyGate?.waitForMediaReady?.(gateArgs);
      if (!preparationIsCurrent()) {
        return;
      }
      options.readyGate?.beginBuild?.(buildGateArgs);
      await runtime.segmentPlayer.ensureBuilt(segmentId, {
        runId: prepareRunId,
        prepareToken,
        timeoutMs: segment.buildTimeoutMs ?? context.manifest.defaults.buildTimeoutMs,
        direction
      });
      if (!preparationIsCurrent()) {
        const latest = actor.getSnapshot().context;
        const stillOwned = latest.pendingSegment === segmentId
          || latest.activeSegment === segmentId
          || (latest.recovery?.scope === 'segment'
            && latest.recovery.status === 'recovering'
            && latest.recovery.segment === segmentId);
        if (!stillOwned) {
          runtime.segmentPlayer.dispose(segmentId);
        }
        return;
      }
      const buildReady = options.readyGate?.reportBuildReady?.(buildGateArgs);
      if (buildReady === false) {
        return;
      }
    } catch (error) {
      const current = preparingActor.getSnapshot();
      if (actor === preparingActor && current.value === 'preparing' && current.context.prepareToken === prepareToken && !(error instanceof BuildTimeoutError)) {
        runtime.send({ type: 'PREPARE_TIMEOUT', segment: segmentId, prepareToken });
      }
      return;
    }

    const current = preparingActor.getSnapshot();
    if (actor !== preparingActor || current.value !== 'preparing' || current.context.prepareToken !== prepareToken || !current.context.pendingDirection) {
      return;
    }
    runtime.send({
      type: 'TARGET_READY',
      scene: targetScene(segment, current.context.pendingDirection),
      prepareToken
    });
  }

  async function recoverToEndpoint(endpoint: RecoveryEndpoint, generation: number): Promise<void> {
    const key = `${generation}:${endpoint.segment}:${endpoint.direction}`;
    if (activeRecoveries.has(key)) {
      return;
    }
    activeRecoveries.add(key);
    try {
      const segment = findSegment(manifest, endpoint.segment);
      await runtime.segmentPlayer.ensureBuilt(endpoint.segment, {
        direction: endpoint.direction,
        timeoutMs: segment.buildTimeoutMs ?? manifest.defaults.buildTimeoutMs
      });
      if (!isStarted || interactionGeneration !== generation) {
        return;
      }
      runtime.segmentPlayer.jumpToEnd(endpoint.segment, endpoint.direction);
      runtime.segmentPlayer.dispose(endpoint.segment);
      runtime.send({
        type: 'SEEK',
        label: `scene:${endpoint.scene}`,
        source: 'recovery'
      });
    } catch (error) {
      if (isStarted && interactionGeneration === generation) {
        runtime.segmentPlayer.dispose(endpoint.segment);
        runtime.send({
          type: 'RECOVERY_FAILED',
          segment: endpoint.segment,
          direction: endpoint.direction,
          error: toError(error)
        });
      }
    } finally {
      activeRecoveries.delete(key);
    }
  }

  function handleScrubInput(event: DirectorEvent): void {
    if (event.type !== 'INPUT_DELTA' && event.type !== 'CHARGE_FIRED') {
      return;
    }
    const snapshot = actor.getSnapshot();
    const context = snapshot.context;
    if (
      snapshot.value !== 'scrubbing' ||
      !context.activeSegment ||
      !context.activeDirection
    ) {
      return;
    }
    const segment = findSegment(context.manifest, context.activeSegment);
    if (segment.policy.kind !== 'scrub') {
      return;
    }
    const active = runtime.segmentPlayer.snapshot();
    const currentProgress = active?.segmentId === context.activeSegment
      ? active.progress
      : context.activeDirection === 1
        ? 0
        : 1;
    const delta = event.type === 'INPUT_DELTA' ? event.delta : event.direction;
    if (!active) {
      pendingScrubDelta += delta;
      queueMicrotask(flushPendingScrubDelta);
      return;
    }
    const effectiveDelta = pendingScrubDelta + delta;
    pendingScrubDelta = 0;
    runtime.segmentPlayer.scrub(context.activeSegment, Math.min(1, Math.max(0, currentProgress + effectiveDelta)));
  }

  function flushPendingScrubDelta(): void {
    if (pendingScrubDelta === 0) {
      return;
    }
    const snapshot = actor.getSnapshot();
    const context = snapshot.context;
    const active = runtime.segmentPlayer.snapshot();
    if (snapshot.value !== 'scrubbing') {
      pendingScrubDelta = 0;
      return;
    }
    if (
      !context.activeSegment ||
      active?.segmentId !== context.activeSegment
    ) {
      return;
    }
    const currentProgress = active.progress;
    const effectiveDelta = pendingScrubDelta;
    pendingScrubDelta = 0;
    runtime.segmentPlayer.scrub(context.activeSegment, Math.min(1, Math.max(0, currentProgress + effectiveDelta)));
  }

  return options.autoStart === false ? runtime : runtime.start();
}
