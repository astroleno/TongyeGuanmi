import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fromSyntheticVisibility, isVisuallyVisible } from './visibility-predicate';
import { BuildTimeoutError, SegmentPlayer } from './segment-player';
import type { DirectorEvent, SegmentTimelineHandle, TransitionModule } from './types';

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

  it('resolves playback failure without unhandled rejection', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    const player = new SegmentPlayer({
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

  it('starts reverse playback from progress 1', async () => {
    const progress = vi.fn();
    const reverse = vi.fn(() => Promise.resolve());
    const player = new SegmentPlayer({
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
});
