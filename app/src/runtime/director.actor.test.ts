import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDirectorRuntime } from './director.actor';
import { storyManifest } from '../story/manifest';
import type {
  LayerHandle,
  LayerVisibilityState,
  SceneId,
  StageHandle,
  StoryManifest
} from '../story/types';

async function flush(ms = 0): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await Promise.resolve();
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

function withFirstSegmentScrub(): StoryManifest {
  const source = structuredClone(storyManifest);
  const nodes = [...source.nodes];
  const firstSegment = nodes[1];
  if (firstSegment?.kind !== 'segment') {
    throw new Error('missing first segment');
  }
  return {
    ...source,
    nodes: [
      nodes[0]!,
      { ...firstSegment, policy: { kind: 'scrub', snapAfterIdleMs: 160 } },
      ...nodes.slice(2)
    ]
  } as StoryManifest;
}

function withFirstSegmentStaged(): StoryManifest {
  const source = structuredClone(storyManifest);
  const nodes = [...source.nodes];
  const firstSegment = nodes[1];
  if (firstSegment?.kind !== 'segment') {
    throw new Error('missing first segment');
  }
  return {
    ...source,
    nodes: [
      nodes[0]!,
      {
        ...firstSegment,
        policy: {
          kind: 'stagedSnap',
          stops: [0.5],
          playMs: [40, 60],
          advance: [{ kind: 'gesture' }]
        },
        virtualDuration: 100
      },
      ...nodes.slice(2)
    ]
  } as StoryManifest;
}

function withSegmentsSnap(...segmentIds: readonly string[]): StoryManifest {
  const source = structuredClone(storyManifest);
  return {
    ...source,
    nodes: source.nodes.map((node) => node.kind === 'segment' && segmentIds.includes(node.id)
      ? { ...node, policy: { kind: 'snap', chargeThreshold: 0.1 } }
      : node)
  } as StoryManifest;
}

function readingStage(scene: SceneId, element: HTMLElement): StageHandle {
  let visibility: LayerVisibilityState = {
    mounted: true,
    visible: true,
    inert: false,
    opacity: 1,
    pointerEvents: 'auto'
  };
  const layer: LayerHandle = {
    scene,
    role: 'current',
    element,
    get visibility() {
      return visibility;
    },
    setVisibility(next) {
      visibility = next;
    },
    dispose() {}
  };
  return {
    getLayer: (candidate) => candidate === scene ? layer : undefined,
    ensureLayer: () => layer,
    releaseLayer() {},
    snapshot: () => [layer]
  };
}

describe('director runtime actor loop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('disposes cached transition resources when the runtime stops', async () => {
    const dispose = vi.fn();
    const runtime = createDirectorRuntime({
      actorEpoch: 'stop-dispose',
      manifest: withSegmentsSnap('hero-pattern'),
      transitions: {
        'hero-pattern': {
          id: 'hero-pattern',
          buildTimeline: () => ({
            play: () => Promise.resolve(),
            progress: vi.fn(),
            reverse: () => Promise.resolve(),
            jumpToEnd: vi.fn(),
            dispose
          })
        }
      }
    });

    await runtime.segmentPlayer.ensureBuilt('hero-pattern');
    runtime.stop();

    expect(dispose).toHaveBeenCalledOnce();
  });

  it('drops queued segment mailbox events after the runtime has stopped', async () => {
    const runtime = createDirectorRuntime({
      actorEpoch: 'stop-mailbox',
      manifest: withSegmentsSnap('hero-pattern'),
      syntheticPlayMs: 1_000
    });
    runtime.send({ type: 'BOOT_READY' });
    runtime.send({ type: 'CHARGE_FIRED', direction: 1, now: 0 });
    await flush(0);
    expect(runtime.getState().state).toBe('playing');

    runtime.stop();
    await flush(0);

    expect(runtime.getState().eventLog.map((record) => record.event.type)).not.toContain('SEGMENT_ABORTED');
  });

  it('restarts the actor pump after a StrictMode-style stop and start cycle', async () => {
    const runtime = createDirectorRuntime({
      actorEpoch: 'strict-restart',
      manifest: withSegmentsSnap('hero-pattern'),
      syntheticPlayMs: 20
    });
    runtime.send({ type: 'BOOT_READY' });

    runtime.stop();
    runtime.start();
    runtime.send({ type: 'BOOT_READY' });
    runtime.send({ type: 'CHARGE_FIRED', direction: 1, now: 0 });
    await flush(0);

    expect(runtime.getState().state).toBe('playing');

    await flush(20);
    await flush(420);
    const snapshot = runtime.getState();
    runtime.stop();

    expect(snapshot.context.cursor).toEqual({ status: 'hold', scene: 'pattern' });
  });

  it('ignores readiness work that resolves after a stopped actor was replaced', async () => {
    const targetReady = deferred();
    const buildTimeline = vi.fn(() => ({
      play: () => Promise.resolve(),
      progress: vi.fn(),
      reverse: () => Promise.resolve(),
      jumpToEnd: vi.fn(),
      dispose: vi.fn()
    }));
    const runtime = createDirectorRuntime({
      actorEpoch: 'stale-prepare',
      manifest: withSegmentsSnap('hero-pattern'),
      transitions: {
        'hero-pattern': { id: 'hero-pattern', buildTimeline }
      },
      readyGate: {
        waitForTargetReady: () => targetReady.promise
      }
    });
    runtime.send({ type: 'BOOT_READY' });
    runtime.send({ type: 'CHARGE_FIRED', direction: 1, now: 0 });
    await flush(0);
    expect(runtime.getState().state).toBe('preparing');

    runtime.stop();
    runtime.start();
    runtime.send({ type: 'BOOT_READY' });
    targetReady.resolve();
    await flush(0);

    expect(runtime.getState().state).toBe('hold');
    expect(buildTimeline).not.toHaveBeenCalled();
    runtime.stop();
  });

  it('wires input-router, SegmentPlayer and Director into an automatic snap loop', async () => {
    const runtime = createDirectorRuntime({
      actorEpoch: 'loop',
      manifest: withSegmentsSnap('hero-pattern'),
      syntheticPlayMs: 20
    });
    runtime.send({ type: 'BOOT_READY' });
    runtime.send({ type: 'INPUT_DELTA', source: 'wheel', delta: 0.11, now: 0 });
    await flush(1);

    expect(runtime.getState().state).toBe('playing');
    expect(runtime.getState().context.activeRunId).toBe('loop:1');

    await flush(20);
    expect(runtime.getState().state).toBe('settling');
    await flush(420);

    const snapshot = runtime.getState();
    runtime.stop();
    expect(snapshot.state).toBe('hold');
    expect(snapshot.context.cursor).toEqual({ status: 'hold', scene: 'pattern' });
    expect(snapshot.virtualProgress).toBeGreaterThan(0);
    expect(snapshot.eventLog.map((record) => record.event.type)).toEqual(
      expect.arrayContaining(['INPUT_DELTA', 'TARGET_READY', 'PLAYBACK_DONE'])
    );
    expect(snapshot.context).toMatchObject({
      activeRunId: undefined,
      prepareToken: undefined,
      cursor: { status: 'hold', scene: 'pattern' }
    });
  });

  it('releases retiring layers through the real actor loop after a second snap hold', async () => {
    const runtime = createDirectorRuntime({
      actorEpoch: 'retiring-loop',
      manifest: withSegmentsSnap('hero-pattern', 'pattern-star-map'),
      syntheticPlayMs: 20
    });
    runtime.send({ type: 'BOOT_READY' });
    runtime.send({ type: 'INPUT_DELTA', source: 'wheel', delta: 0.11, now: 0 });
    await flush(20);
    await flush(420);

    runtime.send({ type: 'INPUT_DELTA', source: 'wheel', delta: 0.11, now: 500 });
    await flush(20);
    await flush(420);

    expect(runtime.getState().state).toBe('hold');
    expect(runtime.getState().context.cursor).toEqual({ status: 'hold', scene: 'star-map' });
    expect(runtime.getState().context.layerWindow.retiring).toEqual(['hero']);

    await flush(1);
    const snapshot = runtime.getState();
    runtime.stop();

    expect(snapshot.context.layerWindow.retiring).toEqual([]);
    expect(snapshot.eventLog.map((record) => record.event.type)).toContain('RETIRING_RELEASED');
  });

  it('does not enter playing until the runtime mediaReady gate resolves', async () => {
    const mediaReady = deferred();
    const runtime = createDirectorRuntime({
      actorEpoch: 'media-gate',
      manifest: withSegmentsSnap('hero-pattern'),
      syntheticPlayMs: 20,
      readyGate: {
        waitForMediaReady: () => mediaReady.promise
      }
    });
    runtime.send({ type: 'BOOT_READY' });
    runtime.send({ type: 'INPUT_DELTA', source: 'wheel', delta: 0.11, now: 0 });
    await flush(0);

    expect(runtime.getState().state).toBe('preparing');
    expect(runtime.getState().eventLog.map((record) => record.event.type)).not.toContain('TARGET_READY');

    mediaReady.resolve();
    await flush(0);

    const snapshot = runtime.getState();
    runtime.stop();
    expect(snapshot.state).toBe('playing');
    expect(snapshot.eventLog.map((record) => record.event.type)).toContain('TARGET_READY');
  });

  it('does not enter playing until the runtime targetReady gate resolves', async () => {
    const targetReady = deferred();
    const runtime = createDirectorRuntime({
      actorEpoch: 'target-gate',
      manifest: withSegmentsSnap('hero-pattern'),
      syntheticPlayMs: 20,
      readyGate: {
        waitForTargetReady: () => targetReady.promise
      }
    });
    runtime.send({ type: 'BOOT_READY' });
    runtime.send({ type: 'INPUT_DELTA', source: 'wheel', delta: 0.11, now: 0 });
    await flush(0);

    expect(runtime.getState().state).toBe('preparing');
    expect(runtime.getState().eventLog.map((record) => record.event.type)).not.toContain('TARGET_READY');

    targetReady.resolve();
    await flush(0);

    const snapshot = runtime.getState();
    runtime.stop();
    expect(snapshot.state).toBe('playing');
    expect(snapshot.eventLog.map((record) => record.event.type)).toContain('TARGET_READY');
  });

  it('uses the runtime buildReady gate before targetReady unlocks playing', async () => {
    const calls: string[] = [];
    const runtime = createDirectorRuntime({
      actorEpoch: 'build-gate',
      manifest: withSegmentsSnap('hero-pattern'),
      syntheticPlayMs: 20,
      readyGate: {
        beginBuild: ({ segment, prepareRunId }) => calls.push(`begin:${segment.id}:${prepareRunId}`),
        reportBuildReady: ({ segment, prepareRunId }) => {
          calls.push(`ready:${segment.id}:${prepareRunId}`);
          return true;
        }
      }
    });
    runtime.send({ type: 'BOOT_READY' });
    runtime.send({ type: 'INPUT_DELTA', source: 'wheel', delta: 0.11, now: 0 });
    await flush(0);

    const snapshot = runtime.getState();
    runtime.stop();

    expect(snapshot.state).toBe('playing');
    expect(calls).toEqual(['begin:hero-pattern:build-gate:0', 'ready:hero-pattern:build-gate:0']);
    expect(snapshot.eventLog.map((record) => record.event.type)).toContain('TARGET_READY');
  });

  it('returns a stable cached snapshot until the actor or event log changes', () => {
    const runtime = createDirectorRuntime({ actorEpoch: 'stable-snapshot' });
    const first = runtime.getState();
    const second = runtime.getState();

    expect(second).toBe(first);

    runtime.send({ type: 'BOOT_READY' });
    const third = runtime.getState();
    const fourth = runtime.getState();
    runtime.stop();

    expect(third).not.toBe(first);
    expect(fourth).toBe(third);
  });

  it('routes scrub input into an automatic SegmentPlayer completion path', async () => {
    const runtime = createDirectorRuntime({
      actorEpoch: 'scrub-loop',
      manifest: withFirstSegmentScrub(),
      syntheticPlayMs: 20
    });
    runtime.send({ type: 'BOOT_READY' });
    runtime.send({ type: 'INPUT_DELTA', source: 'wheel', delta: 0.11, now: 0 });
    await flush(0);

    expect(runtime.getState().state).toBe('scrubbing');
    expect(runtime.getState().context.activeRunId).toBe('scrub-loop:1');

    await flush(820);
    expect(runtime.getState().state).toBe('settling');
    await flush(420);

    const snapshot = runtime.getState();
    runtime.stop();
    expect(snapshot.state).toBe('hold');
    expect(snapshot.context.cursor).toEqual({ status: 'hold', scene: 'pattern' });
  });

  it('uses input-router to drop deltas while preparing instead of mutating charge', async () => {
    const runtime = createDirectorRuntime({
      actorEpoch: 'prepare-drop',
      manifest: withSegmentsSnap('hero-pattern'),
      syntheticBuildDelayMs: 50,
      syntheticPlayMs: 20
    });
    runtime.send({ type: 'BOOT_READY' });
    runtime.send({ type: 'INPUT_DELTA', source: 'wheel', delta: 0.11, now: 0 });
    const chargeAfterFire = runtime.getState().context.charge.value;
    runtime.send({ type: 'INPUT_DELTA', source: 'wheel', delta: 0.11, now: 1 });

    expect(runtime.getState().state).toBe('preparing');
    expect(runtime.getState().context.charge.value).toBe(chargeAfterFire);
    await flush(50);
    runtime.stop();
  });

  it('lets reverse preparing input reach the machine for supersede', async () => {
    const runtime = createDirectorRuntime({
      actorEpoch: 'prepare-reverse',
      manifest: withSegmentsSnap('hero-pattern', 'pattern-star-map'),
      syntheticBuildDelayMs: 100,
      syntheticPlayMs: 20
    });
    runtime.send({ type: 'BOOT_READY' });
    runtime.send({ type: 'SEEK', label: 'scene:pattern', source: 'menu' });
    await flush(0);

    runtime.send({ type: 'INPUT_DELTA', source: 'wheel', delta: 0.11, now: 0 });
    const oldToken = runtime.getState().context.prepareToken;
    expect(runtime.getState().context.pendingSegment).toBe('pattern-star-map');

    runtime.send({ type: 'INPUT_DELTA', source: 'wheel', delta: -0.11, now: 1 });
    const snapshot = runtime.getState();

    runtime.stop();
    expect(snapshot.state).toBe('preparing');
    expect(snapshot.context.pendingSegment).toBe('hero-pattern');
    expect(snapshot.context.pendingDirection).toBe(-1);
    expect(snapshot.context.prepareToken).not.toBe(oldToken);
  });

  it('resumes a stagedSnap run after a same-direction charge without completing at the stop', async () => {
    let renderedProgress = 0;
    const runtime = createDirectorRuntime({
      actorEpoch: 'staged-loop',
      manifest: withFirstSegmentStaged(),
      transitions: {
        'hero-pattern': {
          id: 'hero-pattern',
          buildTimeline: () => ({
            play: () => Promise.resolve(),
            progress: (value) => {
              renderedProgress = value;
            },
            reverse: () => Promise.resolve(),
            jumpToEnd: vi.fn(),
            dispose: vi.fn()
          })
        }
      }
    });
    runtime.send({ type: 'BOOT_READY' });
    runtime.send({ type: 'INPUT_DELTA', source: 'wheel', delta: 0.11, now: 0 });
    await flush(40);

    const paused = runtime.getState();
    expect(paused.state).toBe('staged-paused');
    expect(paused.context.pausePoint).toEqual({ segmentId: 'hero-pattern', stageIndex: 0 });
    expect(renderedProgress).toBe(0.5);
    expect(paused.eventLog.map((record) => record.event.type)).toContain('STAGE_PAUSED');
    expect(paused.eventLog.map((record) => record.event.type)).not.toContain('PLAYBACK_DONE');
    const runId = paused.context.activeRunId;

    runtime.send({ type: 'CHARGE_FIRED', direction: 1, now: 41 });
    await flush(0);

    const resumed = runtime.getState();
    expect(resumed.state).toBe('playing');
    expect(resumed.context.activeRunId).toBe(runId);
    expect(resumed.eventLog.map((record) => record.event.type)).toContain('STAGE_RESUMED');

    await flush(60);
    expect(runtime.getState().state).toBe('settling');
    await flush(420);

    const completed = runtime.getState();
    runtime.stop();
    expect(completed.state).toBe('hold');
    expect(completed.context.cursor).toEqual({ status: 'hold', scene: 'pattern' });
    expect(renderedProgress).toBe(1);
  });

  it('requires one fresh charge at the compact Pattern checkpoint', async () => {
    const runtime = createDirectorRuntime({
      actorEpoch: 'pattern-two-inputs',
      manifest: storyManifest,
      syntheticPlayMs: 20
    });
    runtime.send({ type: 'BOOT_READY' });
    runtime.send({ type: 'SEEK', label: 'scene:pattern', source: 'menu' });
    await flush(0);

    runtime.send({ type: 'CHARGE_FIRED', direction: 1, now: 0 });
    await flush(1800);

    expect(runtime.getState()).toMatchObject({
      state: 'staged-paused',
      context: {
        activeSegment: 'pattern-star-map',
        pausePoint: { segmentId: 'pattern-star-map', stageIndex: 0 }
      }
    });
    expect(runtime.getState().context.cursor).not.toEqual({ status: 'hold', scene: 'star-map' });
    runtime.send({ type: 'CHARGE_FIRED', direction: 1, now: 1801 });

    await flush(1800);
    expect(runtime.getState().state).toBe('settling');
    await flush(420);

    const completed = runtime.getState();
    runtime.stop();
    expect(completed.context.cursor).toEqual({ status: 'hold', scene: 'star-map' });
  });

  it('accumulates small same-direction deltas before resuming a stagedSnap run', async () => {
    let renderedProgress = 0;
    const runtime = createDirectorRuntime({
      actorEpoch: 'staged-small-delta',
      manifest: withFirstSegmentStaged(),
      transitions: {
        'hero-pattern': {
          id: 'hero-pattern',
          buildTimeline: () => ({
            play: () => Promise.resolve(),
            progress: (value) => {
              renderedProgress = value;
            },
            reverse: () => Promise.resolve(),
            jumpToEnd: vi.fn(),
            dispose: vi.fn()
          })
        }
      }
    });
    runtime.send({ type: 'BOOT_READY' });
    runtime.send({ type: 'INPUT_DELTA', source: 'wheel', delta: 0.11, now: 0 });
    await flush(40);

    runtime.send({ type: 'INPUT_DELTA', source: 'wheel', delta: 0.04, now: 41 });
    expect(runtime.getState()).toMatchObject({
      state: 'staged-paused',
      context: { charge: { value: 0.04 }, queuedIntent: undefined }
    });

    runtime.send({ type: 'INPUT_DELTA', source: 'wheel', delta: 0.07, now: 41 });
    await flush(0);
    expect(runtime.getState()).toMatchObject({
      state: 'playing',
      context: { activeDirection: 1, queuedIntent: undefined }
    });

    await flush(60);
    await flush(420);
    const completed = runtime.getState();
    runtime.stop();
    expect(completed.context.cursor).toEqual({ status: 'hold', scene: 'pattern' });
    expect(renderedProgress).toBe(1);
  });

  it('reverses a stagedSnap run from its pause back to the source hold', async () => {
    let renderedProgress = 0;
    const runtime = createDirectorRuntime({
      actorEpoch: 'staged-reverse',
      manifest: withFirstSegmentStaged(),
      transitions: {
        'hero-pattern': {
          id: 'hero-pattern',
          buildTimeline: () => ({
            play: () => Promise.resolve(),
            progress: (value) => {
              renderedProgress = value;
            },
            reverse: () => Promise.resolve(),
            jumpToEnd: vi.fn(),
            dispose: vi.fn()
          })
        }
      }
    });
    runtime.send({ type: 'BOOT_READY' });
    runtime.send({ type: 'INPUT_DELTA', source: 'wheel', delta: 0.11, now: 0 });
    await flush(40);

    runtime.send({ type: 'INPUT_DELTA', source: 'wheel', delta: -0.11, now: 41 });
    await flush(0);
    expect(runtime.getState()).toMatchObject({
      state: 'playing',
      context: { activeDirection: -1, pausePoint: undefined }
    });

    await flush(40);
    expect(runtime.getState().state).toBe('settling');
    await flush(420);

    const completed = runtime.getState();
    runtime.stop();
    expect(completed.context.cursor).toEqual({ status: 'hold', scene: 'hero' });
    expect(renderedProgress).toBe(0);
  });

  it('requires fresh input at the figure2-animation hold after the Method reading transition', async () => {
    const runtime = createDirectorRuntime({
      actorEpoch: 'figure2-fresh-input',
      syntheticPlayMs: 20
    });
    runtime.send({ type: 'BOOT_READY' });
    runtime.send({ type: 'SEEK', label: 'scene:method-top', source: 'menu' });
    await flush(0);

    runtime.send({ type: 'INPUT_DELTA', source: 'wheel', delta: 0.11, now: 1 });
    await flush(0);
    expect(runtime.getState().state).toBe('playing');

    await flush(20);
    expect(runtime.getState().state).toBe('settling');

    await flush(390);
    runtime.send({ type: 'INPUT_DELTA', source: 'wheel', delta: 0.11, now: 410 });
    runtime.send({ type: 'INPUT_DELTA', source: 'wheel', delta: 0.11, now: 411 });
    await flush(30);

    const held = runtime.getState();
    runtime.stop();
    expect(held).toMatchObject({
      state: 'hold',
      context: {
        cursor: { status: 'hold', scene: 'figure2-animation' },
        activeSegment: undefined,
        pendingSegment: undefined,
        queuedIntent: undefined
      }
    });
  });

  it('keeps a failed Contact reverse run at the last committed Contact hold', async () => {
    let buildCount = 0;
    let rejectPlayback!: (error: Error) => void;
    const playback = new Promise<void>((_resolve, reject) => {
      rejectPlayback = reject;
    });
    const runtime = createDirectorRuntime({
      actorEpoch: 'contact-local-recovery',
      transitions: {
        'crane-contact': {
          id: 'crane-contact',
          buildTimeline: () => {
            buildCount += 1;
            if (buildCount === 1) {
              return {
                play: () => Promise.resolve(),
                progress: vi.fn(),
                reverse: () => playback,
                jumpToEnd: vi.fn(),
                dispose: vi.fn()
              };
            }
            throw new Error('recovery must not rebuild the failed segment');
          }
        }
      }
    });
    runtime.send({ type: 'BOOT_READY' });
    runtime.send({ type: 'SEEK', label: 'scene:contact', source: 'menu' });
    await flush(0);
    runtime.send({ type: 'CHARGE_FIRED', direction: -1 });
    await flush(0);
    expect(runtime.getState().state).toBe('playing');
    const runId = runtime.getState().context.activeRunId;
    if (!runId) {
      throw new Error('missing Contact reverse runId');
    }

    rejectPlayback(new Error('crane reverse media timeout'));
    await flush(0);
    await flush(0);

    expect(buildCount).toBe(1);
    expect(runtime.getState().context).toMatchObject({
      cursor: { status: 'hold', scene: 'contact' },
      layerWindow: { current: 'contact' },
      recovery: undefined,
      lastError: new Error('crane reverse media timeout')
    });

    runtime.send({
      type: 'PLAYBACK_FAILED',
      runId,
      error: new Error('duplicate crane reverse failure')
    });
    expect(buildCount).toBe(1);

    const recovered = runtime.getState();
    const failureIndex = recovered.eventLog.findIndex((record) => record.event.type === 'PLAYBACK_FAILED');
    const recoveryWindows = recovered.eventLog.slice(failureIndex).map((record) => record.layerWindow.current);
    runtime.stop();
    expect(recovered).toMatchObject({
      state: 'hold',
      context: { cursor: { status: 'hold', scene: 'contact' } }
    });
    expect(recoveryWindows).not.toContain('crane-animation');
    expect(recoveryWindows).not.toContain('hero');
  });

  it('keeps Method committed when reverse AOD frame preparation fails', async () => {
    let buildCount = 0;
    const runtime = createDirectorRuntime({
      actorEpoch: 'aod-reverse-prepare-failure',
      transitions: {
        'aod-method-top': {
          id: 'aod-method-top',
          buildTimeline: () => {
            buildCount += 1;
            throw new Error('AOD reverse presented frame failed');
          }
        }
      }
    });
    runtime.send({ type: 'BOOT_READY' });
    runtime.send({ type: 'SEEK', label: 'scene:method-top', source: 'menu' });
    await flush(0);
    runtime.send({ type: 'CHARGE_FIRED', direction: -1 });
    await flush(30);

    const recovered = runtime.getState();
    const prepareFailureIndex = recovered.eventLog.findIndex((record) => record.event.type === 'PREPARE_TIMEOUT');
    const recoveryWindows = recovered.eventLog.slice(prepareFailureIndex).map((record) => record.layerWindow.current);
    runtime.stop();

    expect(buildCount).toBe(1);
    expect(recovered).toMatchObject({
      state: 'hold',
      context: {
        cursor: { status: 'hold', scene: 'method-top' },
        layerWindow: { current: 'method-top' },
        recovery: undefined
      }
    });
    expect(recoveryWindows).not.toContain('aod-animation');
    expect(recoveryWindows).not.toContain('hero');
  });

  it('enters the declared static AOD hold when forward media preparation cannot start', async () => {
    let buildCount = 0;
    const runtime = createDirectorRuntime({
      actorEpoch: 'aod-forward-static-fallback',
      initialScene: 'star-map',
      readyGate: {
        waitForTargetReady: () => undefined,
        waitForMediaReady: () => Promise.reject(new Error('cellular media preload blocked'))
      },
      transitions: {
        'star-map-aod': {
          id: 'star-map-aod',
          buildTimeline: () => {
            buildCount += 1;
            throw new Error('media-backed transition unavailable');
          }
        }
      }
    });
    runtime.send({ type: 'BOOT_READY' });
    runtime.send({ type: 'CHARGE_FIRED', direction: 1 });
    await flush(0);
    await flush(0);

    const recovered = runtime.getState();
    runtime.stop();

    expect(buildCount).toBe(1);
    expect(recovered).toMatchObject({
      state: 'hold',
      context: {
        cursor: { status: 'hold', scene: 'aod-animation' },
        layerWindow: { current: 'aod-animation' },
        recovery: undefined
      }
    });
    expect(recovered.eventLog.map((record) => record.event.type)).toContain('PREPARE_TIMEOUT');
  });

  it('keeps Contact usable for an explicit retry after local rollback', async () => {
    let buildCount = 0;
    let rejectPlayback!: (error: Error) => void;
    const playback = new Promise<void>((_resolve, reject) => {
      rejectPlayback = reject;
    });
    const runtime = createDirectorRuntime({
      actorEpoch: 'contact-recovery-failed',
      transitions: {
        'crane-contact': {
          id: 'crane-contact',
          buildTimeline: () => {
            buildCount += 1;
            if (buildCount === 1) {
              return {
                play: () => Promise.resolve(),
                progress: vi.fn(),
                reverse: () => playback,
                jumpToEnd: vi.fn(),
                dispose: vi.fn()
              };
            }
            return {
              play: () => Promise.resolve(),
              progress: vi.fn(),
              reverse: () => Promise.resolve(),
              jumpToEnd: vi.fn(),
              dispose: vi.fn()
            };
          }
        }
      }
    });
    runtime.send({ type: 'BOOT_READY' });
    runtime.send({ type: 'SEEK', label: 'scene:contact', source: 'menu' });
    await flush(0);
    runtime.send({ type: 'CHARGE_FIRED', direction: -1 });
    await flush(0);
    rejectPlayback(new Error('crane reverse media timeout'));
    await flush(0);
    await flush(0);

    expect(runtime.getState()).toMatchObject({
      state: 'hold',
      context: {
        cursor: { status: 'hold', scene: 'contact' },
        layerWindow: { current: 'contact' },
        recovery: undefined,
        lastError: new Error('crane reverse media timeout')
      }
    });
    expect(buildCount).toBe(1);
    expect(runtime.getState().eventLog.map((record) => record.event.type)).not.toContain('RECOVERY_FAILED');

    runtime.send({ type: 'CHARGE_FIRED', direction: -1 });
    expect(runtime.getState()).toMatchObject({
      state: 'preparing',
      context: { pendingSegment: 'crane-contact', recovery: undefined }
    });
    await flush(0);
    expect(buildCount).toBe(2);
    runtime.stop();
  });

  it('cannot let a rolled-back Contact failure overwrite an explicit menu seek', async () => {
    let buildCount = 0;
    let rejectPlayback!: (error: Error) => void;
    const playback = new Promise<void>((_resolve, reject) => {
      rejectPlayback = reject;
    });
    const runtime = createDirectorRuntime({
      actorEpoch: 'contact-stale-recovery',
      transitions: {
        'crane-contact': {
          id: 'crane-contact',
          buildTimeline: () => {
            buildCount += 1;
            if (buildCount === 1) {
              return {
                play: () => Promise.resolve(),
                progress: vi.fn(),
                reverse: () => playback,
                jumpToEnd: vi.fn(),
                dispose: vi.fn()
              };
            }
            throw new Error('rollback must not rebuild without explicit input');
          }
        }
      }
    });
    runtime.send({ type: 'BOOT_READY' });
    runtime.send({ type: 'SEEK', label: 'scene:contact', source: 'menu' });
    await flush(0);
    runtime.send({ type: 'CHARGE_FIRED', direction: -1 });
    await flush(0);
    rejectPlayback(new Error('crane reverse media timeout'));
    await flush(0);
    await flush(0);
    expect(buildCount).toBe(1);

    runtime.send({ type: 'SEEK', label: 'scene:services', source: 'menu' });
    await flush(0);

    const settled = runtime.getState();
    runtime.stop();
    expect(settled).toMatchObject({
      state: 'hold',
      context: { cursor: { status: 'hold', scene: 'services' }, recovery: undefined }
    });
    expect(settled.eventLog.map((record) => record.event.type)).not.toContain('RECOVERY_FAILED');
  });

  it('does not re-query a reading edge after an explicit runtime intent is emitted', async () => {
    const scrollport = {
      scrollTop: 120,
      clientHeight: 720,
      scrollHeight: 1440,
      dataset: { reading: 'true' },
      matches: (selector: string) => selector === '[data-reading="true"]'
    } as unknown as HTMLElement;
    const runtime = createDirectorRuntime({
      actorEpoch: 'reading-edge',
      stage: readingStage('lab', scrollport),
      manifest: withSegmentsSnap('lab-ph')
    });
    runtime.send({ type: 'BOOT_READY' });
    runtime.send({ type: 'SEEK', label: 'scene:lab', source: 'menu' });
    await flush(0);

    runtime.send({ type: 'INPUT_DELTA', source: 'wheel', delta: 0.11, now: 1 });
    expect(runtime.getState().state).toBe('preparing');
    await flush(0);
    runtime.stop();
  });

  it('keeps physical reading ownership outside Director even with a nested scrollport', async () => {
    const scrollport = {
      scrollTop: 120,
      clientHeight: 720,
      scrollHeight: 1440
    } as HTMLElement;
    const fixedLayer = {
      scrollTop: 0,
      clientHeight: 720,
      scrollHeight: 720,
      querySelector: (selector: string) => selector === '[data-reading-scrollport="true"]' ? scrollport : null
    } as unknown as HTMLElement;
    const runtime = createDirectorRuntime({
      actorEpoch: 'reading-owned-scrollport',
      stage: readingStage('method-top', fixedLayer),
      manifest: withSegmentsSnap('method-bottom-figure2')
    });
    runtime.send({ type: 'BOOT_READY' });
    runtime.send({ type: 'SEEK', label: 'scene:method-top', source: 'menu' });
    await flush(0);

    runtime.send({ type: 'INPUT_DELTA', source: 'wheel', delta: 0.11, now: 1 });
    expect(runtime.getState().state).toBe('preparing');
    await flush(0);
    runtime.stop();
  });
});
