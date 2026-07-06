import { useSyncExternalStore } from 'react';
import { createActor } from 'xstate';
import { canUseDOM } from './browser-guard';
import { createDirectorMachine, type DirectorContext, type DirectorMachineOptions } from './director.machine';
import { routeInput, type DirectorDiscreteState } from './input-router';
import { storyManifest } from '../story/manifest';
import { BuildTimeoutError, SegmentPlayer } from '../story/segment-player';
import { StorySpine } from '../story/spine';
import type {
  DirectorEvent,
  Direction,
  MilestoneKey,
  SceneId,
  SegmentId,
  SegmentTimelineHandle,
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
  ringBufferSize?: number;
  syntheticPlayMs?: number;
  syntheticBuildDelayMs?: number;
};

type RuntimeListener = () => void;

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
  const actor = createActor(createDirectorMachine(options));
  const ringBuffer = new EventRingBuffer(options.ringBufferSize ?? 120);
  const listeners = new Set<RuntimeListener>();
  let handledPrepareToken: DirectorContext['prepareToken'];
  let handledRunId: DirectorContext['activeRunId'];
  let isStarted = false;
  let cachedSnapshot: StoryDebugSnapshot | undefined;

  const runtime = {
    actor,
    segmentPlayer: new SegmentPlayer({
      manifest,
      transitions: createSyntheticTransitions(manifest, options.syntheticPlayMs ?? 80, options.syntheticBuildDelayMs ?? 0),
      mailbox: {
        send(event) {
          runtime.send(event);
        }
      }
    }),
    start() {
      if (!isStarted) {
        actor.start();
        isStarted = true;
        refreshSnapshot();
        pumpMainLoop();
      }
      return runtime;
    },
    stop() {
      actor.stop();
      isStarted = false;
    },
    send(event: DirectorEvent): void {
      const routed = routeEvent(event);
      if (event.type === 'SEEK') {
        runtime.segmentPlayer.abort('seek');
      }
      if (routed) {
        actor.send(routed);
        if (routed.type === 'BOOT_FAILED' || routed.type === 'BUILD_TIMEOUT' || routed.type === 'PLAYBACK_FAILED') {
          runtime.segmentPlayer.abort('recovery');
        }
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

  actor.subscribe(() => {
    pumpMainLoop();
    refreshSnapshot();
    notifyListeners();
  });

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
      readingCanScroll: false,
      ...(segment ? { segmentPolicy: segment.policy } : {})
    });

    if (route.path === 'none' || route.path === 'innerScroll') {
      if (state === 'preparing' && context.pendingDirection === -direction) {
        return event;
      }
      return null;
    }
    if (route.path === 'chargeResume' && Math.abs(event.delta) >= context.chargeThreshold) {
      return {
        type: 'CHARGE_FIRED',
        direction: route.direction,
        ...(event.now !== undefined ? { now: event.now } : {})
      };
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
      (state === 'playing' || state === 'scrubbing') &&
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

    if (state === 'recovering') {
      runtime.segmentPlayer.abort('recovery');
    }
  }

  async function prepareSegment(prepareToken: NonNullable<DirectorContext['prepareToken']>, segmentId: SegmentId): Promise<void> {
    const context = actor.getSnapshot().context;
    const segment = findSegment(context.manifest, segmentId);
    const prepareRunId = `${context.actorEpoch}:0` as const;

    try {
      await runtime.segmentPlayer.ensureBuilt(segmentId, {
        runId: prepareRunId,
        prepareToken,
        timeoutMs: segment.buildTimeoutMs ?? context.manifest.defaults.buildTimeoutMs,
        direction: context.pendingDirection ?? 1
      });
    } catch (error) {
      const current = actor.getSnapshot();
      if (current.value === 'preparing' && current.context.prepareToken === prepareToken && !(error instanceof BuildTimeoutError)) {
        runtime.send({ type: 'BUILD_TIMEOUT', segment: segmentId, prepareToken });
      }
      return;
    }

    const current = actor.getSnapshot();
    if (current.value !== 'preparing' || current.context.prepareToken !== prepareToken || !current.context.pendingDirection) {
      return;
    }
    runtime.send({
      type: 'TARGET_READY',
      scene: targetScene(segment, current.context.pendingDirection),
      prepareToken
    });
  }

  return runtime.start();
}

export const directorRuntime = createDirectorRuntime();

export function useDirectorSnapshot(): StoryDebugSnapshot {
  return useSyncExternalStore(
    directorRuntime.subscribe,
    directorRuntime.getState,
    directorRuntime.getState
  );
}

declare global {
  interface Window {
    __story?: typeof directorRuntime;
  }
}

if (canUseDOM()) {
  window.__story = directorRuntime;
}
