import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDirectorRuntime } from './director.actor';
import { storyManifest } from '../story/manifest';
import type { StoryManifest } from '../story/types';

async function flush(ms = 0): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await Promise.resolve();
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((innerResolve) => {
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

describe('director runtime actor loop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('wires input-router, SegmentPlayer and Director into an automatic snap loop', async () => {
    const runtime = createDirectorRuntime({ actorEpoch: 'loop', syntheticPlayMs: 20 });
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
    const runtime = createDirectorRuntime({ actorEpoch: 'retiring-loop', syntheticPlayMs: 20 });
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

    await flush(20);
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
});
