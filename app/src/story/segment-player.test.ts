import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fromSyntheticVisibility, isVisuallyVisible } from './visibility-predicate';
import { BuildTimeoutError, SegmentPlayer } from './segment-player';
import { storyManifest } from './manifest';
import type { DirectorEvent, SegmentTimelineHandle, StoryManifest, TransitionModule } from './types';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

function flushMicrotasks(): Promise<void> {
  return Promise.resolve();
}

function transitionWithTimeline(timeline: SegmentTimelineHandle): TransitionModule {
  return {
    id: 'hero-pattern',
    buildTimeline: () => timeline
  };
}

function withHeroPatternStaged(stops: readonly number[], playMs: readonly number[]): StoryManifest {
  const manifest = structuredClone(storyManifest);
  const nodes = [...manifest.nodes];
  const index = nodes.findIndex((node) => node.kind === 'segment' && node.id === 'hero-pattern');
  const segment = nodes[index];
  if (segment?.kind !== 'segment') {
    throw new Error('hero-pattern segment missing');
  }
  nodes[index] = {
    ...segment,
    policy: { kind: 'stagedSnap', stops, playMs },
    virtualDuration: playMs.reduce((sum, value) => sum + value, 0)
  };
  return { ...manifest, nodes };
}

function withHeroPatternSnap(): StoryManifest {
  const manifest = structuredClone(storyManifest);
  const nodes = [...manifest.nodes];
  const index = nodes.findIndex((node) => node.kind === 'segment' && node.id === 'hero-pattern');
  const segment = nodes[index];
  if (segment?.kind !== 'segment') {
    throw new Error('hero-pattern segment missing');
  }
  nodes[index] = {
    ...segment,
    policy: { kind: 'snap', chargeThreshold: 0.1 }
  };
  return { ...manifest, nodes };
}

function withPatternStarMapScrub(): StoryManifest {
  const manifest = structuredClone(storyManifest);
  return {
    ...manifest,
    nodes: manifest.nodes.map((node) =>
      node.kind === 'segment' && node.id === 'pattern-star-map'
        ? {
            ...node,
            policy: { kind: 'scrub' as const, snapAfterIdleMs: 160 },
            virtualDuration: 1800
          }
        : node
    )
  };
}

describe('SegmentPlayer', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('times out ensureBuilt and sends BUILD_TIMEOUT through the mailbox', async () => {
    vi.useFakeTimers();
    const events: DirectorEvent[] = [];
    const player = new SegmentPlayer({
      transitions: {
        'hero-pattern': {
          id: 'hero-pattern',
          buildTimeline: () => new Promise<SegmentTimelineHandle>(() => undefined)
        }
      },
      mailbox: { send: (event) => events.push(event) },
      actorEpoch: 'epoch'
    });

    const build = player.ensureBuilt('hero-pattern', {
      runId: 'epoch:1',
      prepareToken: 'epoch:prepare:1',
      timeoutMs: 10
    });
    const expectedRejection = expect(build).rejects.toBeInstanceOf(BuildTimeoutError);
    await vi.advanceTimersByTimeAsync(10);

    await expectedRejection;
    await flushMicrotasks();
    expect(events).toContainEqual({
      type: 'BUILD_TIMEOUT',
      segment: 'hero-pattern',
      runId: 'epoch:1',
      prepareToken: 'epoch:prepare:1'
    });
  });

  it('disposes a timeline that resolves after its build timeout', async () => {
    vi.useFakeTimers();
    const lateBuild = deferred<SegmentTimelineHandle>();
    const dispose = vi.fn();
    const player = new SegmentPlayer({
      transitions: {
        'hero-pattern': {
          id: 'hero-pattern',
          buildTimeline: () => lateBuild.promise
        }
      },
      actorEpoch: 'epoch'
    });

    const build = player.ensureBuilt('hero-pattern', { timeoutMs: 10 });
    const expectedRejection = expect(build).rejects.toBeInstanceOf(BuildTimeoutError);
    await vi.advanceTimersByTimeAsync(10);
    await expectedRejection;

    lateBuild.resolve({
      play: () => Promise.resolve(),
      progress: vi.fn(),
      reverse: () => Promise.resolve(),
      jumpToEnd: vi.fn(),
      dispose
    });
    await flushMicrotasks();
    await flushMicrotasks();

    expect(dispose).toHaveBeenCalledOnce();
  });

  it('cancels pending builds on disposeAll and disposes their late timelines', async () => {
    const lateBuild = deferred<SegmentTimelineHandle>();
    const lateDispose = vi.fn();
    const replacementTimeline: SegmentTimelineHandle = {
      play: () => Promise.resolve(),
      progress: vi.fn(),
      reverse: () => Promise.resolve(),
      jumpToEnd: vi.fn(),
      dispose: vi.fn()
    };
    const buildTimeline = vi.fn<TransitionModule['buildTimeline']>()
      .mockImplementationOnce(() => lateBuild.promise)
      .mockImplementationOnce(() => replacementTimeline);
    const player = new SegmentPlayer({
      transitions: {
        'hero-pattern': { id: 'hero-pattern', buildTimeline }
      },
      actorEpoch: 'epoch'
    });

    const pending = player.ensureBuilt('hero-pattern');
    player.disposeAll();
    lateBuild.resolve({
      play: () => Promise.resolve(),
      progress: vi.fn(),
      reverse: () => Promise.resolve(),
      jumpToEnd: vi.fn(),
      dispose: lateDispose
    });

    await expect(pending).rejects.toThrow(/cancelled/i);
    await expect(player.ensureBuilt('hero-pattern')).resolves.toBe(replacementTimeline);
    expect(lateDispose).toHaveBeenCalledOnce();
    expect(buildTimeline).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent builds for the same segment', async () => {
    const lateBuild = deferred<SegmentTimelineHandle>();
    const timeline: SegmentTimelineHandle = {
      play: () => Promise.resolve(),
      progress: vi.fn(),
      reverse: () => Promise.resolve(),
      jumpToEnd: vi.fn(),
      dispose: vi.fn()
    };
    const buildTimeline = vi.fn<TransitionModule['buildTimeline']>(() => lateBuild.promise);
    const player = new SegmentPlayer({
      transitions: {
        'hero-pattern': { id: 'hero-pattern', buildTimeline }
      },
      actorEpoch: 'epoch'
    });

    const first = player.ensureBuilt('hero-pattern');
    const second = player.ensureBuilt('hero-pattern');
    lateBuild.resolve(timeline);

    await expect(Promise.all([first, second])).resolves.toEqual([timeline, timeline]);
    expect(buildTimeline).toHaveBeenCalledOnce();
  });

  it('resolves completed play and reports completion asynchronously', async () => {
    const events: DirectorEvent[] = [];
    const timeline = transitionWithTimeline({
      play: () => Promise.resolve(),
      progress: vi.fn(),
      reverse: () => Promise.resolve(),
      jumpToEnd: vi.fn(),
      dispose: vi.fn()
    });
    const player = new SegmentPlayer({
      manifest: withHeroPatternSnap(),
      transitions: { 'hero-pattern': timeline },
      mailbox: { send: (event) => events.push(event) },
      actorEpoch: 'epoch'
    });

    await expect(player.play('hero-pattern', 1, { runId: 'epoch:1' })).resolves.toEqual({
      status: 'completed',
      runId: 'epoch:1',
      segment: 'hero-pattern',
      direction: 1
    });
    await flushMicrotasks();
    expect(events).toContainEqual({ type: 'PLAYBACK_DONE', runId: 'epoch:1' });
  });

  it('disposes a completed timeline so transition canvases cannot accumulate between holds', async () => {
    const dispose = vi.fn();
    const buildTimeline = vi.fn<TransitionModule['buildTimeline']>(() => ({
      play: () => Promise.resolve(),
      progress: vi.fn(),
      reverse: () => Promise.resolve(),
      jumpToEnd: vi.fn(),
      dispose
    }));
    const player = new SegmentPlayer({
      manifest: withHeroPatternSnap(),
      transitions: {
        'hero-pattern': { id: 'hero-pattern', buildTimeline }
      },
      actorEpoch: 'epoch'
    });

    await player.play('hero-pattern', 1, { runId: 'epoch:1' });
    await player.ensureBuilt('hero-pattern');

    expect(dispose).toHaveBeenCalledOnce();
    expect(buildTimeline).toHaveBeenCalledTimes(2);
  });

  it('resolves playback failure without unhandled rejection', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    const player = new SegmentPlayer({
      manifest: withHeroPatternSnap(),
      transitions: {
        'hero-pattern': transitionWithTimeline({
          play: () => Promise.reject(new Error('boom')),
          progress: vi.fn(),
          reverse: () => Promise.resolve(),
          jumpToEnd: vi.fn(),
          dispose: vi.fn()
        })
      },
      actorEpoch: 'epoch'
    });

    const result = await player.play('hero-pattern', 1, { runId: 'epoch:1' });
    await flushMicrotasks();
    process.off('unhandledRejection', onUnhandled);

    expect(result).toMatchObject({ status: 'failed', runId: 'epoch:1', segment: 'hero-pattern' });
    expect(unhandled).toEqual([]);
  });

  it('resolves abort and ignores stale completion', async () => {
    const playback = deferred<void>();
    const events: DirectorEvent[] = [];
    const player = new SegmentPlayer({
      manifest: withHeroPatternSnap(),
      transitions: {
        'hero-pattern': transitionWithTimeline({
          play: () => playback.promise,
          progress: vi.fn(),
          reverse: () => Promise.resolve(),
          jumpToEnd: vi.fn(),
          dispose: vi.fn()
        })
      },
      mailbox: { send: (event) => events.push(event) },
      actorEpoch: 'epoch'
    });

    const resultPromise = player.play('hero-pattern', 1, { runId: 'epoch:1' });
    await flushMicrotasks();
    player.abort('seek');
    await expect(resultPromise).resolves.toEqual({
      status: 'aborted',
      runId: 'epoch:1',
      segment: 'hero-pattern',
      reason: 'seek'
    });
    playback.resolve();
    await flushMicrotasks();

    expect(events).toContainEqual({ type: 'SEGMENT_ABORTED', runId: 'epoch:1', reason: 'seek' });
    expect(events).not.toContainEqual({ type: 'PLAYBACK_DONE', runId: 'epoch:1' });
  });

  it('rebuilds a disposed cached timeline after seek abort', async () => {
    const playback = deferred<void>();
    const firstTimeline: SegmentTimelineHandle = {
      play: vi.fn(() => playback.promise),
      progress: vi.fn(),
      reverse: () => Promise.resolve(),
      jumpToEnd: vi.fn(),
      dispose: vi.fn()
    };
    const secondTimeline: SegmentTimelineHandle = {
      play: vi.fn(() => Promise.resolve()),
      progress: vi.fn(),
      reverse: () => Promise.resolve(),
      jumpToEnd: vi.fn(),
      dispose: vi.fn()
    };
    let buildCount = 0;
    const buildTimeline = vi.fn<TransitionModule['buildTimeline']>(() => {
      buildCount += 1;
      return buildCount === 1 ? firstTimeline : secondTimeline;
    });
    const player = new SegmentPlayer({
      manifest: withHeroPatternSnap(),
      transitions: {
        'hero-pattern': {
          id: 'hero-pattern',
          buildTimeline
        }
      },
      actorEpoch: 'epoch'
    });

    const firstResult = player.play('hero-pattern', 1, { runId: 'epoch:1' });
    await vi.waitFor(() => expect(firstTimeline.play).toHaveBeenCalledTimes(1));
    player.abort('seek');
    await expect(firstResult).resolves.toMatchObject({ status: 'aborted', reason: 'seek' });

    await expect(player.play('hero-pattern', 1, { runId: 'epoch:2' })).resolves.toMatchObject({
      status: 'completed',
      runId: 'epoch:2'
    });

    expect(firstTimeline.dispose).toHaveBeenCalledTimes(1);
    expect(buildTimeline).toHaveBeenCalledTimes(2);
    expect(secondTimeline.play).toHaveBeenCalledTimes(1);
  });

  it('passes reduced-motion preference into transition build context', async () => {
    let prefersReducedMotion: boolean | undefined;
    const player = new SegmentPlayer({
      transitions: {
        'hero-pattern': {
          id: 'hero-pattern',
          buildTimeline: (context) => {
            prefersReducedMotion = context.prefersReducedMotion;
            return {
              play: () => Promise.resolve(),
              progress: vi.fn(),
              reverse: () => Promise.resolve(),
              jumpToEnd: vi.fn(),
              dispose: vi.fn()
            };
          }
        }
      },
      prefersReducedMotion: true,
      actorEpoch: 'epoch'
    });

    await player.ensureBuilt('hero-pattern');

    expect(prefersReducedMotion).toBe(true);
  });

  it('rebuilds completed timelines and starts every forward replay at progress 0', async () => {
    let progressValue = 0;
    const playStarts: number[] = [];
    const progress = vi.fn((value: number) => {
      progressValue = value;
    });
    const play = vi.fn(() => {
      playStarts.push(progressValue);
      progressValue = 1;
      return Promise.resolve();
    });
    const buildTimeline = vi.fn<TransitionModule['buildTimeline']>(() => ({
      play,
      progress,
      reverse: () => Promise.resolve(),
      jumpToEnd: vi.fn(),
      dispose: vi.fn()
    }));
    const player = new SegmentPlayer({
      manifest: withHeroPatternSnap(),
      transitions: {
        'hero-pattern': {
          id: 'hero-pattern',
          buildTimeline
        }
      },
      actorEpoch: 'epoch'
    });

    await player.play('hero-pattern', 1, { runId: 'epoch:1' });
    await player.play('hero-pattern', 1, { runId: 'epoch:2' });

    expect(buildTimeline).toHaveBeenCalledTimes(2);
    expect(play).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenNthCalledWith(1, 0);
    expect(progress).toHaveBeenNthCalledWith(2, 0);
    expect(playStarts).toEqual([0, 0]);
  });

  it('starts reverse playback from progress 1', async () => {
    const progress = vi.fn();
    const reverse = vi.fn(() => Promise.resolve());
    const player = new SegmentPlayer({
      manifest: withHeroPatternSnap(),
      transitions: {
        'hero-pattern': transitionWithTimeline({
          play: () => Promise.resolve(),
          progress,
          reverse,
          jumpToEnd: vi.fn(),
          dispose: vi.fn()
        })
      },
      actorEpoch: 'epoch'
    });

    await player.play('hero-pattern', -1, { runId: 'epoch:1' });

    expect(progress).toHaveBeenCalledWith(1);
    expect(reverse).toHaveBeenCalled();
  });

  it('reports staged pause/resume events through the mailbox', async () => {
    const events: DirectorEvent[] = [];
    const player = new SegmentPlayer({
      manifest: withHeroPatternSnap(),
      transitions: {
        'hero-pattern': {
          id: 'hero-pattern',
          buildTimeline: (context) => ({
            play: () => {
              context.reportMilestone({
                key: 'stagePaused',
                segment: 'hero-pattern',
                runId: context.runId,
                direction: 1,
                stageIndex: 0
              });
              context.reportMilestone({
                key: 'stageResumed',
                segment: 'hero-pattern',
                runId: context.runId,
                direction: 1,
                stageIndex: 0
              });
              return Promise.resolve();
            },
            progress: vi.fn(),
            reverse: () => Promise.resolve(),
            jumpToEnd: vi.fn(),
            dispose: vi.fn()
          })
        }
      },
      mailbox: { send: (event) => events.push(event) },
      actorEpoch: 'epoch'
    });

    await player.play('hero-pattern', 1, { runId: 'epoch:1' });
    await flushMicrotasks();

    expect(events).toContainEqual({
      type: 'STAGE_PAUSED',
      runId: 'epoch:1',
      segment: 'hero-pattern',
      stageIndex: 0
    });
    expect(events).toContainEqual({
      type: 'STAGE_RESUMED',
      runId: 'epoch:1',
      segment: 'hero-pattern',
      stageIndex: 0
    });
  });

  it('pauses a stagedSnap run at its first stop until explicitly resumed', async () => {
    vi.useFakeTimers();
    const events: DirectorEvent[] = [];
    let renderedProgress = 0;
    const timeline: SegmentTimelineHandle = {
      play: () => Promise.resolve(),
      progress: (value) => {
        renderedProgress = value;
      },
      reverse: () => Promise.resolve(),
      jumpToEnd: vi.fn(),
      dispose: vi.fn()
    };
    const player = new SegmentPlayer({
      manifest: withHeroPatternStaged([0.5], [40, 60]),
      transitions: { 'hero-pattern': transitionWithTimeline(timeline) },
      mailbox: { send: (event) => events.push(event) },
      actorEpoch: 'epoch'
    });

    let settled = false;
    const result = player.play('hero-pattern', 1, { runId: 'epoch:1' });
    void result.then(() => {
      settled = true;
    });
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(20);

    expect(renderedProgress).toBeGreaterThan(0);
    expect(renderedProgress).toBeLessThan(0.5);

    await vi.advanceTimersByTimeAsync(20);
    await flushMicrotasks();

    expect(renderedProgress).toBe(0.5);
    expect(settled).toBe(false);
    expect(player.snapshot()).toMatchObject({
      runId: 'epoch:1',
      segmentId: 'hero-pattern',
      direction: 1,
      progress: 0.5,
      pausedAt: 'stage:0'
    });
    expect(events).toContainEqual({
      type: 'STAGE_PAUSED',
      runId: 'epoch:1',
      segment: 'hero-pattern',
      stageIndex: 0
    });

    expect(player.resumeStaged('epoch:1')).toBe(true);
    await flushMicrotasks();
    expect(events).toContainEqual({
      type: 'STAGE_RESUMED',
      runId: 'epoch:1',
      segment: 'hero-pattern',
      stageIndex: 0
    });

    await vi.advanceTimersByTimeAsync(60);
    await expect(result).resolves.toEqual({
      status: 'completed',
      runId: 'epoch:1',
      segment: 'hero-pattern',
      direction: 1
    });
    expect(renderedProgress).toBe(1);
  });

  it('uses the real Pattern-to-Star Map stop as a separate runtime input boundary', async () => {
    vi.useFakeTimers();
    let renderedProgress = 0;
    const player = new SegmentPlayer({
      manifest: storyManifest,
      transitions: {
        'pattern-star-map': {
          id: 'pattern-star-map',
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
      },
      actorEpoch: 'pattern-stage'
    });

    const result = player.play('pattern-star-map', 1, { runId: 'pattern-stage:1' });
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(1800);

    expect(renderedProgress).toBe(0.5);
    expect(player.snapshot()).toMatchObject({
      segmentId: 'pattern-star-map',
      progress: 0.5,
      pausedAt: 'stage:0'
    });

    expect(player.resumeStaged('pattern-stage:1')).toBe(true);
    await vi.advanceTimersByTimeAsync(1800);
    await expect(result).resolves.toMatchObject({ status: 'completed', direction: 1 });
    expect(renderedProgress).toBe(1);
  });

  it('drives stagedSnap playback on animation frames when the browser scheduler is available', async () => {
    vi.useFakeTimers();
    const requestFrame = vi.fn(() => 41);
    const cancelFrame = vi.fn();
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);
    const player = new SegmentPlayer({
      manifest: withHeroPatternStaged([0.5], [40, 60]),
      transitions: {
        'hero-pattern': transitionWithTimeline({
          play: () => Promise.resolve(),
          progress: vi.fn(),
          reverse: () => Promise.resolve(),
          jumpToEnd: vi.fn(),
          dispose: vi.fn()
        })
      },
      actorEpoch: 'epoch'
    });

    try {
      const result = player.play('hero-pattern', 1, { runId: 'epoch:1' });
      for (let turn = 0; turn < 12; turn += 1) {
        await flushMicrotasks();
      }
      const scheduledFrames = requestFrame.mock.calls.length;
      player.disposeAll();
      await result;

      expect(scheduledFrames).toBeGreaterThan(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not skip a staged leg when one browser frame stalls longer than the leg', async () => {
    const callbacks: FrameRequestCallback[] = [];
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    let now = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const renderedProgress: number[] = [];
    const player = new SegmentPlayer({
      manifest: withHeroPatternStaged([0.5], [1_000, 1_000]),
      transitions: {
        'hero-pattern': transitionWithTimeline({
          play: () => Promise.resolve(),
          progress: (value) => renderedProgress.push(value),
          reverse: () => Promise.resolve(),
          jumpToEnd: vi.fn(),
          dispose: vi.fn()
        })
      },
      actorEpoch: 'epoch'
    });

    const result = player.play('hero-pattern', 1, { runId: 'epoch:1' });
    try {
      for (let turn = 0; turn < 12; turn += 1) {
        await flushMicrotasks();
      }
      expect(callbacks).toHaveLength(1);

      now = 5_000;
      callbacks.shift()?.(now);

      expect(renderedProgress.at(-1)).toBeGreaterThan(0);
      expect(renderedProgress.at(-1)).toBeLessThan(0.5);
      expect(player.snapshot()?.pausedAt).toBeUndefined();
    } finally {
      player.disposeAll();
      await result;
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });

  it('reverses a stagedSnap run from a pause back to the previous boundary', async () => {
    vi.useFakeTimers();
    let renderedProgress = 0;
    const player = new SegmentPlayer({
      manifest: withHeroPatternStaged([0.5], [40, 60]),
      transitions: {
        'hero-pattern': transitionWithTimeline({
          play: () => Promise.resolve(),
          progress: (value) => {
            renderedProgress = value;
          },
          reverse: () => Promise.resolve(),
          jumpToEnd: vi.fn(),
          dispose: vi.fn()
        })
      },
      actorEpoch: 'epoch'
    });

    const result = player.play('hero-pattern', 1, { runId: 'epoch:1' });
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(40);

    expect(player.snapshot()).toMatchObject({
      direction: 1,
      progress: 0.5,
      pausedAt: 'stage:0'
    });
    expect(player.resumeStaged('epoch:1', -1)).toBe(true);
    expect(player.snapshot()).toMatchObject({ direction: -1, progress: 0.5 });

    await vi.advanceTimersByTimeAsync(40);
    await expect(result).resolves.toMatchObject({ status: 'completed', direction: -1 });
    expect(renderedProgress).toBe(0);
  });

  it('keeps a staged leg clock frozen until asynchronous leg readiness resolves', async () => {
    vi.useFakeTimers();
    const legReady = deferred<void>();
    const progress = vi.fn();
    const timeline = {
      play: () => Promise.resolve(),
      progress,
      reverse: () => Promise.resolve(),
      jumpToEnd: vi.fn(),
      dispose: vi.fn(),
      prepareLeg: vi.fn(() => legReady.promise)
    } as SegmentTimelineHandle & {
      prepareLeg(args: unknown): Promise<void>;
    };
    const player = new SegmentPlayer({
      manifest: withHeroPatternStaged([0.5], [40, 60]),
      transitions: { 'hero-pattern': transitionWithTimeline(timeline) },
      actorEpoch: 'leg-readiness'
    });

    const result = player.play('hero-pattern', 1, { runId: 'leg-readiness:1' });
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(80);

    expect(timeline.prepareLeg).toHaveBeenCalledWith(expect.objectContaining({
      direction: 1,
      legIndex: 0,
      from: 0,
      to: 0.5
    }));
    expect(progress.mock.calls.at(-1)?.[0] ?? 0).toBe(0);
    expect(player.snapshot()).toMatchObject({ progress: 0 });
    expect(player.snapshot()?.pausedAt).toBeUndefined();

    legReady.resolve();
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(40);
    expect(player.snapshot()).toMatchObject({ progress: 0.5, pausedAt: 'stage:0' });
    player.disposeAll();
    await result;
  });

  it('fails only the active staged run when leg preparation rejects', async () => {
    vi.useFakeTimers();
    const timeline = {
      play: () => Promise.resolve(),
      progress: vi.fn(),
      reverse: () => Promise.resolve(),
      jumpToEnd: vi.fn(),
      dispose: vi.fn(),
      prepareLeg: vi.fn(() => Promise.reject(new Error('directional frame unavailable')))
    } as SegmentTimelineHandle & {
      prepareLeg(args: unknown): Promise<void>;
    };
    const player = new SegmentPlayer({
      manifest: withHeroPatternStaged([], [40]),
      transitions: { 'hero-pattern': transitionWithTimeline(timeline) },
      actorEpoch: 'leg-failure'
    });

    const result = player.play('hero-pattern', 1, { runId: 'leg-failure:1' });
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(80);

    await expect(result).resolves.toMatchObject({
      status: 'failed',
      error: expect.objectContaining({ message: 'directional frame unavailable' })
    });
    expect(timeline.progress).not.toHaveBeenCalledWith(1);
  });

  it('visits stagedSnap stops in reverse order during reverse playback', async () => {
    vi.useFakeTimers();
    const events: DirectorEvent[] = [];
    let renderedProgress = 0;
    const player = new SegmentPlayer({
      manifest: withHeroPatternStaged([0.25, 0.75], [20, 30, 40]),
      transitions: {
        'hero-pattern': transitionWithTimeline({
          play: () => Promise.resolve(),
          progress: (value) => {
            renderedProgress = value;
          },
          reverse: () => Promise.resolve(),
          jumpToEnd: vi.fn(),
          dispose: vi.fn()
        })
      },
      mailbox: { send: (event) => events.push(event) },
      actorEpoch: 'epoch'
    });

    const result = player.play('hero-pattern', -1, { runId: 'epoch:1' });
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(40);
    await flushMicrotasks();

    expect(renderedProgress).toBe(0.75);
    expect(player.snapshot()?.pausedAt).toBe('stage:1');
    expect(player.resumeStaged('epoch:1')).toBe(true);

    await vi.advanceTimersByTimeAsync(30);
    await flushMicrotasks();
    expect(renderedProgress).toBe(0.25);
    expect(player.snapshot()?.pausedAt).toBe('stage:0');
    expect(player.resumeStaged('epoch:1')).toBe(true);

    await vi.advanceTimersByTimeAsync(20);
    await expect(result).resolves.toMatchObject({ status: 'completed', direction: -1 });
    expect(renderedProgress).toBe(0);
    expect(events.filter((event) => event.type === 'STAGE_PAUSED')).toEqual([
      expect.objectContaining({ stageIndex: 1 }),
      expect.objectContaining({ stageIndex: 0 })
    ]);
  });

  it('lets jumpToEnd fixtures assert terminal visibility with the shared predicate', async () => {
    let from = fromSyntheticVisibility({ mounted: true, opacity: 1 });
    let to = fromSyntheticVisibility({ mounted: true, opacity: 0, visibility: 'hidden' });
    const player = new SegmentPlayer({
      transitions: {
        'hero-pattern': transitionWithTimeline({
          play: () => Promise.resolve(),
          progress: (value) => {
            from = fromSyntheticVisibility({ mounted: true, opacity: 1 - value });
            to = fromSyntheticVisibility({ mounted: true, opacity: value, visibility: value > 0 ? 'visible' : 'hidden' });
          },
          reverse: () => Promise.resolve(),
          jumpToEnd: (direction) => {
            from = fromSyntheticVisibility({ mounted: true, opacity: direction === 1 ? 0 : 1 });
            to = fromSyntheticVisibility({
              mounted: true,
              opacity: direction === 1 ? 1 : 0,
              visibility: direction === 1 ? 'visible' : 'hidden'
            });
          },
          dispose: vi.fn()
        })
      },
      actorEpoch: 'epoch'
    });

    await player.ensureBuilt('hero-pattern');
    player.scrub('hero-pattern', 1);
    expect(isVisuallyVisible(from)).toBe(false);
    expect(isVisuallyVisible(to)).toBe(true);

    player.jumpToEnd('hero-pattern', -1);
    expect(isVisuallyVisible(from)).toBe(true);
    expect(isVisuallyVisible(to)).toBe(false);
  });

  it('snaps an idle scrub to its forward endpoint after the manifest delay', async () => {
    vi.useFakeTimers();
    let renderedProgress = 0;
    const events: DirectorEvent[] = [];
    const player = new SegmentPlayer({
      manifest: withPatternStarMapScrub(),
      transitions: {
        'pattern-star-map': {
          id: 'pattern-star-map',
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
      },
      mailbox: { send: (event) => events.push(event) },
      actorEpoch: 'epoch'
    });

    const result = player.play('pattern-star-map', 1, { runId: 'epoch:1' });
    await flushMicrotasks();
    player.scrub('pattern-star-map', 0.45);
    await vi.advanceTimersByTimeAsync(159);
    expect(renderedProgress).toBe(0.45);

    await vi.advanceTimersByTimeAsync(700);
    await expect(result).resolves.toMatchObject({ status: 'completed', direction: 1 });
    await flushMicrotasks();
    expect(renderedProgress).toBe(1);
    expect(events).toContainEqual({ type: 'PLAYBACK_DONE', runId: 'epoch:1' });
  });

  it('restarts the scrub idle delay when fresh input arrives', async () => {
    vi.useFakeTimers();
    let renderedProgress = 0;
    const player = new SegmentPlayer({
      manifest: withPatternStarMapScrub(),
      transitions: {
        'pattern-star-map': {
          id: 'pattern-star-map',
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
      },
      actorEpoch: 'epoch'
    });

    const result = player.play('pattern-star-map', 1, { runId: 'epoch:1' });
    await flushMicrotasks();
    player.scrub('pattern-star-map', 0.3);
    await vi.advanceTimersByTimeAsync(100);
    player.scrub('pattern-star-map', 0.4);
    await vi.advanceTimersByTimeAsync(100);

    expect(renderedProgress).toBe(0.4);
    player.disposeAll();
    await result;
  });

  it('snaps an idle reverse scrub through intermediate frames to zero', async () => {
    vi.useFakeTimers();
    const rendered: number[] = [];
    const player = new SegmentPlayer({
      manifest: withPatternStarMapScrub(),
      transitions: {
        'pattern-star-map': {
          id: 'pattern-star-map',
          buildTimeline: () => ({
            play: () => Promise.resolve(),
            progress: (value) => rendered.push(value),
            reverse: () => Promise.resolve(),
            jumpToEnd: vi.fn(),
            dispose: vi.fn()
          })
        }
      },
      actorEpoch: 'epoch'
    });

    const result = player.play('pattern-star-map', -1, { runId: 'epoch:1' });
    await flushMicrotasks();
    player.scrub('pattern-star-map', 0.62);
    await vi.advanceTimersByTimeAsync(900);

    await expect(result).resolves.toMatchObject({ status: 'completed', direction: -1 });
    expect(rendered.at(-1)).toBe(0);
    expect(rendered.some((value) => value > 0 && value < 0.62)).toBe(true);
  });
});
