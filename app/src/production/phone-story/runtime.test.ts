import { describe, expect, it, vi } from 'vitest';

import {
  createPhoneStoryRuntime,
  segmentEndpoint,
  phoneReadingEdges,
  type PhoneDependencyLoadResult,
  type PhoneRuntimeHostEvent,
  type PhoneRuntimeLifecycleStep,
  type PhoneRuntimeResourceCounts,
  type PhoneRuntimeTimerHandle,
  type PhoneStoryRuntime,
  type PhoneStoryRuntimeEnvironment
} from './runtime';
import { phoneTransactionActivationSurfaceIds } from './machine';
import { phoneManifest, phoneSceneById, phoneSegmentChoreographyFrame } from './manifest';
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

describe('phone native reading edge contract', () => {
  it('derives both reading edges from the document scroll owner rather than viewport proxies', () => {
    expect(phoneReadingEdges({ scrollTop: 0, clientHeight: 714, scrollHeight: 1_677 }))
      .toEqual({ top: true, bottom: false });
    expect(phoneReadingEdges({ scrollTop: 963, clientHeight: 714, scrollHeight: 1_677 }))
      .toEqual({ top: false, bottom: true });
  });

  it('starts one Method-bottom Figure2 transaction after the fresh edge handoff', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#method-top');
    const disconnect = runtime.connect();
    proveCurrent(runtime, fixture);
    const stable = runtime.getSnapshot();
    expect(stable.status).toBe('stable');
    expect(stable.stableCommit?.sceneId).toBe('method-top');

    fixture.emit({
      type: 'input', kind: 'touch', delta: 300, fresh: true,
      trusted: true, target: 'story'
    });

    expect(currentTransaction(runtime)).toMatchObject({
      mode: 'segment', sourceSceneId: 'method-top', candidateSceneId: 'figure2-animation',
      attempt: { segmentId: 'method-bottom-figure2', direction: 'forward' }
    });
    expect(fixture.effects).not.toContainEqual(expect.objectContaining({
      type: 'show-activation-cta'
    }));
    expect(runtime.getSnapshot().stableCommit).toBe(stable.stableCommit);
    disconnect();
  });
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

function createEnvironment(reducedMotion = false): EnvironmentFixture {
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
    readReducedMotion: () => reducedMotion,
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
        isAttached: () => true,
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
    applyTransitionFrame: () => undefined,
    commitStablePlane: () => undefined,
    refreshStableViewport: () => undefined,
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
  return transaction.activation === 'offered';
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
    'applyPlane' | 'verifyVisibleCandidate' | 'verifyReproject' | 'verifyRollback'
    | 'refreshStableViewport'>> = {},
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
      registerCurrentLeaf(runtime, commandFixture().commands);
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

  it('coalesces toolbar samples and refreshes stable geometry without reopening a transaction', () => {
    const fixture = createEnvironment();
    const refreshStableViewport = vi.fn();
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#education', origin: 'initial' },
      environment: fixture.port,
      presentation: createProjectorAuthority(
        { refreshStableViewport }, fixture.port.readViewport
      )
    });
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
    const refreshed = runtime.getSnapshot();
    expect(refreshed.status).toBe('stable');
    expect(refreshed.viewport).toEqual(latest);
    if (refreshed.status !== 'stable') throw new Error('expected stable');
    expect(refreshed.stableCommit).toBe(commit);
    expect(refreshed.stableCommit.commitSequence).toBe(commit.commitSequence);
    expect(refreshed.presentationProof).toBe(proof);
    expect(refreshed.input).toBe(stable.input);
    expect(refreshStableViewport).toHaveBeenCalledTimes(1);
    expect(refreshStableViewport.mock.calls[0]?.[0]).toEqual(latest);
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
    setMediaPhase: vi.fn(),
    settle: vi.fn(),
    pause: vi.fn(),
    dispose: vi.fn()
  };
  return { commands, rebindings };
}

function installDeprecatedStaticPrepare(commands: PhoneLeafCommandHandle) {
  const prepare = vi.fn(() => ({ invoked: true }));
  Object.defineProperty(commands, 'prepare', {
    configurable: true,
    value: prepare
  });
  return prepare;
}

describe('phone runtime projector bridge', () => {
  it('settles each segment at its real forward or reverse transaction endpoint', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#pattern');
    const disconnect = runtime.connect();
    proveCurrent(runtime, fixture);
    fixture.emit({
      type: 'input', kind: 'wheel', delta: 100, fresh: true,
      trusted: true, target: 'story'
    });
    const active = currentTransaction(runtime);
    const forwardEnd = { ...active, progress: 1 };
    const reverseEnd = {
      ...active,
      progress: 0,
      attempt: { ...active.attempt, direction: 'reverse' as const }
    };
    expect(segmentEndpoint(forwardEnd, 'source')).toBe(1);
    expect(segmentEndpoint(reverseEnd, 'target')).toBe(0);
    expect(segmentEndpoint({ ...reverseEnd, progress: 1 }, 'target')).toBe(1);
    disconnect();
  });

  it('covers direction-aware endpoints across the complete segment table', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#pattern');
    const disconnect = runtime.connect();
    proveCurrent(runtime, fixture);
    fixture.emit({ type: 'input', kind: 'wheel', delta: 100, fresh: true,
      trusted: true, target: 'story' });
    const seed = currentTransaction(runtime);
    for (const segment of phoneManifest.segments) for (const direction of ['forward', 'reverse'] as const) {
      const endProgress = direction === 'forward' ? 1 : 0;
      const transaction = { ...seed, mode: 'segment' as const, progress: endProgress,
        attempt: { ...seed.attempt, segmentId: segment.id, direction } };
      const frame = phoneSegmentChoreographyFrame(segment.id, endProgress, direction);
      expect(segmentEndpoint(transaction, 'source')).toBe(frame.sourceProgress >= .5 ? 1 : 0);
      expect(segmentEndpoint(transaction, 'target')).toBe(frame.targetProgress >= .5 ? 1 : 0);
    }
    disconnect();
  });

  it('drops a stale arch failure instead of faulting the newer transaction', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#home');
    const disconnect = runtime.connect();
    const oldAttempt = currentTransaction(runtime).attempt;
    proveCurrent(runtime, fixture);
    runtime.requestEntry({ pathname: '/', hash: '#figure2-proof', origin: 'menu' });
    const active = currentTransaction(runtime);
    runtime.reportPresentationFailure({
      surfaceId: 'figure2-foreground-arch', attempt: oldAttempt,
      generation: oldAttempt.transactionGeneration,
      failure: { code: 'stale-arch', message: 'stale', recoverable: true }
    });
    expect(currentTransaction(runtime).failure).toBeNull();
    runtime.reportPresentationFailure({
      surfaceId: 'figure2-foreground-arch', attempt: active.attempt,
      generation: active.attempt.transactionGeneration,
      failure: { code: 'current-arch', message: 'current', recoverable: true }
    });
    expect(currentTransaction(runtime).failure?.code).toBe('current-arch');
    disconnect();
  });

  it('projects a retained Proof source to its closing frame before Brand preparation', async () => {
    const fixture = createEnvironment();
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#figure2-proof', origin: 'initial' },
      environment: fixture.port,
      presentation: createPresentationAuthority(),
      ports: { loadDependencies: async () => ({ status: 'loaded' as const }) }
    });
    const disconnect = runtime.connect();
    const source = commandFixture();
    registerCurrentLeaf(runtime, source.commands);
    proveCurrent(runtime, fixture);
    fixture.emit({
      type: 'input', kind: 'wheel', delta: 100, fresh: true,
      trusted: true, target: 'story'
    });
    await vi.waitFor(() => expect(source.commands.render).toHaveBeenCalledWith(1));
    expect(currentTransaction(runtime).attempt.segmentId).toBe('figure2-proof-brand');
    disconnect();
  });

  it('holds a cold Hero at zero until Loader exit starts the one visible entrance', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#home');
    const disconnect = runtime.connect();
    const hero = commandFixture();
    registerCurrentLeaf(runtime, hero.commands);
    proveCurrent(runtime, fixture);
    expect(hero.commands.settle).toHaveBeenLastCalledWith(0);
    runtime.startVisibleEntrance();
    runtime.startVisibleEntrance();
    expect(hero.commands.settle).toHaveBeenLastCalledWith(1);
    expect(hero.commands.settle).toHaveBeenCalledTimes(2);
    disconnect();
  });

  it('maps one reducer progress into distinct endpoint, effect, and plane channels', () => {
    const fixture = createEnvironment();
    const applyTransitionFrame = vi.fn();
    const presentation = {
      ...createPresentationAuthority(fixture.port.readViewport),
      applyTransitionFrame
    } as PhonePresentation;
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#home', origin: 'initial' },
      environment: fixture.port,
      presentation
    });
    const disconnect = runtime.connect();
    const source = commandFixture();
    registerCurrentLeaf(runtime, source.commands);
    proveCurrent(runtime, fixture);
    fixture.emit({
      type: 'input', kind: 'wheel', delta: 100, fresh: true,
      trusted: true, target: 'story'
    });
    const target = commandFixture();
    registerCurrentLeaf(runtime, target.commands);
    const effect = commandFixture();
    vi.mocked(effect.commands.render).mockImplementation(() => ({
      ownership: {
        revealClip: 'circle(10px)',
        concealMask: 'radial-gradient(circle, transparent, #000)'
      }
    }) as never);
    registerCurrentEffect(runtime, effect.commands);
    reachPlaying(runtime, fixture);
    fixture.advance(1500);
    fixture.flushFrames();

    expect(source.commands.render).toHaveBeenLastCalledWith(1);
    expect(target.commands.render).toHaveBeenLastCalledWith(0);
    expect(source.commands.setMediaPhase).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'playing', direction: 'forward', stageIndex: 0
    }));
    expect(effect.commands.render).toHaveBeenLastCalledWith(expect.any(Number));
    expect(vi.mocked(effect.commands.render).mock.calls.at(-1)?.[0]).toBeGreaterThan(0);
    expect(applyTransitionFrame).toHaveBeenLastCalledWith({
      sourceOpacity: 1,
      targetOpacity: 1,
      direction: 'forward',
      foregroundOwner: 'target',
      ownership: {
        revealClip: 'circle(10px)',
        concealMask: 'radial-gradient(circle, transparent, #000)'
      }
    });
    const playingAttempt = currentTransaction(runtime).attempt;
    fixture.send({ type: 'transition-completed', attempt: playingAttempt });
    expect(source.commands.setMediaPhase).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'held', endpoint: 1, direction: 'forward'
    }));
    disconnect();
  });

  it('clears a live choreography before a failed segment enters rollback', () => {
    const fixture = createEnvironment();
    const applyTransitionFrame = vi.fn();
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#home', origin: 'initial' },
      environment: fixture.port,
      presentation: {
        ...createPresentationAuthority(fixture.port.readViewport),
        applyTransitionFrame
      } as PhonePresentation
    });
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
    expect(applyTransitionFrame).toHaveBeenCalledWith(expect.objectContaining({
      direction: 'forward'
    }));
    const active = currentTransaction(runtime);
    fixture.send({
      type: 'failure-reported',
      slot: active.requiredPrepared[0]!,
      failure: { code: 'fixture-frame', message: 'fixture', recoverable: true }
    });
    expect(currentTransaction(runtime).mode).toBe('rollback');
    expect(applyTransitionFrame).not.toHaveBeenCalledWith(null);
    disconnect();
  });

  it('keeps the final Ink projection through target presentation until stable commit', () => {
    const fixture = createEnvironment();
    const applyTransitionFrame = vi.fn();
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#home', origin: 'initial' },
      environment: fixture.port,
      presentation: { ...createPresentationAuthority(fixture.port.readViewport), applyTransitionFrame } as PhonePresentation
    });
    const disconnect = runtime.connect();
    registerCurrentLeaf(runtime, commandFixture().commands);
    proveCurrent(runtime, fixture);
    fixture.emit({ type: 'input', kind: 'wheel', delta: 100, fresh: true, trusted: true, target: 'story' });
    registerCurrentLeaf(runtime, commandFixture().commands);
    registerCurrentEffect(runtime, commandFixture().commands);
    reachPlaying(runtime, fixture);
    applyTransitionFrame.mockClear();
    const playing = currentTransaction(runtime);
    fixture.send({ type: 'transition-completed', attempt: playing.attempt });
    expect(applyTransitionFrame).not.toHaveBeenCalledWith(null);
    proveCurrent(runtime, fixture);
    expect(runtime.getSnapshot().status).toBe('stable');
    expect(applyTransitionFrame).not.toHaveBeenCalledWith(null);
    disconnect();
  });

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
      leg: 'target', sceneId: 'pattern'
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

  it('refreshes stable geometry with runtime-sampled live toolbar viewport', () => {
    const fixture = createEnvironment();
    const verifyReproject = vi.fn(exactPlaneResult);
    const refreshStableViewport = vi.fn();
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#education', origin: 'initial' },
      environment: fixture.port,
      presentation: createProjectorAuthority(
        { verifyReproject, refreshStableViewport }, fixture.port.readViewport
      )
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
    expect(refreshStableViewport).toHaveBeenCalledTimes(1);
    expect(refreshStableViewport.mock.calls[0]?.[0]).toEqual(live);
    expect(verifyReproject).not.toHaveBeenCalled();
    expect(runtime.getSnapshot().status).toBe('stable');
    disconnect();
  });

  it('retries a transient reproject coverage miss inside the bounded reproof deadline', () => {
    const fixture = createEnvironment();
    const verifyReproject = vi.fn()
      .mockReturnValueOnce({
        records: [],
        failure: {
          code: 'presentation-coverage-invalid',
          message: 'dynamic layout geometry is still settling',
          recoverable: true
        }
      })
      .mockImplementation(exactPlaneResult);
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#education', origin: 'initial' },
      environment: fixture.port,
      presentation: createProjectorAuthority({ verifyReproject }, fixture.port.readViewport)
    });
    const disconnect = runtime.connect();
    proveCurrent(runtime, fixture);
    fixture.flushFrames();
    const shifted: PhoneViewportSnapshot = {
      ...initialViewport(),
      visual: { offsetLeft: 0, offsetTop: 153, width: 390, height: 753, scale: 1 },
      visualRevision: 2
    };
    fixture.emit({ type: 'viewport', change: 'layout', viewport: shifted });
    prepareCurrentPlane(runtime, fixture);
    fixture.flushFrames();
    expect(verifyReproject).toHaveBeenCalledTimes(1);
    expect(runtime.getSnapshot().status).toBe('transaction');
    expect(currentTransaction(runtime).deadline?.operation).toBe('planeApply');
    expect(fixture.counts().frames).toBe(1);
    fixture.flushFrames();
    expect(verifyReproject).toHaveBeenCalledTimes(2);
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
  it('prewarms both manifest-adjacent closures while stable without mounting or activating them', async () => {
    const fixture = createEnvironment();
    const prewarmDependencies = vi.fn(async () => ({ status: 'loaded' as const }));
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#star-map', origin: 'initial' },
      environment: fixture.port,
      presentation: createPresentationAuthority(),
      ports: { prewarmDependencies }
    });
    const disconnect = runtime.connect();
    registerCurrentLeaf(runtime, commandFixture().commands);
    proveCurrent(runtime, fixture);
    await vi.waitFor(() => expect(prewarmDependencies).toHaveBeenCalledTimes(1));
    expect(prewarmDependencies).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'load-dependencies',
        dependencies: expect.arrayContaining([
          'transition:pattern-star-map', 'scene:pattern',
          'transition:star-map-aod', 'scene:aod-animation',
          'media:aod-figure-packed'
        ])
      }),
      expect.any(AbortSignal)
    );
    expect(runtime.getSnapshot()).toMatchObject({
      status: 'stable', stableCommit: { sceneId: 'star-map' }
    });
    disconnect();
  });

  it('reports an actual prewarm rejection through chunk recovery without faulting the committed scene', async () => {
    const fixture = createEnvironment();
    const reportRejectedChunk = vi.fn(async () => 'reloading' as const);
    const prewarmDependencies = vi.fn(async (
      effect: Extract<PhoneStoryEffect, { type: 'load-dependencies' }>
    ) => ({
      status: 'rejected' as const,
      dependency: effect.dependencies.find((dependency) => dependency.startsWith('scene:'))!,
      moduleUrl: '/assets/prewarm-rejected.js',
      reason: 'prewarm native import rejected'
    }));
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#star-map', origin: 'initial' },
      environment: fixture.port,
      presentation: createPresentationAuthority(),
      ports: { prewarmDependencies },
      chunkRecovery: { reportRejectedChunk, markStable: vi.fn() }
    });
    const disconnect = runtime.connect();
    registerCurrentLeaf(runtime, commandFixture().commands);
    proveCurrent(runtime, fixture);
    await vi.waitFor(() => expect(reportRejectedChunk).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleUrl: '/assets/prewarm-rejected.js',
        reason: 'prewarm native import rejected'
      })
    ));
    expect(runtime.getSnapshot()).toMatchObject({
      status: 'stable', stableCommit: { sceneId: 'star-map' }
    });
    disconnect();
  });

  it('exposes a prewarm fail-closed result when the cached segment is attempted', async () => {
    const fixture = createEnvironment();
    const reportRejectedChunk = vi.fn(async () => 'fail-closed' as const);
    const loadDependencies = vi.fn(async () => ({ status: 'loaded' as const }));
    const prewarmDependencies = vi.fn(async (
      effect: Extract<PhoneStoryEffect, { type: 'load-dependencies' }>
    ) => ({
      status: 'rejected' as const,
      dependency: effect.dependencies.find((dependency) => dependency === 'transition:star-map-aod')!,
      moduleUrl: '/assets/prewarm-rejected.js',
      reason: 'prewarm native import rejected'
    }));
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#star-map', origin: 'initial' },
      environment: fixture.port,
      presentation: createPresentationAuthority(),
      ports: { loadDependencies, prewarmDependencies },
      chunkRecovery: { reportRejectedChunk, markStable: vi.fn() }
    });
    const disconnect = runtime.connect();
    registerCurrentLeaf(runtime, commandFixture().commands);
    proveCurrent(runtime, fixture);
    await vi.waitFor(() => expect(reportRejectedChunk).toHaveBeenCalledTimes(1));

    fixture.emit({
      type: 'input', kind: 'wheel', delta: 100, fresh: true,
      trusted: true, target: 'story'
    });
    await vi.waitFor(() => expect(currentTransaction(runtime).mode).toBe('rollback'));
    proveCurrent(runtime, fixture);
    await vi.waitFor(() => expect(runtime.getSnapshot().status).toBe('faulted'));
    expect(reportRejectedChunk).toHaveBeenCalledTimes(2);
    const faulted = runtime.getSnapshot();
    if (faulted.status !== 'faulted') throw new Error('expected controlled recovery fault');
    expect(faulted.stableCommit?.sceneId).toBe('star-map');
    expect(faulted.fault.code).toBe('module-load-rejected');
    disconnect();
  });

  it('keeps static Star-to-AOD arrival out of the touch activation path', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#star-map');
    const disconnect = runtime.connect();
    registerCurrentLeaf(runtime, commandFixture().commands);
    proveCurrent(runtime, fixture);
    fixture.emit({
      type: 'input', kind: 'touch', delta: 300, fresh: true,
      trusted: true, target: 'story'
    });
    const started = currentTransaction(runtime);
    expect(started).toMatchObject({
      phase: 'preparing', candidateSceneId: 'aod-animation'
    });
    const target = commandFixture();
    const deprecatedPrepare = installDeprecatedStaticPrepare(target.commands);
    registerCurrentLeaf(runtime, target.commands);
    registerCurrentEffect(runtime, commandFixture().commands);
    expect(deprecatedPrepare).not.toHaveBeenCalled();
    let preparedBeforeTouchEnd = false;
    for (let index = 0; index < 40; index += 1) {
      const transaction = currentTransaction(runtime);
      const missing = transaction.requiredPrepared.find((slot) => (
        !transaction.evidence.some((record) => record.slot === slot)
      ));
      if (!missing) {
        preparedBeforeTouchEnd = true;
        break;
      }
      reportSlot(fixture, missing);
    }
    expect(preparedBeforeTouchEnd).toBe(true);
    expect(currentTransaction(runtime)).toMatchObject({
      phase: 'presenting-source', activation: 'none'
    });
    expect(target.commands.activate).not.toHaveBeenCalled();
    fixture.emit({ type: 'activation', trusted: true });
    const afterTouchEnd = currentTransaction(runtime);
    expect(afterTouchEnd.attempt.transactionGeneration)
      .toBe(started.attempt.transactionGeneration);
    expect(afterTouchEnd.claimedPhysicalEpoch).toBe(started.claimedPhysicalEpoch);
    expect(afterTouchEnd.activation).toBe('none');
    expect(target.commands.activate).not.toHaveBeenCalled();
    expect(fixture.effects.filter((effect) => (
      effect.type === 'show-activation-cta' && effect.attempt.mode === 'segment'
    ))).toEqual([]);
    disconnect();
  });

  it('uses Method-to-Figure2 poster proof without touching a deprecated video preparation seam', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#method-top');
    const disconnect = runtime.connect();
    registerCurrentLeaf(runtime, commandFixture().commands);
    proveCurrent(runtime, fixture);
    fixture.emit({
      type: 'input', kind: 'touch', delta: 300, fresh: true,
      trusted: true, target: 'story'
    });
    expect(currentTransaction(runtime)).toMatchObject({
      phase: 'preparing', candidateSceneId: 'figure2-animation'
    });
    const target = commandFixture();
    const deprecatedPrepare = installDeprecatedStaticPrepare(target.commands);
    registerCurrentLeaf(runtime, target.commands);
    registerCurrentEffect(runtime, commandFixture().commands);

    expect(deprecatedPrepare).not.toHaveBeenCalled();
    expect(target.commands.activate).not.toHaveBeenCalled();
    const transaction = currentTransaction(runtime);
    expect(transaction.activation).toBe('none');
    expect(phoneTransactionActivationSurfaceIds(transaction)).toEqual([]);
    disconnect();
  });

  it('activates incoming owner media as soon as the reverse target mounts', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#pattern');
    const disconnect = runtime.connect();
    registerCurrentLeaf(runtime, commandFixture().commands);
    proveCurrent(runtime, fixture);
    fixture.emit({
      type: 'input', kind: 'touch', delta: -300, fresh: true,
      trusted: true, target: 'story'
    });
    expect(currentTransaction(runtime)).toMatchObject({
      phase: 'preparing', candidateSceneId: 'hero',
      attempt: { segmentId: 'hero-pattern', direction: 'reverse' },
      activation: 'offered'
    });
    const target = commandFixture();
    const deprecatedPrepare = installDeprecatedStaticPrepare(target.commands);
    registerCurrentLeaf(runtime, target.commands);
    registerCurrentEffect(runtime, commandFixture().commands);

    expect(deprecatedPrepare).not.toHaveBeenCalled();
    expect(target.commands.activate).toHaveBeenCalledTimes(1);
    expect(target.commands.activate).toHaveBeenLastCalledWith(expect.objectContaining({
      credit: 'direct-muted-autoplay', surfaceIds: ['hero-figure-video']
    }));
    expect(currentTransaction(runtime).activation).toBe('spent');
    disconnect();
  });

  it('primes incoming PH without granting the playback clock', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#lab');
    const disconnect = runtime.connect();
    registerCurrentLeaf(runtime, commandFixture().commands);
    proveCurrent(runtime, fixture);
    fixture.emit({
      type: 'input', kind: 'touch', delta: 300, fresh: true,
      trusted: true, target: 'story'
    });
    expect(currentTransaction(runtime)).toMatchObject({
      candidateSceneId: 'ph-animation', activation: 'offered'
    });
    const target = commandFixture();
    registerCurrentLeaf(runtime, target.commands);
    registerCurrentEffect(runtime, commandFixture().commands);
    expect(target.commands.activate).toHaveBeenCalledWith(expect.objectContaining({
      credit: 'direct-muted-autoplay',
      surfaceIds: ['ph-figure-video']
    }));
    disconnect();
  });

  it('rejects an incomplete physical-epoch activation immediately instead of deferring it', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#home');
    const disconnect = runtime.connect();
    proveCurrent(runtime, fixture);

    fixture.emit({
      type: 'input', kind: 'touch', delta: 300, fresh: true,
      trusted: true, target: 'story'
    });

    expect(currentTransaction(runtime)).toMatchObject({
      mode: 'rollback', phase: 'rolling-back', candidateSceneId: 'hero'
    });
    expect(fixture.effects.filter((effect) => (
      effect.type === 'show-activation-cta' && effect.attempt.mode === 'segment'
    ))).toEqual([]);
    disconnect();
  });

  it('defers direct muted autoplay until the receiver mounts once, then rolls back without a CTA', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#pattern');
    const disconnect = runtime.connect();
    registerCurrentLeaf(runtime, commandFixture().commands);
    proveCurrent(runtime, fixture);
    fixture.emit({
      type: 'input', kind: 'touch', delta: -300, fresh: true,
      trusted: true, target: 'story'
    });
    expect(currentTransaction(runtime)).toMatchObject({
      mode: 'segment', candidateSceneId: 'hero', activation: 'offered'
    });

    const target = commandFixture(() => false);
    registerCurrentLeaf(runtime, target.commands);

    expect(target.commands.activate).toHaveBeenCalledTimes(1);
    expect(target.commands.activate).toHaveBeenLastCalledWith(expect.objectContaining({
      credit: 'direct-muted-autoplay',
      surfaceIds: ['hero-figure-video']
    }));
    expect(currentTransaction(runtime)).toMatchObject({
      mode: 'rollback', phase: 'rolling-back'
    });
    expect(fixture.effects.filter((effect) => (
      effect.type === 'show-activation-cta' && effect.attempt.mode === 'segment'
    ))).toEqual([]);
    disconnect();
  });

  it('gives the departing media clock to the source within the same touch epoch', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#crane-animation');
    const disconnect = runtime.connect();
    const source = commandFixture();
    registerCurrentLeaf(runtime, source.commands);
    proveCurrent(runtime, fixture);
    vi.mocked(source.commands.activate).mockClear();
    fixture.emit({
      type: 'input', kind: 'touch', delta: 300, fresh: true,
      trusted: true, target: 'story'
    });
    registerCurrentLeaf(runtime, commandFixture().commands);
    registerCurrentEffect(runtime, commandFixture().commands);
    expect(source.commands.activate).toHaveBeenCalledTimes(1);
    expect(source.commands.activate).toHaveBeenLastCalledWith(expect.objectContaining({
      surfaceIds: ['crane-figure-video', 'crane-flock-video']
    }));
    disconnect();
  });

  it('consumes a completed Hero-to-Pattern touch epoch through Hero before Pattern proof', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#home');
    const disconnect = runtime.connect();
    const hero = commandFixture();
    registerCurrentLeaf(runtime, hero.commands);
    proveCurrent(runtime, fixture);
    vi.mocked(hero.commands.activate).mockClear();

    fixture.emit({
      type: 'input', kind: 'touch', delta: 300, fresh: true,
      trusted: true, target: 'story'
    });
    expect(currentTransaction(runtime)).toMatchObject({
      phase: 'preparing', candidateSceneId: 'pattern',
      attempt: { segmentId: 'hero-pattern', direction: 'forward' },
      activation: 'spent'
    });

    const pattern = commandFixture();
    registerCurrentLeaf(runtime, pattern.commands);
    registerCurrentEffect(runtime, commandFixture().commands);
    expect(pattern.commands.activate).not.toHaveBeenCalled();

    expect(hero.commands.activate).toHaveBeenCalledTimes(1);
    expect(hero.commands.activate).toHaveBeenLastCalledWith(expect.objectContaining({
      credit: 'physical-epoch', surfaceIds: ['hero-figure-video']
    }));
    expect(currentTransaction(runtime)).toMatchObject({
      phase: 'preparing', activation: 'spent'
    });

    proveCurrent(runtime, fixture);
    expect(runtime.getSnapshot()).toMatchObject({
      status: 'stable', stableCommit: { sceneId: 'pattern' }
    });
    disconnect();
  });

  it('accepts a causal frame reported synchronously from command rebind', () => {
    const fixture = createEnvironment();
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#hero', origin: 'initial' },
      environment: fixture.port,
      presentation: createFrameProofPresentationAuthority()
    });
    const disconnect = runtime.connect();
    const canvasSurface = phoneSceneById('hero').frame.surfaceIds[0]!;
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
      isAttached: () => true,
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
          target.directEntry.mediaActivation.requiresPhysicalCredit ? 1 : 0
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

  it('rolls back a rejected continuous activation and lets the next fresh gesture retry', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#figure3-animation');
    const disconnect = runtime.connect();
    const source = commandFixture((call) => call !== 2);
    registerCurrentLeaf(runtime, source.commands);
    proveCurrent(runtime, fixture);

    fixture.emit({
      type: 'input', kind: 'keyboard', key: 'ArrowDown', fresh: true,
      trusted: true, target: 'story'
    });
    expect(currentTransaction(runtime)).toMatchObject({
      mode: 'rollback', candidateSceneId: 'figure3-animation'
    });
    expect(fixture.effects.filter((effect) => (
      effect.type === 'show-activation-cta' && effect.attempt.mode === 'segment'
    ))).toEqual([]);
    expect(source.commands.activate).toHaveBeenCalledTimes(2);

    proveCurrent(runtime, fixture);
    expect(runtime.getSnapshot()).toMatchObject({
      status: 'stable', stableCommit: { sceneId: 'figure3-animation' }
    });
    fixture.emit({
      type: 'input', kind: 'keyboard', key: 'ArrowDown', fresh: true,
      trusted: true, target: 'story'
    });
    expect(currentTransaction(runtime)).toMatchObject({
      mode: 'segment', candidateSceneId: 'services', activation: 'spent'
    });
    expect(source.commands.activate).toHaveBeenCalledTimes(3);
    disconnect();
  });

  it('keeps direct AOD poster entry out of autoplay and CTA recovery', async () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#aod-animation');
    const disconnect = runtime.connect();
    const { commands } = commandFixture();
    registerCurrentLeaf(runtime, commands);
    expect(commands.activate).not.toHaveBeenCalled();
    expect(currentTransaction(runtime)).toMatchObject({
      candidateSceneId: 'aod-animation', activation: 'none'
    });
    expect(fixture.effects).not.toContainEqual(expect.objectContaining({
      type: 'show-activation-cta', enabled: true
    }));
    disconnect();
  });

  it('keeps Figure2 direct entry on muted autoplay, then gates CTA after rejection', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#figure2-animation');
    const disconnect = runtime.connect();
    const direct = commandFixture((call) => call > 1);
    expect(fixture.effects).not.toContainEqual(expect.objectContaining({
      type: 'show-activation-cta', enabled: true
    }));

    registerCurrentLeaf(runtime, direct.commands);

    expect(direct.commands.activate).toHaveBeenCalledTimes(1);
    expect(direct.commands.activate).toHaveBeenLastCalledWith(expect.objectContaining({
      credit: 'direct-muted-autoplay', surfaceIds: ['figure2-pair-video']
    }));
    expect(currentTransaction(runtime)).toMatchObject({
      phase: 'awaiting-media-activation', activation: 'awaiting', retainedTopology: true
    });
    expect(fixture.effects).toContainEqual(expect.objectContaining({
      type: 'show-activation-cta', enabled: true
    }));
    disconnect();
  });

  it('keeps reduced-motion Figure2 direct entry on static proof without autoplay or CTA', () => {
    const fixture = createEnvironment(true);
    const runtime = createRuntime(fixture, '#figure2-animation');
    const disconnect = runtime.connect();
    const direct = commandFixture();

    registerCurrentLeaf(runtime, direct.commands);

    expect(currentTransaction(runtime).reducedMotion).toBe(true);
    expect(direct.commands.activate).not.toHaveBeenCalled();
    expect(fixture.effects).not.toContainEqual(expect.objectContaining({
      type: 'show-activation-cta', enabled: true
    }));
    disconnect();
  });

  it('does not turn a delayed static target video into an activation CTA', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#star-map');
    const disconnect = runtime.connect();
    proveCurrent(runtime, fixture);
    fixture.emit({
      type: 'input', kind: 'wheel', delta: 100, fresh: true, target: 'story'
    });
    expect(currentTransaction(runtime).candidateSceneId).toBe('aod-animation');
    expect(currentTransaction(runtime)).toMatchObject({
      phase: 'preparing', activation: 'none'
    });
    expect(fixture.effects).not.toContainEqual(expect.objectContaining({
      type: 'show-activation-cta'
    }));

    const { commands } = commandFixture();
    const { reports } = registerCurrentLeaf(runtime, commands);
    expect(commands.activate).not.toHaveBeenCalled();
    reportCurrentLeafFacts(runtime, reports);
    proveCurrent(runtime, fixture);
    expect(runtime.getSnapshot()).toMatchObject({
      status: 'stable', stableCommit: { sceneId: 'aod-animation' }
    });
    expect(commands.activate).not.toHaveBeenCalled();
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

  it('retires a detached retained mount before React registers its replacement', () => {
    const fixture = createEnvironment();
    const authority = createPresentationAuthority();
    let firstMountAttached = true;
    let registration = 0;
    const releases = vi.fn();
    const presentation: PhonePresentation = {
      ...authority,
      registerLeafMount: (request) => {
        const descriptor = describePhoneLeafMount(request);
        const current = ++registration;
        return {
          ...descriptor,
          registrationKey: `detached-remount:${current}`,
          commands: request.registration.commands,
          isAttached: () => current !== 1 || firstMountAttached,
          rebind: () => undefined,
          release: releases
        };
      }
    };
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#brand', origin: 'initial' },
      environment: fixture.port,
      presentation
    });
    const disconnect = runtime.connect();
    const first = commandFixture();
    const { reports, binding } = registerCurrentLeaf(runtime, first.commands);
    firstMountAttached = false;
    const second = commandFixture();

    expect(() => reports.registerMount({
      root: {} as HTMLElement,
      surfaces: binding.allowedSurfaceIds.map((id) => ({
        id, element: {} as HTMLElement, kind: 'dom' as const
      })),
      commands: second.commands
    })).not.toThrow();
    expect(first.commands.dispose).toHaveBeenCalledWith('generation-replaced');
    expect(releases).toHaveBeenCalledTimes(1);
    expect(second.commands.rebind).toHaveBeenCalledTimes(1);
    disconnect();
  });

  it('revives a stale React port when its retained mount detached before replacement', () => {
    const fixture = createEnvironment();
    const authority = createPresentationAuthority();
    let firstMountAttached = true;
    let registration = 0;
    const releases = vi.fn();
    const presentation: PhonePresentation = {
      ...authority,
      registerLeafMount: (request) => {
        const descriptor = describePhoneLeafMount(request);
        const current = ++registration;
        return {
          ...descriptor,
          registrationKey: `stale-detached-remount:${current}`,
          commands: request.registration.commands,
          isAttached: () => current !== 1 || firstMountAttached,
          rebind: () => undefined,
          release: releases
        };
      }
    };
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#brand', origin: 'initial' },
      environment: fixture.port,
      presentation
    });
    const disconnect = runtime.connect();
    const first = commandFixture();
    const { reports, binding } = registerCurrentLeaf(runtime, first.commands);
    proveCurrent(runtime, fixture);
    fixture.emit({
      type: 'input', kind: 'wheel', delta: 100, fresh: true,
      target: 'story', trusted: true
    });
    firstMountAttached = false;
    const second = commandFixture();

    reports.registerMount({
      root: {} as HTMLElement,
      surfaces: binding.allowedSurfaceIds.map((id) => ({
        id, element: {} as HTMLElement, kind: 'dom' as const
      })),
      commands: second.commands
    });

    expect(first.commands.dispose).toHaveBeenCalledWith('generation-replaced');
    expect(releases).toHaveBeenCalledTimes(1);
    expect(second.commands.rebind).toHaveBeenCalledTimes(1);
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

  it('does not consume touchend activation for static choreography even when its closure mounts video', () => {
    const fixture = createEnvironment();
    const runtime = createRuntime(fixture, '#star-map');
    const disconnect = runtime.connect();
    proveCurrent(runtime, fixture);
    expect(runtime.getSnapshot().status).toBe('stable');

    fixture.emit({
      type: 'input', kind: 'touch', delta: 100, fresh: true,
      target: 'story', trusted: true
    });
    expect(currentTransaction(runtime).candidateSceneId).toBe('aod-animation');
    expect(currentTransaction(runtime).activation).toBe('none');

    const target = commandFixture();
    registerCurrentLeaf(runtime, target.commands);

    fixture.emit({ type: 'activation', trusted: true });
    expect(currentTransaction(runtime).phase).toBe('preparing');
    expect(currentTransaction(runtime).activation).toBe('none');
    expect(target.commands.activate).not.toHaveBeenCalled();
    expect(fixture.effects).not.toContainEqual(expect.objectContaining({
      type: 'show-activation-cta', enabled: true
    }));
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
      type: 'viewport', change: 'layout',
      viewport: { ...initialViewport(), visualRevision: 2 }
    });
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

  it('rolls a second-leg native rejection back to the stable source and reopens input', async () => {
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
    expect(runtime.getSnapshot().stableCommit?.sceneId).toBe('star-map');
    expect(reportRejectedChunk).toHaveBeenCalledWith(expect.objectContaining({
      moduleUrl: '/assets/star-map-aod.js'
    }));
    proveCurrent(runtime, fixture);
    await vi.waitFor(() => expect(runtime.getSnapshot().status).toBe('faulted'));
    const faulted = runtime.getSnapshot();
    if (faulted.status !== 'faulted') throw new Error('expected controlled recovery fault');
    expect(faulted.stableCommit?.sceneId).toBe('star-map');
    expect(faulted.fault.code).toBe('module-load-rejected');
    expect(faulted.input.enabled).toBe(false);
    disconnect();
  });

  it('applies a delayed fail-closed result after the original rollback is stable', async () => {
    const fixture = createEnvironment();
    const recoveryResults: Array<(status: 'fail-closed') => void> = [];
    const reportRejectedChunk = vi.fn(() => new Promise<'fail-closed'>((resolve) => {
      recoveryResults.push(resolve);
    }));
    const loadDependencies = vi.fn(async (effect: Extract<PhoneStoryEffect, {
      type: 'load-dependencies'
    }>) => effect.attempt.mode === 'segment'
      && effect.attempt.segmentId === 'star-map-aod'
      ? {
          status: 'rejected' as const,
          dependency: 'transition:star-map-aod' as const,
          moduleUrl: '/assets/star-map-aod.js', reason: 'rollback already stable'
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
    fixture.emit({ type: 'input', kind: 'wheel', delta: 100, fresh: true, trusted: true, target: 'story' });
    await vi.waitFor(() => expect(currentTransaction(runtime).evidence.some(({ slot }) => (
      slot.kind === 'module-loaded'
    ))).toBe(true));
    proveCurrent(runtime, fixture);
    fixture.emit({ type: 'input', kind: 'wheel', delta: 100, fresh: true, trusted: true, target: 'story' });
    fixture.emit({ type: 'input', kind: 'wheel', delta: 100, fresh: true, trusted: true, target: 'story' });
    await vi.waitFor(() => expect(currentTransaction(runtime).mode).toBe('rollback'));
    proveCurrent(runtime, fixture);
    expect(runtime.getSnapshot().status).toBe('stable');
    expect(runtime.getSnapshot().stableCommit?.sceneId).toBe('star-map');
    expect(recoveryResults).toHaveLength(1);
    recoveryResults[0]!('fail-closed');
    await vi.waitFor(() => expect(runtime.getSnapshot().status).toBe('faulted'));
    const faulted = runtime.getSnapshot();
    if (faulted.status !== 'faulted') throw new Error('expected controlled recovery fault');
    expect(faulted.fault.code).toBe('module-load-rejected');
    disconnect();
  });

  it('applies delayed fail-closed after layout replaces the rollback generation', async () => {
    const fixture = createEnvironment();
    const recoveryResults: Array<(status: 'fail-closed') => void> = [];
    const reportRejectedChunk = vi.fn(() => new Promise<'fail-closed'>((resolve) => {
      recoveryResults.push(resolve);
    }));
    const loadDependencies = vi.fn(async (effect: Extract<PhoneStoryEffect, {
      type: 'load-dependencies'
    }>) => effect.attempt.mode === 'segment'
      && effect.attempt.segmentId === 'star-map-aod'
      ? {
          status: 'rejected' as const,
          dependency: 'transition:star-map-aod' as const,
          moduleUrl: '/assets/star-map-aod.js', reason: 'layout replaced rollback'
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
    fixture.emit({ type: 'input', kind: 'wheel', delta: 100, fresh: true, trusted: true, target: 'story' });
    await vi.waitFor(() => expect(currentTransaction(runtime).evidence.some(({ slot }) => (
      slot.kind === 'module-loaded'
    ))).toBe(true));
    proveCurrent(runtime, fixture);
    fixture.emit({ type: 'input', kind: 'wheel', delta: 100, fresh: true, trusted: true, target: 'story' });
    fixture.emit({ type: 'input', kind: 'wheel', delta: 100, fresh: true, trusted: true, target: 'story' });
    await vi.waitFor(() => expect(currentTransaction(runtime).mode).toBe('rollback'));
    const firstRollback = currentTransaction(runtime).attempt.transactionGeneration;
    fixture.emit({
      type: 'viewport', change: 'layout',
      viewport: { ...initialViewport(), layoutRevision: 2, visualRevision: 2 }
    });
    expect(currentTransaction(runtime).mode).toBe('rollback');
    expect(currentTransaction(runtime).attempt.transactionGeneration).toBeGreaterThan(firstRollback);
    proveCurrent(runtime, fixture);
    expect(runtime.getSnapshot().status).toBe('stable');
    expect(runtime.getSnapshot().stableCommit?.sceneId).toBe('star-map');
    expect(recoveryResults).toHaveLength(1);
    recoveryResults[0]!('fail-closed');
    await vi.waitFor(() => expect(runtime.getSnapshot().status).toBe('faulted'));
    const faulted = runtime.getSnapshot();
    if (faulted.status !== 'faulted') throw new Error('expected controlled recovery fault');
    expect(faulted.fault.code).toBe('module-load-rejected');
    disconnect();
  });

  it('fails closed when a direct non-Hero boot rejects before any stable commit', async () => {
    const fixture = createEnvironment();
    const recoveryResults: Array<(status: 'fail-closed') => void> = [];
    const reportRejectedChunk = vi.fn(() => new Promise<'fail-closed'>((resolve) => {
      recoveryResults.push(resolve);
    }));
    const loadDependencies = vi.fn(async (effect: Extract<PhoneStoryEffect, {
      type: 'load-dependencies'
    }>) => effect.attempt.sceneId === 'brand'
      ? {
          status: 'rejected' as const,
          dependency: 'scene:brand' as const,
          moduleUrl: '/assets/brand.js', reason: 'direct Brand boot rejected'
        }
      : { status: 'loaded' as const });
    const runtime = createPhoneStoryRuntime({
      initialEntry: { pathname: '/', hash: '#brand', origin: 'initial' },
      environment: fixture.port,
      presentation: createPresentationAuthority(),
      ports: { loadDependencies },
      chunkRecovery: { reportRejectedChunk, markStable: vi.fn() }
    } as Parameters<typeof createPhoneStoryRuntime>[0]);
    const disconnect = runtime.connect();
    await vi.waitFor(() => expect(recoveryResults).toHaveLength(1));
    expect(runtime.getSnapshot().status).toBe('faulted');
    const faultedBeforeRecovery = runtime.getSnapshot();
    if (faultedBeforeRecovery.status !== 'faulted') throw new Error('expected direct boot fault');
    expect(faultedBeforeRecovery.stableCommit).toBeNull();
    expect(faultedBeforeRecovery.fault.code).toBe('module-load-rejected');
    recoveryResults[0]!('fail-closed');
    await Promise.resolve();
    expect(runtime.getSnapshot().status).toBe('faulted');
    disconnect();
  });

  it('does not apply a delayed fail-closed result to a newer transition', async () => {
    const fixture = createEnvironment();
    const recoveryResults: Array<(status: 'fail-closed') => void> = [];
    const reportRejectedChunk = vi.fn(() => new Promise<'fail-closed'>((resolve) => {
      recoveryResults.push(resolve);
    }));
    const loadDependencies = vi.fn(async (effect: Extract<PhoneStoryEffect, {
      type: 'load-dependencies'
    }>) => effect.attempt.mode === 'segment'
      && effect.attempt.segmentId === 'star-map-aod'
      ? {
          status: 'rejected' as const,
          dependency: 'transition:star-map-aod' as const,
          moduleUrl: '/assets/star-map-aod.js', reason: 'delayed recovery result'
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
    fixture.emit({ type: 'input', kind: 'wheel', delta: 100, fresh: true, trusted: true, target: 'story' });
    await vi.waitFor(() => expect(currentTransaction(runtime).evidence.some(({ slot }) => (
      slot.kind === 'module-loaded'
    ))).toBe(true));
    proveCurrent(runtime, fixture);
    expect(runtime.getSnapshot().stableCommit?.sceneId).toBe('star-map');
    fixture.emit({ type: 'input', kind: 'wheel', delta: 100, fresh: true, trusted: true, target: 'story' });
    fixture.emit({ type: 'input', kind: 'wheel', delta: 100, fresh: true, trusted: true, target: 'story' });
    await vi.waitFor(() => expect(currentTransaction(runtime).mode).toBe('rollback'));
    proveCurrent(runtime, fixture);
    fixture.emit({ type: 'input', kind: 'wheel', delta: -100, fresh: true, trusted: true, target: 'story' });
    proveCurrent(runtime, fixture);
    expect(runtime.getSnapshot().status).toBe('stable');
    expect(runtime.getSnapshot().stableCommit?.sceneId).toBe('pattern');
    expect(recoveryResults).toHaveLength(1);
    recoveryResults[0]!('fail-closed');
    await Promise.resolve();
    await Promise.resolve();
    expect(runtime.getSnapshot().status).toBe('stable');
    disconnect();
  });

  it('ignores a delayed fail-closed result after the runtime reconnects', async () => {
    const fixture = createEnvironment();
    const recoveryResults: Array<(status: 'fail-closed') => void> = [];
    const reportRejectedChunk = vi.fn(() => new Promise<'fail-closed'>((resolve) => {
      recoveryResults.push(resolve);
    }));
    const loadDependencies = vi.fn(async (effect: Extract<PhoneStoryEffect, {
      type: 'load-dependencies'
    }>) => effect.attempt.mode === 'segment'
      && effect.attempt.segmentId === 'star-map-aod'
      ? {
          status: 'rejected' as const,
          dependency: 'transition:star-map-aod' as const,
          moduleUrl: '/assets/star-map-aod.js', reason: 'stale connection result'
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
    fixture.emit({ type: 'input', kind: 'wheel', delta: 100, fresh: true, trusted: true, target: 'story' });
    await vi.waitFor(() => expect(currentTransaction(runtime).evidence.some(({ slot }) => (
      slot.kind === 'module-loaded'
    ))).toBe(true));
    proveCurrent(runtime, fixture);
    fixture.emit({ type: 'input', kind: 'wheel', delta: 100, fresh: true, trusted: true, target: 'story' });
    fixture.emit({ type: 'input', kind: 'wheel', delta: 100, fresh: true, trusted: true, target: 'story' });
    await vi.waitFor(() => expect(currentTransaction(runtime).mode).toBe('rollback'));
    proveCurrent(runtime, fixture);
    expect(recoveryResults).toHaveLength(1);
    disconnect();
    const reconnect = runtime.connect();
    recoveryResults[0]!('fail-closed');
    await Promise.resolve();
    await Promise.resolve();
    proveCurrent(runtime, fixture);
    expect(runtime.getSnapshot().status).toBe('stable');
    reconnect();
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
