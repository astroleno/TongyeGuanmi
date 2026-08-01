import { describe, expect, it, vi } from 'vitest';

import {
  createPhoneStoryRuntime,
  type PhoneDependencyLoadResult,
  type PhoneRuntimeHostEvent,
  type PhoneRuntimeLifecycleStep,
  type PhoneRuntimeResourceCounts,
  type PhoneRuntimeTimerHandle,
  type PhoneStoryRuntime,
  type PhoneStoryRuntimeEnvironment
} from './runtime';
import { phoneManifest, phoneSceneById } from './manifest';
import type {
  PhoneLeafCommandHandle,
  PhoneLeafGenerationBinding,
  PhoneLeafReportPort,
  PhoneLeafReportBinding,
  PhonePlaneApplyResult,
  PhonePlaneRequest,
  PhonePresentation
} from './presentation';
import { describePhoneLeafMount } from './presentation';
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
  lifecycle: PhoneRuntimeLifecycleStep[];
  resources: PhoneRuntimeResourceCounts[];
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
  const lifecycle: PhoneRuntimeLifecycleStep[] = [];
  const resources: PhoneRuntimeResourceCounts[] = [];
  let activeMs = 0;
  let authority = 0;
  let handle = 0;
  let liveViewport = initialViewport();
  let send: ((event: PhoneStoryEvent) => void) | null = null;
  const port: PhoneStoryRuntimeEnvironment = {
    nextAuthorityId: () => `runtime-authority:${++authority}`,
    readViewport: () => liveViewport,
    activeNow: () => activeMs,
    readReducedMotion: () => false,
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
    },
    observeLifecycle: (step) => lifecycle.push(step),
    observeResources: (counts) => resources.push(counts)
  };
  return {
    port,
    effects,
    publications,
    urlWrites,
    lifecycle,
    resources,
    emit: (event) => {
      if (event.type === 'viewport') liveViewport = event.viewport;
      [...listeners].forEach((listener) => listener(event));
    },
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
    environment: fixture.port,
    presentation: createPresentationAuthority(fixture.port.readViewport)
  });
}

function createPresentationAuthority(
  readViewport: () => PhoneViewportSnapshot = initialViewport
): PhonePresentation {
  let registration = 0;
  return {
    attachRoot: () => () => undefined,
    registerLeafMount: (request) => {
      const descriptor = describePhoneLeafMount(request);
      return {
        ...descriptor,
        registrationKey: `test-presentation:${++registration}`,
        commands: request.registration.commands,
        rebind: () => undefined,
        release: () => undefined
      };
    },
    verifyPrepared: ({ binding, fact }) => {
      if (!fact || fact.report.kind === 'frame'
        || !binding.allowedReports.includes(fact.report.kind)
        || !['image-decoded', 'video-decoded', 'canvas-drawn', 'static-ready']
          .includes(fact.report.kind)) return { records: [] };
      return { records: [{
        slot: {
          attempt: binding.attempt,
          stageIndex: binding.stageIndex,
          leg: binding.leg,
          kind: fact.report.kind,
          surfaceId: fact.surfaceId,
          planeRevision: binding.planeRevision
        },
        token: fact.report.token
      }] };
    },
    sampleLayoutViewport: () => readViewport().layout,
    sampleVisualViewport: () => readViewport().visual,
    applyPlane: () => ({ records: [], failure: null }),
    verifyVisibleCandidate: () => ({ records: [], failure: null }),
    verifyReproject: () => ({ records: [], failure: null }),
    verifyRollback: () => ({ records: [], failure: null })
  };
}

function createStructuralPresentationAuthority(): PhonePresentation {
  const authority = createPresentationAuthority();
  return {
    ...authority,
    verifyPrepared: (request) => {
      if (request.fact) return authority.verifyPrepared(request);
      const { binding } = request;
      const records = [...new Set(binding.allowedReports)].flatMap((kind) => {
        if (!['root-connected', 'layout-measurable', 'resource-budget-valid'].includes(kind)) {
          return [];
        }
        return [{
          slot: {
            attempt: binding.attempt,
            stageIndex: binding.stageIndex,
            leg: binding.leg,
            kind,
            surfaceId: kind === 'resource-budget-valid'
              ? null : `root:${binding.attempt.sceneId}`,
            planeRevision: binding.planeRevision
          },
          token: `${binding.attempt.transactionId}:structural:${kind}`
        }];
      });
      return { records };
    }
  };
}

function createFrameProofPresentationAuthority(): PhonePresentation {
  const authority = createStructuralPresentationAuthority();
  return {
    ...authority,
    verifyPrepared: (request) => request.fact?.report.kind === 'frame'
      ? { records: [{
          slot: {
            attempt: request.binding.attempt,
            stageIndex: request.binding.stageIndex,
            leg: request.binding.leg,
            kind: 'canvas-drawn',
            surfaceId: request.fact.surfaceId,
            planeRevision: request.binding.planeRevision
          },
          token: request.fact.report.token
        }] }
      : authority.verifyPrepared(request)
  };
}

function currentTransaction(runtime: PhoneStoryRuntime) {
  const snapshot = runtime.getSnapshot();
  expect(snapshot.status).toBe('transaction');
  if (snapshot.status !== 'transaction') throw new Error('expected active transaction');
  return snapshot.transaction;
}

function requiresMediaActivation(
  transaction: ReturnType<typeof currentTransaction>
): boolean {
  return transaction.mode === 'segment'
    ? transaction.closure.mount.some((mount) => mount.includes('video'))
    : phoneSceneById(transaction.candidateSceneId)
      .directEntry.closure.resourceBudget.videos > 0;
}

function reportSlot(fixture: EnvironmentFixture, slot: PhoneEvidenceSlot): void {
  fixture.send({
    type: 'evidence-reported',
    slot,
    report: {
      kind: slot.kind,
      token: `${slot.attempt.transactionId}:${slot.leg}:${slot.kind}:${slot.surfaceId ?? 'global'}:${slot.stageIndex}`,
      accepted: true
    }
  });
}

function proveCurrent(
  runtime: PhoneStoryRuntime,
  fixture: EnvironmentFixture,
  acceptActivation = true
): void {
  for (;;) {
    const snapshot = runtime.getSnapshot();
    if (snapshot.status !== 'transaction') return;
    const transaction = snapshot.transaction;
    if (transaction.phase === 'awaiting-media-activation') {
      if (!acceptActivation) return;
      fixture.send({ type: 'activation-settled', invoked: true, attempt: transaction.attempt });
      continue;
    }
    if (transaction.phase === 'preparing'
      && requiresMediaActivation(transaction)
      && transaction.activation !== 'spent'
      && transaction.requiredPrepared.every((slot) => transaction.evidence.some((record) => (
        record.slot.kind === slot.kind && record.slot.leg === slot.leg
          && record.slot.stageIndex === slot.stageIndex
          && record.slot.surfaceId === slot.surfaceId
          && record.slot.planeRevision === slot.planeRevision
      )))) {
      fixture.send({ type: 'activation-settled', invoked: true, attempt: transaction.attempt });
      continue;
    }
    if (transaction.phase === 'playing') {
      fixture.send({ type: 'transition-completed', attempt: transaction.attempt });
      continue;
    }
    if (transaction.phase === 'dwelling') {
      fixture.send({ type: 'deadline-fired', operation: 'dwell', attempt: transaction.attempt });
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
        && record.slot.surfaceId === slot.surfaceId
        && record.slot.planeRevision === slot.planeRevision
    )));
    if (!missing) throw new Error(`no missing proof in ${transaction.phase}`);
    reportSlot(fixture, missing);
  }
}

function prepareCurrentPlane(
  runtime: PhoneStoryRuntime,
  fixture: EnvironmentFixture
): void {
  for (;;) {
    const transaction = currentTransaction(runtime);
    if (transaction.requiredFinal.length > 0) return;
    if (transaction.phase === 'awaiting-media-activation'
      || (requiresMediaActivation(transaction)
        && transaction.activation !== 'spent'
        && transaction.requiredPrepared.every((slot) => transaction.evidence.some((record) => (
          record.slot.kind === slot.kind && record.slot.leg === slot.leg
            && record.slot.surfaceId === slot.surfaceId
        ))))) {
      fixture.send({ type: 'activation-settled', invoked: true, attempt: transaction.attempt });
      continue;
    }
    const missing = transaction.requiredPrepared.find((slot) => !transaction.evidence.some((record) => (
      record.slot.kind === slot.kind && record.slot.leg === slot.leg
        && record.slot.stageIndex === slot.stageIndex && record.slot.surfaceId === slot.surfaceId
    )));
    if (!missing) throw new Error(`cannot prepare projector plane from ${transaction.phase}`);
    reportSlot(fixture, missing);
  }
}

function exactPlaneResult(request: PhonePlaneRequest): PhonePlaneApplyResult {
  return {
    records: request.required.map((slot) => ({
      slot,
      token: `${request.attempt.transactionId}:projector:${slot.kind}:${request.planeRevision}`
    })),
    failure: null
  };
}

function createProjectorAuthority(
  methods: Partial<Pick<PhonePresentation,
    'applyPlane' | 'verifyVisibleCandidate' | 'verifyReproject' | 'verifyRollback'>> = {},
  readViewport: () => PhoneViewportSnapshot = initialViewport
): PhonePresentation {
  return { ...createPresentationAuthority(readViewport), ...methods };
}

function reachPlaying(runtime: PhoneStoryRuntime, fixture: EnvironmentFixture): void {
  for (;;) {
    const transaction = currentTransaction(runtime);
    if (transaction.phase === 'playing') return;
    if (transaction.phase === 'awaiting-media-activation') {
      fixture.send({ type: 'activation-settled', invoked: true, attempt: transaction.attempt });
      continue;
    }
    if (transaction.phase === 'preparing'
      && requiresMediaActivation(transaction)
      && transaction.activation !== 'spent'
      && transaction.requiredPrepared.every((slot) => transaction.evidence.some((record) => (
        record.slot.kind === slot.kind && record.slot.leg === slot.leg
          && record.slot.stageIndex === slot.stageIndex
          && record.slot.surfaceId === slot.surfaceId
          && record.slot.planeRevision === slot.planeRevision
      )))) {
      fixture.send({ type: 'activation-settled', invoked: true, attempt: transaction.attempt });
      continue;
    }
    const slots = transaction.requiredFinal.length > 0
      ? transaction.requiredFinal : transaction.requiredPrepared;
    const missing = slots.find((slot) => !transaction.evidence.some((record) => (
      record.slot.kind === slot.kind && record.slot.leg === slot.leg
        && record.slot.stageIndex === slot.stageIndex
        && record.slot.surfaceId === slot.surfaceId
        && record.slot.planeRevision === slot.planeRevision
    )));
    if (!missing) throw new Error(`cannot reach playback from ${transaction.phase}`);
    reportSlot(fixture, missing);
  }
}

function registerCurrentLeaf(
  runtime: PhoneStoryRuntime,
  commands: PhoneLeafCommandHandle
) {
  const transaction = currentTransaction(runtime);
  const scene = phoneSceneById(transaction.candidateSceneId);
  const binding: PhoneLeafReportBinding = {
    attempt: transaction.attempt,
    stageIndex: transaction.stageIndex,
    leg: transaction.mode === 'rollback' ? 'rollback' : 'target',
    allowedReports: transaction.requiredPrepared.map(({ kind }) => kind),
    allowedSurfaceIds: scene.surfaces,
    planeRevision: transaction.planeRevision
  };
  const reports = runtime.createLeafReportPort(binding);
  reports.registerMount({
    root: {} as HTMLElement,
    surfaces: scene.surfaces.map((id) => ({
      id,
      element: {} as HTMLElement,
      kind: id.includes('video') ? 'video' as const
        : /(?:image|poster|arch)/.test(id) ? 'image' as const
        : ['hero-intro-ink', 'star-map-canvas', 'figure3-paper-canvas'].includes(id)
          ? 'canvas-2d' as const
          : id.includes('canvas') ? 'canvas-webgl' as const : 'dom' as const
    })),
    commands
  });
  return { binding, reports };
}

function registerCurrentEffect(
  runtime: PhoneStoryRuntime,
  commands: PhoneLeafCommandHandle
) {
  const transaction = currentTransaction(runtime);
  const segment = phoneManifest.segments.find(({ id }) => id === transaction.attempt.segmentId);
  if (!segment || !transaction.attempt.direction) throw new Error('expected segment effect');
  const surfaceId = segment[transaction.attempt.direction].effectSurface;
  const binding: PhoneLeafReportBinding = {
    attempt: transaction.attempt,
    stageIndex: transaction.stageIndex,
    leg: 'effect',
    allowedReports: transaction.requiredPrepared.filter(({ leg }) => leg === 'effect')
      .map(({ kind }) => kind),
    allowedSurfaceIds: [surfaceId],
    planeRevision: transaction.planeRevision
  };
  const reports = runtime.createLeafReportPort(binding);
  reports.registerMount({
    root: {} as HTMLElement,
    surfaces: [{ id: surfaceId, element: {} as HTMLElement,
      kind: surfaceId.startsWith('fx:') ? 'canvas-webgl' : 'dom' }],
    commands
  });
  return reports;
}

function reportCurrentLeafFacts(
  runtime: PhoneStoryRuntime,
  reports: PhoneLeafReportPort,
  exclude: PhoneEvidenceSlot | null = null
): void {
  for (const slot of currentTransaction(runtime).requiredPrepared) {
    if (slot === exclude) continue;
    if (!slot.surfaceId) continue;
    switch (slot.kind) {
      case 'image-decoded':
      case 'video-decoded':
      case 'canvas-drawn':
      case 'static-ready':
        reports.reportPrepared(slot.surfaceId, {
          kind: slot.kind,
          token: `${slot.attempt.transactionId}:${slot.kind}:${slot.surfaceId}`,
          ready: true
        });
        break;
      default:
        break;
    }
  }
}

describe('phone runtime input, history, viewport, and queue', () => {
  it('is inert until connect and gives every connection one non-overlapping authority', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture);
    const subscriber = vi.fn();
    runtime.subscribe(subscriber);
    expect(fixture.counts()).toEqual({ listeners: 0, timers: 0, frames: 0 });
    const disconnectA = runtime.connect();
    const authorityA = runtime.getSnapshot().authorityId;
    expect(fixture.counts().listeners).toBe(1);
    disconnectA();
    const retiredPublishCount = subscriber.mock.calls.length;
    expect(fixture.counts()).toEqual({ listeners: 0, timers: 0, frames: 0 });

    const disconnectB = runtime.connect();
    const authorityB = runtime.getSnapshot().authorityId;
    expect(authorityB).not.toBe(authorityA);
    expect(subscriber).toHaveBeenCalledTimes(retiredPublishCount);
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
      environment,
      presentation: createPresentationAuthority()
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

  it('reprojects an active transition without replacing its attempt, stage, or progress', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#pattern');
    const disconnect = runtime.connect();
    proveCurrent(runtime, fixture);
    fixture.emit({
      type: 'input', kind: 'wheel', delta: 100, fresh: true,
      trusted: true, target: 'story'
    });
    reachPlaying(runtime, fixture);
    const before = currentTransaction(runtime);
    fixture.send({ type: 'transition-progressed', attempt: before.attempt, progress: 0.25 });
    const progressed = currentTransaction(runtime);
    fixture.emit({
      type: 'viewport', change: 'toolbar',
      viewport: { ...initialViewport(), visualRevision: 2 }
    });
    fixture.flushFrames();
    const reprojected = currentTransaction(runtime);
    expect(reprojected.attempt).toBe(progressed.attempt);
    expect(reprojected.phase).toBe('playing');
    expect(reprojected.stageIndex).toBe(progressed.stageIndex);
    expect(reprojected.progress).toBe(progressed.progress);
    expect(runtime.getSnapshot().lastPlaneRevision)
      .toBeGreaterThan(progressed.planeRevision ?? 0);
    expect(fixture.effects.some(({ type }) => type === 'apply-presentation-plane')).toBe(false);
    disconnect();
  });

  it('restarts only active candidate proof when toolbar geometry changes late', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#pattern');
    const disconnect = runtime.connect();
    proveCurrent(runtime, fixture);
    fixture.emit({
      type: 'input', kind: 'wheel', delta: 100, fresh: true,
      trusted: true, target: 'story'
    });
    reachPlaying(runtime, fixture);
    for (;;) {
      const active = currentTransaction(runtime);
      if (active.phase === 'presenting-target') break;
      fixture.send({ type: 'transition-completed', attempt: active.attempt });
      if (currentTransaction(runtime).phase === 'awaiting-leg-intent') fixture.send({
        type: 'leg-intent', attempt: active.attempt,
        physicalEpoch: (active.claimedPhysicalEpoch ?? 0) + 1
      });
      if (currentTransaction(runtime).phase === 'dwelling') fixture.send({
        type: 'deadline-fired', operation: 'dwell', attempt: active.attempt
      });
    }
    const before = currentTransaction(runtime);
    reportSlot(fixture, before.requiredFinal[0]!);
    fixture.emit({
      type: 'viewport', change: 'toolbar',
      viewport: { ...initialViewport(), visualRevision: 2 }
    });
    fixture.flushFrames();
    const restarted = currentTransaction(runtime);
    expect(restarted.attempt).toBe(before.attempt);
    expect(restarted.mode).toBe('segment');
    expect(restarted.phase).toBe('presenting-target');
    expect(restarted.candidateSceneId).toBe(before.candidateSceneId);
    expect(restarted.planeRevision).toBeGreaterThan(before.planeRevision ?? 0);
    expect(restarted.requiredFinal.every((slot) => (
      slot.planeRevision === restarted.planeRevision
    ))).toBe(true);
    expect(restarted.evidence.some(({ slot }) => slot.planeRevision === before.planeRevision))
      .toBe(false);
    disconnect();
  });

  it('never lets a pending toolbar sample delay or overwrite layout invalidation', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#brand');
    const disconnect = runtime.connect();
    proveCurrent(runtime, fixture);
    fixture.emit({
      type: 'viewport', change: 'toolbar',
      viewport: { ...initialViewport(), visualRevision: 2 }
    });
    const layout = { ...initialViewport(), layoutRevision: 3, visualRevision: 3 };
    fixture.emit({ type: 'viewport', change: 'layout', viewport: layout });
    expect(runtime.getSnapshot().viewport).toEqual(layout);
    fixture.flushFrames();
    expect(runtime.getSnapshot().viewport).toEqual(layout);
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

  it('keeps the committed source lease when unsupported geometry preempts a candidate', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#pattern');
    const disconnect = runtime.connect();
    const source = commandFixture();
    registerCurrentLeaf(runtime, source.commands);
    proveCurrent(runtime, fixture);
    fixture.emit({
      type: 'input', kind: 'wheel', delta: 100, fresh: true, target: 'story'
    });
    fixture.emit({
      type: 'viewport', change: 'unsupported',
      viewport: {
        ...initialViewport(),
        layout: { width: 844, height: 390, orientation: 'landscape' },
        layoutRevision: 2,
        supported: false
      }
    });
    fixture.flushFrames();
    expect(runtime.getSnapshot().status).toBe('stable');
    expect(runtime.getSnapshot().stableCommit?.sceneId).toBe('pattern');
    expect(source.commands.pause).toHaveBeenCalledWith('superseded');
    expect(source.commands.dispose).not.toHaveBeenCalled();
    disconnect();
  });
});

describe('phone runtime pagehide/pageshow/BFCache lifecycle', () => {
  it('keeps a terminal fault inert across viewport and BFCache events until explicit retry', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#home');
    const disconnect = runtime.connect();
    const failed = currentTransaction(runtime);
    fixture.send({
      type: 'failure-reported', slot: failed.requiredPrepared[0]!,
      failure: { code: 'hero-failed', message: 'hero failed', recoverable: false }
    });
    const faulted = runtime.getSnapshot();
    expect(faulted.status).toBe('faulted');
    fixture.emit({
      type: 'viewport', change: 'toolbar',
      viewport: { ...initialViewport(), visualRevision: 2 }
    });
    fixture.flushFrames();
    fixture.emit({ type: 'pagehide', persisted: true });
    fixture.emit({ type: 'pageshow', persisted: true });
    expect(runtime.getSnapshot().status).toBe('faulted');
    expect(runtime.getSnapshot().lastTransactionGeneration)
      .toBe(faulted.lastTransactionGeneration);
    runtime.retry();
    expect(currentTransaction(runtime).attempt.transactionGeneration)
      .toBeGreaterThan(faulted.lastTransactionGeneration);
    disconnect();
  });

  it('preserves the newest rollback entry across a layout recovery generation', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#services');
    const disconnect = runtime.connect();
    proveCurrent(runtime, fixture);
    fixture.emit({
      type: 'input', kind: 'wheel', delta: 100, fresh: true,
      trusted: true, target: 'story'
    });
    const candidate = currentTransaction(runtime);
    fixture.send({
      type: 'failure-reported', slot: candidate.requiredPrepared[0]!,
      failure: { code: 'candidate', message: 'candidate failed', recoverable: true }
    });
    runtime.requestEntry({ pathname: '/', hash: '#brand', origin: 'menu' });
    expect(currentTransaction(runtime).mode).toBe('rollback');
    fixture.emit({
      type: 'viewport', change: 'unsupported',
      viewport: {
        ...initialViewport(),
        layout: { width: 844, height: 390, orientation: 'landscape' },
        layoutRevision: 2,
        supported: false
      }
    });
    expect(currentTransaction(runtime).mode).toBe('rollback');
    expect(currentTransaction(runtime).pendingEntry?.hash).toBe('#brand');
    fixture.emit({
      type: 'viewport', change: 'layout',
      viewport: { ...initialViewport(), layoutRevision: 3, visualRevision: 3 }
    });
    const restarted = currentTransaction(runtime);
    expect(restarted.mode).toBe('rollback');
    expect(restarted.pendingEntry?.hash).toBe('#brand');
    proveCurrent(runtime, fixture);
    expect(runtime.getSnapshot().status).toBe('stable');
    expect(runtime.getSnapshot().stableCommit?.sceneId).toBe('brand');
    disconnect();
  });
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

  it('restarts an AOD proof after crossing the retired six-second watchdog in background', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#aod-animation');
    const disconnect = runtime.connect();
    registerCurrentLeaf(runtime, commandFixture().commands);
    const before = currentTransaction(runtime).attempt.transactionGeneration;
    expect(currentTransaction(runtime).phase).toBe('preparing');
    expect(fixture.counts().timers).toBe(1);

    fixture.emit({ type: 'visibility', hidden: true });
    fixture.advance(6_001);
    fixture.fireTimers();
    expect(fixture.counts().timers).toBe(0);
    fixture.emit({ type: 'visibility', hidden: false });

    expect(currentTransaction(runtime).attempt.transactionGeneration).toBeGreaterThan(before);
    expect(currentTransaction(runtime).deadline?.remainingMs).toBeGreaterThan(0);
    expect(fixture.counts().timers).toBe(1);
    disconnect();
  });

  it('pauses hidden deadlines and re-proves a stable BFCache restore with one listener', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#education');
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

  it('resamples the live viewport before BFCache recovery starts', () => {
    const fixture = createEnvironment();
    let liveViewport = initialViewport();
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#pattern', origin: 'initial' },
      environment: { ...fixture.port, readViewport: () => liveViewport },
      presentation: createPresentationAuthority()
    });
    const disconnect = runtime.connect();
    proveCurrent(runtime, fixture);
    fixture.emit({ type: 'pagehide', persisted: true });
    liveViewport = { ...initialViewport(), layoutRevision: 4, visualRevision: 7 };
    fixture.emit({ type: 'pageshow', persisted: true });
    expect(runtime.getSnapshot().viewport).toEqual(liveViewport);
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

function commandFixture(
  activation: (call: number) => boolean = () => true
): Readonly<{
  commands: PhoneLeafCommandHandle;
  rebindings: PhoneLeafGenerationBinding[];
}> {
  const rebindings: PhoneLeafGenerationBinding[] = [];
  let activationCall = 0;
  const commands: PhoneLeafCommandHandle = {
    rebind: vi.fn((binding) => { rebindings.push(binding); }),
    activate: vi.fn((command: Parameters<PhoneLeafCommandHandle['activate']>[0]) => ({
      invocationId: command.invocationId,
      surfaceIds: command.surfaceIds,
      invoked: activation(++activationCall),
      settlements: command.surfaceIds.map((surfaceId) => ({
        surfaceId, status: 'fulfilled' as const
      }))
    })),
    render: vi.fn(),
    settle: vi.fn(),
    pause: vi.fn(),
    dispose: vi.fn()
  };
  return { commands, rebindings };
}

describe('phone runtime projector bridge', () => {
  it('renders the reducer-owned start endpoint before activating a newly mounted leaf', () => {
    const directFixture = createEnvironment();
    const directRuntime = createRuntime(directFixture, '#ph-animation');
    const disconnectDirect = directRuntime.connect();
    const directCalls: string[] = [];
    const { commands: directCommands } = commandFixture();
    vi.mocked(directCommands.render).mockImplementation((progress) => {
      directCalls.push(`render:${progress}`);
    });
    vi.mocked(directCommands.activate).mockImplementation((command) => {
      directCalls.push('activate');
      return {
        invocationId: command.invocationId,
        surfaceIds: command.surfaceIds,
        invoked: true,
        settlements: command.surfaceIds.map((surfaceId) => ({
          surfaceId, status: 'fulfilled' as const
        }))
      };
    });
    registerCurrentLeaf(directRuntime, directCommands);
    expect(directCalls.slice(0, 2)).toEqual(['render:0', 'activate']);
    disconnectDirect();

    const reverseFixture = createEnvironment();
    const reverseRuntime = createRuntime(reverseFixture, '#education');
    const disconnectReverse = reverseRuntime.connect();
    proveCurrent(reverseRuntime, reverseFixture);
    reverseFixture.emit({
      type: 'input', kind: 'wheel', delta: -100, fresh: true,
      trusted: true, target: 'story'
    });
    expect(currentTransaction(reverseRuntime)).toMatchObject({
      candidateSceneId: 'ph-animation', progress: 1
    });
    const { commands: reverseCommands } = commandFixture();
    registerCurrentLeaf(reverseRuntime, reverseCommands);
    expect(reverseCommands.render).toHaveBeenCalledWith(1);
    disconnectReverse();
  });

  it('uses verifyVisibleCandidate for one exact target-plane proof and never forwards it', () => {
    const fixture = createEnvironment();
    const verifyVisibleCandidate = vi.fn(exactPlaneResult);
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#pattern', origin: 'initial' },
      environment: fixture.port,
      presentation: createProjectorAuthority(
        { verifyVisibleCandidate }, fixture.port.readViewport
      )
    });
    const disconnect = runtime.connect();
    prepareCurrentPlane(runtime, fixture);
    expect(currentTransaction(runtime).phase).toBe('presenting-target');
    expect(verifyVisibleCandidate).not.toHaveBeenCalled();
    fixture.flushFrames();
    expect(verifyVisibleCandidate).toHaveBeenCalledTimes(1);
    expect(verifyVisibleCandidate.mock.calls[0]?.[0]).toMatchObject({
      leg: 'target', sceneId: 'pattern', interactionEnabled: false
    });
    expect(runtime.getSnapshot().status).toBe('stable');
    expect(fixture.effects.some(({ type }) => type === 'apply-presentation-plane')).toBe(false);
    disconnect();
  });

  it('uses applyPlane for a fresh source coverage revision during active playback', () => {
    const fixture = createEnvironment();
    const applyPlane = vi.fn(exactPlaneResult);
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#pattern', origin: 'initial' },
      environment: fixture.port,
      presentation: createProjectorAuthority({ applyPlane }, fixture.port.readViewport)
    });
    const disconnect = runtime.connect();
    proveCurrent(runtime, fixture);
    fixture.flushFrames();
    fixture.emit({
      type: 'input', kind: 'wheel', delta: 100, fresh: true,
      trusted: true, target: 'story'
    });
    reachPlaying(runtime, fixture);
    fixture.flushFrames();
    applyPlane.mockClear();
    fixture.emit({
      type: 'viewport', change: 'toolbar',
      viewport: { ...initialViewport(), visualRevision: 2 }
    });
    fixture.flushFrames();
    fixture.flushFrames();
    expect(applyPlane).toHaveBeenCalledTimes(1);
    expect(applyPlane.mock.calls[0]?.[0]).toMatchObject({
      leg: 'source', required: [expect.objectContaining({ kind: 'coverage-visible' })]
    });
    expect(currentTransaction(runtime).phase).toBe('playing');
    disconnect();
  });

  it('uses verifyReproject with runtime-sampled live toolbar geometry', () => {
    const fixture = createEnvironment();
    const verifyReproject = vi.fn(exactPlaneResult);
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#education', origin: 'initial' },
      environment: fixture.port,
      presentation: createProjectorAuthority({ verifyReproject }, fixture.port.readViewport)
    });
    const disconnect = runtime.connect();
    proveCurrent(runtime, fixture);
    fixture.flushFrames();
    const live: PhoneViewportSnapshot = {
      ...initialViewport(),
      visual: { offsetLeft: 0.5, offsetTop: 37.25, width: 389.5, height: 806.75, scale: 1.25 },
      visualRevision: 2
    };
    fixture.emit({ type: 'viewport', change: 'toolbar', viewport: live });
    fixture.flushFrames();
    prepareCurrentPlane(runtime, fixture);
    fixture.flushFrames();
    expect(verifyReproject).toHaveBeenCalledTimes(1);
    expect(verifyReproject.mock.calls[0]?.[0].viewport).toEqual(live);
    expect(runtime.getSnapshot().status).toBe('stable');
    disconnect();
  });

  it('uses verifyRollback for the exact retained source plane', () => {
    const fixture = createEnvironment();
    const verifyRollback = vi.fn(exactPlaneResult);
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#brand', origin: 'initial' },
      environment: fixture.port,
      presentation: createProjectorAuthority({ verifyRollback }, fixture.port.readViewport)
    });
    const disconnect = runtime.connect();
    proveCurrent(runtime, fixture);
    fixture.flushFrames();
    runtime.requestEntry({ pathname: '/', hash: '#services', origin: 'menu' });
    const failed = currentTransaction(runtime);
    fixture.send({
      type: 'failure-reported',
      slot: failed.requiredPrepared[0]!,
      failure: { code: 'fixture-load', message: 'fixture', recoverable: true }
    });
    expect(currentTransaction(runtime).mode).toBe('rollback');
    prepareCurrentPlane(runtime, fixture);
    fixture.flushFrames();
    expect(verifyRollback).toHaveBeenCalledTimes(1);
    expect(verifyRollback.mock.calls[0]?.[0]).toMatchObject({
      leg: 'rollback', sceneId: 'brand'
    });
    expect(runtime.getSnapshot().stableCommit?.sceneId).toBe('brand');
    disconnect();
  });

  it.each([
    ['stale revision', (request: PhonePlaneRequest) => ({
      ...exactPlaneResult(request),
      records: exactPlaneResult(request).records.map((record, index) => index === 0
        ? { ...record, slot: { ...record.slot, planeRevision: request.planeRevision - 1 } }
        : record)
    })],
    ['mixed leg', (request: PhonePlaneRequest) => ({
      ...exactPlaneResult(request),
      records: exactPlaneResult(request).records.map((record, index) => index === 0
        ? { ...record, slot: { ...record.slot, leg: 'source' as const } }
        : record)
    })],
    ['mixed attempt', (request: PhonePlaneRequest) => ({
      ...exactPlaneResult(request),
      records: exactPlaneResult(request).records.map((record, index) => index === 0
        ? { ...record, slot: { ...record.slot, attempt: {
            ...record.slot.attempt, transactionId: 'forged-transaction'
          } } }
        : record)
    })],
    ['partial proof', (request: PhonePlaneRequest) => ({
      ...exactPlaneResult(request), records: exactPlaneResult(request).records.slice(1)
    })],
    ['duplicate slot', (request: PhonePlaneRequest) => {
      const result = exactPlaneResult(request);
      return { ...result, records: [...result.records, result.records[0]!] };
    }]
  ] as const)('fails closed on a projector %s result', (_label, resultFor) => {
    const fixture = createEnvironment();
    const verifyVisibleCandidate = vi.fn(resultFor);
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#pattern', origin: 'initial' },
      environment: fixture.port,
      presentation: createProjectorAuthority(
        { verifyVisibleCandidate }, fixture.port.readViewport
      )
    });
    const disconnect = runtime.connect();
    prepareCurrentPlane(runtime, fixture);
    const rejectedAttempt = currentTransaction(runtime).attempt;
    fixture.flushFrames();
    expect(verifyVisibleCandidate).toHaveBeenCalledTimes(1);
    expect(runtime.getSnapshot().stableCommit?.sceneId).not.toBe('pattern');
    const snapshot = runtime.getSnapshot();
    if (snapshot.status === 'transaction') {
      expect(snapshot.transaction.attempt.transactionGeneration)
        .toBeGreaterThan(rejectedAttempt.transactionGeneration);
      expect(snapshot.transaction.candidateSceneId).toBe('hero');
    }
    disconnect();
  });

  it('turns a thrown projector exception into the bounded presentation failure path', () => {
    const fixture = createEnvironment();
    const verifyVisibleCandidate = vi.fn((): PhonePlaneApplyResult => {
      throw new Error('projector exploded');
    });
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#pattern', origin: 'initial' },
      environment: fixture.port,
      presentation: createProjectorAuthority(
        { verifyVisibleCandidate }, fixture.port.readViewport
      )
    });
    const disconnect = runtime.connect();
    prepareCurrentPlane(runtime, fixture);
    expect(() => fixture.flushFrames()).not.toThrow();
    expect(verifyVisibleCandidate).toHaveBeenCalledTimes(1);
    expect(runtime.getSnapshot().stableCommit?.sceneId).not.toBe('pattern');
    disconnect();
  });

  it('does not let generic performEffect forge presentation evidence', () => {
    const fixture = createEnvironment();
    const observed: PhoneStoryEffect['type'][] = [];
    const environment: PhoneStoryRuntimeEnvironment = {
      ...fixture.port,
      performEffect: (effect, enqueue) => {
        observed.push(effect.type);
        fixture.port.performEffect?.(effect, enqueue);
        if (effect.type === 'apply-presentation-plane') {
          const transaction = currentTransaction(runtime);
          for (const slot of transaction.requiredFinal) reportSlot(fixture, slot);
          enqueue({ type: 'terminal-fault', code: 'generic-projector-forgery' });
        }
      }
    };
    const verifyVisibleCandidate = vi.fn(exactPlaneResult);
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#pattern', origin: 'initial' },
      environment,
      presentation: createProjectorAuthority(
        { verifyVisibleCandidate }, fixture.port.readViewport
      )
    });
    const disconnect = runtime.connect();
    prepareCurrentPlane(runtime, fixture);
    fixture.flushFrames();
    expect(observed).not.toContain('apply-presentation-plane');
    expect(verifyVisibleCandidate).toHaveBeenCalledTimes(1);
    expect(runtime.getSnapshot().status).toBe('stable');
    disconnect();
  });
});

describe('phone runtime effects, media activation, and disposal', () => {
  it('accepts a causal frame reported synchronously from command rebind', () => {
    const fixture = createEnvironment();
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#aod-animation', origin: 'initial' },
      environment: fixture.port,
      presentation: createFrameProofPresentationAuthority()
    });
    const disconnect = runtime.connect();
    const canvasSurface = phoneSceneById('aod-animation').frame.surfaceIds[0]!;
    const commands = commandFixture().commands;
    vi.mocked(commands.rebind).mockImplementation((binding) => {
      binding.reports.reportFrame(canvasSurface, {
        kind: 'frame', token: binding.frameToken,
        presented: true, frameId: 'synchronous-causal-draw'
      });
    });
    registerCurrentLeaf(runtime, commands);
    expect(currentTransaction(runtime).evidence).toContainEqual(expect.objectContaining({
      slot: expect.objectContaining({ kind: 'canvas-drawn', surfaceId: canvasSurface }),
      token: expect.stringContaining(':frame:')
    }));
    disconnect();
  });

  it('delegates mount ownership to the injected presentation authority', () => {
    const fixture = createEnvironment();
    const registerLeafMount = vi.fn(() => ({
      registrationKey: 'presentation:pattern',
      commands: commandFixture().commands,
      surfaceIds: ['pattern-image'],
      activationSurfaceIds: [],
      resources: { videos: 0, activeDecoders: 0, canvases: 0, webglContexts: 0 },
      rebind: vi.fn(),
      release: vi.fn()
    }));
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#pattern', origin: 'initial' },
      environment: fixture.port,
      presentation: {
        ...createPresentationAuthority(),
        registerLeafMount,
        verifyPrepared: () => ({ records: [] })
      }
    });
    const disconnect = runtime.connect();
    registerCurrentLeaf(runtime, commandFixture().commands);
    expect(registerLeafMount).toHaveBeenCalledTimes(1);
    disconnect();
  });

  it('does not let a leaf forge root, layout, or resource prepared proof', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#pattern');
    const disconnect = runtime.connect();
    const { reports } = registerCurrentLeaf(runtime, commandFixture().commands);
    for (const kind of [
      'root-connected', 'layout-measurable', 'resource-budget-valid'
    ] as const) {
      const before = runtime.getSnapshot();
      reports.reportPrepared('pattern-image', { kind, token: `forged:${kind}`, ready: true });
      expect(runtime.getSnapshot()).toBe(before);
    }
    disconnect();
  });

  it('waits for every asynchronous media settlement and reclaims partial rejection', async () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#crane-animation');
    const disconnect = runtime.connect();
    let rejectFlock!: (reason?: unknown) => void;
    const figure = Promise.resolve();
    const flock = new Promise<void>((_resolve, reject) => { rejectFlock = reject; });
    void flock.catch(() => undefined);
    const commands = {
      rebind: vi.fn(),
      activate: vi.fn((command: Parameters<PhoneLeafCommandHandle['activate']>[0]) => ({
        invocationId: command.invocationId,
        surfaceIds: command.surfaceIds,
        invoked: true,
        settlements: command.surfaceIds.map((surfaceId) => ({
          surfaceId,
          status: 'pending' as const,
          settled: surfaceId === 'crane-flock-video' ? flock : figure
        }))
      })),
      render: vi.fn(), settle: vi.fn(), pause: vi.fn(), dispose: vi.fn()
    } as unknown as PhoneLeafCommandHandle;
    registerCurrentLeaf(runtime, commands);
    expect(currentTransaction(runtime).activation).not.toBe('spent');
    rejectFlock(new Error('flock play rejected'));
    await vi.waitFor(() => {
      expect(currentTransaction(runtime).activation).toBe('awaiting');
    });
    expect(commands.pause).toHaveBeenCalled();
    expect(fixture.resources.at(-1)?.activeDecoders).toBe(0);
    disconnect();
  });

  it('treats leaf progress and completion as diagnostics, never phase authority', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#pattern');
    const disconnect = runtime.connect();
    proveCurrent(runtime, fixture);
    fixture.emit({
      type: 'input', kind: 'wheel', delta: 100, fresh: true,
      trusted: true, target: 'story'
    });
    registerCurrentLeaf(runtime, commandFixture().commands);
    const reports = registerCurrentEffect(runtime, commandFixture().commands);
    reachPlaying(runtime, fixture);
    const before = runtime.getSnapshot();
    reports.reportProgress(1);
    reports.reportComplete();
    expect(runtime.getSnapshot()).toBe(before);
    disconnect();
  });

  it('reads the production reduced-motion policy and still proves the source plane', () => {
    const fixture = createEnvironment();
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#pattern', origin: 'initial' },
      environment: { ...fixture.port, readReducedMotion: () => true },
      presentation: createPresentationAuthority()
    });
    const disconnect = runtime.connect();
    proveCurrent(runtime, fixture);
    fixture.emit({
      type: 'input', kind: 'wheel', delta: 100, fresh: true,
      trusted: true, target: 'story'
    });
    let active = currentTransaction(runtime);
    for (const slot of active.requiredPrepared) reportSlot(fixture, slot);
    active = currentTransaction(runtime);
    expect(active.phase).toBe('presenting-source');
    for (const slot of active.requiredFinal) reportSlot(fixture, slot);
    expect(currentTransaction(runtime).phase).toBe('presenting-target');
    expect(fixture.counts().frames).toBe(1);
    disconnect();
  });

  it('cannot recreate an authority RAF after a subscriber disconnects during publish', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#pattern');
    const disconnect = runtime.connect();
    proveCurrent(runtime, fixture);
    fixture.emit({
      type: 'input', kind: 'wheel', delta: 100, fresh: true,
      trusted: true, target: 'story'
    });
    let active = currentTransaction(runtime);
    for (const slot of active.requiredPrepared) reportSlot(fixture, slot);
    active = currentTransaction(runtime);
    for (const slot of active.requiredFinal.slice(0, -1)) reportSlot(fixture, slot);
    const unsubscribe = runtime.subscribe(() => disconnect());
    reportSlot(fixture, active.requiredFinal.at(-1)!);
    expect(fixture.counts()).toEqual({ listeners: 0, timers: 0, frames: 0 });
    unsubscribe();
  });

  it('closes over an immutable report binding and rejects false readiness facts', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#pattern');
    const disconnect = runtime.connect();
    const transaction = currentTransaction(runtime);
    const scene = phoneSceneById(transaction.candidateSceneId);
    const allowedReports = transaction.requiredPrepared.map(({ kind }) => kind);
    const allowedSurfaceIds = [...scene.surfaces];
    const attempt = { ...transaction.attempt };
    const binding: PhoneLeafReportBinding = {
      attempt, stageIndex: transaction.stageIndex, leg: 'target',
      allowedReports, allowedSurfaceIds, planeRevision: transaction.planeRevision
    };
    const reports = runtime.createLeafReportPort(binding);
    allowedReports.splice(0, allowedReports.length);
    allowedSurfaceIds.splice(0, allowedSurfaceIds.length, 'rogue-surface');
    (attempt as { sceneId?: string }).sceneId = 'hero';
    reports.registerMount({
      root: {} as HTMLElement,
      surfaces: scene.surfaces.map((id) => ({
        id, element: {} as HTMLElement,
        kind: id.includes('video') ? 'video'
          : /(?:image|poster|arch)/.test(id) ? 'image'
            : id.includes('canvas') ? 'canvas-webgl' : 'dom'
      })),
      commands: commandFixture().commands
    });
    const before = runtime.getSnapshot();
    const prepared = transaction.requiredPrepared.find(({ kind }) => kind !== 'module-loaded')!;
    reports.reportPrepared(scene.surfaces[0]!, {
      kind: prepared.kind, token: 'false-ready', ready: false
    } as unknown as Parameters<typeof reports.reportPrepared>[1]);
    reports.reportFrame(scene.surfaces[0]!, {
      kind: 'frame', token: 'false-frame', presented: false, frameId: 'false-frame'
    } as unknown as Parameters<typeof reports.reportFrame>[1]);
    expect(runtime.getSnapshot()).toBe(before);
    disconnect();
  });

  it('owns a stable registration inventory even if the caller mutates its aliases', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#ph-animation');
    const disconnect = runtime.connect();
    const transaction = currentTransaction(runtime);
    const scene = phoneSceneById(transaction.candidateSceneId);
    const reports = runtime.createLeafReportPort({
      attempt: transaction.attempt, stageIndex: 0, leg: 'target',
      allowedReports: transaction.requiredPrepared.map(({ kind }) => kind),
      allowedSurfaceIds: scene.surfaces, planeRevision: null
    });
    const surfaces = scene.surfaces.map((id) => ({
      id, element: {} as HTMLElement,
      kind: id.includes('video') ? 'video' as const : 'canvas-webgl' as const
    }));
    reports.registerMount({ root: {} as HTMLElement, surfaces,
      commands: commandFixture().commands });
    expect(fixture.resources.at(-1)).toEqual({
      videos: 1, activeDecoders: 1, canvases: 1, webglContexts: 1
    });
    surfaces.splice(0, surfaces.length);
    disconnect();
    expect(fixture.resources.at(-1)).toEqual({
      videos: 0, activeDecoders: 0, canvases: 0, webglContexts: 0
    });
  });

  it('does not let non-media leaves forge an activation rejection', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#pattern');
    const disconnect = runtime.connect();
    const { reports } = registerCurrentLeaf(runtime, commandFixture().commands);
    const before = runtime.getSnapshot();
    reports.reportFailure({
      code: 'media-activation-rejected',
      message: 'not a media leaf',
      recoverable: true
    });
    expect(runtime.getSnapshot()).toBe(before);
    disconnect();
  });

  it('advances every ordered warm target through the mount activation seam', () => {
    for (const source of phoneManifest.scenes) {
      for (const target of phoneManifest.scenes) {
        if (source.id === target.id) continue;
        const fixture = createEnvironment();
        const runtime = createRuntime(fixture, source.directEntry.canonicalHash);
        const disconnect = runtime.connect();
        proveCurrent(runtime, fixture);
        runtime.requestEntry({
          pathname: '/', hash: target.directEntry.canonicalHash, origin: 'menu'
        });
        const { commands } = commandFixture();
        registerCurrentLeaf(runtime, commands);
        const prepared = [...currentTransaction(runtime).requiredPrepared];
        for (const slot of prepared) reportSlot(fixture, slot);
        expect(currentTransaction(runtime).phase).toBe('presenting-target');
        expect(commands.activate).toHaveBeenCalledTimes(
          target.directEntry.closure.resourceBudget.videos > 0 ? 1 : 0
        );
        disconnect();
      }
    }
  });

  it('regenerates retained structural proof through presentation and leaf seams only', async () => {
    const fixture = createEnvironment();
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#crane-animation', origin: 'initial' },
      environment: fixture.port,
      presentation: createStructuralPresentationAuthority(),
      ports: { loadDependencies: async () => ({ status: 'loaded' }) }
    });
    const disconnect = runtime.connect();
    const { commands, rebindings } = commandFixture((call) => call > 1);
    const { reports } = registerCurrentLeaf(runtime, commands);
    reportCurrentLeafFacts(runtime, reports);
    await vi.waitFor(() => expect(currentTransaction(runtime).phase)
      .toBe('awaiting-media-activation'));

    fixture.emit({ type: 'activation', trusted: true });
    const rebound = rebindings.at(-1);
    expect(rebound).toBeDefined();
    if (!rebound) throw new Error('missing retained generation binding');
    reportCurrentLeafFacts(runtime, rebound.reports);
    await vi.waitFor(() => expect(currentTransaction(runtime).phase).toBe('presenting-target'));
    disconnect();
  });

  it('issues and replaces frame tokens and rejects an old token through the new port', async () => {
    const fixture = createEnvironment();
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#crane-animation', origin: 'initial' },
      environment: fixture.port,
      presentation: createFrameProofPresentationAuthority(),
      ports: { loadDependencies: async () => ({ status: 'loaded' }) }
    });
    const disconnect = runtime.connect();
    const { commands, rebindings } = commandFixture((call) => call > 1);
    const { reports } = registerCurrentLeaf(runtime, commands);
    expect(rebindings).toHaveLength(1);
    const initialBinding = rebindings[0]!;
    reportCurrentLeafFacts(runtime, reports);
    await vi.waitFor(() => expect(currentTransaction(runtime).phase)
      .toBe('awaiting-media-activation'));

    fixture.emit({ type: 'activation', trusted: true });
    expect(rebindings).toHaveLength(2);
    const renewedBinding = rebindings[1]!;
    expect(renewedBinding.frameToken).not.toBe(initialBinding.frameToken);
    const withheld = currentTransaction(runtime).requiredPrepared.find(({ kind }) => (
      kind === 'canvas-drawn'
    ));
    if (!withheld?.surfaceId) throw new Error('missing frame-bound prepared slot');
    reportCurrentLeafFacts(runtime, renewedBinding.reports, withheld);
    const beforeStaleFrame = runtime.getSnapshot();
    renewedBinding.reports.reportFrame(withheld.surfaceId, {
      kind: 'frame', token: initialBinding.frameToken,
      presented: true, frameId: 'stale-generation-frame'
    });
    expect(runtime.getSnapshot()).toBe(beforeStaleFrame);
    renewedBinding.reports.reportFrame(withheld.surfaceId, {
      kind: 'frame', token: renewedBinding.frameToken,
      presented: true, frameId: 'current-generation-frame'
    });
    expect(currentTransaction(runtime).evidence).toContainEqual(expect.objectContaining({
      slot: withheld,
      token: renewedBinding.frameToken
    }));
    disconnect();
  });

  it('retains inert Crane topology after autoplay rejection and activates only on real CTA input', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#crane-animation');
    const disconnect = runtime.connect();
    const { commands, rebindings } = commandFixture((call) => call > 1);
    const { reports: oldReports } = registerCurrentLeaf(runtime, commands);
    expect(commands.activate).toHaveBeenCalledTimes(1);
    expect(commands.activate).toHaveBeenLastCalledWith(expect.objectContaining({
      credit: 'direct-muted-autoplay',
      surfaceIds: ['crane-figure-video', 'crane-flock-video']
    }));

    proveCurrent(runtime, fixture, false);
    const waiting = currentTransaction(runtime);
    expect(waiting.phase).toBe('awaiting-media-activation');
    expect(waiting.retainedTopology).toBe(true);
    expect(waiting.activation).toBe('awaiting');
    expect(fixture.counts().timers).toBe(0);
    expect(fixture.effects).toContainEqual(expect.objectContaining({
      type: 'show-activation-cta', enabled: true
    }));

    const beforeActivation = runtime.getSnapshot();
    fixture.emit({ type: 'activation', trusted: false });
    expect(runtime.getSnapshot()).toBe(beforeActivation);
    fixture.emit({ type: 'activation', trusted: true });
    expect(rebindings).toHaveLength(2);
    expect(commands.activate).toHaveBeenCalledTimes(2);
    expect(commands.activate).toHaveBeenLastCalledWith(expect.objectContaining({
      credit: 'physical-epoch',
      surfaceIds: ['crane-figure-video', 'crane-flock-video']
    }));
    expect(currentTransaction(runtime).attempt.transactionGeneration)
      .toBeGreaterThan(waiting.attempt.transactionGeneration);
    expect(fixture.counts().timers).toBe(1);
    expect(currentTransaction(runtime).evidence.some(({ slot }) => (
      slot.kind === 'frame-visible'
    ))).toBe(false);

    const afterRenewal = runtime.getSnapshot();
    oldReports.reportComplete();
    oldReports.reportProgress(1);
    expect(runtime.getSnapshot()).toBe(afterRenewal);
    proveCurrent(runtime, fixture);
    expect(runtime.getSnapshot().status).toBe('stable');
    expect(commands.rebind).toHaveBeenCalledTimes(2);
    disconnect();
  });

  it('offers activation immediately when direct autoplay rejects before prepared proof', async () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#aod-animation');
    const disconnect = runtime.connect();
    const { commands } = commandFixture();
    vi.mocked(commands.activate).mockImplementation((command) => ({
      invocationId: command.invocationId,
      surfaceIds: command.surfaceIds,
      invoked: true,
      settlements: command.surfaceIds.map((surfaceId) => ({
        surfaceId,
        status: 'pending' as const,
        settled: Promise.reject(new DOMException('gesture required', 'NotAllowedError'))
      }))
    }));

    registerCurrentLeaf(runtime, commands);

    await vi.waitFor(() => expect(currentTransaction(runtime).phase)
      .toBe('awaiting-media-activation'));
    expect(currentTransaction(runtime).activation).toBe('awaiting');
    expect(currentTransaction(runtime).retainedTopology).toBe(true);
    expect(fixture.effects).toContainEqual(expect.objectContaining({
      type: 'show-activation-cta', enabled: true
    }));
    disconnect();
  });

  it('reveals segment activation only after the delayed video leaf registers', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#star-map');
    const disconnect = runtime.connect();
    proveCurrent(runtime, fixture);
    fixture.emit({
      type: 'input', kind: 'wheel', delta: 100, fresh: true, target: 'story'
    });
    expect(currentTransaction(runtime).candidateSceneId).toBe('aod-animation');
    expect(currentTransaction(runtime).phase).toBe('awaiting-media-activation');
    expect(fixture.effects.at(-1)).toMatchObject({
      type: 'show-activation-cta', enabled: false
    });

    const { commands } = commandFixture();
    const { reports } = registerCurrentLeaf(runtime, commands);
    expect(fixture.effects.at(-1)).toMatchObject({
      type: 'show-activation-cta', enabled: true
    });
    expect(commands.activate).not.toHaveBeenCalled();
    reportCurrentLeafFacts(runtime, reports);
    expect(currentTransaction(runtime).phase).toBe('awaiting-media-activation');
    expect(fixture.counts().timers).toBe(0);
    fixture.advance(8_001);
    expect(currentTransaction(runtime).phase).toBe('awaiting-media-activation');
    disconnect();
  });

  it('rejects the legacy leaf-failure path as a second activation authority', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#crane-animation');
    const disconnect = runtime.connect();
    const { commands } = commandFixture();
    const { reports } = registerCurrentLeaf(runtime, commands);
    expect(currentTransaction(runtime).activation).toBe('spent');
    for (const slot of currentTransaction(runtime).requiredPrepared) reportSlot(fixture, slot);
    expect(currentTransaction(runtime).phase).toBe('presenting-target');
    reports.reportFailure({
      code: 'media-activation-rejected',
      message: 'play promise rejected',
      recoverable: true
    });
    expect(currentTransaction(runtime).phase).toBe('presenting-target');
    expect(runtime.getSnapshot().stableCommit).toBeNull();
    disconnect();
  });

  it('registers one multi-surface handle, enforces resource maxima, and never treats play as frame proof', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#crane-animation');
    const disconnect = runtime.connect();
    const { commands } = commandFixture();
    const transaction = currentTransaction(runtime);
    const scene = phoneSceneById(transaction.candidateSceneId);
    const invalidReports = runtime.createLeafReportPort({
      attempt: transaction.attempt,
      stageIndex: transaction.stageIndex,
      leg: 'target',
      allowedReports: transaction.requiredPrepared.map(({ kind }) => kind),
      allowedSurfaceIds: scene.surfaces,
      planeRevision: transaction.planeRevision
    });
    const resourcesBeforeInvalidMount = [...fixture.resources];
    expect(() => invalidReports.registerMount({
      root: {} as HTMLElement,
      surfaces: scene.surfaces.map((id) => ({
        id, element: {} as HTMLElement, kind: 'dom'
      })),
      commands
    })).toThrow(/surface(?:s| kind) differs/);
    expect(fixture.resources).toEqual(resourcesBeforeInvalidMount);
    const { reports } = registerCurrentLeaf(runtime, commands);
    expect(fixture.resources.at(-1)).toEqual({
      videos: 2, activeDecoders: 2, canvases: 2, webglContexts: 2
    });
    expect(() => reports.registerMount({
      root: {} as HTMLElement,
      surfaces: [],
      commands
    })).toThrow(/already registered/);
    expect(currentTransaction(runtime).evidence).toEqual([]);
    expect(commands.activate).toHaveBeenCalledTimes(1);
    expect(currentTransaction(runtime).requiredFinal).toEqual([]);
    disconnect();
  });

  it('rejects a scene registration that hides a declared Canvas behind a DOM kind', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#home');
    const disconnect = runtime.connect();
    const { commands } = commandFixture();
    const transaction = currentTransaction(runtime);
    const scene = phoneSceneById(transaction.candidateSceneId);
    const reports = runtime.createLeafReportPort({
      attempt: transaction.attempt, stageIndex: transaction.stageIndex, leg: 'target',
      allowedReports: transaction.requiredPrepared.map(({ kind }) => kind),
      allowedSurfaceIds: scene.surfaces, planeRevision: transaction.planeRevision
    });
    expect(() => reports.registerMount({
      root: {} as HTMLElement,
      surfaces: scene.surfaces.map((id) => ({
        id, element: {} as HTMLElement,
        kind: id.includes('video') ? 'video'
          : id.includes('canvas') ? 'canvas-webgl' : 'dom'
      })),
      commands
    })).toThrow(/surface kind differs/);
    disconnect();
  });

  it('rejects evidence and failure callbacks until the closed port owns a live mount', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#pattern');
    const disconnect = runtime.connect();
    const transaction = currentTransaction(runtime);
    const scene = phoneSceneById(transaction.candidateSceneId);
    expect(() => runtime.createLeafReportPort({
      attempt: { ...transaction.attempt, sceneId: 'hero' },
      stageIndex: transaction.stageIndex,
      leg: 'target',
      allowedReports: transaction.requiredPrepared.map(({ kind }) => kind),
      allowedSurfaceIds: scene.surfaces,
      planeRevision: transaction.planeRevision
    })).toThrow(/active transaction/);
    const reports = runtime.createLeafReportPort({
      attempt: transaction.attempt,
      stageIndex: transaction.stageIndex,
      leg: 'target',
      allowedReports: transaction.requiredPrepared.map(({ kind }) => kind),
      allowedSurfaceIds: scene.surfaces,
      planeRevision: transaction.planeRevision
    });
    const before = runtime.getSnapshot();
    reports.reportPrepared(scene.surfaces[0]!, {
      kind: 'module-loaded', token: 'unmounted', ready: true
    });
    reports.reportFailure({ code: 'unmounted', message: 'unmounted', recoverable: true });
    expect(runtime.getSnapshot()).toBe(before);
    disconnect();
  });

  it('rebinds a late unmounted target registration to the active superseding attempt', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#method');
    const disconnect = runtime.connect();
    const stale = currentTransaction(runtime);
    const scene = phoneSceneById(stale.candidateSceneId);
    const reports = runtime.createLeafReportPort({
      attempt: stale.attempt, stageIndex: stale.stageIndex, leg: 'target',
      allowedReports: stale.requiredPrepared.map(({ kind }) => kind),
      allowedSurfaceIds: scene.surfaces, planeRevision: stale.planeRevision
    });
    runtime.requestEntry({ pathname: '/', hash: '#method', origin: 'hash' });
    const active = currentTransaction(runtime);
    expect(active.attempt.transactionGeneration)
      .toBeGreaterThan(stale.attempt.transactionGeneration);
    const { commands, rebindings } = commandFixture();
    reports.registerMount({
      root: {} as HTMLElement,
      surfaces: [{ id: 'method-root', element: {} as HTMLElement, kind: 'dom' }],
      commands
    });
    expect(commands.rebind).toHaveBeenCalledTimes(1);
    expect(rebindings[0]?.frameToken).toContain(active.attempt.transactionId);
    disconnect();
  });

  it('reactivates only video surfaces declared by the active segment closure', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#crane-animation');
    const disconnect = runtime.connect();
    const { commands } = commandFixture();
    registerCurrentLeaf(runtime, commands);
    proveCurrent(runtime, fixture);
    expect(runtime.getSnapshot().status).toBe('stable');

    fixture.emit({
      type: 'input', kind: 'wheel', delta: 100, fresh: true,
      target: 'story', trusted: true
    });
    expect(currentTransaction(runtime).candidateSceneId).toBe('contact');
    expect(commands.activate).toHaveBeenLastCalledWith(expect.objectContaining({
      credit: 'physical-epoch',
      surfaceIds: ['crane-figure-video', 'crane-flock-video']
    }));
    expect(commands.activate).toHaveBeenCalledTimes(2);
    disconnect();
  });

  it('drives render, settle, pause, rebind, and idempotent dispose only through the command handle', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#pattern');
    const disconnect = runtime.connect();
    proveCurrent(runtime, fixture);
    fixture.emit({
      type: 'input', kind: 'wheel', delta: 100, fresh: true, target: 'story'
    });
    const { commands } = commandFixture();
    const target = registerCurrentLeaf(runtime, commands);
    const effect = commandFixture();
    const effectReports = registerCurrentEffect(runtime, effect.commands);
    reachPlaying(runtime, fixture);
    const beforeTargetProgress = runtime.getSnapshot();
    target.reports.reportProgress(0.4);
    expect(runtime.getSnapshot()).toBe(beforeTargetProgress);
    effectReports.reportProgress(0.4);
    expect(runtime.getSnapshot()).toBe(beforeTargetProgress);
    effectReports.reportComplete();
    expect(runtime.getSnapshot()).toBe(beforeTargetProgress);
    fixture.advance(100_000);
    fixture.flushFrames();
    expect(commands.render).toHaveBeenCalledWith(expect.any(Number));
    let active = currentTransaction(runtime);
    expect(active.phase).toBe('awaiting-leg-intent');
    const stageBeforeIntent = active.stageIndex;
    fixture.emit({
      type: 'input', kind: 'wheel', delta: 100, fresh: true,
      trusted: true, target: 'story'
    });
    active = currentTransaction(runtime);
    expect(active.phase).toBe('playing');
    expect(active.stageIndex).toBe(stageBeforeIntent + 1);
    expect(effect.rebindings.length).toBeGreaterThan(0);
    const afterStageRenewal = runtime.getSnapshot();
    effectReports.reportComplete();
    expect(runtime.getSnapshot()).toBe(afterStageRenewal);
    while (currentTransaction(runtime).phase !== 'presenting-target') {
      active = currentTransaction(runtime);
      if (active.phase === 'playing') {
        fixture.send({ type: 'transition-completed', attempt: active.attempt });
      } else if (active.phase === 'dwelling') {
        fixture.send({ type: 'deadline-fired', operation: 'dwell', attempt: active.attempt });
      } else if (active.phase === 'awaiting-leg-intent') {
        fixture.send({
          type: 'leg-intent', attempt: active.attempt,
          physicalEpoch: (active.claimedPhysicalEpoch ?? 0) + 1
        });
      }
    }
    expect(commands.settle).toHaveBeenCalledWith(1);
    fixture.emit({ type: 'visibility', hidden: true });
    expect(commands.pause).toHaveBeenCalledWith('hidden');
    disconnect();
    disconnect();
    expect(commands.dispose).toHaveBeenCalledTimes(1);
    expect(commands.dispose).toHaveBeenCalledWith('route-dispose');
  });

  it('schedules canonical dwell completion through the runtime timer queue', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#figure2-animation');
    const disconnect = runtime.connect();
    registerCurrentLeaf(runtime, commandFixture().commands);
    proveCurrent(runtime, fixture);
    fixture.emit({
      type: 'input', kind: 'wheel', delta: 100, fresh: true,
      trusted: true, target: 'story'
    });
    registerCurrentLeaf(runtime, commandFixture().commands);
    const effect = registerCurrentEffect(runtime, commandFixture().commands);
    reachPlaying(runtime, fixture);
    effect.reportComplete();
    expect(currentTransaction(runtime).phase).toBe('playing');
    fixture.advance(100_000);
    fixture.flushFrames();
    const dwelling = currentTransaction(runtime);
    expect(dwelling.phase).toBe('dwelling');
    expect(fixture.counts().timers).toBe(1);
    const stage = dwelling.stageIndex;
    fixture.fireTimers();
    expect(currentTransaction(runtime).phase).toBe('playing');
    expect(currentTransaction(runtime).stageIndex).toBe(stage + 1);
    disconnect();
  });

  it('owns the transition clock and advances an authored stage without a leaf timer', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#pattern');
    const disconnect = runtime.connect();
    registerCurrentLeaf(runtime, commandFixture().commands);
    proveCurrent(runtime, fixture);
    fixture.emit({
      type: 'input', kind: 'wheel', delta: 100, fresh: true,
      trusted: true, target: 'story'
    });
    registerCurrentLeaf(runtime, commandFixture().commands);
    registerCurrentEffect(runtime, commandFixture().commands);
    reachPlaying(runtime, fixture);
    expect(fixture.counts().frames).toBe(1);
    fixture.advance(100_000);
    fixture.flushFrames();
    expect(currentTransaction(runtime).phase).toBe('awaiting-leg-intent');
    fixture.emit({
      type: 'input', kind: 'wheel', delta: 100, fresh: true,
      trusted: true, target: 'story'
    });
    expect(currentTransaction(runtime).phase).toBe('playing');
    expect(fixture.counts().frames).toBe(1);
    fixture.emit({ type: 'pagehide', persisted: true });
    expect(fixture.counts().frames).toBe(0);
    disconnect();
  });

  it('disposes in invalidate-pause-dispose-unregister-release order and ignores retired callbacks', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#ph-animation');
    const disconnectA = runtime.connect();
    const authorityA = runtime.getSnapshot().authorityId;
    const { commands } = commandFixture();
    const { reports } = registerCurrentLeaf(runtime, commands);
    const active = runtime.getSnapshot();
    disconnectA();
    expect(fixture.lifecycle.slice(-5)).toEqual([
      'invalidate', 'pause', 'dispose', 'unregister', 'release'
    ]);
    expect(fixture.resources.at(-1)).toEqual({
      videos: 0, activeDecoders: 0, canvases: 0, webglContexts: 0
    });
    reports.reportComplete();
    reports.reportFailure({ code: 'late', message: 'late', recoverable: true });
    expect(runtime.getSnapshot()).toBe(active);

    const disconnectB = runtime.connect();
    expect(runtime.getSnapshot().authorityId).not.toBe(authorityA);
    expect(fixture.resources.at(-1)).toEqual({
      videos: 0, activeDecoders: 0, canvases: 0, webglContexts: 0
    });
    disconnectB();
  });

  it('pauses retained stable resources for backgrounding and rebinds them on recovery', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#pattern');
    const disconnect = runtime.connect();
    const { commands } = commandFixture();
    registerCurrentLeaf(runtime, commands);
    proveCurrent(runtime, fixture);
    fixture.emit({ type: 'pagehide', persisted: true });
    expect(commands.pause).toHaveBeenCalledWith('hidden');
    fixture.emit({ type: 'pageshow', persisted: true });
    expect(commands.rebind).toHaveBeenCalledTimes(2);
    disconnect();
  });

  it('retains a committed media leaf when layout supersedes its recovery generation', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#crane-animation');
    const disconnect = runtime.connect();
    const { commands } = commandFixture();
    registerCurrentLeaf(runtime, commands);
    proveCurrent(runtime, fixture);
    const stableCommit = runtime.getSnapshot().stableCommit;

    fixture.emit({ type: 'pagehide', persisted: true });
    fixture.emit({ type: 'pageshow', persisted: true });
    const firstRecovery = currentTransaction(runtime);
    expect(firstRecovery.mode).toBe('recovery');
    fixture.emit({
      type: 'viewport', change: 'layout',
      viewport: { ...initialViewport(), layoutRevision: 2, visualRevision: 2 }
    });

    const latestRecovery = currentTransaction(runtime);
    expect(latestRecovery.mode).toBe('recovery');
    expect(latestRecovery.attempt.transactionGeneration)
      .toBeGreaterThan(firstRecovery.attempt.transactionGeneration);
    expect(commands.dispose).not.toHaveBeenCalled();
    expect(commands.rebind).toHaveBeenCalledTimes(3);
    proveCurrent(runtime, fixture);
    expect(runtime.getSnapshot().stableCommit).toBe(stableCommit);
    disconnect();
  });

  it('keeps the proven stable leaf as the safe cover when recovery proof fails', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#pattern');
    const disconnect = runtime.connect();
    const { commands } = commandFixture();
    registerCurrentLeaf(runtime, commands);
    proveCurrent(runtime, fixture);
    fixture.emit({
      type: 'viewport', change: 'toolbar',
      viewport: { ...initialViewport(), visualRevision: 2 }
    });
    fixture.flushFrames();
    const recovery = currentTransaction(runtime);
    fixture.send({
      type: 'failure-reported', slot: recovery.requiredPrepared[0]!,
      failure: { code: 'reproof', message: 'reproof failed', recoverable: true }
    });
    expect(runtime.getSnapshot().status).toBe('faulted');
    expect(runtime.getSnapshot().stableCommit?.sceneId).toBe('pattern');
    expect(commands.dispose).not.toHaveBeenCalled();
    expect(commands.pause).toHaveBeenLastCalledWith('rollback');
    runtime.retry();
    expect(currentTransaction(runtime).mode).toBe('recovery');
    disconnect();
  });

  it('aborts a superseded closure load and accepts completion only for the latest attempt', async () => {
    const fixture = createEnvironment();
    const loads: Array<Readonly<{
      resolve(result: PhoneDependencyLoadResult): void; signal: AbortSignal;
    }>> = [];
    const loadDependencies = vi.fn((
      _effect: unknown,
      signal: AbortSignal
    ) => new Promise<PhoneDependencyLoadResult>((resolve) => {
      loads.push({ resolve, signal });
    }));
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#home', origin: 'initial' },
      environment: fixture.port,
      presentation: createPresentationAuthority(),
      ports: { loadDependencies }
    });
    const disconnect = runtime.connect();
    const first = currentTransaction(runtime).attempt;
    runtime.requestEntry({ pathname: '/', hash: '#home', origin: 'programmatic' });
    const latest = currentTransaction(runtime).attempt;
    expect(latest.transactionGeneration).toBeGreaterThan(first.transactionGeneration);
    expect(loadDependencies).toHaveBeenCalledTimes(2);
    expect(loads[0]?.signal.aborted).toBe(true);
    loads[0]?.resolve({ status: 'loaded' });
    await Promise.resolve();
    expect(currentTransaction(runtime).evidence.some(({ slot }) => slot.attempt === first)).toBe(false);
    loads[1]?.resolve({ status: 'loaded' });
    await vi.waitFor(() => expect(currentTransaction(runtime).evidence.some(({ slot }) => (
      slot.kind === 'module-loaded' && slot.attempt === latest
    ))).toBe(true));
    expect(currentTransaction(runtime).evidence.some(({ slot }) => slot.attempt === first)).toBe(false);
    disconnect();
  });

  it('does not cache an abort-aware loader rejection and permits a later reload', async () => {
    const fixture = createEnvironment();
    const signals: AbortSignal[] = [];
    const loadDependencies = vi.fn((
      _effect: unknown,
      signal: AbortSignal
    ) => new Promise<PhoneDependencyLoadResult>((_resolve, reject) => {
      const explicitAbortError = signals.length === 0
        ? Object.assign(new Error('dependency load aborted'), { name: 'AbortError' })
        : null;
      signals.push(signal);
      const rejectForAbort = () => reject(explicitAbortError ?? signal.reason);
      if (signal.aborted) rejectForAbort();
      else signal.addEventListener('abort', rejectForAbort, { once: true });
    }));
    const reportRejectedChunk = vi.fn(async () => 'fail-closed' as const);
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#home', origin: 'initial' },
      environment: fixture.port,
      presentation: createPresentationAuthority(),
      ports: { loadDependencies },
      chunkRecovery: { reportRejectedChunk, markStable: vi.fn() }
    });
    const disconnect = runtime.connect();
    runtime.requestEntry({ pathname: '/', hash: '#brand', origin: 'programmatic' });
    expect(loadDependencies).toHaveBeenCalledTimes(2);
    expect(signals[0]?.aborted).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(reportRejectedChunk).not.toHaveBeenCalled();
    runtime.requestEntry({ pathname: '/', hash: '#home', origin: 'programmatic' });
    expect(loadDependencies).toHaveBeenCalledTimes(3);
    await Promise.resolve();
    await Promise.resolve();
    expect(reportRejectedChunk).not.toHaveBeenCalled();
    disconnect();
  });

  it('caches a native rejection that reaches catch after a same-tick supersede', async () => {
    const fixture = createEnvironment();
    const signals: AbortSignal[] = [];
    const nativeError = new TypeError('Failed to fetch dynamically imported module');
    const loadDependencies = vi.fn((
      _effect: unknown,
      signal: AbortSignal
    ): Promise<PhoneDependencyLoadResult> => {
      signals.push(signal);
      return signals.length === 1
        ? Promise.reject(nativeError)
        : new Promise(() => undefined);
    });
    const reportRejectedChunk = vi.fn(async () => 'fail-closed' as const);
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#home', origin: 'initial' },
      environment: fixture.port,
      presentation: createPresentationAuthority(),
      ports: { loadDependencies },
      chunkRecovery: { reportRejectedChunk, markStable: vi.fn() }
    });
    const disconnect = runtime.connect();
    const retired = currentTransaction(runtime).attempt;
    runtime.requestEntry({ pathname: '/', hash: '#brand', origin: 'programmatic' });
    expect(signals[0]?.aborted).toBe(true);
    await vi.waitFor(() => expect(reportRejectedChunk).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId: retired.transactionId,
        moduleUrl: 'unknown-phone-module',
        reason: nativeError.message
      })
    ));
    runtime.requestEntry({ pathname: '/', hash: '#home', origin: 'programmatic' });
    expect(loadDependencies).toHaveBeenCalledTimes(2);
    expect(runtime.getSnapshot().status).toBe('faulted');
    disconnect();
  });

  it('caches a superseded native import late rejection without reviving stale evidence', async () => {
    const fixture = createEnvironment();
    const loads: Array<Readonly<{
      effect: Extract<PhoneStoryEffect, { type: 'load-dependencies' }>;
      resolve(result: PhoneDependencyLoadResult): void;
      signal: AbortSignal;
    }>> = [];
    const loadDependencies = vi.fn((
      effect: Extract<PhoneStoryEffect, { type: 'load-dependencies' }>,
      signal: AbortSignal
    ) => new Promise<PhoneDependencyLoadResult>((resolve) => {
      loads.push({ effect, resolve, signal });
    }));
    const reportRejectedChunk = vi.fn(async () => 'fail-closed' as const);
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#home', origin: 'initial' },
      environment: fixture.port,
      presentation: createPresentationAuthority(),
      ports: { loadDependencies },
      chunkRecovery: { reportRejectedChunk, markStable: vi.fn() }
    });
    const disconnect = runtime.connect();
    const retired = currentTransaction(runtime).attempt;
    runtime.requestEntry({ pathname: '/', hash: '#brand', origin: 'programmatic' });
    expect(loadDependencies).toHaveBeenCalledTimes(2);
    expect(loads[0]?.signal.aborted).toBe(true);
    const activeAfterSupersede = runtime.getSnapshot();
    const retiredLoad = loads[0];
    if (!retiredLoad) throw new Error('missing retired native import');
    retiredLoad.resolve({
      status: 'rejected',
      dependency: retiredLoad.effect.dependencies[0]!,
      moduleUrl: '/assets/retired-phone-entry.js',
      reason: 'late native import rejection'
    });
    await vi.waitFor(() => expect(reportRejectedChunk).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId: retired.transactionId,
        moduleUrl: '/assets/retired-phone-entry.js'
      })
    ));
    expect(runtime.getSnapshot()).toBe(activeAfterSupersede);
    const beforeRetry = runtime.getSnapshot();
    runtime.requestEntry({ pathname: '/', hash: '#home', origin: 'programmatic' });
    expect(loadDependencies).toHaveBeenCalledTimes(2);
    expect(runtime.getSnapshot()).not.toBe(beforeRetry);
    expect(runtime.getSnapshot().status).toBe('faulted');
    disconnect();
  });

  it('marks only a new semantic stable commit on the frozen recovery port', () => {
    const fixture = createEnvironment();
    const recovery = {
      reportRejectedChunk: vi.fn(async () => 'fail-closed' as const),
      markStable: vi.fn()
    };
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#education', origin: 'initial' },
      environment: fixture.port,
      presentation: createPresentationAuthority(),
      chunkRecovery: recovery
    });
    const disconnect = runtime.connect();
    proveCurrent(runtime, fixture);
    expect(recovery.markStable).toHaveBeenCalledTimes(1);
    fixture.emit({
      type: 'viewport', change: 'toolbar',
      viewport: { ...initialViewport(), visualRevision: 2 }
    });
    fixture.flushFrames();
    proveCurrent(runtime, fixture);
    expect(recovery.markStable).toHaveBeenCalledTimes(1);
    expect(Object.isFrozen(recovery)).toBe(true);
    disconnect();
  });

  it('routes a native dependency rejection through the frozen recovery port without same-Document retry', async () => {
    const fixture = createEnvironment();
    const loadDependencies = vi.fn(async () => {
      throw new Error('native import rejected');
    });
    const reportRejectedChunk = vi.fn(async () => 'fail-closed' as const);
    const markStable = vi.fn();
    const recovery = { reportRejectedChunk, markStable };
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#home', origin: 'initial' },
      environment: fixture.port,
      presentation: createPresentationAuthority(),
      ports: { loadDependencies },
      chunkRecovery: recovery
    });
    const disconnect = runtime.connect();
    await vi.waitFor(() => expect(reportRejectedChunk).toHaveBeenCalledTimes(1));
    expect(loadDependencies).toHaveBeenCalledTimes(1);
    runtime.retry();
    await Promise.resolve();
    expect(loadDependencies).toHaveBeenCalledTimes(1);
    expect(Object.isFrozen(recovery)).toBe(true);
    disconnect();
  });

  it('poisons only a second leg native rejection and reloads its stable source rollback', async () => {
    const fixture = createEnvironment();
    const reportRejectedChunk = vi.fn(async () => 'fail-closed' as const);
    const loadDependencies = vi.fn(async (effect: Extract<PhoneStoryEffect, {
      type: 'load-dependencies'
    }>) => effect.attempt.mode === 'segment'
      && effect.attempt.segmentId === 'star-map-aod'
      ? {
          status: 'rejected' as const,
          dependency: 'transition:star-map-aod' as const,
          moduleUrl: '/assets/star-map-aod.js',
          reason: 'native transition import rejected'
        }
      : { status: 'loaded' as const });
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#pattern', origin: 'initial' },
      environment: fixture.port,
      presentation: createPresentationAuthority(),
      ports: { loadDependencies },
      chunkRecovery: { reportRejectedChunk, markStable: vi.fn() }
    } as Parameters<typeof createPhoneStoryRuntime>[0]);
    const disconnect = runtime.connect();
    await vi.waitFor(() => expect(currentTransaction(runtime).evidence.some(({ slot }) => (
      slot.kind === 'module-loaded'
    ))).toBe(true));
    proveCurrent(runtime, fixture);
    fixture.emit({
      type: 'input', kind: 'wheel', delta: 100, fresh: true,
      trusted: true, target: 'story'
    });
    await vi.waitFor(() => expect(currentTransaction(runtime).evidence.some(({ slot }) => (
      slot.kind === 'module-loaded'
    ))).toBe(true));
    proveCurrent(runtime, fixture);
    expect(runtime.getSnapshot().stableCommit?.sceneId).toBe('star-map');
    fixture.emit({
      type: 'input', kind: 'wheel', delta: 100, fresh: true,
      trusted: true, target: 'story'
    });
    fixture.emit({
      type: 'input', kind: 'wheel', delta: 100, fresh: true,
      trusted: true, target: 'story'
    });
    await vi.waitFor(() => expect(currentTransaction(runtime).mode).toBe('rollback'));
    await vi.waitFor(() => expect(currentTransaction(runtime).evidence.some(({ slot }) => (
      slot.kind === 'module-loaded'
    ))).toBe(true));
    proveCurrent(runtime, fixture);
    expect(runtime.getSnapshot().status).toBe('stable');
    expect(runtime.getSnapshot().stableCommit?.sceneId).toBe('star-map');
    expect(reportRejectedChunk).toHaveBeenCalledWith(expect.objectContaining({
      moduleUrl: '/assets/star-map-aod.js'
    }));
    disconnect();
  });

  it.each(['pause', 'dispose', 'lease-release', 'dependencies'] as const)(
    'finishes every disconnect cleanup step before aggregating a %s failure',
    (failurePoint) => {
      const fixture = createEnvironment();
      const pause = vi.fn(() => {
        if (failurePoint === 'pause') throw new Error('pause cleanup failed');
      });
      const dispose = vi.fn(() => {
        if (failurePoint === 'dispose') throw new Error('dispose cleanup failed');
      });
      const baseCommands = commandFixture().commands;
      const commands: PhoneLeafCommandHandle = { ...baseCommands, pause, dispose };
      const release = vi.fn(() => {
        if (failurePoint === 'lease-release') throw new Error('lease release failed');
      });
      const authority = createPresentationAuthority();
      const presentation: PhonePresentation = {
        ...authority,
        registerLeafMount: (request) => ({
          ...authority.registerLeafMount(request),
          release
        })
      };
      const releaseDependencies = vi.fn(() => {
        if (failurePoint === 'dependencies') throw new Error('dependency release failed');
      });
      const runtime = createPhoneStoryRuntime({
        initialEntry: { pathname: '/', hash: '#ph-animation', origin: 'initial' },
        environment: fixture.port,
        presentation,
        ports: {
          loadDependencies: async () => ({ status: 'loaded' }),
          releaseDependencies
        }
      });
      const disconnect = runtime.connect();
      registerCurrentLeaf(runtime, commands);
      expect(disconnect).toThrow(AggregateError);
      expect(pause).toHaveBeenCalledTimes(1);
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledTimes(1);
      expect(releaseDependencies).toHaveBeenCalledTimes(1);
      expect(fixture.counts()).toEqual({ listeners: 0, timers: 0, frames: 0 });
      expect(fixture.resources.at(-1)).toEqual({
        videos: 0, activeDecoders: 0, canvases: 0, webglContexts: 0
      });
    }
  );
});
