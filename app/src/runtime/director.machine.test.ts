import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import { storyManifest } from '../story/manifest';
import { createDirectorMachine, DIRECTOR_STATES, type DirectorContext } from './director.machine';
import type { StoryManifest } from '../story/types';

function startDirector(options: Parameters<typeof createDirectorMachine>[0] = {}) {
  const actor = createActor(createDirectorMachine({ actorEpoch: 'epoch', ...options }));
  actor.start();
  return actor;
}

function stateValue(actor: ReturnType<typeof startDirector>) {
  return actor.getSnapshot().value;
}

function context(actor: ReturnType<typeof startDirector>): DirectorContext {
  return actor.getSnapshot().context;
}

async function flushTimers(ms = 0): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms === 0 ? 1 : ms);
  await Promise.resolve();
}

function bootToHold(actor: ReturnType<typeof startDirector>) {
  actor.send({ type: 'BOOT_READY' });
  expect(stateValue(actor)).toBe('hold');
}

function sendTargetReady(actor: ReturnType<typeof startDirector>) {
  const current = context(actor);
  if (!current.prepareToken || !current.pendingSegment || !current.pendingDirection) {
    throw new Error('test helper expected preparing context');
  }
  const segment = storyManifest.nodes.find((node) => node.kind === 'segment' && node.id === current.pendingSegment);
  if (segment?.kind !== 'segment') {
    throw new Error('test helper missing segment');
  }
  actor.send({
    type: 'TARGET_READY',
    scene: current.pendingDirection === 1 ? segment.to : segment.from,
    prepareToken: current.prepareToken
  });
}

function enterPlaying(actor: ReturnType<typeof startDirector>, direction: 1 | -1 = 1) {
  actor.send({ type: 'CHARGE_FIRED', direction });
  expect(stateValue(actor)).toBe('preparing');
  sendTargetReady(actor);
  expect(stateValue(actor)).toBe('playing');
}

function withFirstSegmentScrub(): StoryManifest {
  const scrubManifestSource = structuredClone(storyManifest);
  const nodes = [...scrubManifestSource.nodes];
  const firstSegment = nodes[1];
  if (firstSegment?.kind !== 'segment') {
    throw new Error('missing first segment');
  }
  return {
    ...scrubManifestSource,
    nodes: [
      nodes[0]!,
      { ...firstSegment, policy: { kind: 'scrub', snapAfterIdleMs: 160 } },
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

describe('Director machine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exposes the required 9-state contract', async () => {
    const seen = new Set<unknown>();
    const actor = startDirector();
    seen.add(stateValue(actor));

    bootToHold(actor);
    seen.add(stateValue(actor));

    actor.send({ type: 'CHARGE_FIRED', direction: 1 });
    seen.add(stateValue(actor));

    sendTargetReady(actor);
    seen.add(stateValue(actor));

    const runId = context(actor).activeRunId;
    if (!runId) {
      throw new Error('missing runId');
    }
    actor.send({ type: 'STAGE_PAUSED', runId, segment: 'hero-pattern', stageIndex: 0 });
    seen.add(stateValue(actor));

    actor.send({ type: 'STAGE_RESUMED', runId, segment: 'hero-pattern', stageIndex: 0 });
    actor.send({ type: 'PLAYBACK_DONE', runId });
    seen.add(stateValue(actor));

    actor.send({ type: 'SEEK', label: 'scene:brand', source: 'menu' });
    seen.add(stateValue(actor));
    await flushTimers(0);

    const recoveringActor = startDirector();
    recoveringActor.send({ type: 'BOOT_FAILED', error: new Error('offline') });
    seen.add(stateValue(recoveringActor));

    const scrubActor = startDirector({ manifest: withFirstSegmentScrub() });
    bootToHold(scrubActor);
    scrubActor.send({ type: 'CHARGE_FIRED', direction: 1 });
    seen.add(stateValue(scrubActor));

    expect([...seen].sort()).toEqual([...DIRECTOR_STATES].sort());
  });

  it('keeps StorySpine cursor invariants through hold, segment, staged-paused and settling', () => {
    const actor = startDirector();
    bootToHold(actor);
    enterPlaying(actor);

    expect(context(actor).cursor).toEqual({
      status: 'segment',
      segment: 'hero-pattern',
      from: 'hero',
      to: 'pattern'
    });
    const runId = context(actor).activeRunId;
    if (!runId) {
      throw new Error('missing runId');
    }
    actor.send({ type: 'STAGE_PAUSED', runId, segment: 'hero-pattern', stageIndex: 0 });
    expect(stateValue(actor)).toBe('staged-paused');
    expect(context(actor).cursor.status).toBe('segment');
    expect(context(actor).pausePoint).toEqual({ segmentId: 'hero-pattern', stageIndex: 0 });

    actor.send({ type: 'STAGE_RESUMED', runId, segment: 'hero-pattern', stageIndex: 0 });
    actor.send({ type: 'PLAYBACK_DONE', runId });
    expect(context(actor).cursor).toEqual({
      status: 'settling',
      segment: 'hero-pattern',
      from: 'hero',
      to: 'pattern',
      target: 'pattern'
    });
  });

  it('settles after 420ms and advances LayerWindow before hold', async () => {
    const actor = startDirector();
    bootToHold(actor);
    enterPlaying(actor);
    const runId = context(actor).activeRunId;
    if (!runId) {
      throw new Error('missing runId');
    }

    actor.send({ type: 'PLAYBACK_DONE', runId });
    expect(stateValue(actor)).toBe('settling');
    await flushTimers(419);
    expect(stateValue(actor)).toBe('settling');
    await flushTimers(1);

    expect(stateValue(actor)).toBe('hold');
    expect(context(actor).cursor).toEqual({ status: 'hold', scene: 'pattern' });
    expect(context(actor).layerWindow).toMatchObject({ prev: 'hero', current: 'pattern', next: 'star-map' });
  });

  it('marks retiring on the real second settling path and releases it through the director event', async () => {
    const actor = startDirector({ manifest: withSegmentsSnap('pattern-star-map') });
    bootToHold(actor);
    enterPlaying(actor);
    let runId = context(actor).activeRunId;
    if (!runId) {
      throw new Error('missing first runId');
    }
    actor.send({ type: 'PLAYBACK_DONE', runId });
    actor.send({ type: 'SETTLING_DONE', now: 0 });
    expect(context(actor).cursor).toEqual({ status: 'hold', scene: 'pattern' });

    enterPlaying(actor);
    runId = context(actor).activeRunId;
    if (!runId) {
      throw new Error('missing second runId');
    }
    actor.send({ type: 'PLAYBACK_DONE', runId });
    actor.send({ type: 'SETTLING_DONE', now: 1 });

    expect(context(actor).cursor).toEqual({ status: 'hold', scene: 'star-map' });
    expect(context(actor).layerWindow.retiring).toEqual(['hero']);

    actor.send({ type: 'RETIRING_RELEASED' });
    expect(context(actor).layerWindow.retiring).toEqual([]);
  });

  it('releases retiring before a hold with retiring can enter another preparing run', () => {
    const actor = startDirector({ manifest: withSegmentsSnap('pattern-star-map') });
    bootToHold(actor);
    enterPlaying(actor);
    let runId = context(actor).activeRunId;
    if (!runId) {
      throw new Error('missing first runId');
    }
    actor.send({ type: 'PLAYBACK_DONE', runId });
    actor.send({ type: 'SETTLING_DONE', now: 0 });

    enterPlaying(actor);
    runId = context(actor).activeRunId;
    if (!runId) {
      throw new Error('missing second runId');
    }
    actor.send({ type: 'PLAYBACK_DONE', runId });
    actor.send({ type: 'SETTLING_DONE', now: 1 });
    expect(context(actor).layerWindow.retiring).toEqual(['hero']);

    actor.send({ type: 'CHARGE_FIRED', direction: 1 });

    expect(stateValue(actor)).toBe('preparing');
    expect(context(actor).layerWindow.retiring).toEqual([]);
    expect(context(actor).pendingSegment).toBe('star-map-aod');
  });

  it('recovers from preparing timeout, build timeout and playback failure without locking input', async () => {
    const actor = startDirector({ prepareTimeoutMs: 20 });
    bootToHold(actor);
    actor.send({ type: 'CHARGE_FIRED', direction: 1 });
    expect(stateValue(actor)).toBe('preparing');
    await flushTimers(20);
    expect(stateValue(actor)).toBe('recovering');
    await flushTimers(0);
    expect(stateValue(actor)).toBe('hold');

    actor.send({ type: 'CHARGE_FIRED', direction: 1 });
    const token = context(actor).prepareToken;
    if (!token) {
      throw new Error('missing prepare token');
    }
    actor.send({ type: 'BUILD_TIMEOUT', segment: 'hero-pattern', prepareToken: token });
    expect(stateValue(actor)).toBe('recovering');
    await flushTimers(0);
    expect(stateValue(actor)).toBe('hold');

    enterPlaying(actor);
    const runId = context(actor).activeRunId;
    if (!runId) {
      throw new Error('missing runId');
    }
    actor.send({ type: 'PLAYBACK_FAILED', runId, error: new Error('jumpToEnd failed') });
    expect(stateValue(actor)).toBe('recovering');
    await flushTimers(0);
    expect(stateValue(actor)).toBe('hold');
    expect(context(actor).cursor).toEqual({ status: 'hold', scene: 'hero' });
  });

  it('enters playing when slow targetReady arrives before the preparing timeout', async () => {
    const actor = startDirector({ prepareTimeoutMs: 100 });
    bootToHold(actor);
    actor.send({ type: 'CHARGE_FIRED', direction: 1 });

    await flushTimers(60);
    expect(stateValue(actor)).toBe('preparing');
    sendTargetReady(actor);

    expect(stateValue(actor)).toBe('playing');
    expect(context(actor).activeSegment).toBe('hero-pattern');
  });

  it('buffers queued intent during playing and flushes only when ttl and decay keep it above threshold', async () => {
    const actor = startDirector();
    bootToHold(actor);
    enterPlaying(actor);
    const runId = context(actor).activeRunId;
    if (!runId) {
      throw new Error('missing runId');
    }

    actor.send({ type: 'INPUT_DELTA', delta: 0.12, source: 'wheel', now: 0 });
    expect(context(actor).queuedIntent).toMatchObject({
      direction: 1,
      strength: 0.12,
      deadline: 420,
      decayRatePerMs: 0.001
    });
    actor.send({ type: 'PLAYBACK_DONE', runId });
    actor.send({ type: 'SETTLING_DONE', now: 10 });

    expect(stateValue(actor)).toBe('preparing');
    expect(context(actor).pendingSegment).toBe('pattern-star-map');
  });

  it('clears expired queued intent after settling', () => {
    const actor = startDirector();
    bootToHold(actor);
    enterPlaying(actor);
    const runId = context(actor).activeRunId;
    if (!runId) {
      throw new Error('missing runId');
    }

    actor.send({ type: 'INPUT_DELTA', delta: 0.12, source: 'wheel', now: 0 });
    actor.send({ type: 'PLAYBACK_DONE', runId });
    actor.send({ type: 'SETTLING_DONE', now: 421 });

    expect(stateValue(actor)).toBe('hold');
    expect(context(actor).queuedIntent).toBeUndefined();
    expect(context(actor).cursor).toEqual({ status: 'hold', scene: 'pattern' });
  });

  it('carries top and bottom reading entry intent through sequential settlement', async () => {
    const actor = startDirector();
    bootToHold(actor);
    actor.send({ type: 'SEEK', label: 'scene:method-top', source: 'menu' });
    await flushTimers(0);
    expect(context(actor).holdEntry).toMatchObject({
      scene: 'method-top',
      edge: 'top',
      source: 'menu'
    });

    enterPlaying(actor, 1);
    const forwardRun = context(actor).activeRunId;
    if (!forwardRun) throw new Error('missing forward run');
    actor.send({ type: 'PLAYBACK_DONE', runId: forwardRun });
    actor.send({ type: 'SETTLING_DONE', now: 1 });
    expect(context(actor).cursor).toEqual({ status: 'hold', scene: 'figure2-animation' });

    enterPlaying(actor, -1);
    const reverseRun = context(actor).activeRunId;
    if (!reverseRun) throw new Error('missing reverse run');
    actor.send({ type: 'PLAYBACK_DONE', runId: reverseRun });
    actor.send({ type: 'SETTLING_DONE', now: 2 });

    expect(context(actor).holdEntry).toMatchObject({
      scene: 'method-top',
      edge: 'bottom',
      source: 'sequential'
    });
  });

  it('does not flush momentum from the prior segment through a reading hold', async () => {
    const actor = startDirector();
    bootToHold(actor);
    actor.send({ type: 'SEEK', label: 'scene:aod-animation', source: 'menu' });
    await flushTimers(0);
    enterPlaying(actor, 1);
    const runId = context(actor).activeRunId;
    if (!runId) throw new Error('missing run');

    actor.send({ type: 'INPUT_DELTA', delta: 0.12, source: 'wheel', now: 0 });
    actor.send({ type: 'PLAYBACK_DONE', runId });
    actor.send({ type: 'SETTLING_DONE', now: 10 });

    expect(stateValue(actor)).toBe('hold');
    expect(context(actor)).toMatchObject({
      cursor: { status: 'hold', scene: 'method-top' },
      queuedIntent: undefined,
      holdEntry: { scene: 'method-top', edge: 'top', source: 'sequential' }
    });
  });

  it('supersedes preparing direction and ignores stale prepare tokens', async () => {
    const actor = startDirector({ manifest: withSegmentsSnap('pattern-star-map') });
    bootToHold(actor);
    actor.send({ type: 'SEEK', label: 'scene:pattern', source: 'menu' });
    await flushTimers(0);

    actor.send({ type: 'CHARGE_FIRED', direction: 1 });
    const oldToken = context(actor).prepareToken;
    expect(context(actor).pendingSegment).toBe('pattern-star-map');
    actor.send({ type: 'INPUT_DELTA', delta: -0.11, source: 'wheel', now: 0 });
    const newToken = context(actor).prepareToken;

    expect(newToken).not.toBe(oldToken);
    expect(context(actor).pendingSegment).toBe('hero-pattern');
    if (!oldToken || !newToken) {
      throw new Error('missing prepare token');
    }
    actor.send({ type: 'TARGET_READY', scene: 'star-map', prepareToken: oldToken });
    expect(stateValue(actor)).toBe('preparing');
    actor.send({ type: 'TARGET_READY', scene: 'hero', prepareToken: newToken });
    expect(stateValue(actor)).toBe('playing');
  });

  it('restarts preparing timeout after supersede instead of letting the stale timer recover', async () => {
    const actor = startDirector({ prepareTimeoutMs: 100, manifest: withSegmentsSnap('pattern-star-map') });
    bootToHold(actor);
    actor.send({ type: 'SEEK', label: 'scene:pattern', source: 'menu' });
    await flushTimers(0);

    actor.send({ type: 'CHARGE_FIRED', direction: 1 });
    await flushTimers(80);
    actor.send({ type: 'INPUT_DELTA', delta: -0.11, source: 'wheel', now: 80 });
    const newToken = context(actor).prepareToken;

    expect(stateValue(actor)).toBe('preparing');
    await flushTimers(30);
    expect(stateValue(actor)).toBe('preparing');
    await flushTimers(70);
    expect(stateValue(actor)).toBe('recovering');
    expect(context(actor).prepareToken).toBeUndefined();
    expect(newToken).toBeDefined();
  });

  it('lets scrubbing complete through active runId without leaving a segment cursor in hold', () => {
    const actor = startDirector({ manifest: withFirstSegmentScrub() });
    bootToHold(actor);
    actor.send({ type: 'CHARGE_FIRED', direction: 1 });

    expect(stateValue(actor)).toBe('scrubbing');
    expect(context(actor).cursor.status).toBe('segment');
    const runId = context(actor).activeRunId;
    if (!runId) {
      throw new Error('missing scrub runId');
    }
    actor.send({ type: 'PLAYBACK_DONE', runId });
    expect(stateValue(actor)).toBe('settling');
    actor.send({ type: 'SETTLING_DONE', now: 0 });
    expect(stateValue(actor)).toBe('hold');
    expect(context(actor).cursor).toEqual({ status: 'hold', scene: 'pattern' });
  });

  it('guards stale runId completion, failure and stage events', () => {
    const actor = startDirector();
    bootToHold(actor);
    enterPlaying(actor);

    actor.send({ type: 'PLAYBACK_DONE', runId: 'epoch:999' });
    expect(stateValue(actor)).toBe('playing');
    actor.send({ type: 'STAGE_PAUSED', runId: 'epoch:999', segment: 'hero-pattern', stageIndex: 0 });
    expect(stateValue(actor)).toBe('playing');
    actor.send({ type: 'PLAYBACK_FAILED', runId: 'epoch:999', error: new Error('stale') });
    expect(stateValue(actor)).toBe('playing');
  });

  it('seeking aborts the active run and stale completion is ignored', async () => {
    const actor = startDirector();
    bootToHold(actor);
    enterPlaying(actor);
    const staleRun = context(actor).activeRunId;
    if (!staleRun) {
      throw new Error('missing runId');
    }

    actor.send({ type: 'SEEK', label: 'scene:brand', source: 'menu' });
    expect(stateValue(actor)).toBe('seeking');
    expect(context(actor).activeRunId).not.toBe(staleRun);
    await flushTimers(0);
    expect(context(actor).cursor).toEqual({ status: 'hold', scene: 'brand' });
    actor.send({ type: 'PLAYBACK_DONE', runId: staleRun });
    expect(stateValue(actor)).toBe('hold');
  });

  it('BOOT_FAILED falls back to the hero static hold', async () => {
    const actor = startDirector();
    actor.send({ type: 'BOOT_FAILED', error: new Error('boot') });

    expect(stateValue(actor)).toBe('recovering');
    expect(context(actor).cursor).toEqual({ status: 'hold', scene: 'hero' });
    expect(context(actor).layerWindow.current).toBe('hero');
    await flushTimers(0);
    expect(stateValue(actor)).toBe('hold');
  });

  it('keeps Contact committed while a failed reverse crane-contact run recovers locally', async () => {
    const actor = startDirector();
    bootToHold(actor);
    actor.send({ type: 'SEEK', label: 'scene:contact', source: 'menu' });
    await flushTimers(0);
    enterPlaying(actor, -1);
    const runId = context(actor).activeRunId;
    if (!runId) {
      throw new Error('missing Contact reverse runId');
    }

    actor.send({ type: 'PLAYBACK_FAILED', runId, error: new Error('crane media timeout') });

    expect(stateValue(actor)).toBe('recovering');
    expect(context(actor)).toMatchObject({
      cursor: { status: 'hold', scene: 'contact' },
      layerWindow: { current: 'contact', prev: 'crane-animation' },
      recovery: {
        scope: 'segment',
        status: 'recovering',
        committedScene: 'contact',
        segment: 'crane-contact',
        direction: -1,
        endpoint: 'contact'
      }
    });
    expect(Object.values(context(actor).layerWindow)).not.toContain('hero');

    await flushTimers(0);
    expect(stateValue(actor)).toBe('hold');
    expect(context(actor).cursor).toEqual({ status: 'hold', scene: 'contact' });
  });

  it('handles quick repeat input by buffering during settling', () => {
    const actor = startDirector();
    bootToHold(actor);
    enterPlaying(actor);
    const runId = context(actor).activeRunId;
    if (!runId) {
      throw new Error('missing runId');
    }

    actor.send({ type: 'PLAYBACK_DONE', runId });
    actor.send({ type: 'INPUT_DELTA', delta: -0.15, source: 'wheel', now: 5 });
    actor.send({ type: 'SETTLING_DONE', now: 6 });

    expect(stateValue(actor)).toBe('preparing');
    expect(context(actor).pendingSegment).toBe('hero-pattern');
    expect(context(actor).pendingDirection).toBe(-1);
  });
});
