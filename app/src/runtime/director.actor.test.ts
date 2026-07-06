import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDirectorRuntime } from './director.actor';
import { storyManifest } from '../story/manifest';
import type { StoryManifest } from '../story/types';

async function flush(ms = 0): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await Promise.resolve();
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
    await flush(0);

    expect(runtime.getState().state).toBe('playing');
    expect(runtime.getState().context.activeRunId).toBe('loop:1');

    await flush(20);
    expect(runtime.getState().state).toBe('settling');
    await flush(420);

    const snapshot = runtime.getState();
    runtime.stop();
    expect(snapshot.state).toBe('hold');
    expect(snapshot.context.cursor).toEqual({ status: 'hold', scene: 'pattern' });
    expect(snapshot.eventLog.map((record) => record.event.type)).toEqual(
      expect.arrayContaining(['INPUT_DELTA', 'TARGET_READY', 'PLAYBACK_DONE'])
    );
    expect(snapshot.context).toMatchObject({
      activeRunId: undefined,
      prepareToken: undefined,
      cursor: { status: 'hold', scene: 'pattern' }
    });
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
});
