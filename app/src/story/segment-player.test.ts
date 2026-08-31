import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fromSyntheticVisibility, isVisuallyVisible } from './visibility-predicate';
import { BuildTimeoutError, SegmentPlayer } from './segment-player';
import { storyManifest } from './manifest';
import type {
  DirectorEvent,
  SegmentProgressReceipt,
  SegmentProgressRequest,
  SegmentPolicy,
  SegmentTimelineHandle,
  StagedBoundaryAdvance,
  StoryManifest,
  TransitionModule
} from './types';

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

function withHeroPatternStaged(
  stops: readonly number[],
  playMs: readonly number[],
  preparingTimeoutMs?: number,
  advance: readonly StagedBoundaryAdvance[] = stops.map(() => ({ kind: 'gesture' as const }))
): StoryManifest {
  const manifest = structuredClone(storyManifest);
  const nodes = [...manifest.nodes];
  const index = nodes.findIndex((node) => node.kind === 'segment' && node.id === 'hero-pattern');
  const segment = nodes[index];
  if (segment?.kind !== 'segment') {
    throw new Error('hero-pattern segment missing');
  }
  nodes[index] = {
    ...(() => {
      if (preparingTimeoutMs !== undefined) return segment;
      const withoutMedia = { ...segment };
      delete withoutMedia.mediaPlayback;
      return { ...withoutMedia, requiredMilestones: ['targetReady', 'buildReady'] as const };
    })(),
    policy: { kind: 'stagedSnap', stops, playMs, advance },
    virtualDuration: playMs.reduce((sum, value) => sum + value, 0),
    ...(preparingTimeoutMs !== undefined
      ? {
          mediaPlayback: [{
            id: 'test-staged-media',
            media: [],
            forward: { mode: 'none' as const, required: false },
            reverse: { mode: 'none' as const, required: false },
            readyMilestones: [],
            terminalFallbackScene: 'pattern' as const,
            preparingTimeoutMs
          }]
        }
      : {})
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
    ...(() => {
      const withoutMedia = { ...segment };
      delete withoutMedia.mediaPlayback;
      return { ...withoutMedia, requiredMilestones: ['targetReady', 'buildReady'] as const };
    })(),
    policy: { kind: 'snap', chargeThreshold: 0.1 }
  };
  return { ...manifest, nodes };
}

function withHeroPatternFrameLock(
  policy: SegmentPolicy
): StoryManifest {
  const manifest = structuredClone(storyManifest);
  const nodes = [...manifest.nodes];
  const index = nodes.findIndex((node) => node.kind === 'segment' && node.id === 'hero-pattern');
  const segment = nodes[index];
  if (segment?.kind !== 'segment') {
    throw new Error('hero-pattern segment missing');
  }
  nodes[index] = {
    ...segment,
    policy,
    mediaPlayback: [{
      id: 'test-frame-lock',
      media: ['test-frame-lock'],
      forward: { mode: 'frame-lock', required: true, media: ['test-frame-lock'] },
      reverse: { mode: 'frame-lock', required: true, media: ['test-frame-lock'] },
      readyMilestones: ['targetReady', 'mediaReady'],
      terminalFallbackScene: 'pattern',
      preparingTimeoutMs: 8000
    }]
  };
  return { ...manifest, nodes };
}

function withHeroPatternFrameLockSnap(): StoryManifest {
  return withHeroPatternFrameLock({ kind: 'snap', chargeThreshold: 0.1 });
}

function withHeroPatternFrameLockStaged(): StoryManifest {
  return withHeroPatternFrameLock({
    kind: 'stagedSnap',
    stops: [0.5],
    playMs: [40, 60],
    advance: [{ kind: 'gesture' }]
  });
}

function withHeroPatternFrameLockScrub(): StoryManifest {
  return withHeroPatternFrameLock({ kind: 'scrub', snapAfterIdleMs: 160 });
}

function presentedProgressReceipt(request: SegmentProgressRequest): SegmentProgressReceipt {
  return {
    status: 'presented',
    runId: request.runId,
    sequence: request.sequence,
    desiredProgress: request.desiredProgress,
    presentedProgress: request.desiredProgress,
    evidence: 'runtime'
  };
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
    vi.unstubAllGlobals();
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

  it('commits a frame-lock snap only after the exact presented receipt', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', undefined);
    const pending = deferred<SegmentProgressReceipt>();
    const requests: SegmentProgressRequest[] = [];
    const progress = vi.fn();
    const play = vi.fn(() => Promise.resolve());
    const reverse = vi.fn(() => Promise.resolve());
    const timeline: SegmentTimelineHandle = {
      play,
      presentProgress: (request) => {
        requests.push(request);
        return request.desiredProgress >= 1
          ? pending.promise
          : Promise.resolve(presentedProgressReceipt(request));
      },
      progress,
      reverse,
      jumpToEnd: vi.fn(),
      dispose: vi.fn()
    };
    const player = new SegmentPlayer({
      manifest: withHeroPatternFrameLockSnap(),
      transitions: { 'hero-pattern': transitionWithTimeline(timeline) },
      actorEpoch: 'frame-lock-snap'
    });

    const result = player.play('hero-pattern', 1, { runId: 'frame-lock-snap:1' });
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(3200);
    await flushMicrotasks();

    expect(requests[0]?.desiredProgress).toBeGreaterThan(0);
    expect(requests[0]?.desiredProgress).toBeLessThan(1);
    expect(requests.at(-1)).toMatchObject({
      runId: 'frame-lock-snap:1', desiredProgress: 1
    });
    expect(progress).not.toHaveBeenCalledWith(1);
    expect(player.snapshot()?.progress).toBeLessThan(1);
    expect(play).not.toHaveBeenCalled();
    expect(reverse).not.toHaveBeenCalled();

    pending.resolve(presentedProgressReceipt(requests.at(-1)!));
    await expect(result).resolves.toEqual({
      status: 'completed',
      runId: 'frame-lock-snap:1',
      segment: 'hero-pattern',
      direction: 1
    });
    expect(progress).toHaveBeenLastCalledWith(1);
  });

  it('gates a reverse frame-lock endpoint on its receipt and ignores a late abort', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', undefined);
    const pending = deferred<SegmentProgressReceipt>();
    const requests: SegmentProgressRequest[] = [];
    const progress = vi.fn();
    const timeline: SegmentTimelineHandle = {
      play: vi.fn(() => Promise.resolve()),
      presentProgress: (request) => {
        requests.push(request);
        return request.desiredProgress <= 0
          ? pending.promise
          : Promise.resolve(presentedProgressReceipt(request));
      },
      progress,
      reverse: vi.fn(() => Promise.resolve()),
      jumpToEnd: vi.fn(),
      dispose: vi.fn()
    };
    const player = new SegmentPlayer({
      manifest: withHeroPatternFrameLockSnap(),
      transitions: { 'hero-pattern': transitionWithTimeline(timeline) },
      actorEpoch: 'frame-lock-reverse'
    });

    const result = player.play('hero-pattern', -1, { runId: 'frame-lock-reverse:1' });
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(3200);
    await flushMicrotasks();
    expect(requests[0]?.desiredProgress).toBeLessThan(1);
    expect(requests[0]?.desiredProgress).toBeGreaterThan(0);
    expect(requests.at(-1)).toMatchObject({ desiredProgress: 0, direction: -1 });
    player.abort('seek');
    await expect(result).resolves.toMatchObject({ status: 'aborted', reason: 'seek' });

    pending.resolve(presentedProgressReceipt(requests.at(-1)!));
    await flushMicrotasks();
    expect(progress.mock.calls.at(-1)?.[0]).toBeGreaterThan(0);
    expect(progress).not.toHaveBeenCalledWith(0);
  });

  it('coalesces frame-lock scrub requests without advancing from desired progress', async () => {
    const presentations: Array<ReturnType<typeof deferred<SegmentProgressReceipt>>> = [];
    const requests: SegmentProgressRequest[] = [];
    const progress = vi.fn();
    const timeline: SegmentTimelineHandle = {
      play: vi.fn(() => Promise.resolve()),
      presentProgress: (request) => {
        requests.push(request);
        const next = deferred<SegmentProgressReceipt>();
        presentations.push(next);
        return next.promise;
      },
      progress,
      reverse: vi.fn(() => Promise.resolve()),
      jumpToEnd: vi.fn(),
      dispose: vi.fn()
    };
    const player = new SegmentPlayer({
      manifest: withHeroPatternFrameLockScrub(),
      transitions: { 'hero-pattern': transitionWithTimeline(timeline) },
      actorEpoch: 'frame-lock-scrub'
    });

    const result = player.play('hero-pattern', 1, { runId: 'frame-lock-scrub:1' });
    await vi.waitFor(() => expect(progress).toHaveBeenCalledWith(0));
    player.scrub('hero-pattern', 0.25);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    player.scrub('hero-pattern', 0.75);
    expect(player.snapshot()).toMatchObject({ progress: 0 });
    expect(progress).not.toHaveBeenCalledWith(0.25);

    presentations[0]!.resolve(presentedProgressReceipt(requests[0]!));
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    presentations[1]!.resolve(presentedProgressReceipt(requests[1]!));
    await vi.waitFor(() => expect(progress).toHaveBeenLastCalledWith(0.75));
    expect(player.snapshot()).toMatchObject({ progress: 0.75 });
    expect(progress).toHaveBeenLastCalledWith(0.75);

    player.abort('seek');
    await expect(result).resolves.toMatchObject({ status: 'aborted', reason: 'seek' });
  });

  it('starts the frame-lock scrub idle snap from the last presented progress', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', undefined);
    const presentations: Array<ReturnType<typeof deferred<SegmentProgressReceipt>>> = [];
    const requests: SegmentProgressRequest[] = [];
    const progress = vi.fn();
    const timeline: SegmentTimelineHandle = {
      play: vi.fn(() => Promise.resolve()),
      presentProgress: (request) => {
        requests.push(request);
        const next = deferred<SegmentProgressReceipt>();
        presentations.push(next);
        return next.promise;
      },
      progress,
      reverse: vi.fn(() => Promise.resolve()),
      jumpToEnd: vi.fn(),
      dispose: vi.fn()
    };
    const player = new SegmentPlayer({
      manifest: withHeroPatternFrameLockScrub(),
      transitions: { 'hero-pattern': transitionWithTimeline(timeline) },
      actorEpoch: 'frame-lock-scrub-idle'
    });

    const result = player.play('hero-pattern', 1, { runId: 'frame-lock-scrub-idle:1' });
    await vi.waitFor(() => expect(progress).toHaveBeenCalledWith(0));
    player.scrub('hero-pattern', 0.75);
    await vi.waitFor(() => expect(requests).toHaveLength(1));

    await vi.advanceTimersByTimeAsync(176);
    expect(requests).toHaveLength(1);
    presentations[0]!.resolve(presentedProgressReceipt(requests[0]!));
    await vi.waitFor(() => expect(requests).toHaveLength(2));

    expect(requests[1]!.desiredProgress).toBeGreaterThanOrEqual(0);
    expect(requests[1]!.desiredProgress).toBeLessThan(0.75);
    player.abort('seek');
    await expect(result).resolves.toMatchObject({ status: 'aborted', reason: 'seek' });
  });

  it('waits for a frame-lock staged boundary receipt before pausing or advancing', async () => {
    const presentations: Array<ReturnType<typeof deferred<SegmentProgressReceipt>>> = [];
    const requests: SegmentProgressRequest[] = [];
    const events: DirectorEvent[] = [];
    const progress = vi.fn();
    const timeline: SegmentTimelineHandle = {
      play: vi.fn(() => Promise.resolve()),
      presentProgress: (request) => {
        requests.push(request);
        const next = deferred<SegmentProgressReceipt>();
        presentations.push(next);
        return next.promise;
      },
      progress,
      reverse: vi.fn(() => Promise.resolve()),
      jumpToEnd: vi.fn(),
      dispose: vi.fn()
    };
    const player = new SegmentPlayer({
      manifest: withHeroPatternFrameLockStaged(),
      transitions: { 'hero-pattern': transitionWithTimeline(timeline) },
      mailbox: { send: (event) => events.push(event) },
      actorEpoch: 'frame-lock-staged',
      prefersReducedMotion: true
    });

    const result = player.play('hero-pattern', 1, { runId: 'frame-lock-staged:1' });
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ desiredProgress: 0.5 });
    expect(player.snapshot()).toMatchObject({ progress: 0 });
    expect(events).not.toContainEqual(expect.objectContaining({ type: 'STAGE_PAUSED' }));

    presentations[0]!.resolve(presentedProgressReceipt(requests[0]!));
    await vi.waitFor(() => expect(player.snapshot()).toMatchObject({ progress: 0.5, pausedAt: 'stage:0' }));
    expect(player.snapshot()).toMatchObject({ progress: 0.5, pausedAt: 'stage:0' });
    expect(events).toContainEqual(expect.objectContaining({ type: 'STAGE_PAUSED', stageIndex: 0 }));

    expect(player.resumeStaged('frame-lock-staged:1')).toBe(true);
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    expect(requests).toHaveLength(2);
    expect(player.snapshot()).toMatchObject({ progress: 0.5 });
    presentations[1]!.resolve(presentedProgressReceipt(requests[1]!));
    await expect(result).resolves.toMatchObject({ status: 'completed', direction: 1 });
    expect(progress).toHaveBeenLastCalledWith(1);
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

  it('pauses the real Pattern lifecycle once after compact and copy finish together', async () => {
    vi.useFakeTimers();
    const events: DirectorEvent[] = [];
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
      actorEpoch: 'pattern-stage',
      mailbox: { send: (event) => events.push(event) }
    });

    const result = player.play('pattern-star-map', 1, { runId: 'pattern-stage:1' });
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(1800);
    expect(player.snapshot()).toMatchObject({ progress: 0.5, pausedAt: 'stage:0' });
    expect(player.resumeStaged('pattern-stage:1')).toBe(true);

    await vi.advanceTimersByTimeAsync(1800);
    await expect(result).resolves.toMatchObject({ status: 'completed', direction: 1 });
    expect(renderedProgress).toBe(1);
    expect(events.filter((event) => event.type === 'STAGE_PAUSED')).toEqual([
      expect.objectContaining({ stageIndex: 0 })
    ]);
    expect(events.filter((event) => event.type === 'PLAYBACK_DONE')).toHaveLength(1);
  });

  it('automatically advances a delay boundary only after its cancellable dwell', async () => {
    vi.useFakeTimers();
    const events: DirectorEvent[] = [];
    let renderedProgress = 0;
    const player = new SegmentPlayer({
      manifest: withHeroPatternStaged(
        [0.5],
        [40, 60],
        undefined,
        [{ kind: 'delay', ms: 1000 }]
      ),
      transitions: {
        'hero-pattern': transitionWithTimeline({
          play: () => Promise.resolve(),
          progress: (value) => { renderedProgress = value; },
          reverse: () => Promise.resolve(),
          jumpToEnd: vi.fn(),
          dispose: vi.fn()
        })
      },
      mailbox: { send: (event) => events.push(event) },
      actorEpoch: 'delay-boundary'
    });

    const result = player.play('hero-pattern', 1, { runId: 'delay-boundary:1' });
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(40);
    expect(renderedProgress).toBe(0.5);
    expect(player.snapshot()?.pausedAt).toBeUndefined();
    expect(events.some((event) => event.type === 'STAGE_PAUSED')).toBe(false);

    await vi.advanceTimersByTimeAsync(999);
    expect(renderedProgress).toBe(0.5);
    await vi.advanceTimersByTimeAsync(61);
    await expect(result).resolves.toMatchObject({ status: 'completed', direction: 1 });
    expect(renderedProgress).toBe(1);
  });

  it('applies the same cancellable boundary dwell while reversing', async () => {
    vi.useFakeTimers();
    const events: DirectorEvent[] = [];
    let renderedProgress = 1;
    const player = new SegmentPlayer({
      manifest: withHeroPatternStaged(
        [0.5],
        [40, 60],
        undefined,
        [{ kind: 'delay', ms: 1000 }]
      ),
      transitions: {
        'hero-pattern': transitionWithTimeline({
          play: () => Promise.resolve(),
          progress: (value) => { renderedProgress = value; },
          reverse: () => Promise.resolve(),
          jumpToEnd: vi.fn(),
          dispose: vi.fn()
        })
      },
      mailbox: { send: (event) => events.push(event) },
      actorEpoch: 'reverse-delay-boundary'
    });

    const result = player.play('hero-pattern', -1, { runId: 'reverse-delay-boundary:1' });
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(60);
    expect(renderedProgress).toBe(0.5);
    expect(events.some((event) => event.type === 'STAGE_PAUSED')).toBe(false);

    await vi.advanceTimersByTimeAsync(999);
    expect(renderedProgress).toBe(0.5);
    await vi.advanceTimersByTimeAsync(41);
    await expect(result).resolves.toMatchObject({ status: 'completed', direction: -1 });
    expect(renderedProgress).toBe(0);
  });

  it('clears a pending staged dwell when the run is aborted', async () => {
    vi.useFakeTimers();
    let renderedProgress = 0;
    const player = new SegmentPlayer({
      manifest: withHeroPatternStaged(
        [0.5],
        [40, 60],
        undefined,
        [{ kind: 'delay', ms: 1000 }]
      ),
      transitions: {
        'hero-pattern': transitionWithTimeline({
          play: () => Promise.resolve(),
          progress: (value) => { renderedProgress = value; },
          reverse: () => Promise.resolve(),
          jumpToEnd: vi.fn(),
          dispose: vi.fn()
        })
      },
      actorEpoch: 'delay-abort'
    });

    const result = player.play('hero-pattern', 1, { runId: 'delay-abort:1' });
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(40);
    player.abort('seek');
    await vi.advanceTimersByTimeAsync(2000);

    await expect(result).resolves.toMatchObject({ status: 'aborted', reason: 'seek' });
    expect(renderedProgress).toBe(0.5);
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

  it('fails a staged leg that never resolves at the manifest media timeout', async () => {
    vi.useFakeTimers();
    const legReady = deferred<void>();
    let preparationSignal: AbortSignal | undefined;
    let settledResult: Awaited<ReturnType<SegmentPlayer['play']>> | undefined;
    const commitLeg = vi.fn();
    const timeline = {
      play: () => Promise.resolve(),
      progress: vi.fn(),
      reverse: () => Promise.resolve(),
      jumpToEnd: vi.fn(),
      dispose: vi.fn(),
      prepareLeg: vi.fn((leg: { signal?: AbortSignal }) => {
        preparationSignal = leg.signal;
        return legReady.promise;
      }),
      commitLeg
    } as unknown as SegmentTimelineHandle;
    const player = new SegmentPlayer({
      manifest: withHeroPatternStaged([], [40], 25),
      transitions: { 'hero-pattern': transitionWithTimeline(timeline) },
      actorEpoch: 'leg-timeout'
    });
    const result = player.play('hero-pattern', 1, { runId: 'leg-timeout:1' });
    void result.then((value) => {
      settledResult = value;
    });

    try {
      for (let turn = 0; turn < 8; turn += 1) {
        await flushMicrotasks();
      }
      await vi.advanceTimersByTimeAsync(25);
      await flushMicrotasks();

      expect(settledResult).toMatchObject({
        status: 'failed',
        error: expect.objectContaining({ code: 'MEDIA_PREPARATION_TIMEOUT' })
      });
      expect(preparationSignal?.aborted).toBe(true);
      expect(commitLeg).not.toHaveBeenCalled();
    } finally {
      player.disposeAll();
      legReady.resolve();
      await result;
    }
  });

  it('aborts staged preparation before disposing its timeline', async () => {
    const legReady = deferred<void>();
    let preparationSignal: AbortSignal | undefined;
    let abortedAtDispose = false;
    const commitLeg = vi.fn();
    const progress = vi.fn();
    const timeline = {
      play: () => Promise.resolve(),
      progress,
      reverse: () => Promise.resolve(),
      jumpToEnd: vi.fn(),
      dispose: vi.fn(() => {
        abortedAtDispose = preparationSignal?.aborted ?? false;
      }),
      prepareLeg: vi.fn((leg: { signal?: AbortSignal }) => {
        preparationSignal = leg.signal;
        return legReady.promise;
      }),
      commitLeg
    } as unknown as SegmentTimelineHandle;
    const player = new SegmentPlayer({
      manifest: withHeroPatternStaged([], [40], 1_000),
      transitions: { 'hero-pattern': transitionWithTimeline(timeline) },
      actorEpoch: 'leg-abort'
    });
    const result = player.play('hero-pattern', 1, { runId: 'leg-abort:1' });
    await vi.waitFor(() => {
      expect(preparationSignal).toBeDefined();
    });
    progress.mockClear();

    player.abort('seek');
    legReady.resolve();
    await flushMicrotasks();

    await expect(result).resolves.toMatchObject({ status: 'aborted', reason: 'seek' });
    expect(preparationSignal?.aborted).toBe(true);
    expect(abortedAtDispose).toBe(true);
    expect(commitLeg).not.toHaveBeenCalled();
    expect(progress).not.toHaveBeenCalled();
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
