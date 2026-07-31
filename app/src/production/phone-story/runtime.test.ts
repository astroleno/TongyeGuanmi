import { describe, expect, it } from 'vitest';

import {
  createPhoneStoryRuntime,
  type PhoneRuntimeHostEvent,
  type PhoneRuntimeTimerHandle,
  type PhoneStoryRuntime,
  type PhoneStoryRuntimeEnvironment
} from './runtime';
import type {
  PhoneEvidenceSlot,
  PhoneStoryEffect,
  PhoneStoryEvent,
  PhoneStorySnapshot,
  PhoneViewportSnapshot
} from './protocol';

const initialViewport = (): PhoneViewportSnapshot => ({
  layout: { width: 390, height: 844, orientation: 'portrait' },
  visual: { offsetLeft: 0, offsetTop: 0, width: 390, height: 844, scale: 1 },
  layoutRevision: 1,
  visualRevision: 1,
  supported: true
});

type EnvironmentFixture = Readonly<{
  port: PhoneStoryRuntimeEnvironment;
  effects: PhoneStoryEffect[];
  publications: PhoneStorySnapshot[];
  urlWrites: Array<Readonly<{ mode: 'push' | 'replace'; pathname: string; hash: string }>>;
  emit(event: PhoneRuntimeHostEvent): void;
  flushFrames(): void;
  fireTimers(): void;
  advance(ms: number): void;
  send(event: PhoneStoryEvent): void;
  counts(): Readonly<{ listeners: number; timers: number; frames: number }>;
  retiredListeners(): readonly ((event: PhoneRuntimeHostEvent) => void)[];
}>;

function createEnvironment(): EnvironmentFixture {
  const listeners = new Set<(event: PhoneRuntimeHostEvent) => void>();
  const retired: Array<(event: PhoneRuntimeHostEvent) => void> = [];
  const timers = new Map<PhoneRuntimeTimerHandle, () => void>();
  const frames = new Map<PhoneRuntimeTimerHandle, () => void>();
  const effects: PhoneStoryEffect[] = [];
  const publications: PhoneStorySnapshot[] = [];
  const urlWrites: Array<Readonly<{
    mode: 'push' | 'replace'; pathname: string; hash: string
  }>> = [];
  let activeMs = 0;
  let authority = 0;
  let handle = 0;
  let send: ((event: PhoneStoryEvent) => void) | null = null;
  const port: PhoneStoryRuntimeEnvironment = {
    nextAuthorityId: () => `runtime-authority:${++authority}`,
    readViewport: initialViewport,
    activeNow: () => activeMs,
    subscribeHost: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        retired.push(listener);
      };
    },
    scheduleTimer: (callback) => {
      const id = `timer:${++handle}`;
      timers.set(id, callback);
      return id;
    },
    cancelTimer: (id) => timers.delete(id),
    requestFrame: (callback) => {
      const id = `frame:${++handle}`;
      frames.set(id, callback);
      return id;
    },
    cancelFrame: (id) => frames.delete(id),
    writeUrl: (mode, pathname, hash) => urlWrites.push({ mode, pathname, hash }),
    observePublish: (snapshot) => publications.push(snapshot),
    performEffect: (effect, enqueue) => {
      effects.push(effect);
      send = enqueue;
    }
  };
  return {
    port,
    effects,
    publications,
    urlWrites,
    emit: (event) => [...listeners].forEach((listener) => listener(event)),
    flushFrames: () => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback());
    },
    fireTimers: () => {
      const pending = [...timers.values()];
      timers.clear();
      pending.forEach((callback) => callback());
    },
    advance: (ms) => { activeMs += ms; },
    send: (event) => {
      if (!send) throw new Error('runtime effect dispatcher is not available');
      send(event);
    },
    counts: () => ({
      listeners: listeners.size, timers: timers.size, frames: frames.size
    }),
    retiredListeners: () => retired
  };
}

function createRuntime(
  fixture: EnvironmentFixture,
  hash = '#home'
): PhoneStoryRuntime {
  return createPhoneStoryRuntime({
    initialEntry: { pathname: '/', hash, origin: 'initial' },
    environment: fixture.port
  });
}

function currentTransaction(runtime: PhoneStoryRuntime) {
  const snapshot = runtime.getSnapshot();
  expect(snapshot.status).toBe('transaction');
  if (snapshot.status !== 'transaction') throw new Error('expected active transaction');
  return snapshot.transaction;
}

function reportSlot(fixture: EnvironmentFixture, slot: PhoneEvidenceSlot): void {
  fixture.send({
    type: 'evidence-reported',
    slot,
    report: {
      kind: slot.kind,
      token: `${slot.attempt.transactionId}:${slot.leg}:${slot.kind}:${slot.stageIndex}`,
      accepted: true
    }
  });
}

function proveCurrent(runtime: PhoneStoryRuntime, fixture: EnvironmentFixture): void {
  for (;;) {
    const snapshot = runtime.getSnapshot();
    if (snapshot.status !== 'transaction') return;
    const transaction = snapshot.transaction;
    if (transaction.phase === 'playing') {
      fixture.send({ type: 'transition-completed', attempt: transaction.attempt });
      continue;
    }
    if (transaction.phase === 'dwelling') {
      fixture.send({ type: 'dwell-completed', attempt: transaction.attempt });
      continue;
    }
    if (transaction.phase === 'awaiting-leg-intent') {
      fixture.send({
        type: 'leg-intent',
        attempt: transaction.attempt,
        physicalEpoch: (transaction.claimedPhysicalEpoch ?? 0) + 1
      });
      continue;
    }
    const slots = transaction.requiredFinal.length > 0
      ? transaction.requiredFinal
      : transaction.requiredPrepared;
    const missing = slots.find((slot) => !transaction.evidence.some((record) => (
      record.slot.kind === slot.kind
        && record.slot.leg === slot.leg
        && record.slot.stageIndex === slot.stageIndex
        && record.slot.planeRevision === slot.planeRevision
    )));
    if (!missing) throw new Error(`no missing proof in ${transaction.phase}`);
    reportSlot(fixture, missing);
  }
}

describe('phone runtime input, history, viewport, and queue', () => {
  it('is inert until connect and gives every connection one non-overlapping authority', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture);
    expect(fixture.counts()).toEqual({ listeners: 0, timers: 0, frames: 0 });
    const disconnectA = runtime.connect();
    const authorityA = runtime.getSnapshot().authorityId;
    expect(fixture.counts().listeners).toBe(1);
    disconnectA();
    expect(fixture.counts()).toEqual({ listeners: 0, timers: 0, frames: 0 });

    const disconnectB = runtime.connect();
    const authorityB = runtime.getSnapshot().authorityId;
    expect(authorityB).not.toBe(authorityA);
    const snapshotB = runtime.getSnapshot();
    fixture.retiredListeners()[0]?.({
      type: 'input', kind: 'wheel', delta: 100, fresh: true, target: 'story'
    });
    expect(runtime.getSnapshot()).toBe(snapshotB);
    disconnectB();
  });

  it('claims wheel/touch/pointer/keyboard once and excludes native corridors and momentum', () => {
    for (const event of [
      { type: 'input', kind: 'wheel', delta: 100, fresh: true, target: 'story' },
      { type: 'input', kind: 'touch', delta: 100, fresh: true, target: 'story' },
      { type: 'input', kind: 'pointer', delta: 100, fresh: true, target: 'story' },
      { type: 'input', kind: 'keyboard', key: 'ArrowDown', fresh: true, target: 'story' }
    ] as const satisfies readonly PhoneRuntimeHostEvent[]) {
      const fixture = createEnvironment();
      const runtime = createRuntime(fixture);
      const disconnect = runtime.connect();
      proveCurrent(runtime, fixture);
      fixture.emit(event);
      expect(currentTransaction(runtime).mode).toBe('segment');
      const generation = currentTransaction(runtime).attempt.transactionGeneration;
      fixture.emit({ ...event, fresh: false } as PhoneRuntimeHostEvent);
      expect(currentTransaction(runtime).attempt.transactionGeneration).toBe(generation);
      disconnect();
    }

    const fixture = createEnvironment();
    const runtime = createRuntime(fixture);
    const disconnect = runtime.connect();
    proveCurrent(runtime, fixture);
    const stable = runtime.getSnapshot();
    fixture.emit({
      type: 'input', kind: 'wheel', delta: 100, fresh: true, target: 'native-corridor'
    });
    fixture.emit({
      type: 'input', kind: 'pointer', delta: 100, fresh: true, target: 'contact-control'
    });
    fixture.emit({
      type: 'scroll', sample: { x: 0, y: 120, sampledAt: 10, origin: 'runtime' }
    });
    fixture.flushFrames();
    expect(runtime.getSnapshot().status).toBe('stable');
    expect(runtime.getSnapshot().stableCommit).toBe(stable.stableCommit);
    disconnect();
  });

  it('publishes before effects, never re-enters reduction, and preserves queued FIFO entries', () => {
    const fixture = createEnvironment();
    const ordering: string[] = [];
    const environment: PhoneStoryRuntimeEnvironment = {
      ...fixture.port,
      observePublish: (snapshot) => {
        ordering.push(`publish:${snapshot.stateRevision}`);
        fixture.port.observePublish?.(snapshot);
      },
      performEffect: (effect, enqueue) => {
        ordering.push(`effect:${effect.type}`);
        fixture.port.performEffect?.(effect, enqueue);
      }
    };
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#brand', origin: 'initial' },
      environment
    });
    let queued = false;
    runtime.subscribe(() => {
      if (!queued && runtime.getSnapshot().status === 'transaction') {
        queued = true;
        runtime.requestEntry({ pathname: '/', hash: '#services', origin: 'menu' });
        runtime.requestEntry({ pathname: '/', hash: '#contact', origin: 'menu' });
      }
    });
    const disconnect = runtime.connect();
    expect(ordering[0]).toMatch(/^publish:/);
    expect(ordering[1]).toBe('effect:load-dependencies');
    const candidates = fixture.publications
      .filter((snapshot) => snapshot.status === 'transaction')
      .map((snapshot) => snapshot.status === 'transaction'
        ? snapshot.transaction.candidateSceneId : null);
    expect(candidates).toEqual(expect.arrayContaining(['services', 'contact']));
    expect(candidates.indexOf('services')).toBeLessThan(candidates.indexOf('contact'));
    expect(currentTransaction(runtime).candidateSceneId).toBe('contact');
    disconnect();
  });

  it('writes menu URLs only after commit and restores popstate only after rollback proof', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#brand');
    const disconnect = runtime.connect();
    proveCurrent(runtime, fixture);
    runtime.requestEntry({ pathname: '/', hash: '#services', origin: 'menu' });
    expect(fixture.urlWrites).toEqual([]);
    proveCurrent(runtime, fixture);
    expect(fixture.urlWrites.at(-1)).toEqual({
      mode: 'push', pathname: '/', hash: '#services'
    });

    fixture.emit({
      type: 'entry', request: { pathname: '/', hash: '#lab', origin: 'popstate' }
    });
    const active = currentTransaction(runtime);
    fixture.send({
      type: 'failure-reported',
      slot: active.requiredPrepared[0]!,
      failure: { code: 'load', message: 'load', recoverable: true }
    });
    expect(fixture.urlWrites.at(-1)?.hash).toBe('#services');
    proveCurrent(runtime, fixture);
    expect(fixture.urlWrites.at(-1)).toEqual({
      mode: 'replace', pathname: '/', hash: '#services'
    });
    disconnect();
  });

  it('coalesces toolbar samples and reprojects without changing semantic commit', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#education');
    const disconnect = runtime.connect();
    proveCurrent(runtime, fixture);
    const stable = runtime.getSnapshot();
    if (stable.status !== 'stable') throw new Error('expected stable');
    const commit = stable.stableCommit;
    const proof = stable.presentationProof;
    const first = initialViewport();
    const latest: PhoneViewportSnapshot = {
      ...first,
      visual: { ...first.visual, offsetTop: 37, height: 807 },
      visualRevision: 3
    };
    fixture.emit({ type: 'viewport', viewport: { ...first, visualRevision: 2 }, change: 'toolbar' });
    fixture.emit({ type: 'viewport', viewport: latest, change: 'toolbar' });
    expect(fixture.counts().frames).toBe(1);
    fixture.flushFrames();
    expect(currentTransaction(runtime).mode).toBe('recovery');
    expect(runtime.getSnapshot().viewport).toEqual(latest);
    proveCurrent(runtime, fixture);
    const recovered = runtime.getSnapshot();
    expect(recovered.status).toBe('stable');
    if (recovered.status !== 'stable') throw new Error('expected stable');
    expect(recovered.stableCommit).toBe(commit);
    expect(recovered.stableCommit.commitSequence).toBe(commit.commitSequence);
    expect(recovered.presentationProof).not.toBe(proof);
    expect(recovered.presentationProof.planeRevision).toBeGreaterThan(proof.planeRevision);
    disconnect();
  });

  it('preempts candidates for layout invalidation and blocks unsupported geometry', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#brand');
    const disconnect = runtime.connect();
    proveCurrent(runtime, fixture);
    const commit = runtime.getSnapshot().stableCommit;
    fixture.emit({
      type: 'input', kind: 'wheel', delta: 100, fresh: true, target: 'story'
    });
    const retiredAttempt = currentTransaction(runtime).attempt;
    const landscape: PhoneViewportSnapshot = {
      ...initialViewport(),
      layout: { width: 844, height: 390, orientation: 'landscape' },
      layoutRevision: 2,
      supported: false
    };
    fixture.emit({ type: 'viewport', viewport: landscape, change: 'unsupported' });
    fixture.flushFrames();
    expect(runtime.getSnapshot().viewport.supported).toBe(false);
    expect(runtime.getSnapshot().input.enabled).toBe(false);
    fixture.send({ type: 'transition-completed', attempt: retiredAttempt });
    expect(runtime.getSnapshot().input.enabled).toBe(false);

    const portrait = { ...initialViewport(), layoutRevision: 3 };
    fixture.emit({ type: 'viewport', viewport: portrait, change: 'layout' });
    fixture.flushFrames();
    expect(currentTransaction(runtime).mode).toBe('recovery');
    proveCurrent(runtime, fixture);
    expect(runtime.getSnapshot().stableCommit).toBe(commit);
    disconnect();
  });
});

describe('phone runtime pagehide/pageshow/BFCache lifecycle', () => {
  it('invalidates an active hidden attempt and restarts its foreground deadline', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#brand');
    const disconnect = runtime.connect();
    proveCurrent(runtime, fixture);
    runtime.requestEntry({ pathname: '/', hash: '#contact', origin: 'menu' });
    const before = currentTransaction(runtime).attempt.transactionGeneration;
    expect(fixture.counts().timers).toBe(1);
    fixture.emit({ type: 'visibility', hidden: true });
    expect(runtime.getSnapshot().visibility).toBe('hidden');
    expect(fixture.counts().timers).toBe(0);
    fixture.advance(30_000);
    fixture.fireTimers();
    expect(runtime.getSnapshot().status).toBe('transaction');
    fixture.emit({ type: 'visibility', hidden: false });
    expect(currentTransaction(runtime).attempt.transactionGeneration).toBeGreaterThan(before);
    expect(fixture.counts().timers).toBe(1);
    disconnect();
  });

  it('pauses hidden deadlines and re-proves a stable BFCache restore with one listener', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#crane-animation');
    const disconnect = runtime.connect();
    proveCurrent(runtime, fixture);
    const stable = runtime.getSnapshot();
    if (stable.status !== 'stable') throw new Error('expected stable');
    const commit = stable.stableCommit;
    fixture.emit({ type: 'pagehide', persisted: true });
    expect(runtime.getSnapshot().visibility).toBe('persisted');
    expect(runtime.getSnapshot().input.enabled).toBe(false);
    expect(fixture.counts().listeners).toBe(1);
    expect(fixture.counts().timers).toBe(0);
    fixture.advance(60_000);
    fixture.fireTimers();
    expect(runtime.getSnapshot().stableCommit).toBe(commit);

    fixture.emit({ type: 'pageshow', persisted: true });
    expect(currentTransaction(runtime).mode).toBe('recovery');
    proveCurrent(runtime, fixture);
    expect(runtime.getSnapshot().stableCommit).toBe(commit);
    expect(fixture.counts().listeners).toBe(1);
    disconnect();
  });

  it('restarts an uncommitted boot after BFCache and fully disposes ordinary pagehide', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#ph-animation');
    const disconnect = runtime.connect();
    const boot = currentTransaction(runtime);
    fixture.emit({ type: 'pagehide', persisted: true });
    fixture.emit({ type: 'pageshow', persisted: true });
    const restarted = currentTransaction(runtime);
    expect(restarted.mode).toBe('boot');
    expect(restarted.candidateSceneId).toBe('ph-animation');
    expect(restarted.attempt.transactionGeneration)
      .toBeGreaterThan(boot.attempt.transactionGeneration);
    expect(runtime.getSnapshot().stableCommit).toBeNull();

    fixture.emit({ type: 'pagehide', persisted: false });
    expect(fixture.counts()).toEqual({ listeners: 0, timers: 0, frames: 0 });
    const disposedSnapshot = runtime.getSnapshot();
    fixture.retiredListeners().at(-1)?.({ type: 'pageshow', persisted: true });
    expect(runtime.getSnapshot()).toBe(disposedSnapshot);
    disconnect();
  });
});
