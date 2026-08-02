// @vitest-environment jsdom

import { StrictMode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhoneLeafReportPort } from './presentation';
import type { PhoneStoryEffect } from './protocol';
import type {
  PhoneRuntimeHostEvent,
  PhoneStoryRuntimeConfig
} from './runtime';

type SnapshotRecord = Record<string, unknown>;
type MockEngine = Readonly<{
  id: number;
  presentationId: number;
  config: PhoneStoryRuntimeConfig;
  hostEvents: PhoneRuntimeHostEvent[];
  requestEntry: ReturnType<typeof vi.fn>;
  retry: ReturnType<typeof vi.fn>;
  getSnapshot(): SnapshotRecord | null;
  subscribe(listener: () => void): () => void;
  connect(): () => void;
  createLeafReportPort: ReturnType<typeof vi.fn>;
  publish(next: SnapshotRecord): void;
}> & { connectCount: number; disconnectCount: number };

const probe = vi.hoisted(() => ({
  activeConnections: 0,
  maxActiveConnections: 0,
  disconnectFailure: false,
  presentationSequence: 0,
  events: [] as string[],
  engines: [] as MockEngine[],
  loaderProps: [] as Array<Record<string, unknown>>,
  sceneProps: [] as Array<Record<string, unknown>>,
  transitionProps: [] as Array<Record<string, unknown>>,
  snapshot: null as SnapshotRecord | null
}));

vi.mock('./runtime', () => ({
  createPhoneStoryRuntime: vi.fn((config: PhoneStoryRuntimeConfig) => {
    const id = probe.engines.length + 1;
    const subscribers = new Set<() => void>();
    let snapshot = probe.snapshot;
    let removeHost: (() => void) | null = null;
    const hostEvents: PhoneRuntimeHostEvent[] = [];
    const engine: MockEngine = {
      id,
      presentationId: (config.presentation as PhoneStoryRuntimeConfig['presentation'] & {
        mockId: number;
      }).mockId,
      config,
      hostEvents,
      connectCount: 0,
      disconnectCount: 0,
      requestEntry: vi.fn(),
      retry: vi.fn(),
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => {
        subscribers.add(listener);
        return () => subscribers.delete(listener);
      },
      connect: () => {
        engine.connectCount += 1;
        probe.events.push(`connect:${id}`);
        probe.activeConnections += 1;
        probe.maxActiveConnections = Math.max(
          probe.maxActiveConnections,
          probe.activeConnections
        );
        removeHost = config.environment.subscribeHost((event) => hostEvents.push(event));
        snapshot = snapshot ? { ...snapshot } : snapshot;
        subscribers.forEach((listener) => listener());
        return () => {
          engine.disconnectCount += 1;
          probe.events.push(`disconnect:${id}`);
          removeHost?.();
          removeHost = null;
          probe.activeConnections -= 1;
          if (probe.disconnectFailure) throw new Error('runtime disconnect failed');
        };
      },
      createLeafReportPort: vi.fn(() => {
        if (engine.connectCount === engine.disconnectCount) {
          throw new Error('report ports require the active route connection');
        }
        return Object.freeze({
          registerMount: vi.fn(), reportPrepared: vi.fn(), reportFrame: vi.fn(),
          reportProgress: vi.fn(), reportComplete: vi.fn(), reportFailure: vi.fn()
        }) satisfies PhoneLeafReportPort;
      }),
      publish: (next: SnapshotRecord) => {
        snapshot = next;
        subscribers.forEach((listener) => listener());
      }
    };
    probe.engines.push(engine);
    return engine;
  })
}));

vi.mock('./presentation', () => ({
  runPhoneCleanupSteps: (label: string, steps: readonly (() => void)[]) => {
    const errors: unknown[] = [];
    for (const step of steps) {
      try { step(); } catch (error) { errors.push(error); }
    }
    if (errors.length > 0) throw new AggregateError(errors, label);
  },
  createPhonePresentation: vi.fn(() => {
    const id = ++probe.presentationSequence;
    return {
      mockId: id,
      attachRoot: () => {
        probe.events.push(`attach:${id}`);
        return () => probe.events.push(`detach:${id}`);
      },
      sampleLayoutViewport: () => ({ width: 390, height: 844, orientation: 'portrait' }),
      sampleVisualViewport: () => ({
        offsetLeft: 0, offsetTop: 0, width: 390, height: 844, scale: 1
      })
    };
  })
}));

vi.mock('./scenes', async () => {
  const { createElement } = await import('react');
  const actual = await vi.importActual<typeof import('./scenes')>('./scenes');
  return {
    createPhoneSceneTopology: actual.createPhoneSceneTopology,
    loadPhoneSceneModule: vi.fn(async () => ({
      default: () => null,
      phoneSceneId: 'hero' as const
    })),
    PhoneSceneLeaf: (props: Record<string, unknown>) => {
      probe.sceneProps.push(props);
      return createElement('div', { 'data-phone-scene-leaf': props.sceneId });
    },
    PhoneSceneReading: (props: Record<string, unknown>) => (
      createElement('div', { 'data-phone-reading-leaf': props.sceneId })
    )
  };
});

vi.mock('./transitions', async () => {
  const { createElement } = await import('react');
  const actual = await vi.importActual<typeof import('./transitions')>('./transitions');
  return {
    createPhoneEffectTopology: actual.createPhoneEffectTopology,
    loadPhoneTransitionModule: vi.fn(async () => ({
      default: () => null,
      phoneSegmentId: 'hero-pattern' as const
    })),
    PhoneTransitionLeaf: (props: Record<string, unknown>) => {
      probe.transitionProps.push(props);
      return createElement('div', { 'data-phone-transition-leaf': props.segmentId });
    }
  };
});

vi.mock('../StoryLoader', async () => {
  const { createElement } = await import('react');
  return {
    StoryLoader: (props: Record<string, unknown>) => {
      probe.loaderProps.push(props);
      return createElement('div', { 'data-phone-loader-probe': 'true' });
    }
  };
});

vi.mock('../StoryNav', async () => {
  const { createElement } = await import('react');
  return {
    StoryNav: (props: Readonly<{ onNavigate(sceneId: string): void }>) => createElement('button', {
      type: 'button',
      'data-phone-nav-contact': 'true',
      onClick: () => props.onNavigate('contact')
    }, 'contact')
  };
});

import { PhoneStoryShell } from './PhoneStoryShell';
import { loadPhoneSceneModule } from './scenes';
import { loadPhoneTransitionModule } from './transitions';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const viewport = Object.freeze({
  layout: { width: 390, height: 844, orientation: 'portrait' as const },
  visual: { offsetLeft: 0, offsetTop: 0, width: 390, height: 844, scale: 1 },
  layoutRevision: 1, visualRevision: 1, supported: true
});

function attempt(mode = 'boot', generation = 1) {
  return Object.freeze({
    authorityId: 'test-authority', transactionId: `test:${generation}:${mode}`,
    transactionGeneration: generation, mode, sceneId: 'hero',
    segmentId: null, direction: null
  });
}

function bootSnapshot(): SnapshotRecord {
  const activeAttempt = attempt();
  return {
    status: 'transaction', authorityId: 'test-authority', stateRevision: 1,
    viewport, scroll: null, input: { enabled: false }, visibility: 'foreground',
    lastTransactionGeneration: 1, lastPlaneRevision: 0,
    originalEntry: { pathname: '/', hash: '#home', origin: 'initial' },
    stableCommit: null, presentationProof: null,
    transaction: {
      mode: 'boot', phase: 'preparing', attempt: activeAttempt,
      sourceSceneId: null, candidateSceneId: 'hero', stageIndex: 0,
      planeRevision: null,
      requiredPrepared: [{
        attempt: activeAttempt, stageIndex: 0, leg: 'target', kind: 'module-loaded',
        surfaceId: null, planeRevision: null
      }],
      requiredFinal: [], evidence: [], progress: 0,
      closure: { load: [], mount: [], prewarm: [], resourceBudget: {} }
    }
  };
}

function stableSnapshot(): SnapshotRecord {
  return {
    ...bootSnapshot(), status: 'stable', stateRevision: 2, lastPlaneRevision: 1,
    transaction: null,
    stableCommit: { sceneId: 'hero', landing: {}, commitSequence: 1 },
    presentationProof: { commitSequence: 1, planeRevision: 1 },
    scroll: { x: 0, y: 0, sampledAt: 0, origin: 'runtime' },
    input: { enabled: true }
  };
}

function faultedSnapshot(): SnapshotRecord {
  return {
    ...bootSnapshot(), status: 'faulted', stateRevision: 3, transaction: null,
    fault: { code: 'hero-terminal', message: 'Hero failed', retryable: true },
    safeCover: { kind: 'loader', opaque: true }
  };
}

function segmentSnapshot(stageIndex = 0, generation = 2): SnapshotRecord {
  const activeAttempt = Object.freeze({
    authorityId: 'test-authority', transactionId: `test:${generation}:segment`,
    transactionGeneration: generation, mode: 'segment', sceneId: 'pattern',
    segmentId: 'hero-pattern', direction: 'forward'
  });
  return {
    ...stableSnapshot(), status: 'transaction', stateRevision: 3 + stageIndex,
    transaction: {
      mode: 'segment', phase: 'preparing', attempt: activeAttempt,
      sourceSceneId: 'hero', candidateSceneId: 'pattern', stageIndex,
      planeRevision: null,
      requiredPrepared: [
        { attempt: activeAttempt, stageIndex, leg: 'source', kind: 'root-connected',
          surfaceId: 'root:hero', planeRevision: null },
        { attempt: activeAttempt, stageIndex, leg: 'effect', kind: 'root-connected',
          surfaceId: 'hero-pattern-ink', planeRevision: null },
        { attempt: activeAttempt, stageIndex, leg: 'target', kind: 'module-loaded',
          surfaceId: null, planeRevision: null }
      ],
      requiredFinal: [], evidence: [], progress: 0,
      closure: { load: [], mount: [], prewarm: [], resourceBudget: {} }
    }
  };
}

function figure3PairSnapshot(
  sourceSceneId: 'figure3-animation' | 'services',
  candidateSceneId: 'figure3-animation' | 'services',
  generation: number,
  sourceCommitSequence = 1
): SnapshotRecord {
  const direction = sourceSceneId === 'figure3-animation' ? 'forward' : 'reverse';
  const activeAttempt = Object.freeze({
    authorityId: 'test-authority', transactionId: `test:${generation}:figure3-pair`,
    transactionGeneration: generation, mode: 'segment', sceneId: candidateSceneId,
    segmentId: 'figure3-services', direction
  });
  return {
    ...stableSnapshot(), status: 'transaction', stateRevision: 20 + generation,
    stableCommit: {
      sceneId: sourceSceneId, landing: {}, commitSequence: sourceCommitSequence
    },
    presentationProof: {
      commitSequence: sourceCommitSequence, planeRevision: sourceCommitSequence
    },
    lastPlaneRevision: sourceCommitSequence,
    transaction: {
      mode: 'segment', phase: 'preparing', attempt: activeAttempt,
      sourceSceneId, candidateSceneId, stageIndex: 0,
      planeRevision: null,
      requiredPrepared: [], requiredFinal: [], evidence: [], progress: 0,
      closure: {
        load: [], mount: [], prewarm: [], resourceBudget: {},
        retireAfter: 'pair-exit-or-route-dispose'
      }
    }
  };
}

function stableSceneSnapshot(
  sceneId: 'figure3-animation' | 'services' | 'ttg-animation' | 'lab',
  commitSequence: number
): SnapshotRecord {
  return {
    ...stableSnapshot(), stateRevision: 30 + commitSequence,
    stableCommit: { sceneId, landing: {}, commitSequence },
    presentationProof: { commitSequence, planeRevision: commitSequence },
    lastPlaneRevision: commitSequence
  };
}

function ttgPairSnapshot(
  sourceSceneId: 'ttg-animation' | 'lab',
  candidateSceneId: 'ttg-animation' | 'lab',
  generation: number,
  sourceCommitSequence = 1
): SnapshotRecord {
  const direction = sourceSceneId === 'ttg-animation' ? 'forward' : 'reverse';
  const activeAttempt = Object.freeze({
    authorityId: 'test-authority', transactionId: `test:${generation}:ttg-pair`,
    transactionGeneration: generation, mode: 'segment', sceneId: candidateSceneId,
    segmentId: 'ttg-lab', direction
  });
  return {
    ...stableSnapshot(), status: 'transaction', stateRevision: 40 + generation,
    stableCommit: {
      sceneId: sourceSceneId, landing: {}, commitSequence: sourceCommitSequence
    },
    presentationProof: {
      commitSequence: sourceCommitSequence, planeRevision: sourceCommitSequence
    },
    lastPlaneRevision: sourceCommitSequence,
    transaction: {
      mode: 'segment', phase: 'preparing', attempt: activeAttempt,
      sourceSceneId, candidateSceneId, stageIndex: 0,
      planeRevision: null,
      requiredPrepared: [], requiredFinal: [], evidence: [], progress: 0,
      closure: {
        load: [], mount: [], prewarm: [], resourceBudget: {},
        retireAfter: 'pair-exit-or-route-dispose'
      }
    }
  };
}

function rollbackSnapshot(): SnapshotRecord {
  const activeAttempt = Object.freeze({
    authorityId: 'test-authority', transactionId: 'test:3:rollback',
    transactionGeneration: 3, mode: 'rollback', sceneId: 'hero',
    segmentId: 'hero-pattern', direction: 'forward'
  });
  return {
    ...stableSnapshot(), status: 'transaction', stateRevision: 4,
    transaction: {
      mode: 'rollback', phase: 'rolling-back', attempt: activeAttempt,
      sourceSceneId: 'hero', candidateSceneId: 'hero', stageIndex: 0,
      planeRevision: null,
      requiredPrepared: [{
        attempt: activeAttempt, stageIndex: 0, leg: 'rollback', kind: 'module-loaded',
        surfaceId: null, planeRevision: null
      }],
      requiredFinal: [], evidence: [], progress: 0,
      closure: { load: [], mount: [], prewarm: [], resourceBudget: {} }
    }
  };
}

function recoverySnapshot(): SnapshotRecord {
  const activeAttempt = Object.freeze({
    authorityId: 'test-authority', transactionId: 'test:4:recovery',
    transactionGeneration: 4, mode: 'recovery', sceneId: 'hero',
    segmentId: null, direction: null
  });
  return {
    ...stableSnapshot(), status: 'transaction', stateRevision: 5,
    transaction: {
      mode: 'recovery', phase: 'preparing', attempt: activeAttempt,
      sourceSceneId: 'hero', candidateSceneId: 'hero', stageIndex: 0,
      planeRevision: null,
      requiredPrepared: [{
        attempt: activeAttempt, stageIndex: 0, leg: 'target', kind: 'module-loaded',
        surfaceId: null, planeRevision: null
      }],
      requiredFinal: [], evidence: [], progress: 0,
      closure: { load: [], mount: [], prewarm: [], resourceBudget: {} }
    }
  };
}

const chunkRecovery = Object.freeze({
  reportRejectedChunk: vi.fn(async () => 'fail-closed' as const),
  markStable: vi.fn()
});

function hostRoot(): Readonly<{ host: HTMLDivElement; root: Root }> {
  const host = document.createElement('div');
  document.body.append(host);
  return { host, root: createRoot(host) };
}

function connectedEngine(): MockEngine {
  const engine = probe.engines.find((candidate) => candidate.connectCount > 0);
  if (!engine) throw new Error('expected one connected phone runtime');
  return engine;
}

function reportPortProbe(reportFailure = vi.fn()): PhoneLeafReportPort {
  return Object.freeze({
    registerMount: vi.fn(),
    reportPrepared: vi.fn(),
    reportFrame: vi.fn(),
    reportProgress: vi.fn(),
    reportComplete: vi.fn(),
    reportFailure
  });
}

beforeEach(() => {
  probe.activeConnections = 0;
  probe.maxActiveConnections = 0;
  probe.disconnectFailure = false;
  probe.presentationSequence = 0;
  probe.events.length = 0;
  probe.engines.length = 0;
  probe.loaderProps.length = 0;
  probe.sceneProps.length = 0;
  probe.transitionProps.length = 0;
  probe.snapshot = bootSnapshot();
  document.body.replaceChildren();
  delete document.documentElement.dataset.phonePreboot;
  vi.clearAllMocks();
  vi.mocked(loadPhoneSceneModule).mockResolvedValue({
    default: () => null,
    phoneSceneId: 'hero'
  });
  vi.mocked(loadPhoneTransitionModule).mockResolvedValue({
    default: () => null,
    phoneSegmentId: 'hero-pattern'
  });
});

describe('clean PhoneStoryShell ownership', () => {
  it('replaces pending preboot with a presentation-only mounted marker and one implementation signature', () => {
    document.documentElement.dataset.phonePreboot = 'pending';
    const { host, root } = hostRoot();
    act(() => root.render(
      <PhoneStoryShell diagnostics chunkRecovery={chunkRecovery} />
    ));

    expect(document.documentElement.dataset.phonePreboot).toBe('mounted');
    expect(host.querySelector('.phone-story')?.getAttribute('data-phone-implementation'))
      .toBe('clean-v1');

    act(() => root.unmount());
    expect(document.documentElement.dataset.phonePreboot).toBeUndefined();
  });

  it('replays real StrictMode layout effects without overlapping browser ownership', () => {
    const { root } = hostRoot();
    act(() => root.render(
      <StrictMode><PhoneStoryShell chunkRecovery={chunkRecovery} /></StrictMode>
    ));
    const connected = probe.engines.filter((engine) => Number(engine.connectCount) > 0);
    expect(connected).toHaveLength(1);
    expect(connected[0]).toMatchObject({ connectCount: 2, disconnectCount: 1 });
    expect(probe.maxActiveConnections).toBe(1);
    expect(probe.activeConnections).toBe(1);
    const engine = connected[0];
    if (!engine) throw new Error('expected StrictMode to select one runtime owner');
    expect(probe.events.filter((event) => (
      event.endsWith(`:${engine.id}`) || event.endsWith(`:${engine.presentationId}`)
    ))).toEqual([
      `attach:${engine.presentationId}`,
      `connect:${engine.id}`,
      `disconnect:${engine.id}`,
      `detach:${engine.presentationId}`,
      `attach:${engine.presentationId}`,
      `connect:${engine.id}`
    ]);
    act(() => root.unmount());
    expect(probe.activeConnections).toBe(0);
    expect(connected[0]).toMatchObject({ connectCount: 2, disconnectCount: 2 });
  });

  it('does not recreate owners on snapshot publication or in-route menu entry', () => {
    const { host, root } = hostRoot();
    act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    const created = probe.engines.length;
    const engine = connectedEngine();
    act(() => engine.publish(stableSnapshot()));
    expect(probe.engines).toHaveLength(created);
    expect(probe.loaderProps.at(-1)).toMatchObject({
      ready: true, allowSafetyExit: false
    });
    act(() => (host.querySelector('[data-phone-nav-contact]') as HTMLButtonElement).click());
    expect(engine.requestEntry).toHaveBeenCalledWith({
      pathname: '/', hash: '#contact', origin: 'menu'
    });
    expect(probe.engines).toHaveLength(created);
    act(() => root.unmount());
  });

  it('exposes exact browser-harness diagnostics only when explicitly enabled', () => {
    const { host, root } = hostRoot();
    act(() => root.render(
      <PhoneStoryShell diagnostics scope="harness" chunkRecovery={chunkRecovery} />
    ));
    const engine = connectedEngine();
    act(() => engine.publish(stableSnapshot()));
    const shell = host.querySelector('.phone-story');
    expect(shell?.getAttribute('data-phone-authority')).toBe('test-authority');
    expect(shell?.getAttribute('data-phone-plane-revision')).toBe('1');
    expect(shell?.getAttribute('data-phone-commit-sequence')).toBe('1');
    expect(shell?.getAttribute('data-phone-scene')).toBe('hero');
    act(() => root.unmount());
  });

  it('swaps semantic plane roles without remounting the committed leaf and closes rollback effects', () => {
    const { host, root } = hostRoot();
    act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    const engine = connectedEngine();
    const bootHero = host.querySelector(
      '[data-phone-buffer="b"] [data-phone-scene-leaf="hero"]'
    );
    expect(bootHero).not.toBeNull();
    act(() => engine.publish(stableSnapshot()));
    expect(host.querySelector('[data-phone-buffer="b"]')?.getAttribute('data-phone-plane'))
      .toBe('source');
    expect(host.querySelector('[data-phone-buffer="b"] [data-phone-scene-leaf="hero"]'))
      .toBe(bootHero);

    act(() => engine.publish(segmentSnapshot()));
    expect(host.querySelector('[data-phone-buffer="b"] [data-phone-scene-leaf="hero"]'))
      .toBe(bootHero);
    expect(host.querySelector('[data-phone-buffer="a"] [data-phone-scene-leaf="pattern"]'))
      .not.toBeNull();
    expect(host.querySelector('[data-phone-transition-leaf="hero-pattern"]')).not.toBeNull();
    const transitionReports = probe.transitionProps.at(-1)?.reports;
    act(() => engine.publish(segmentSnapshot(1)));
    expect(probe.transitionProps.at(-1)?.reports).toBe(transitionReports);
    act(() => engine.publish(segmentSnapshot(0, 3)));
    expect(probe.transitionProps.at(-1)?.reports).toBe(transitionReports);

    act(() => engine.publish(rollbackSnapshot()));
    expect(host.querySelector('[data-phone-buffer="b"] [data-phone-scene-leaf="hero"]'))
      .toBe(bootHero);
    expect(host.querySelector('[data-phone-scene-leaf="pattern"]')).toBeNull();
    expect(host.querySelector('[data-phone-transition-leaf]')).toBeNull();

    act(() => engine.publish(stableSnapshot()));
    const recoveredHero = host.querySelector('[data-phone-scene-leaf="hero"]');
    act(() => engine.publish(recoverySnapshot()));
    expect(host.querySelectorAll('[data-phone-scene-leaf="hero"]')).toHaveLength(1);
    expect(host.querySelector('[data-phone-buffer="b"] [data-phone-scene-leaf="hero"]'))
      .toBe(recoveredHero);
    expect(host.querySelector('[data-phone-buffer="b"]')?.getAttribute('data-phone-plane'))
      .toBe('receiver');
    act(() => engine.publish(stableSnapshot()));
    expect(host.querySelector('[data-phone-buffer="b"] [data-phone-scene-leaf="hero"]'))
      .toBe(recoveredHero);
    expect(host.querySelector('[data-phone-buffer="b"]')?.getAttribute('data-phone-plane'))
      .toBe('source');
    act(() => root.unmount());
  });

  it('retains one Figure3 pair topology and report port across the immediate reverse', () => {
    const { host, root } = hostRoot();
    act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    const engine = connectedEngine();

    act(() => engine.publish(figure3PairSnapshot(
      'figure3-animation', 'services', 8
    )));
    const figure3 = host.querySelector('[data-phone-scene-leaf="figure3-animation"]');
    const services = host.querySelector('[data-phone-scene-leaf="services"]');
    const effect = host.querySelector('[data-phone-transition-leaf="figure3-services"]');
    const effectReports = probe.transitionProps.at(-1)?.reports;
    expect(figure3).not.toBeNull();
    expect(services).not.toBeNull();
    expect(effect).not.toBeNull();

    act(() => engine.publish(stableSceneSnapshot('services', 2)));
    expect(host.querySelector('[data-phone-scene-leaf="figure3-animation"]')).toBe(figure3);
    expect(host.querySelector('[data-phone-scene-leaf="services"]')).toBe(services);
    expect(host.querySelector('[data-phone-transition-leaf="figure3-services"]')).toBe(effect);

    act(() => engine.publish(figure3PairSnapshot(
      'services', 'figure3-animation', 9, 2
    )));
    expect(host.querySelector('[data-phone-scene-leaf="figure3-animation"]')).toBe(figure3);
    expect(host.querySelector('[data-phone-scene-leaf="services"]')).toBe(services);
    expect(host.querySelector('[data-phone-transition-leaf="figure3-services"]')).toBe(effect);
    expect(probe.transitionProps.at(-1)?.reports).toBe(effectReports);

    act(() => engine.publish(stableSceneSnapshot('figure3-animation', 3)));
    expect(host.querySelector('[data-phone-scene-leaf="services"]')).toBe(services);
    expect(host.querySelector('[data-phone-transition-leaf="figure3-services"]')).toBe(effect);
    act(() => root.unmount());
  });

  it('retains one TTG/Lab pair topology and report port across the immediate reverse', () => {
    const { host, root } = hostRoot();
    act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    const engine = connectedEngine();

    act(() => engine.publish(ttgPairSnapshot('ttg-animation', 'lab', 10)));
    const ttg = host.querySelector('[data-phone-scene-leaf="ttg-animation"]');
    const lab = host.querySelector('[data-phone-scene-leaf="lab"]');
    const effect = host.querySelector('[data-phone-transition-leaf="ttg-lab"]');
    const effectReports = probe.transitionProps.at(-1)?.reports;
    expect(ttg).not.toBeNull();
    expect(lab).not.toBeNull();
    expect(effect).not.toBeNull();

    act(() => engine.publish(stableSceneSnapshot('lab', 2)));
    expect(host.querySelector('[data-phone-scene-leaf="ttg-animation"]')).toBe(ttg);
    expect(host.querySelector('[data-phone-scene-leaf="lab"]')).toBe(lab);
    expect(host.querySelector('[data-phone-transition-leaf="ttg-lab"]')).toBe(effect);

    act(() => engine.publish(ttgPairSnapshot('lab', 'ttg-animation', 11, 2)));
    expect(host.querySelector('[data-phone-scene-leaf="ttg-animation"]')).toBe(ttg);
    expect(host.querySelector('[data-phone-scene-leaf="lab"]')).toBe(lab);
    expect(host.querySelector('[data-phone-transition-leaf="ttg-lab"]')).toBe(effect);
    expect(probe.transitionProps.at(-1)?.reports).toBe(effectReports);

    act(() => engine.publish(stableSceneSnapshot('ttg-animation', 3)));
    expect(host.querySelector('[data-phone-scene-leaf="lab"]')).toBe(lab);
    expect(host.querySelector('[data-phone-transition-leaf="ttg-lab"]')).toBe(effect);
    act(() => root.unmount());
  });

  it('disconnects a keyed formal shell before the QA shell can claim ownership', () => {
    const { root } = hostRoot();
    act(() => root.render(
      <PhoneStoryShell key="formal" scope="formal" chunkRecovery={chunkRecovery} />
    ));
    const oldEngine = connectedEngine();
    act(() => root.render(
      <PhoneStoryShell key="qa" scope="brand-lab" chunkRecovery={chunkRecovery} />
    ));
    const newEngine = probe.engines.find((candidate) => candidate !== oldEngine
      && candidate.connectCount > 0);
    if (!newEngine) throw new Error('expected the keyed QA runtime to connect');
    const oldDisconnect = probe.events.lastIndexOf(`disconnect:${oldEngine.id}`);
    const newConnect = probe.events.lastIndexOf(`connect:${newEngine.id}`);
    expect(oldDisconnect).toBeGreaterThanOrEqual(0);
    expect(oldDisconnect).toBeLessThan(newConnect);
    expect(probe.maxActiveConnections).toBe(1);
    act(() => root.unmount());
  });

  it('detaches the projector even when runtime disconnect reports an aggregated failure', () => {
    const { root } = hostRoot();
    act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    const engine = connectedEngine();
    probe.disconnectFailure = true;
    expect(() => act(() => root.unmount())).toThrow(/Phone shell cleanup failed/);
    expect(probe.activeConnections).toBe(0);
    expect(probe.events).toContain(`detach:${engine.presentationId}`);
  });

  it('passes only closed report ports into visual leaves and keeps terminal failure covered', () => {
    const { host, root } = hostRoot();
    act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    expect(probe.sceneProps.at(-1)).toMatchObject({ sceneId: 'hero' });
    expect(probe.sceneProps.at(-1)).toHaveProperty('reports');
    expect(probe.sceneProps.at(-1)).not.toHaveProperty('attempt');
    expect(probe.sceneProps.at(-1)).not.toHaveProperty('dispatch');
    expect(probe.sceneProps.at(-1)).not.toHaveProperty('runtime');
    const engine = connectedEngine();
    act(() => engine.publish(faultedSnapshot()));
    expect(probe.loaderProps.at(-1)).toMatchObject({
      ready: false, failed: true, allowSafetyExit: false
    });
    const retry = host.querySelector('[data-phone-retry]') as HTMLButtonElement;
    expect(retry).not.toBeNull();
    expect(retry.classList).toContain('phone-story__retry');
    const styles = readFileSync(resolve(
      process.cwd(), 'src/production/phone-story/styles.css'
    ), 'utf8');
    expect(styles).toMatch(/\.phone-story__retry\s*\{[^}]*z-index:\s*1001/s);
    act(() => retry.click());
    expect(engine.retry).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it('projects the runtime-owned media activation CTA without giving leaves input authority', () => {
    const { host, root } = hostRoot();
    act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    const engine = connectedEngine();
    const cta = host.querySelector('[data-phone-activation]');
    if (!(cta instanceof HTMLButtonElement)) throw new Error('missing activation CTA');
    expect(cta.hidden).toBe(true);
    expect(cta.disabled).toBe(true);
    const effect: Extract<PhoneStoryEffect, { type: 'show-activation-cta' }> = {
      type: 'show-activation-cta', enabled: true,
      attempt: {
        authorityId: 'test-authority', transactionId: 'test:activation',
        transactionGeneration: 2, mode: 'entry', sceneId: 'crane-animation',
        segmentId: null, direction: null
      }
    };
    act(() => engine.config.environment.performEffect?.(effect, () => undefined));
    expect(cta.hidden).toBe(false);
    expect(cta.disabled).toBe(false);
    act(() => engine.config.environment.performEffect?.(
      { ...effect, enabled: false }, () => undefined
    ));
    expect(cta.hidden).toBe(true);
    expect(cta.disabled).toBe(true);
    act(() => root.unmount());
  });

  it('uses pointer ownership without duplicating the same gesture through touch events', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'PointerEvent');
    Object.defineProperty(window, 'PointerEvent', { configurable: true, value: MouseEvent });
    const { host, root } = hostRoot();
    try {
      act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
      const engine = connectedEngine();
      const story = host.querySelector('.phone-story');
      if (!(story instanceof HTMLElement)) throw new Error('missing clean phone story root');
      const touchStart = new Event('touchstart', { bubbles: true });
      Object.defineProperty(touchStart, 'touches', {
        value: [{ identifier: 7, clientY: 640 }]
      });
      const touchEnd = new Event('touchend', { bubbles: true });
      Object.defineProperty(touchEnd, 'changedTouches', {
        value: [{ identifier: 7, clientY: 240 }]
      });
      act(() => {
        story.dispatchEvent(new MouseEvent('pointerdown', {
          bubbles: true, clientY: 640
        }));
        story.dispatchEvent(touchStart);
        story.dispatchEvent(new MouseEvent('pointerup', {
          bubbles: true, clientY: 240
        }));
        story.dispatchEvent(touchEnd);
      });
      expect(engine.hostEvents.filter(({ type }) => type === 'input')).toEqual([
        expect.objectContaining({
          kind: 'pointer', delta: 400, fresh: true, target: 'story'
        })
      ]);
    } finally {
      act(() => root.unmount());
      if (descriptor) Object.defineProperty(window, 'PointerEvent', descriptor);
      else Reflect.deleteProperty(window, 'PointerEvent');
    }
  });

  it('publishes directional touch input when Pointer Events are unavailable', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'PointerEvent');
    Reflect.deleteProperty(window, 'PointerEvent');
    const { host, root } = hostRoot();
    try {
      act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
      const engine = connectedEngine();
      const story = host.querySelector('.phone-story');
      if (!(story instanceof HTMLElement)) throw new Error('missing clean phone story root');
      const touchStart = new Event('touchstart', { bubbles: true });
      Object.defineProperty(touchStart, 'touches', {
        value: [{ identifier: 9, clientY: 200 }]
      });
      const touchEnd = new Event('touchend', { bubbles: true });
      Object.defineProperty(touchEnd, 'changedTouches', {
        value: [{ identifier: 9, clientY: 520 }]
      });
      const touchMove = new Event('touchmove', { bubbles: true, cancelable: true });
      act(() => {
        story.dispatchEvent(touchStart);
        story.dispatchEvent(touchMove);
        story.dispatchEvent(touchEnd);
      });
      expect(touchMove.defaultPrevented).toBe(true);
      expect(engine.hostEvents.at(-1)).toMatchObject({
        type: 'input', kind: 'touch', delta: -320, fresh: true, target: 'story'
      });
      const nativeButton = host.querySelector('[data-phone-nav-contact]');
      if (!(nativeButton instanceof HTMLButtonElement)) throw new Error('missing native corridor');
      const nativeStart = new Event('touchstart', { bubbles: true });
      Object.defineProperty(nativeStart, 'touches', {
        value: [{ identifier: 10, clientY: 200 }]
      });
      const nativeMove = new Event('touchmove', { bubbles: true, cancelable: true });
      act(() => {
        nativeButton.dispatchEvent(nativeStart);
        nativeButton.dispatchEvent(nativeMove);
      });
      expect(nativeMove.defaultPrevented).toBe(false);
    } finally {
      act(() => root.unmount());
      if (descriptor) Object.defineProperty(window, 'PointerEvent', descriptor);
    }
  });

  it('keeps every descendant of a native document outside cinematic prevention', () => {
    const { host, root } = hostRoot();
    act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    const story = host.querySelector('.phone-story');
    if (!(story instanceof HTMLElement)) throw new Error('missing clean phone story root');
    const reading = document.createElement('section');
    reading.dataset.phoneInputOwner = 'native-document';
    const copy = document.createElement('p');
    reading.append(copy);
    story.append(reading);
    const wheel = new WheelEvent('wheel', {
      bubbles: true, cancelable: true, deltaY: 120
    });
    const key = new KeyboardEvent('keydown', {
      bubbles: true, cancelable: true, key: 'ArrowUp'
    });
    const touchStart = new Event('touchstart', { bubbles: true });
    Object.defineProperty(touchStart, 'touches', {
      value: [{ identifier: 11, clientY: 200 }]
    });
    const touchMove = new Event('touchmove', { bubbles: true, cancelable: true });
    act(() => {
      copy.dispatchEvent(wheel);
      copy.dispatchEvent(key);
      copy.dispatchEvent(touchStart);
      copy.dispatchEvent(touchMove);
    });
    expect(wheel.defaultPrevented).toBe(false);
    expect(key.defaultPrevented).toBe(false);
    expect(touchMove.defaultPrevented).toBe(false);
    expect(connectedEngine().hostEvents.filter(({ type }) => type === 'input')).toEqual([
      expect.objectContaining({ kind: 'wheel', target: 'native-corridor' }),
      expect.objectContaining({ kind: 'keyboard', target: 'native-corridor' })
    ]);
    act(() => root.unmount());
  });

  it('marks wheel momentum tails and repeated keys as non-fresh physical input', () => {
    const { host, root } = hostRoot();
    act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    const engine = connectedEngine();
    const story = host.querySelector('.phone-story');
    if (!(story instanceof HTMLElement)) throw new Error('missing clean phone story root');
    const wheel = (timeStamp: number) => {
      const event = new WheelEvent('wheel', { bubbles: true, deltaY: 100 });
      Object.defineProperty(event, 'timeStamp', { value: timeStamp });
      story.dispatchEvent(event);
    };
    act(() => {
      wheel(1_000);
      wheel(1_050);
      wheel(1_300);
      story.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true, key: 'ArrowDown', repeat: true
      }));
    });
    expect(engine.hostEvents.filter(({ type }) => type === 'input').map((event) => (
      event.type === 'input' ? [event.kind, event.fresh] : null
    ))).toEqual([
      ['wheel', true], ['wheel', false], ['wheel', true], ['keyboard', false]
    ]);
    act(() => root.unmount());
  });

  it('attributes a native lazy rejection to the dependency that actually failed', async () => {
    const { root } = hostRoot();
    act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    vi.mocked(loadPhoneSceneModule).mockReturnValueOnce(new Promise(() => undefined));
    vi.mocked(loadPhoneTransitionModule).mockRejectedValueOnce(
      new Error('native transition rejection')
    );
    const load = connectedEngine().config.ports?.loadDependencies;
    if (!load) throw new Error('missing clean dependency loader');
    const effect: Extract<PhoneStoryEffect, { type: 'load-dependencies' }> = {
      type: 'load-dependencies',
      attempt: {
        authorityId: 'test-authority', transactionId: 'test:dependency',
        transactionGeneration: 2, mode: 'segment', sceneId: 'pattern',
        segmentId: 'hero-pattern', direction: 'forward'
      },
      dependencies: ['scene:hero', 'transition:hero-pattern']
    };
    const outcome = await Promise.race([
      load(effect, new AbortController().signal),
      new Promise<'timeout'>((resolveTimeout) => setTimeout(() => resolveTimeout('timeout'), 0))
    ]);
    expect(outcome).toMatchObject({
      status: 'rejected', dependency: 'transition:hero-pattern',
      moduleUrl: 'transition:hero-pattern', reason: 'native transition rejection'
    });
    act(() => root.unmount());
  });

  it('waits in-document while offline before making the first native leaf request', async () => {
    const { root } = hostRoot();
    act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    const load = connectedEngine().config.ports?.loadDependencies;
    if (!load) throw new Error('missing clean dependency loader');
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      const pending = load({
        type: 'load-dependencies',
        attempt: {
          authorityId: 'test-authority', transactionId: 'test:offline',
          transactionGeneration: 3, mode: 'entry', sceneId: 'hero',
          segmentId: null, direction: null
        },
        dependencies: ['scene:hero']
      }, new AbortController().signal);
      await Promise.resolve();
      expect(loadPhoneSceneModule).not.toHaveBeenCalled();
      online.mockReturnValue(true);
      window.dispatchEvent(new Event('online'));
      await expect(pending).resolves.toEqual({ status: 'loaded' });
      expect(loadPhoneSceneModule).toHaveBeenCalledTimes(1);
    } finally {
      online.mockRestore();
      act(() => root.unmount());
    }
  });
});

describe('clean lazy registries', () => {
  it('caches fulfilled scene modules without caching a rejected import promise', async () => {
    const { createPhoneSceneRegistry } = await vi.importActual<typeof import('./scenes')>('./scenes');
    const fulfilled = vi.fn(async () => ({
      default: () => null,
      phoneSceneId: 'hero' as const
    }));
    const rejected = vi.fn(async () => { throw new Error('native scene rejection'); });
    const registry = createPhoneSceneRegistry({ hero: fulfilled, pattern: rejected });
    const firstLoad = registry.load('hero');
    await expect(firstLoad).resolves.toBe(await registry.load('hero'));
    expect(registry.load('hero')).toBe(firstLoad);
    expect(fulfilled).toHaveBeenCalledTimes(1);
    await expect(registry.load('pattern')).rejects.toThrow('native scene rejection');
    expect(() => registry.load('pattern')).toThrow(/same Document|rejected/);
    expect(rejected).toHaveBeenCalledTimes(1);
  });

  it('reports missing scene and rejected transition leaves under a non-null cover', async () => {
    const { createPhoneSceneRegistry, PhoneSceneLeaf, PhoneSceneReading } = await vi.importActual<
      typeof import('./scenes')
    >('./scenes');
    const { createPhoneTransitionRegistry, PhoneTransitionLeaf } = await vi.importActual<
      typeof import('./transitions')
    >('./transitions');
    const sceneRegistry = createPhoneSceneRegistry({});
    const transitionRegistry = createPhoneTransitionRegistry({
      'hero-pattern': async () => { throw new Error('native transition rejection'); }
    });
    const sceneFailure = vi.fn();
    const transitionFailure = vi.fn();
    const sceneReports = reportPortProbe(sceneFailure);
    const transitionReports = reportPortProbe(transitionFailure);
    const { host, root } = hostRoot();
    const expectedError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await act(async () => root.render(<>
        <PhoneSceneLeaf registry={sceneRegistry} sceneId="hero" reports={sceneReports} />
        <PhoneSceneReading registry={sceneRegistry} sceneId="hero" />
        <PhoneTransitionLeaf
          registry={transitionRegistry}
          segmentId="hero-pattern"
          reports={transitionReports}
        />
      </>));
      await act(async () => Promise.resolve());
      expect(host.querySelectorAll('[data-phone-leaf-cover]')).toHaveLength(3);
      expect(sceneFailure).toHaveBeenCalledWith(expect.objectContaining({
        code: 'phone-scene-leaf-missing'
      }));
      expect(transitionFailure).toHaveBeenCalledWith(expect.objectContaining({
        code: 'phone-transition-leaf-rejected'
      }));
      act(() => root.unmount());
    } finally {
      expectedError.mockRestore();
    }
  });
});
