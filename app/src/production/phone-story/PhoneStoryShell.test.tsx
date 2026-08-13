// @vitest-environment jsdom

import { StrictMode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhoneLeafReportPort } from './presentation';
import type { PhoneStoryEffect, PhoneStorySnapshot } from './protocol';
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
  reportPresentationPrepared: ReturnType<typeof vi.fn>;
  reportPresentationFailure: ReturnType<typeof vi.fn>;
  startVisibleEntrance: ReturnType<typeof vi.fn>;
  getSnapshot(): SnapshotRecord | null;
  subscribe(listener: () => void): () => void;
  connect(): () => void;
  createLeafReportPort: ReturnType<typeof vi.fn>;
  createPrewarmLeafReportPort: ReturnType<typeof vi.fn>;
  promotePrewarmLeaf: ReturnType<typeof vi.fn>;
  nativeHandoff: ReturnType<typeof vi.fn>;
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
  phoneReadingEdges: (owner: Readonly<{
    scrollTop: number; clientHeight: number; scrollHeight: number;
  }>) => ({
    top: owner.scrollTop <= 1,
    bottom: owner.scrollTop >= Math.max(0, owner.scrollHeight - owner.clientHeight) - 1
  }),
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
      reportPresentationPrepared: vi.fn(),
      reportPresentationFailure: vi.fn(),
      startVisibleEntrance: vi.fn(),
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
      createPrewarmLeafReportPort: vi.fn(() => Object.freeze({
        registerMount: vi.fn(), reportPrepared: vi.fn(), reportFrame: vi.fn(),
        reportProgress: vi.fn(), reportComplete: vi.fn(), reportFailure: vi.fn()
      }) satisfies PhoneLeafReportPort),
      promotePrewarmLeaf: vi.fn(() => false),
      nativeHandoff: vi.fn((direction: 'forward' | 'reverse') => [`test-handoff:${direction}`, null]),
      publish: (next: SnapshotRecord) => {
        snapshot = next;
        config.environment.observePublish?.(next as PhoneStorySnapshot);
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
      commitStablePlane: vi.fn(),
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
    phoneDiagnosticActivationSurfaces: actual.phoneDiagnosticActivationSurfaces,
    phoneDiagnosticBlockedBy: actual.phoneDiagnosticBlockedBy,
    phoneDiagnosticFailureCode: actual.phoneDiagnosticFailureCode,
    phoneDiagnosticMissingProofs: actual.phoneDiagnosticMissingProofs,
    loadPhoneSceneModule: vi.fn(async () => ({
      default: () => null,
      phoneSceneId: 'hero' as const
    })),
    PhoneSceneLeaf: (props: Record<string, unknown>) => {
      probe.sceneProps.push(props);
      return createElement('div', {
        'data-phone-scene-leaf': props.sceneId,
        'data-phone-scene': props.sceneId,
        'data-r4-scene': props.sceneId
      }, createElement('div', {
        'data-phone-aod-figure-poster': props.sceneId === 'aod-animation' || undefined,
        'data-phone-figure2-poster': props.sceneId === 'figure2-animation' || undefined,
        'data-phone-figure3-initial-composite': props.sceneId === 'figure3-animation' || undefined,
        'data-ttg-figure-video': props.sceneId === 'ttg-animation' || undefined,
        'data-phone-packed-alpha-canvas': props.sceneId === 'ph-animation'
          ? 'ph-figure' : 'crane-figure'
      }));
    },
    PhoneSceneReading: (props: Record<string, unknown>) => (
      createElement('div', { 'data-phone-reading-leaf': props.sceneId },
        props.sceneId === 'figure2-proof'
          ? createElement('div', { 'data-r4-proof-panel': 'cards' }) : null)
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
    StoryNav: (props: Readonly<{ visible: boolean; onNavigate(sceneId: string): void }>) => createElement('button', {
      type: 'button',
      'data-phone-nav-contact': 'true',
      'data-phone-nav-visible': String(props.visible),
      onClick: () => props.onNavigate('contact')
    }, 'contact')
  };
});

import { PhoneStoryShell } from './PhoneStoryShell';
import { phoneNativePrewarmScenes } from './manifest';
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

function loadedEvidence(
  activeAttempt: Readonly<Record<string, unknown>>,
  stageIndex = 0,
  leg = 'target'
): readonly SnapshotRecord[] {
  return [{
    slot: {
      attempt: activeAttempt, stageIndex, leg, kind: 'module-loaded',
      surfaceId: null, planeRevision: null
    },
    report: { kind: 'module-loaded', token: 'fixture:module', accepted: true }
  }];
}

function bootSnapshot(modulesLoaded = true): SnapshotRecord {
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
      requiredFinal: [], evidence: modulesLoaded ? loadedEvidence(activeAttempt) : [], progress: 0,
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

function methodReadingSnapshot(): SnapshotRecord {
  return {
    ...stableSnapshot(),
    stableCommit: { sceneId: 'method-top', landing: {}, commitSequence: 5 },
    presentationProof: { commitSequence: 5, planeRevision: 5 },
    lastPlaneRevision: 5
  };
}

function nativeStableSnapshot(
  sceneId: 'method-top' | 'figure2-proof' | 'brand' | 'services' | 'lab'
    | 'education' | 'contact', commitSequence: number,
  direction: 'forward' | 'reverse' | null = 'forward',
  landingAlias: 'opening' | 'cards' | 'closing' | null = null,
  proofRole: 'committed' | 'rollback' = 'committed'
): SnapshotRecord {
  return { ...stableSnapshot(), stableCommit: { sceneId, landing: {}, commitSequence, direction, landingAlias }, presentationProof: { commitSequence, planeRevision: commitSequence, plane: { role: proofRole } }, lastPlaneRevision: commitSequence };
}

function methodToolbarReprojectSnapshot(): SnapshotRecord {
  const stable = methodReadingSnapshot();
  const activeAttempt = Object.freeze({
    authorityId: 'test-authority', transactionId: 'test:6:method-toolbar',
    transactionGeneration: 6, mode: 'recovery', sceneId: 'method-top',
    segmentId: null, direction: null
  });
  return {
    ...stable,
    status: 'transaction',
    stateRevision: 6,
    transaction: {
      mode: 'recovery', phase: 'presenting-source', attempt: activeAttempt,
      sourceSceneId: 'method-top', candidateSceneId: 'method-top', stageIndex: 0,
      planeRevision: 6, commitIntent: 'reproject',
      requiredPrepared: [], requiredFinal: [], evidence: loadedEvidence(activeAttempt), progress: 0,
      closure: { load: [], mount: [], prewarm: [], resourceBudget: {} }
    }
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
        { attempt: activeAttempt, stageIndex: 0, leg: 'source', kind: 'root-connected',
          surfaceId: 'root:hero', planeRevision: null },
        { attempt: activeAttempt, stageIndex: 0, leg: 'effect', kind: 'root-connected',
          surfaceId: 'hero-pattern-ink', planeRevision: null },
        { attempt: activeAttempt, stageIndex: 0, leg: 'target', kind: 'module-loaded',
          surfaceId: null, planeRevision: null }
      ],
      requiredFinal: [], evidence: loadedEvidence(activeAttempt, 0, 'effect'), progress: 0,
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
      requiredPrepared: [], requiredFinal: [], evidence: loadedEvidence(
        activeAttempt, 0, 'effect'
      ), progress: 0,
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
    stableCommit: { sceneId, landing: {}, commitSequence, direction: 'forward' },
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
      requiredPrepared: [], requiredFinal: [], evidence: loadedEvidence(
        activeAttempt, 0, 'effect'
      ), progress: 0,
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
      requiredFinal: [], evidence: loadedEvidence(activeAttempt, 0, 'rollback'), progress: 0,
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
      requiredFinal: [], evidence: loadedEvidence(activeAttempt), progress: 0,
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

function revealStableStory(engine = connectedEngine()): void {
  act(() => engine.publish(stableSnapshot()));
  const hidden = probe.loaderProps.at(-1)?.onHidden;
  if (typeof hidden !== 'function') throw new Error('missing Loader hidden callback');
  act(() => hidden('ready'));
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
  delete document.documentElement.dataset.storyHydrated;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({ matches: false } as MediaQueryList))
  });
  window.history.replaceState(null, '', '/');
  delete (window as typeof window & { __r5PhoneRuntimeLog?: unknown }).__r5PhoneRuntimeLog;
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
  it('does not clamp, freeze, or consume a native boundary gesture before runtime readiness', () => {
    const { host, root } = hostRoot();
    act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    const engine = connectedEngine();
    act(() => engine.publish(nativeStableSnapshot('services', 9)));
    const hidden = probe.loaderProps.at(-1)?.onHidden;
    if (typeof hidden !== 'function') throw new Error('missing Loader hidden callback');
    act(() => hidden('ready'));
    engine.nativeHandoff.mockReturnValue([null, null]);

    const story = host.querySelector('.phone-story');
    if (!(story instanceof HTMLElement)) throw new Error('missing shell');
    const reading = document.createElement('section');
    reading.dataset.phoneInputOwner = 'native-document';
    story.querySelector('.phone-story__reading-flow')?.append(reading);
    const unleasedTarget = document.createElement('video');
    unleasedTarget.dataset.phoneSceneLeaf = 'ttg-animation';
    story.querySelector('.phone-story__viewport')?.append(unleasedTarget);
    const owner = document.createElement('main');
    let scrollTop = 690;
    Object.defineProperties(owner, {
      scrollTop: { configurable: true, get: () => scrollTop,
        set: (value: number) => { scrollTop = value; } },
      clientHeight: { configurable: true, value: 844 },
      scrollHeight: { configurable: true, value: 1544 }
    });
    const original = Object.getOwnPropertyDescriptor(document, 'scrollingElement');
    Object.defineProperty(document, 'scrollingElement', { configurable: true, value: owner });
    try {
      const start = new Event('touchstart', { bubbles: true });
      Object.defineProperty(start, 'touches', { value: [{ identifier: 71, clientY: 600 }] });
      const move = new Event('touchmove', { bubbles: true, cancelable: true });
      Object.defineProperty(move, 'touches', { value: [{ identifier: 71, clientY: 560 }] });
      act(() => { reading.dispatchEvent(start); reading.dispatchEvent(move); });

      expect(scrollTop).toBe(690);
      expect(move.defaultPrevented).toBe(false);
      expect(story.contains(unleasedTarget)).toBe(true);
      expect(engine.hostEvents.filter(({ type }) => type === 'input')).toEqual([]);
    } finally {
      if (original) Object.defineProperty(document, 'scrollingElement', original);
      else Reflect.deleteProperty(document, 'scrollingElement');
      act(() => root.unmount());
    }
  });

  it('can consume readiness that appears on a later move of the same touch, but never after touchend', () => {
    const { host, root } = hostRoot();
    act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    const engine = connectedEngine();
    act(() => engine.publish(nativeStableSnapshot('lab', 10)));
    const hidden = probe.loaderProps.at(-1)?.onHidden;
    if (typeof hidden !== 'function') throw new Error('missing Loader hidden callback');
    act(() => hidden('ready'));

    const story = host.querySelector('.phone-story');
    if (!(story instanceof HTMLElement)) throw new Error('missing shell');
    const reading = document.createElement('section');
    reading.dataset.phoneInputOwner = 'native-document';
    story.querySelector('.phone-story__reading-flow')?.append(reading);
    const owner = document.createElement('main');
    let scrollTop = 690;
    Object.defineProperties(owner, {
      scrollTop: { configurable: true, get: () => scrollTop,
        set: (value: number) => { scrollTop = value; } },
      clientHeight: { configurable: true, value: 844 },
      scrollHeight: { configurable: true, value: 1544 }
    });
    const original = Object.getOwnPropertyDescriptor(document, 'scrollingElement');
    Object.defineProperty(document, 'scrollingElement', { configurable: true, value: owner });
    const dispatchTouch = (name: 'touchstart' | 'touchmove' | 'touchend', y: number) => {
      const event = new Event(name, { bubbles: true, cancelable: name === 'touchmove' });
      Object.defineProperty(event, name === 'touchend' ? 'changedTouches' : 'touches', {
        value: [{ identifier: 72, clientY: y }]
      });
      act(() => reading.dispatchEvent(event));
      return event;
    };
    try {
      engine.nativeHandoff.mockReturnValue([null, null]);
      dispatchTouch('touchstart', 600);
      const waiting = dispatchTouch('touchmove', 560);
      expect(waiting.defaultPrevented).toBe(false);
      engine.nativeHandoff.mockReturnValue(['lab-ph:ready:10', null]);
      const accepted = dispatchTouch('touchmove', 500);
      expect(accepted.defaultPrevented).toBe(true);
      expect(engine.hostEvents.filter(({ type }) => type === 'input')).toEqual([
        expect.objectContaining({
          kind: 'touch', handoffToken: 'lab-ph:ready:10', target: 'story'
        })
      ]);

      engine.hostEvents.length = 0;
      scrollTop = 690;
      engine.nativeHandoff.mockReturnValue([null, null]);
      dispatchTouch('touchstart', 600);
      dispatchTouch('touchmove', 540);
      dispatchTouch('touchend', 540);
      engine.nativeHandoff.mockReturnValue(['lab-ph:late:10', null]);
      expect(engine.hostEvents.filter(({ type }) => type === 'input')).toEqual([]);
      dispatchTouch('touchstart', 600);
      dispatchTouch('touchmove', 520);
      dispatchTouch('touchend', 520);
      expect(engine.hostEvents.filter(({ type }) => type === 'input')).toHaveLength(1);
    } finally {
      if (original) Object.defineProperty(document, 'scrollingElement', original);
      else Reflect.deleteProperty(document, 'scrollingElement');
      act(() => root.unmount());
    }
  });

  it('leaves a middle-of-reading keyboard input with the native document', () => {
    const { root } = hostRoot();
    act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    const engine = connectedEngine();
    act(() => engine.publish(nativeStableSnapshot('lab', 11)));
    const hidden = probe.loaderProps.at(-1)?.onHidden;
    if (typeof hidden !== 'function') throw new Error('missing Loader hidden callback');
    act(() => hidden('ready'));
    engine.nativeHandoff.mockReturnValue(['lab-ph:ready:11', null]);
    const owner = document.createElement('main');
    Object.defineProperties(owner, {
      scrollTop: { configurable: true, value: 350, writable: true },
      clientHeight: { configurable: true, value: 700 },
      scrollHeight: { configurable: true, value: 1700 }
    });
    const original = Object.getOwnPropertyDescriptor(document, 'scrollingElement');
    Object.defineProperty(document, 'scrollingElement', { configurable: true, value: owner });
    try {
      const event = new KeyboardEvent('keydown', {
        key: 'ArrowDown', bubbles: true, cancelable: true
      });
      act(() => document.body.dispatchEvent(event));
      expect(event.defaultPrevented).toBe(false);
      expect(engine.hostEvents.filter(({ type }) => type === 'input').at(-1)).toMatchObject({
        kind: 'keyboard', target: 'native-corridor'
      });
      expect(engine.hostEvents.filter(({ type }) => type === 'input').at(-1))
        .not.toHaveProperty('handoffToken');
    } finally {
      if (original) Object.defineProperty(document, 'scrollingElement', original);
      else Reflect.deleteProperty(document, 'scrollingElement');
      act(() => root.unmount());
    }
  });

  it('converts a bottom native wheel input into one atomic story handoff', () => {
    const { host, root } = hostRoot();
    act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    const engine = connectedEngine();
    act(() => engine.publish(nativeStableSnapshot('lab', 12)));
    const hidden = probe.loaderProps.at(-1)?.onHidden;
    if (typeof hidden !== 'function') throw new Error('missing Loader hidden callback');
    act(() => hidden('ready'));
    engine.nativeHandoff.mockReturnValue(['lab-ph:ready:12', null]);
    const reading = host.querySelector<HTMLElement>('.phone-story__reading-flow');
    if (!reading) throw new Error('missing reading flow');
    reading.dataset.phoneInputOwner = 'native-document';
    const owner = document.createElement('main');
    Object.defineProperties(owner, {
      scrollTop: { configurable: true, value: 1000, writable: true },
      clientHeight: { configurable: true, value: 700 },
      scrollHeight: { configurable: true, value: 1700 }
    });
    const original = Object.getOwnPropertyDescriptor(document, 'scrollingElement');
    Object.defineProperty(document, 'scrollingElement', { configurable: true, value: owner });
    try {
      const event = new WheelEvent('wheel', {
        deltaY: 120, bubbles: true, cancelable: true
      });
      act(() => reading.dispatchEvent(event));
      expect(event.defaultPrevented).toBe(true);
      expect(engine.hostEvents.filter(({ type }) => type === 'input').at(-1)).toMatchObject({
        kind: 'wheel', target: 'story', handoffToken: 'lab-ph:ready:12'
      });
    } finally {
      if (original) Object.defineProperty(document, 'scrollingElement', original);
      else Reflect.deleteProperty(document, 'scrollingElement');
      act(() => root.unmount());
    }
  });

  it('converts a bottom native pointer drag into one atomic story handoff', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'PointerEvent');
    Object.defineProperty(window, 'PointerEvent', { configurable: true, value: MouseEvent });
    const { host, root } = hostRoot();
    try {
      act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
      const engine = connectedEngine();
      act(() => engine.publish(nativeStableSnapshot('lab', 13)));
      const hidden = probe.loaderProps.at(-1)?.onHidden;
      if (typeof hidden !== 'function') throw new Error('missing Loader hidden callback');
      act(() => hidden('ready'));
      engine.nativeHandoff.mockReturnValue(['lab-ph:ready:13', null]);
      const reading = host.querySelector<HTMLElement>('.phone-story__reading-flow');
      if (!reading) throw new Error('missing reading flow');
      reading.dataset.phoneInputOwner = 'native-document';
      const owner = document.createElement('main');
      Object.defineProperties(owner, {
        scrollTop: { configurable: true, value: 1000, writable: true },
        clientHeight: { configurable: true, value: 700 },
        scrollHeight: { configurable: true, value: 1700 }
      });
      const original = Object.getOwnPropertyDescriptor(document, 'scrollingElement');
      Object.defineProperty(document, 'scrollingElement', { configurable: true, value: owner });
      try {
        const down = new MouseEvent('pointerdown', { bubbles: true, clientY: 600 });
        const up = new MouseEvent('pointerup', { bubbles: true, clientY: 300 });
        for (const event of [down, up]) {
          Object.defineProperty(event, 'pointerId', { value: 42 });
          Object.defineProperty(event, 'pointerType', { value: 'mouse' });
        }
        act(() => { reading.dispatchEvent(down); reading.dispatchEvent(up); });
        expect(engine.hostEvents.filter(({ type }) => type === 'input').at(-1)).toMatchObject({
          kind: 'pointer', target: 'story', handoffToken: 'lab-ph:ready:13'
        });
      } finally {
        if (original) Object.defineProperty(document, 'scrollingElement', original);
        else Reflect.deleteProperty(document, 'scrollingElement');
        act(() => root.unmount());
      }
    } finally {
      if (descriptor) Object.defineProperty(window, 'PointerEvent', descriptor);
      else Reflect.deleteProperty(window, 'PointerEvent');
    }
  });

  it('publishes native scroll samples without prewarm direction control fields', () => {
    const { host, root } = hostRoot();
    act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    const engine = connectedEngine();
    act(() => engine.publish(nativeStableSnapshot('lab', 12)));
    const reading = host.querySelector<HTMLElement>('.phone-story__reading-flow');
    if (!reading) throw new Error('missing reading flow');
    reading.dataset.phoneInputOwner = 'native-document';
    const owner = document.createElement('main');
    Object.defineProperties(owner, {
      scrollTop: { configurable: true, value: 300, writable: true },
      clientHeight: { configurable: true, value: 700 },
      scrollHeight: { configurable: true, value: 1700 }
    });
    const original = Object.getOwnPropertyDescriptor(document, 'scrollingElement');
    Object.defineProperty(document, 'scrollingElement', { configurable: true, value: owner });
    try {
      const start = new Event('touchstart', { bubbles: true });
      Object.defineProperty(start, 'touches', { value: [{ identifier: 73, clientY: 600 }] });
      act(() => reading.dispatchEvent(start));
      act(() => window.dispatchEvent(new Event('scroll')));
      const active = [...engine.hostEvents].reverse().find(({ type }) => type === 'scroll');
      expect(active).not.toHaveProperty('maximumY');
      const end = new Event('touchend', { bubbles: true });
      Object.defineProperty(end, 'changedTouches', { value: [{ identifier: 73, clientY: 600 }] });
      act(() => reading.dispatchEvent(end));
      act(() => window.dispatchEvent(new Event('scroll')));
      expect([...engine.hostEvents].reverse().find(({ type }) => type === 'scroll')).not.toHaveProperty('maximumY');
    } finally {
      if (original) Object.defineProperty(document, 'scrollingElement', original);
      else Reflect.deleteProperty(document, 'scrollingElement');
      act(() => root.unmount());
    }
  });

  it('derives both fixed media neighbours from the canonical spine', () => {
    expect(phoneNativePrewarmScenes('services')).toEqual([
      'figure3-animation', 'ttg-animation'
    ]);
    expect(phoneNativePrewarmScenes('lab')).toEqual([
      'ttg-animation', 'ph-animation'
    ]);
  });

  it('mounts the forward dormant media target immediately on a native stable commit', () => {
    const { host, root } = hostRoot();
    act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    const engine = connectedEngine();
    act(() => engine.publish(nativeStableSnapshot('services', 14, 'forward')));

    expect(engine.createPrewarmLeafReportPort).toHaveBeenCalledWith('figure3-animation');
    expect(engine.createPrewarmLeafReportPort).toHaveBeenCalledWith('ttg-animation');
    expect(host.querySelector('[data-phone-scene-leaf="figure3-animation"]')).not.toBeNull();
    expect(host.querySelector('[data-phone-scene-leaf="ttg-animation"]')).not.toBeNull();
    act(() => root.unmount());
  });

  it('keeps the Lab media neighbours on the same mounts throughout native reading', () => {
    const { host, root } = hostRoot();
    act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    const engine = connectedEngine();
    const stable = nativeStableSnapshot('lab', 18);
    act(() => engine.publish(stable));
    const ttg = host.querySelector('[data-phone-scene-leaf="ttg-animation"]');
    const ph = host.querySelector('[data-phone-scene-leaf="ph-animation"]');
    expect(ttg).not.toBeNull();
    expect(ph).not.toBeNull();

    act(() => engine.publish({
      ...stable, stateRevision: 19,
      scroll: { x: 0, y: 390, sampledAt: 10, origin: 'native' }
    }));

    expect(host.querySelector('[data-phone-scene-leaf="ttg-animation"]')).toBe(ttg);
    expect(host.querySelector('[data-phone-scene-leaf="ph-animation"]')).toBe(ph);
    expect(engine.createPrewarmLeafReportPort).toHaveBeenCalledTimes(2);
    act(() => root.unmount());
  });

  it('does not render a lazy receiver before reducer-owned module evidence arrives', () => {
    probe.snapshot = bootSnapshot(false);
    const { host, root } = hostRoot();
    act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    const engine = connectedEngine();

    expect(host.querySelector('[data-phone-scene-leaf="hero"]')).toBeNull();
    act(() => engine.publish(bootSnapshot(true)));
    expect(host.querySelector('[data-phone-scene-leaf="hero"]')).not.toBeNull();

    act(() => root.unmount());
  });

  it('replaces pending preboot with a presentation-only mounted marker and one implementation signature', () => {
    document.documentElement.dataset.phonePreboot = 'pending';
    const { host, root } = hostRoot();
    act(() => root.render(
      <PhoneStoryShell diagnostics chunkRecovery={chunkRecovery} />
    ));

    expect(document.documentElement.dataset.phonePreboot).toBe('mounted');
    expect(document.documentElement.dataset.storyHydrated).toBe('true');
    expect(host.querySelector('.phone-story')?.getAttribute('data-phone-implementation'))
      .toBe('clean-v1');

    act(() => root.unmount());
    expect(document.documentElement.dataset.phonePreboot).toBeUndefined();
    expect(document.documentElement.dataset.storyHydrated).toBeUndefined();
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

  it('starts Hero only with Loader exit and keeps story input disabled until hidden', () => {
    const { host, root } = hostRoot();
    act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    const engine = connectedEngine();
    act(() => engine.publish(stableSnapshot()));
    const shell = host.querySelector('.phone-story');
    expect(shell?.getAttribute('data-phone-interaction')).toBe('disabled');
    const loader = probe.loaderProps.at(-1)!;
    act(() => (loader.onExitStart as (reason: string) => void)('ready'));
    expect(engine.startVisibleEntrance).toHaveBeenCalledTimes(1);
    expect(shell?.getAttribute('data-phone-interaction')).toBe('disabled');
    act(() => (loader.onHidden as (reason: string) => void)('ready'));
    expect(engine.startVisibleEntrance).toHaveBeenCalledTimes(1);
    expect(shell?.getAttribute('data-phone-interaction')).toBe('enabled');
    act(() => root.unmount());
  });

  it('keeps a native Method document scrollable through a same-scene toolbar reproject', () => {
    const { host, root } = hostRoot();
    act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    const engine = connectedEngine();
    act(() => engine.publish(methodReadingSnapshot()));
    const hidden = probe.loaderProps.at(-1)?.onHidden;
    if (typeof hidden !== 'function') throw new Error('missing Loader hidden callback');
    act(() => hidden('ready'));

    const shell = host.querySelector<HTMLElement>('.phone-story');
    const reading = host.querySelector<HTMLElement>('.phone-story__reading-flow');
    if (!shell || !reading) throw new Error('missing native Method reading corridor');
    reading.scrollTop = 240;
    expect(shell.getAttribute('data-phone-interaction')).toBe('enabled');
    expect(shell.getAttribute('data-phone-reading')).toBe('enabled');
    expect(reading.hasAttribute('inert')).toBe(false);

    act(() => engine.publish(methodToolbarReprojectSnapshot()));

    expect(shell.getAttribute('data-phone-interaction')).toBe('disabled');
    expect(shell.getAttribute('data-phone-reading')).toBe('enabled');
    expect(reading.hasAttribute('inert')).toBe(false);
    expect(reading.scrollTop).toBe(240);
    act(() => root.unmount());
  });

  it('captures a shared native mirror before publishing a Services edge intent', () => {
    const originalScrollingElement = Object.getOwnPropertyDescriptor(document, 'scrollingElement');
    const scrollingElement = document.createElement('main');
    Object.defineProperties(scrollingElement, {
      scrollTop: { configurable: true, value: 1128, writable: true },
      clientHeight: { configurable: true, value: 844 },
      scrollHeight: { configurable: true, value: 1972 }
    });
    Object.defineProperty(document, 'scrollingElement', {
      configurable: true, value: scrollingElement
    });
    const { host, root } = hostRoot();
    try {
      act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
      const engine = connectedEngine();
      act(() => engine.publish(nativeStableSnapshot('services', 8)));
      const hidden = probe.loaderProps.at(-1)?.onHidden;
      if (typeof hidden !== 'function') throw new Error('missing Loader hidden callback');
      act(() => hidden('ready'));
      const shell = host.querySelector<HTMLElement>('.phone-story');
      const mirror = document.createElement('div');
      mirror.dataset.phoneNativeMirror = 'services';
      shell?.querySelector('.phone-story__viewport')?.append(mirror);
      const reading = document.createElement('section');
      reading.dataset.phoneInputOwner = 'native-document';
      shell?.querySelector('.phone-story__reading-flow')?.append(reading);
      scrollingElement.scrollTop = 1128;

      const key = new KeyboardEvent('keydown', {
        bubbles: true, cancelable: true, key: 'ArrowDown'
      });
      act(() => reading.dispatchEvent(key));

      expect(mirror.style.getPropertyValue('--phone-native-scroll-y')).toBe('1128.00px');
      expect(mirror.dataset.phoneNativeScrollY).toBe('1128.00');
      expect(engine.hostEvents.at(-1)).toMatchObject({
        type: 'input', kind: 'keyboard', delta: 1, target: 'story',
        handoffToken: 'test-handoff:forward'
      });
    } finally {
      if (originalScrollingElement) {
        Object.defineProperty(document, 'scrollingElement', originalScrollingElement);
      } else {
        Reflect.deleteProperty(document, 'scrollingElement');
      }
      act(() => root.unmount());
    }
  });

  it('restores a native handoff from the commit record after the mirror DOM is renewed', () => {
    const originalScrollingElement = Object.getOwnPropertyDescriptor(document, 'scrollingElement');
    const scrollingElement = document.createElement('main');
    Object.defineProperties(scrollingElement, {
      scrollTop: { configurable: true, value: 1128, writable: true },
      clientHeight: { configurable: true, value: 844 },
      scrollHeight: { configurable: true, value: 1972 }
    });
    Object.defineProperty(document, 'scrollingElement', {
      configurable: true, value: scrollingElement
    });
    const { host, root } = hostRoot();
    try {
      act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
      const engine = connectedEngine();
      act(() => engine.publish(nativeStableSnapshot('services', 8)));
      const hidden = probe.loaderProps.at(-1)?.onHidden;
      if (typeof hidden !== 'function') throw new Error('missing Loader hidden callback');
      act(() => hidden('ready'));
      const shell = host.querySelector<HTMLElement>('.phone-story');
      const mirror = document.createElement('div');
      mirror.dataset.phoneNativeMirror = 'services';
      shell?.querySelector('.phone-story__viewport')?.append(mirror);
      const reading = document.createElement('section');
      reading.dataset.phoneInputOwner = 'native-document';
      shell?.querySelector('.phone-story__reading-flow')?.append(reading);
      scrollingElement.scrollTop = 1128;

      act(() => reading.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true, cancelable: true, key: 'ArrowDown'
      })));
      expect(mirror.dataset.phoneNativeHandoff).toBe('active');
      mirror.remove();
      scrollingElement.scrollTop = 0;
      const renewedMirror = document.createElement('div');
      renewedMirror.dataset.phoneNativeMirror = 'services';
      shell?.querySelector('.phone-story__viewport')?.append(renewedMirror);

      act(() => engine.publish(nativeStableSnapshot('services', 8)));

      expect(scrollingElement.scrollTop).toBe(1128);
      expect(renewedMirror.dataset.phoneNativeHandoff).toBeUndefined();
    } finally {
      if (originalScrollingElement) {
        Object.defineProperty(document, 'scrollingElement', originalScrollingElement);
      } else {
        Reflect.deleteProperty(document, 'scrollingElement');
      }
      act(() => root.unmount());
    }
  });

  it('uses the scrolling element as the native handoff owner even at scrollTop zero', () => {
    const originalScrollingElement = Object.getOwnPropertyDescriptor(document, 'scrollingElement');
    const originalScrollY = Object.getOwnPropertyDescriptor(window, 'scrollY');
    const scrollingElement = document.createElement('main');
    Object.defineProperties(scrollingElement, {
      scrollTop: { configurable: true, value: 0, writable: true },
      clientHeight: { configurable: true, value: 844 },
      scrollHeight: { configurable: true, value: 844 }
    });
    Object.defineProperty(document, 'scrollingElement', {
      configurable: true, value: scrollingElement
    });
    Object.defineProperty(window, 'scrollY', {
      configurable: true, value: 640
    });
    const { host, root } = hostRoot();
    try {
      act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
      const engine = connectedEngine();
      act(() => engine.publish(nativeStableSnapshot('services', 8)));
      const hidden = probe.loaderProps.at(-1)?.onHidden;
      if (typeof hidden !== 'function') throw new Error('missing Loader hidden callback');
      act(() => hidden('ready'));
      const shell = host.querySelector<HTMLElement>('.phone-story');
      const mirror = document.createElement('div');
      mirror.dataset.phoneNativeMirror = 'services';
      const reading = document.createElement('section');
      reading.dataset.phoneInputOwner = 'native-document';
      shell?.querySelector('.phone-story__viewport')?.append(mirror);
      shell?.querySelector('.phone-story__reading-flow')?.append(reading);

      const key = new KeyboardEvent('keydown', {
        bubbles: true, cancelable: true, key: 'ArrowDown'
      });
      act(() => reading.dispatchEvent(key));

      expect(mirror.dataset.phoneNativeScrollY).toBe('0.00');
    } finally {
      if (originalScrollingElement) {
        Object.defineProperty(document, 'scrollingElement', originalScrollingElement);
      } else {
        Reflect.deleteProperty(document, 'scrollingElement');
      }
      if (originalScrollY) {
        Object.defineProperty(window, 'scrollY', originalScrollY);
      } else {
        Reflect.deleteProperty(window, 'scrollY');
      }
      act(() => root.unmount());
    }
  });

  it('restores the captured native reading position after rollback keeps the same commit', () => {
    const originalScrollingElement = Object.getOwnPropertyDescriptor(document, 'scrollingElement');
    let scrollTop = 680;
    const scrollingElement = document.createElement('main');
    Object.defineProperty(scrollingElement, 'scrollTop', {
      configurable: true, get: () => scrollTop, set: (value: number) => { scrollTop = value; }
    });
    Object.defineProperty(document, 'scrollingElement', { configurable: true, value: scrollingElement });
    const { host, root } = hostRoot();
    try {
      act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
      const engine = connectedEngine();
      act(() => engine.publish(nativeStableSnapshot('education', 8)));
      const mirror = document.createElement('div');
      mirror.dataset.phoneNativeMirror = 'education';
      mirror.dataset.phoneNativeScrollY = '680.00';
      mirror.dataset.phoneNativeHandoff = 'active';
      host.querySelector('.phone-story__viewport')?.append(mirror);
      scrollTop = 0;

      act(() => engine.publish({
        ...nativeStableSnapshot('education', 8, 'forward', null, 'rollback'),
        presentationProof: {
          commitSequence: 8,
          planeRevision: 9,
          plane: { role: 'rollback' }
        },
        lastPlaneRevision: 9
      }));

      expect(scrollTop).toBe(680);
    } finally {
      if (originalScrollingElement) Object.defineProperty(document, 'scrollingElement', originalScrollingElement); else Reflect.deleteProperty(document, 'scrollingElement');
      act(() => root.unmount());
    }
  });

  it('completes the Method toolbar and fresh-edge handoff inside its scoped shell', () => {
    const decoy = document.createElement('main');
    decoy.className = 'phone-story';
    decoy.dataset.phoneScope = 'brand-lab';
    const decoyViewport = document.createElement('div');
    decoyViewport.className = 'phone-story__viewport';
    const decoyVisual = document.createElement('div');
    decoyVisual.className = 'phone-method-top__visual';
    decoyVisual.dataset.phoneNativeMirror = 'method-top';
    const decoyReadingFlow = document.createElement('div');
    decoyReadingFlow.className = 'phone-story__reading-flow';
    const decoyReading = document.createElement('section');
    decoyReading.dataset.phoneInputOwner = 'native-document';
    decoyReadingFlow.append(decoyReading);
    decoyViewport.append(decoyVisual);
    decoy.append(decoyViewport, decoyReadingFlow);
    document.body.append(decoy);

    const visualViewportDescriptor = Object.getOwnPropertyDescriptor(window, 'visualViewport');
    const visualViewport = Object.assign(new EventTarget(), {
      offsetLeft: 0, offsetTop: 0, width: 390, height: 844, scale: 1
    });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true, value: visualViewport
    });
    const originalScrollingElement = Object.getOwnPropertyDescriptor(document, 'scrollingElement');
    const scrollingElement = document.createElement('main');
    let scrollTop = 100;
    Object.defineProperties(scrollingElement, {
      scrollTop: { configurable: true, get: () => scrollTop, set: (value) => { scrollTop = value; } },
      clientHeight: { configurable: true, value: 714 },
      scrollHeight: { configurable: true, value: 1_677 }
    });
    Object.defineProperty(document, 'scrollingElement', {
      configurable: true, value: scrollingElement
    });

    const { host, root } = hostRoot();
    try {
      act(() => root.render(
        <PhoneStoryShell scope="formal" chunkRecovery={chunkRecovery} />
      ));
      const engine = connectedEngine();
      act(() => engine.publish(methodReadingSnapshot()));
      expect(engine.createPrewarmLeafReportPort).toHaveBeenCalledWith('aod-animation');
      expect(host.querySelector('[data-phone-scene-leaf="aod-animation"]')).not.toBeNull();
      const hidden = probe.loaderProps.at(-1)?.onHidden;
      if (typeof hidden !== 'function') throw new Error('missing Loader hidden callback');
      act(() => hidden('ready'));

      const shell = host.querySelector<HTMLElement>('.phone-story');
      const viewport = shell?.querySelector('.phone-story__viewport');
      const visual = document.createElement('div');
      visual.className = 'phone-method-top__visual';
      visual.dataset.phoneNativeMirror = 'method-top';
      const reading = document.createElement('section');
      reading.dataset.phoneInputOwner = 'native-document';
      shell?.querySelector('.phone-story__reading-flow')?.append(reading);
      viewport?.append(visual);
      if (!shell || !viewport) throw new Error('missing formal Method shell');
      expect(shell.dataset.phoneReading).toBe('enabled');

      visualViewport.height = 714;
      visualViewport.dispatchEvent(new Event('resize'));
      expect(engine.hostEvents.at(-1)).toMatchObject({
        type: 'viewport', change: 'toolbar',
        viewport: { visual: { width: 390, height: 714 } }
      });
      act(() => engine.publish(methodToolbarReprojectSnapshot()));
      expect(engine.getSnapshot()?.stableCommit).toMatchObject({
        sceneId: 'method-top', commitSequence: 5
      });
      expect(engine.getSnapshot()?.stableCommit).not.toBeNull();
      expect(shell.dataset.phoneReading).toBe('enabled');
      expect(reading.hasAttribute('inert')).toBe(false);

      const gesture = (identifier: number, reachBottom: boolean) => {
        const start = new Event('touchstart', { bubbles: true });
        Object.defineProperty(start, 'touches', { value: [{ identifier, clientY: 600 }] });
        const move = new Event('touchmove', { bubbles: true, cancelable: true });
        Object.defineProperty(move, 'touches', { value: [{ identifier, clientY: 300 }] });
        const end = new Event('touchend', { bubbles: true });
        Object.defineProperty(end, 'changedTouches', { value: [{ identifier, clientY: 300 }] });
        act(() => reading.dispatchEvent(start));
        if (reachBottom) scrollTop = 963;
        act(() => {
          reading.dispatchEvent(move);
          reading.dispatchEvent(end);
        });
        return move;
      };

      scrollTop = 850;
      act(() => engine.publish({
        ...methodReadingSnapshot(),
        scroll: { x: 0, y: scrollTop, sampledAt: 1, origin: 'native' }
      }));
      const first = gesture(51, true);
      expect(first.defaultPrevented).toBe(true);
      expect(visual.dataset.phoneNativeScrollY).toBe('963.00');
      expect(decoyVisual.dataset.phoneNativeScrollY).toBeUndefined();
      expect(engine.hostEvents.filter(({ type }) => type === 'input')).toEqual([
        expect.objectContaining({ kind: 'touch', delta: 300, fresh: true, target: 'story' })
      ]);
      expect(host.querySelector('[data-phone-activation]:not([hidden])')).toBeNull();
    } finally {
      act(() => root.unmount());
      if (originalScrollingElement) {
        Object.defineProperty(document, 'scrollingElement', originalScrollingElement);
      } else {
        Reflect.deleteProperty(document, 'scrollingElement');
      }
      if (visualViewportDescriptor) {
        Object.defineProperty(window, 'visualViewport', visualViewportDescriptor);
      } else {
        Reflect.deleteProperty(window, 'visualViewport');
      }
    }
  });

  it('withholds Topbar chrome until Star Map is the committed scene', () => {
    const { host, root } = hostRoot();
    act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    const engine = connectedEngine();
    revealStableStory(engine);
    const nav = host.querySelector('[data-phone-nav-contact]');
    expect(nav?.getAttribute('data-phone-nav-visible')).toBe('false');

    act(() => engine.publish({
      ...stableSnapshot(),
      stableCommit: { sceneId: 'pattern', landing: {}, commitSequence: 2 },
      presentationProof: { commitSequence: 2, planeRevision: 2 }
    }));
    expect(nav?.getAttribute('data-phone-nav-visible')).toBe('false');

    act(() => engine.publish({
      ...stableSnapshot(),
      stableCommit: { sceneId: 'aod-animation', landing: {}, commitSequence: 3 },
      presentationProof: { commitSequence: 3, planeRevision: 3 }
    }));
    expect(nav?.getAttribute('data-phone-nav-visible')).toBe('false');

    act(() => engine.publish({
      ...stableSnapshot(),
      stableCommit: { sceneId: 'star-map', landing: {}, commitSequence: 4 },
      presentationProof: { commitSequence: 4, planeRevision: 4 }
    }));
    expect(nav?.getAttribute('data-phone-nav-visible')).toBe('true');
    act(() => root.unmount());
  });

  it('blocks browser scrolling and emits no story intent while Loader owns the viewport', () => {
    const { host, root } = hostRoot();
    act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    const engine = connectedEngine();
    const story = host.querySelector('.phone-story');
    if (!(story instanceof HTMLElement)) throw new Error('missing clean phone story root');
    const wheel = new WheelEvent('wheel', {
      bubbles: true, cancelable: true, deltaY: 120
    });
    const key = new KeyboardEvent('keydown', {
      bubbles: true, cancelable: true, key: 'ArrowDown'
    });
    const start = new Event('touchstart', { bubbles: true });
    Object.defineProperty(start, 'touches', {
      value: [{ identifier: 91, clientY: 600 }]
    });
    const move = new Event('touchmove', { bubbles: true, cancelable: true });
    Object.defineProperty(move, 'touches', {
      value: [{ identifier: 91, clientY: 300 }]
    });
    act(() => {
      story.dispatchEvent(wheel);
      story.dispatchEvent(key);
      story.dispatchEvent(start);
      story.dispatchEvent(move);
    });
    expect(wheel.defaultPrevented).toBe(true);
    expect(key.defaultPrevented).toBe(true);
    expect(move.defaultPrevented).toBe(true);
    expect(engine.hostEvents.filter(({ type }) => type === 'input')).toEqual([]);
    act(() => root.unmount());
  });

  it('reopens the story input corridor at an authored gesture boundary', () => {
    const { host, root } = hostRoot();
    act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    const engine = connectedEngine();
    revealStableStory(engine);
    const segment = segmentSnapshot();
    const staged = {
      ...segment,
      transaction: {
        ...(segment.transaction as Record<string, unknown>),
        phase: 'awaiting-leg-intent'
      }
    };
    act(() => engine.publish(staged));
    const story = host.querySelector('.phone-story');
    if (!(story instanceof HTMLElement)) throw new Error('missing clean phone story root');
    expect(story.getAttribute('data-phone-interaction')).toBe('enabled');

    const start = new Event('touchstart', { bubbles: true });
    Object.defineProperty(start, 'touches', {
      value: [{ identifier: 92, clientY: 600 }]
    });
    const move = new Event('touchmove', { bubbles: true, cancelable: true });
    Object.defineProperty(move, 'touches', {
      value: [{ identifier: 92, clientY: 300 }]
    });
    const end = new Event('touchend', { bubbles: true });
    Object.defineProperty(end, 'changedTouches', {
      value: [{ identifier: 92, clientY: 300 }]
    });
    act(() => {
      story.dispatchEvent(start);
      story.dispatchEvent(move);
      story.dispatchEvent(end);
    });
    expect(engine.hostEvents.filter(({ type }) => type === 'input').at(-1)).toMatchObject({
      kind: 'touch', delta: 300, fresh: true, target: 'story'
    });
    expect(engine.hostEvents.filter(({ type }) => type === 'activation')).toEqual([]);
    act(() => root.unmount());
  });

  it('exposes exact browser-harness diagnostics only when explicitly enabled', () => {
    const { host, root } = hostRoot();
    act(() => root.render(
      <PhoneStoryShell diagnostics scope="harness" chunkRecovery={chunkRecovery} />
    ));
    const engine = connectedEngine();
    engine.nativeHandoff.mockImplementation((direction: 'forward' | 'reverse') => (
      direction === 'forward' ? [null, 'surface'] : [null, null]
    ));
    act(() => engine.publish(stableSnapshot()));
    const shell = host.querySelector('.phone-story');
    expect(shell?.getAttribute('data-phone-authority')).toBe('test-authority');
    expect(shell?.getAttribute('data-phone-plane-revision')).toBe('1');
    expect(shell?.getAttribute('data-phone-commit-sequence')).toBe('1');
    expect(shell?.getAttribute('data-phone-scene')).toBe('hero');
    expect(shell?.getAttribute('data-phone-blocked-by')).toBe('none');
    expect(shell?.getAttribute('data-phone-network-hint')).toBe('online');
    expect(shell?.getAttribute('data-phone-missing-proof')).toBe('');
    expect(shell?.getAttribute('data-phone-activation-surfaces')).toBe('');
    expect(shell?.getAttribute('data-phone-handoff')).toBe(
      'forward:surface'
    );
    act(() => engine.config.environment.observeResources?.({
      videos: 2, activeDecoders: 1, canvases: 3, webglContexts: 2
    }));
    expect(shell?.getAttribute('data-phone-resource-videos')).toBe('2');
    expect(shell?.getAttribute('data-phone-resource-active-decoders')).toBe('1');
    expect(shell?.getAttribute('data-phone-resource-canvases')).toBe('3');
    expect(shell?.getAttribute('data-phone-resource-webgl-contexts')).toBe('2');
    act(() => root.unmount());
  });

  it('exposes the actual reduced-motion preference only through diagnostics', () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
    const diagnostic = hostRoot();
    act(() => diagnostic.root.render(
      <PhoneStoryShell diagnostics chunkRecovery={chunkRecovery} />
    ));
    expect(diagnostic.host.querySelector('.phone-story')?.getAttribute(
      'data-phone-reduced-motion'
    )).toBe('true');
    act(() => diagnostic.root.unmount());

    const formal = hostRoot();
    act(() => formal.root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    expect(formal.host.querySelector('.phone-story')?.hasAttribute(
      'data-phone-reduced-motion'
    )).toBe(false);
    act(() => formal.root.unmount());
  });

  it('exposes a terminal fault code only when diagnostics are enabled', () => {
    const diagnostic = hostRoot();
    act(() => diagnostic.root.render(
      <PhoneStoryShell diagnostics chunkRecovery={chunkRecovery} />
    ));
    act(() => connectedEngine().publish(faultedSnapshot()));
    expect(diagnostic.host.querySelector('.phone-story')?.getAttribute('data-phone-fault-code'))
      .toBe('hero-terminal');
    expect(diagnostic.host.querySelector('.phone-story')?.getAttribute('data-phone-last-failure'))
      .toBe('hero-terminal');
    expect(diagnostic.host.querySelector('.phone-story')?.getAttribute('data-phone-blocked-by'))
      .toBe('none');
    act(() => diagnostic.root.unmount());

    const formal = hostRoot();
    act(() => formal.root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    act(() => connectedEngine().publish(faultedSnapshot()));
    expect(formal.host.querySelector('.phone-story')?.hasAttribute('data-phone-fault-code'))
      .toBe(false);
    act(() => formal.root.unmount());
  });

  it('records complete runtime snapshots only when a test-owned sink is present', () => {
    const trace = window as typeof window & {
      __r5PhoneRuntimeLog?: readonly PhoneStorySnapshot[];
    };
    trace.__r5PhoneRuntimeLog = [];
    const diagnostic = hostRoot();
    act(() => diagnostic.root.render(
      <PhoneStoryShell diagnostics chunkRecovery={chunkRecovery} />
    ));
    const engine = connectedEngine();
    act(() => engine.publish(stableSnapshot()));
    act(() => engine.publish(segmentSnapshot()));
    expect(trace.__r5PhoneRuntimeLog).toMatchObject([
      { status: 'stable', stableCommit: { sceneId: 'hero' } },
      { status: 'transaction', transaction: {
        phase: 'preparing', attempt: { segmentId: 'hero-pattern' }
      } }
    ]);
    act(() => diagnostic.root.unmount());

    delete trace.__r5PhoneRuntimeLog;
    const formal = hostRoot();
    act(() => formal.root.render(
      <PhoneStoryShell diagnostics chunkRecovery={chunkRecovery} />
    ));
    const formalEngine = probe.engines.at(-1);
    if (!formalEngine) throw new Error('missing non-diagnostic formal runtime');
    act(() => formalEngine.publish(segmentSnapshot()));
    expect(trace.__r5PhoneRuntimeLog).toBeUndefined();
    act(() => formal.root.unmount());
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
    expect(host.querySelector('[data-phone-transition-leaf="hero-pattern"]')).not.toBeNull();
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

  it('commits a native reading handoff with the new stable plane before paint', () => {
    const { host, root } = hostRoot();
    const originalScrollingElement = Object.getOwnPropertyDescriptor(document, 'scrollingElement');
    let scrollTop = 420;
    const scrollingElement = document.createElement('main');
    Object.defineProperty(scrollingElement, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => { scrollTop = value; }
    });
    Object.defineProperty(document, 'scrollingElement', { configurable: true, value: scrollingElement });
    try {
      act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />)); const engine = connectedEngine();
      revealStableStory(engine);
      act(() => engine.publish(nativeStableSnapshot('figure2-proof', 10)));
      scrollTop = 420; act(() => engine.publish(nativeStableSnapshot('brand', 11)));

      expect(scrollTop).toBe(0); expect(host.querySelector<HTMLElement>('.phone-story')?.dataset.phoneReading).toBe('enabled');
    } finally {
      act(() => root.unmount());
      if (originalScrollingElement) Object.defineProperty(document, 'scrollingElement', originalScrollingElement); else Reflect.deleteProperty(document, 'scrollingElement');
    }
  });

  it('lands reverse native handoffs and proof aliases at their committed reading anchors', () => {
    const { host, root } = hostRoot();
    const originalScrollingElement = Object.getOwnPropertyDescriptor(document, 'scrollingElement');
    let scrollTop = 420;
    const scrollingElement = document.createElement('main');
    Object.defineProperties(scrollingElement, {
      scrollTop: { configurable: true, get: () => scrollTop, set: (value: number) => { scrollTop = value; } },
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1_000 }
    });
    Object.defineProperty(document, 'scrollingElement', { configurable: true, value: scrollingElement });
    try {
      act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />)); const engine = connectedEngine();
      revealStableStory(engine);
      act(() => engine.publish(nativeStableSnapshot('brand', 10)));
      scrollTop = 420;
      act(() => engine.publish(nativeStableSnapshot('figure2-proof', 11, 'reverse')));
      expect(scrollTop).toBe(600);

      const cards = host.querySelector<HTMLElement>('[data-r4-proof-panel="cards"]');
      if (!cards) throw new Error('missing proof cards anchor');
      Object.defineProperty(cards, 'offsetTop', { configurable: true, value: 240 });
      scrollTop = 600;
      act(() => engine.publish(nativeStableSnapshot('figure2-proof', 12, 'forward', 'cards')));
      expect(scrollTop).toBe(240);
      scrollTop = 120;
      act(() => engine.publish(nativeStableSnapshot('figure2-proof', 13, 'forward', 'closing')));
      expect(scrollTop).toBe(600);
    } finally {
      act(() => root.unmount());
      if (originalScrollingElement) Object.defineProperty(document, 'scrollingElement', originalScrollingElement); else Reflect.deleteProperty(document, 'scrollingElement');
    }
  });

  it('repositions same-scene Proof aliases without a new stable commit sequence', () => {
    const { host, root } = hostRoot();
    const originalScrollingElement = Object.getOwnPropertyDescriptor(document, 'scrollingElement');
    let scrollTop = 420;
    const scrollingElement = document.createElement('main');
    Object.defineProperties(scrollingElement, {
      scrollTop: { configurable: true, get: () => scrollTop, set: (value: number) => { scrollTop = value; } },
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1_000 }
    });
    Object.defineProperty(document, 'scrollingElement', { configurable: true, value: scrollingElement });
    try {
      act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />)); const engine = connectedEngine();
      revealStableStory(engine);
      act(() => engine.publish(nativeStableSnapshot('figure2-proof', 20, null, 'opening')));
      const cards = host.querySelector<HTMLElement>('[data-r4-proof-panel="cards"]');
      if (!cards) throw new Error('missing proof cards anchor');
      Object.defineProperty(cards, 'offsetTop', { configurable: true, value: 240 });
      scrollTop = 120;
      act(() => engine.publish(nativeStableSnapshot('figure2-proof', 20, null, 'cards')));
      expect(scrollTop).toBe(240);
      scrollTop = 120;
      act(() => engine.publish(nativeStableSnapshot('figure2-proof', 20, null, 'closing')));
      expect(scrollTop).toBe(600);
    } finally {
      act(() => root.unmount());
      if (originalScrollingElement) Object.defineProperty(document, 'scrollingElement', originalScrollingElement); else Reflect.deleteProperty(document, 'scrollingElement');
    }
  });

  it('retains Figure2 arch at the story root and places the incoming Ink above it', () => {
    const { host, root } = hostRoot();
    act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    const engine = connectedEngine();
    const entering = segmentSnapshot();
    const transaction = entering.transaction as Record<string, unknown>;
    act(() => engine.publish({
      ...entering,
      transaction: {
        ...transaction,
        candidateSceneId: 'figure2-animation',
        attempt: { ...(transaction.attempt as Record<string, unknown>),
          sceneId: 'figure2-animation', segmentId: 'method-bottom-figure2' }
      }
    }));
    const incomingEffectParent = host.querySelector(
      '[data-phone-plane="effect"]'
    )?.parentElement;
    act(() => engine.publish({
      ...stableSnapshot(),
      stableCommit: { sceneId: 'figure2-animation', landing: {}, commitSequence: 2 },
      presentationProof: { commitSequence: 2, planeRevision: 2 }
    }));
    const arch = host.querySelector('[data-stage-retained-figure2-arch="true"]');
    expect(arch).not.toBeNull();
    expect(arch?.getAttribute('data-phone-figure2-arch-ready')).toBe('true');
    act(() => arch?.dispatchEvent(new Event('load')));
    expect(arch?.getAttribute('data-phone-figure2-arch-ready')).toBe('true');
    expect(arch?.parentElement?.classList).toContain('phone-story__retained-figure2-arch-layer');
    expect(arch?.parentElement?.parentElement?.classList).toContain('phone-story');
    expect(arch?.closest('.phone-story__planes')).toBeNull();
    expect(incomingEffectParent?.classList).toContain('phone-story');
    expect(arch?.closest('.phone-story__reading-flow')).toBeNull();
    act(() => root.unmount());
  });

  it('keeps the arch shared across Figure2 and Proof and reports decode failure', () => {
    const { host, root } = hostRoot();
    act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    const engine = connectedEngine();
    const entering = segmentSnapshot();
    const transaction = entering.transaction as Record<string, unknown>;
    act(() => engine.publish({
      ...entering,
      transaction: {
        ...transaction,
        sourceSceneId: 'figure2-animation', candidateSceneId: 'figure2-proof',
        attempt: { ...(transaction.attempt as Record<string, unknown>),
          sceneId: 'figure2-proof', segmentId: 'figure2-distance-expand', direction: 'forward' }
      }
    }));
    const layer = host.querySelector('.phone-story__retained-figure2-arch-layer');
    expect(layer?.getAttribute('data-phone-figure2-arch-owner')).toBe('shared');
    const arch = host.querySelector('[data-stage-retained-figure2-arch="true"]');
    act(() => arch?.dispatchEvent(new Event('error')));
    expect(engine.reportPresentationFailure).toHaveBeenCalledWith(expect.objectContaining({
      surfaceId: 'figure2-foreground-arch',
      failure: expect.objectContaining({ code: 'figure2-arch-decode' })
    }));
    act(() => root.unmount());
  });

  it('keeps one arch node fixed through the depth boundary and releases it for reverse media', () => {
    const { host, root } = hostRoot();
    act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    const engine = connectedEngine();
    const publishFigure2 = (
      direction: 'forward' | 'reverse', stageIndex: number,
      phase: 'playing' | 'awaiting-leg-intent' | 'preparing'
    ) => {
      const entering = segmentSnapshot(stageIndex, direction === 'forward' ? 14 : 15);
      const transaction = entering.transaction as Record<string, unknown>;
      const sourceSceneId = direction === 'forward' ? 'figure2-animation' : 'figure2-proof';
      const candidateSceneId = direction === 'forward' ? 'figure2-proof' : 'figure2-animation';
      act(() => engine.publish({
        ...entering,
        stableCommit: { sceneId: sourceSceneId, landing: {}, commitSequence: 4 },
        transaction: {
          ...transaction, phase, sourceSceneId, candidateSceneId, stageIndex,
          attempt: { ...(transaction.attempt as Record<string, unknown>),
            sceneId: candidateSceneId, segmentId: 'figure2-distance-expand', direction }
        }
      }));
    };

    publishFigure2('forward', 0, 'playing');
    const arch = host.querySelector('[data-stage-retained-figure2-arch="true"]');
    expect(arch?.getAttribute('data-figure2-arch-motion')).toBe('depth');
    expect(host.querySelector('.phone-story')?.getAttribute('data-phone-segment'))
      .toBe('figure2-distance-expand');
    publishFigure2('forward', 0, 'awaiting-leg-intent');
    expect(host.querySelector('[data-stage-retained-figure2-arch="true"]')).toBe(arch);
    expect(arch?.getAttribute('data-figure2-arch-motion')).toBe('fixed');
    publishFigure2('forward', 1, 'preparing');
    expect(host.querySelector('[data-stage-retained-figure2-arch="true"]')).toBe(arch);
    expect(arch?.getAttribute('data-figure2-arch-motion')).toBe('fixed');
    publishFigure2('reverse', 0, 'playing');
    expect(arch?.getAttribute('data-figure2-arch-motion')).toBe('fixed');
    publishFigure2('reverse', 1, 'playing');
    expect(host.querySelector('[data-stage-retained-figure2-arch="true"]')).toBe(arch);
    expect(arch?.getAttribute('data-figure2-arch-motion')).toBe('depth');
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

  it('retains Crane as a dormant reverse prewarm after Contact commits', () => {
    const { host, root } = hostRoot();
    act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    const engine = connectedEngine();
    act(() => engine.publish(nativeStableSnapshot('contact', 12, 'forward')));

    expect(engine.createPrewarmLeafReportPort).toHaveBeenCalledWith('crane-animation');
    expect(host.querySelector('[data-phone-scene-leaf="crane-animation"]')).not.toBeNull();
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

  it('routes module faults to controlled page reload instead of same-Document retry', () => {
    const { host, root } = hostRoot();
    const manualReload = vi.fn(); const recovery = { ...chunkRecovery, manualReload };
    act(() => root.render(<PhoneStoryShell chunkRecovery={recovery} />)); const engine = connectedEngine();
    act(() => engine.publish({ ...faultedSnapshot(), fault: { code: 'module-load-rejected', message: 'chunk rejected', retryable: true } }));

    const retry = host.querySelector('[data-phone-recovery-reload]') as HTMLButtonElement;
    expect(retry.textContent).toContain('重新加载最新版本');
    act(() => retry.click());
    expect(manualReload).toHaveBeenCalledTimes(1); expect(engine.retry).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it('never renders an activation CTA for a continuous segment', () => {
    const { host, root } = hostRoot();
    act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    const engine = connectedEngine();
    const segment = segmentSnapshot();
    act(() => engine.publish({
      ...segment,
      transaction: {
        ...(segment.transaction as Record<string, unknown>),
        phase: 'awaiting-media-activation'
      }
    }));
    expect(host.querySelector('[data-phone-activation]')).toBeNull();

    const direct = bootSnapshot();
    act(() => engine.publish({
      ...direct,
      transaction: {
        ...(direct.transaction as Record<string, unknown>),
        phase: 'awaiting-media-activation'
      }
    }));
    const fallback = host.querySelector('[data-phone-activation]');
    if (!(fallback instanceof HTMLButtonElement)) throw new Error('missing direct activation CTA');
    expect(fallback.hidden).toBe(false);
    expect(fallback.disabled).toBe(false);
    act(() => root.unmount());
  });

  it('uses native touchmove and touchend even when Safari exposes Pointer Events', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'PointerEvent');
    Object.defineProperty(window, 'PointerEvent', { configurable: true, value: MouseEvent });
    const { host, root } = hostRoot();
    try {
      act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
      const engine = connectedEngine();
      revealStableStory(engine);
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
      const touchMove = new Event('touchmove', { bubbles: true, cancelable: true });
      Object.defineProperty(touchMove, 'touches', {
        value: [{ identifier: 7, clientY: 240 }]
      });
      const touchTail = new Event('touchmove', { bubbles: true, cancelable: true });
      Object.defineProperty(touchTail, 'touches', {
        value: [{ identifier: 7, clientY: 180 }]
      });
      const pointerDown = new MouseEvent('pointerdown', { bubbles: true, clientY: 640 });
      const pointerUp = new MouseEvent('pointerup', { bubbles: true, clientY: 240 });
      Object.defineProperty(pointerDown, 'pointerType', { value: 'touch' });
      Object.defineProperty(pointerUp, 'pointerType', { value: 'touch' });
      act(() => {
        story.dispatchEvent(pointerDown);
        story.dispatchEvent(touchStart);
        story.dispatchEvent(touchMove);
        story.dispatchEvent(touchTail);
        story.dispatchEvent(pointerUp);
        story.dispatchEvent(touchEnd);
      });
      expect(engine.hostEvents.filter(({ type }) => type === 'input')).toEqual([
        expect.objectContaining({
          kind: 'touch', delta: 400, fresh: true, target: 'story'
        })
      ]);
      expect(engine.hostEvents.filter(({ type }) => type === 'activation')).toEqual([]);
      expect(touchMove.defaultPrevented).toBe(true);
      expect(touchTail.defaultPrevented).toBe(true);
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
      revealStableStory(engine);
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
      Object.defineProperty(touchMove, 'touches', {
        value: [{ identifier: 9, clientY: 520 }]
      });
      act(() => {
        story.dispatchEvent(touchStart);
        story.dispatchEvent(touchMove);
        story.dispatchEvent(touchEnd);
      });
      expect(touchMove.defaultPrevented).toBe(true);
      expect(engine.hostEvents.filter(({ type }) => type === 'input').at(-1)).toMatchObject({
        type: 'input', kind: 'touch', delta: -320, fresh: true, target: 'story'
      });
      expect(engine.hostEvents.filter(({ type }) => type === 'activation')).toEqual([]);
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
    const engine = connectedEngine();
    act(() => engine.publish(methodReadingSnapshot()));
    const hidden = probe.loaderProps.at(-1)?.onHidden;
    if (typeof hidden !== 'function') throw new Error('missing Loader hidden callback');
    act(() => hidden('ready'));
    const story = host.querySelector('.phone-story');
    if (!(story instanceof HTMLElement)) throw new Error('missing clean phone story root');
    const reading = document.createElement('section');
    reading.dataset.phoneInputOwner = 'native-document';
    const copy = document.createElement('p');
    reading.append(copy);
    story.append(reading);
    const owner = document.createElement('main');
    Object.defineProperties(owner, {
      scrollTop: { configurable: true, value: 350, writable: true },
      clientHeight: { configurable: true, value: 700 },
      scrollHeight: { configurable: true, value: 1700 }
    });
    const original = Object.getOwnPropertyDescriptor(document, 'scrollingElement');
    Object.defineProperty(document, 'scrollingElement', { configurable: true, value: owner });
    const wheel = new WheelEvent('wheel', {
      bubbles: true, cancelable: true, deltaY: 120
    });
    const key = new KeyboardEvent('keydown', {
      bubbles: true, cancelable: true, key: 'ArrowDown'
    });
    const touchStart = new Event('touchstart', { bubbles: true });
    Object.defineProperty(touchStart, 'touches', {
      value: [{ identifier: 11, clientY: 200 }]
    });
    const touchMove = new Event('touchmove', { bubbles: true, cancelable: true });
    try {
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
    } finally {
      if (original) Object.defineProperty(document, 'scrollingElement', original);
      else Reflect.deleteProperty(document, 'scrollingElement');
      act(() => root.unmount());
    }
  });

  it('hands one native gesture to the story after it reaches the live edge outside the old corridor', () => {
    const { host, root } = hostRoot();
    act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    const engine = connectedEngine();
    act(() => engine.publish(methodReadingSnapshot()));
    const hidden = probe.loaderProps.at(-1)?.onHidden;
    if (typeof hidden !== 'function') throw new Error('missing Loader hidden callback');
    act(() => hidden('ready'));
    const story = host.querySelector('.phone-story');
    if (!(story instanceof HTMLElement)) throw new Error('missing clean phone story root');
    const visual = document.createElement('div');
    visual.className = 'phone-method-top__visual';
    visual.dataset.phoneNativeMirror = 'method-top';
    story.querySelector('.phone-story__viewport')?.append(visual);
    const reading = document.createElement('section');
    reading.dataset.phoneInputOwner = 'native-document';
    story.querySelector('.phone-story__reading-flow')?.append(reading);
    const scrollingElement = document.createElement('main');
    let scrollTop = 650;
    Object.defineProperties(scrollingElement, {
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => { scrollTop = value; }
      },
      clientHeight: { configurable: true, value: 844 },
      scrollHeight: { configurable: true, value: 1544 }
    });
    const originalScrollingElement = Object.getOwnPropertyDescriptor(document, 'scrollingElement');
    Object.defineProperty(document, 'scrollingElement', {
      configurable: true, value: scrollingElement
    });
    const scrollY = 0;
    Object.defineProperty(window, 'scrollY', {
      configurable: true, get: () => scrollY
    });
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true, value: 1544
    });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
    const gesture = (identifier: number, startY: number, moveY: number, tailY?: number) => {
      const start = new Event('touchstart', { bubbles: true });
      Object.defineProperty(start, 'touches', { value: [{ identifier, clientY: startY }] });
      const move = new Event('touchmove', { bubbles: true, cancelable: true });
      Object.defineProperty(move, 'touches', { value: [{ identifier, clientY: moveY }] });
      const edgeMove = new Event('touchmove', { bubbles: true, cancelable: true });
      Object.defineProperty(edgeMove, 'touches', {
        value: [{ identifier, clientY: tailY ?? moveY }]
      });
      const end = new Event('touchend', { bubbles: true });
      Object.defineProperty(end, 'changedTouches', { value: [{ identifier, clientY: tailY ?? moveY }] });
      act(() => reading.dispatchEvent(start));
      act(() => {
        reading.dispatchEvent(move);
        if (tailY !== undefined) reading.dispatchEvent(edgeMove);
        reading.dispatchEvent(end);
      });
      return { move, edgeMove };
    };
    try {
      scrollTop = 400;
      const start = new Event('touchstart', { bubbles: true });
      Object.defineProperty(start, 'touches', { value: [{ identifier: 31, clientY: 600 }] });
      const interiorMove = new Event('touchmove', { bubbles: true, cancelable: true });
      Object.defineProperty(interiorMove, 'touches', { value: [{ identifier: 31, clientY: 450 }] });
      const edgeMove = new Event('touchmove', { bubbles: true, cancelable: true });
      Object.defineProperty(edgeMove, 'touches', { value: [{ identifier: 31, clientY: 300 }] });
      const end = new Event('touchend', { bubbles: true });
      Object.defineProperty(end, 'changedTouches', { value: [{ identifier: 31, clientY: 300 }] });
      act(() => reading.dispatchEvent(start));
      act(() => reading.dispatchEvent(interiorMove));
      expect(interiorMove.defaultPrevented).toBe(false);
      scrollTop = 550;
      act(() => engine.publish({
        ...methodReadingSnapshot(),
        scroll: { x: 0, y: scrollTop, sampledAt: 1, origin: 'native' }
      }));
      act(() => { reading.dispatchEvent(edgeMove); reading.dispatchEvent(end); });
      expect(edgeMove.defaultPrevented).toBe(true);
      expect(visual.dataset.phoneNativeScrollY).toBe('700.00');
      expect(visual.style.getPropertyValue('--phone-native-scroll-y')).toBe('700.00px');
      expect(connectedEngine().hostEvents.filter(({ type }) => type === 'input')).toEqual([
        expect.objectContaining({ kind: 'touch', delta: 300, target: 'story', fresh: true }),
      ]);

      connectedEngine().hostEvents.length = 0;
      scrollTop = 300;
      const interior = gesture(32, 600, 300);
      expect(interior.move.defaultPrevented).toBe(false);
      expect(connectedEngine().hostEvents.filter(({ type }) => type === 'input')).toEqual([]);

      scrollTop = 650;
      const inwardThenOutward = gesture(33, 600, 640, 480);
      expect(inwardThenOutward.move.defaultPrevented).toBe(false);
      expect(inwardThenOutward.edgeMove.defaultPrevented).toBe(false);
      expect(connectedEngine().hostEvents.filter(({ type }) => type === 'input')).toEqual([]);
      expect(connectedEngine().hostEvents.filter(({ type }) => type === 'activation')).toEqual([]);

      const reversingGesture = (
        identifier: number,
        points: readonly number[],
        edgeScrollTop: number
      ) => {
        const start = new Event('touchstart', { bubbles: true });
        Object.defineProperty(start, 'touches', {
          value: [{ identifier, clientY: points[0] }]
        });
        act(() => reading.dispatchEvent(start));
        for (const [index, clientY] of points.slice(1).entries()) {
          if (index === 2) scrollTop = edgeScrollTop;
          const move = new Event('touchmove', { bubbles: true, cancelable: true });
          Object.defineProperty(move, 'touches', { value: [{ identifier, clientY }] });
          act(() => reading.dispatchEvent(move));
        }
        const end = new Event('touchend', { bubbles: true });
        Object.defineProperty(end, 'changedTouches', {
          value: [{ identifier, clientY: points.at(-1) }]
        });
        act(() => reading.dispatchEvent(end));
      };

      connectedEngine().hostEvents.length = 0;
      scrollTop = 500;
      reversingGesture(34, [600, 500, 502, 400, 350], 700);
      expect(connectedEngine().hostEvents.filter(({ type }) => type === 'input')).toEqual([
        expect.objectContaining({ kind: 'touch', delta: 200, target: 'story' })
      ]);
      expect(connectedEngine().hostEvents.filter(({ type }) => type === 'input')).toHaveLength(1);

      connectedEngine().hostEvents.length = 0;
      scrollTop = 500;
      reversingGesture(36, [600, 500, 520, 400], 680);
      expect(connectedEngine().hostEvents.filter(({ type }) => type === 'input')).toEqual([]);
      expect(connectedEngine().hostEvents.filter(({ type }) => type === 'activation')).toEqual([]);

      connectedEngine().hostEvents.length = 0;
      scrollTop = 200;
      reversingGesture(35, [300, 400, 380, 500], 20);
      expect(connectedEngine().hostEvents.filter(({ type }) => type === 'input')).toEqual([]);
      expect(connectedEngine().hostEvents.filter(({ type }) => type === 'activation')).toEqual([]);
    } finally {
      if (originalScrollingElement) {
        Object.defineProperty(document, 'scrollingElement', originalScrollingElement);
      } else {
        Reflect.deleteProperty(document, 'scrollingElement');
      }
      act(() => root.unmount());
    }
  });

  it('classifies height-only Safari resize as toolbar geometry, not authored layout', () => {
    const width = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    const height = Object.getOwnPropertyDescriptor(window, 'innerHeight');
    const visualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
    const visual = Object.assign(new EventTarget(), {
      offsetLeft: 0, offsetTop: 0, width: 390, height: 714, scale: 1
    });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 714 });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true, value: visual
    });
    const { root } = hostRoot();
    try {
      act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
      revealStableStory();
      visual.height = 753;
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 753 });
      act(() => window.dispatchEvent(new Event('resize')));
      expect(connectedEngine().hostEvents.at(-1)).toMatchObject({
        type: 'viewport', change: 'toolbar',
        viewport: {
          layout: { width: 390, height: 714, orientation: 'portrait' },
          visual: { width: 390, height: 753 }
        }
      });

      visual.width = 844;
      visual.height = 390;
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 844 });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 390 });
      act(() => window.dispatchEvent(new Event('resize')));
      expect(connectedEngine().hostEvents.at(-1)).toMatchObject({
        type: 'viewport', change: 'layout',
        viewport: { layout: { width: 844, height: 390, orientation: 'landscape' } }
      });
    } finally {
      act(() => root.unmount());
      if (width) Object.defineProperty(window, 'innerWidth', width);
      if (height) Object.defineProperty(window, 'innerHeight', height);
      if (visualViewport) Object.defineProperty(window, 'visualViewport', visualViewport);
      else Reflect.deleteProperty(window, 'visualViewport');
    }
  });

  it('marks wheel momentum tails and repeated keys as non-fresh physical input', () => {
    const { host, root } = hostRoot();
    act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    const engine = connectedEngine();
    revealStableStory(engine);
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

  it('propagates an explicit loader abort instead of poisoning the native module cache', async () => {
    const { root } = hostRoot();
    act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    vi.mocked(loadPhoneSceneModule).mockRejectedValueOnce(
      Object.assign(new Error('dependency load aborted'), { name: 'AbortError' })
    );
    const load = connectedEngine().config.ports?.loadDependencies;
    if (!load) throw new Error('missing clean dependency loader');
    const controller = new AbortController();
    controller.abort();
    await expect(load({
      type: 'load-dependencies',
      attempt: {
        authorityId: 'test-authority', transactionId: 'test:abort',
        transactionGeneration: 4, mode: 'entry', sceneId: 'hero',
        segmentId: null, direction: null
      },
      dependencies: ['scene:hero']
    }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    act(() => root.unmount());
  });

  it('retains a real native rejection when another module aborts in the same batch', async () => {
    const { root } = hostRoot();
    act(() => root.render(<PhoneStoryShell chunkRecovery={chunkRecovery} />));
    vi.mocked(loadPhoneSceneModule).mockRejectedValueOnce(
      new TypeError('native scene rejection')
    );
    vi.mocked(loadPhoneTransitionModule).mockRejectedValueOnce(
      Object.assign(new Error('dependency load aborted'), { name: 'AbortError' })
    );
    const load = connectedEngine().config.ports?.loadDependencies;
    if (!load) throw new Error('missing clean dependency loader');
    const controller = new AbortController();
    controller.abort();
    await expect(load({
      type: 'load-dependencies',
      attempt: {
        authorityId: 'test-authority', transactionId: 'test:mixed-abort',
        transactionGeneration: 5, mode: 'segment', sceneId: 'pattern',
        segmentId: 'hero-pattern', direction: 'forward'
      },
      dependencies: ['scene:hero', 'transition:hero-pattern']
    }, controller.signal)).resolves.toMatchObject({
      status: 'rejected', dependency: 'scene:hero', reason: 'native scene rejection'
    });
    act(() => root.unmount());
  });

  it('treats the offline hint as non-authoritative and starts the first native leaf request', async () => {
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
      const covers = [...host.querySelectorAll<HTMLElement>('[data-phone-leaf-cover]')];
      expect(covers).toHaveLength(3);
      expect(covers.every((cover) => cover.classList.contains('r4-visually-hidden'))).toBe(true);
      expect(covers.every((cover) => cover.getAttribute('role') === 'status')).toBe(true);
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
