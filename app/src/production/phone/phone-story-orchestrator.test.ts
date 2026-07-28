import { describe, expect, it, vi } from 'vitest';
import {
  createPhoneStoryOrchestrator,
  type PhoneOrchestratedRunSession,
  type PhoneRunCapability
} from './phone-story-orchestrator';
import type { PhoneStoryOrchestrator } from './phone-story-orchestrator.types';

function element(top = 0): HTMLElement {
  const properties = new Map<string, string>();
  return {
    dataset: {} as DOMStringMap,
    style: {
      setProperty(name: string, value: string) {
        properties.set(name, value);
      },
      removeProperty(name: string) {
        properties.delete(name);
      },
      getPropertyValue(name: string) {
        return properties.get(name) ?? '';
      }
    },
    getBoundingClientRect: () => ({ top })
  } as unknown as HTMLElement;
}

function capability(
  position: number,
  start: PhoneRunCapability['start']
): PhoneRunCapability {
  return {
    position: () => position,
    canStart: () => true,
    start
  };
}

function intent() {
  return [1, 1, 0, 240] as const;
}

function registerCorridor(
  orchestrator: PhoneStoryOrchestrator,
  run: 'brand-services' | 'lab-education' = 'brand-services',
  boundary = 100
) {
  return orchestrator.registerScrollCorridor({
    id: `test:${run}`,
    scenes: run === 'brand-services' ? ['brand', 'services'] : ['lab', 'education'],
    sample: () => null,
    boundary: (requestedRun) => requestedRun === run ? boundary : null,
    landing: () => boundary
  });
}

describe('single phone story projector transaction', () => {
  it('[Task 9] exposes snapshots without the deprecated cursor compatibility API', () => {
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      scrollY: () => 0,
      scrollTo: () => undefined
    });

    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'stable',
      scene: 'brand'
    });
    expect(orchestrator).not.toHaveProperty('cursor');
  });

  it('projects the next revision before notifying external-store subscribers', () => {
    const root = element();
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      root,
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    const observed: string[] = [];
    orchestrator.subscribe(() => {
      observed.push(`${root.dataset.phoneRevision}:${root.dataset.phoneCursor}`);
    });

    orchestrator.dispatch({
      type: 'HOLD_RECONCILED',
      authorityId: orchestrator.getSnapshot().authorityId,
      scene: 'services'
    });

    expect(observed).toEqual(['1:hold:services']);
    expect(orchestrator.getSnapshot()).toMatchObject({
      revision: 1,
      status: 'stable',
      scene: 'services'
    });
  });

  it('registers surfaces as pure handles and lets the projector select roles', () => {
    const root = element();
    const brand = element();
    const services = element();
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      root,
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    orchestrator.registerSurface({
      id: 'native:brand',
      scene: 'brand',
      kind: 'native',
      root: () => brand,
      presented: () => true
    });
    orchestrator.registerSurface({
      id: 'native:services',
      scene: 'services',
      kind: 'native',
      root: () => services,
      presented: () => true
    });

    expect(brand.dataset.phoneSurfaceRole).toBe('stable');
    expect(services.dataset.phoneSurfaceRole).toBe('retired');
    orchestrator.dispatch({
      type: 'HOLD_RECONCILED',
      authorityId: orchestrator.getSnapshot().authorityId,
      scene: 'services'
    });
    expect(brand.dataset.phoneSurfaceRole).toBe('retired');
    expect(services.dataset.phoneSurfaceRole).toBe('stable');
  });

  it('keeps candidate target projection locked until release, alignment, and verification settle', () => {
    const root = element();
    let session: PhoneOrchestratedRunSession | undefined;
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      root,
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    orchestrator.registerRunCapability('brand-services', 'test', capability(100, (
      _direction,
      activeSession
    ) => {
      session = activeSession;
    }));
    registerCorridor(orchestrator);

    expect(orchestrator.resolveIntent(intent())).toBe('claim-boundary');
    session?.reportPresentedFrame();
    session?.reportEndpointCommit('receiver');
    session?.reportPresentedFrame();
    session?.reportAnimationComplete();

    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { phase: 'verifying-target' }
    });
    expect(root.dataset.phoneProjectionState).toBe('transition');
    expect(root.dataset.phoneInputState).toBe('locked');
  });

  it('releases geometry before stable publication and resources after it', () => {
    const root = element();
    const frames: Array<() => void> = [];
    const events: string[] = [];
    let actualY = 0;
    let session: PhoneOrchestratedRunSession | undefined;
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      root,
      scrollY: () => actualY,
      scrollTo: (nextY) => { actualY = nextY; },
      scheduleFrame: (callback) => frames.push(callback)
    });
    orchestrator.registerRunCapability('brand-services', 'test', capability(100, (
      _direction,
      activeSession
    ) => {
      session = activeSession;
    }));
    registerCorridor(orchestrator);
    orchestrator.subscribe(() => {
      if (orchestrator.getSnapshot().status === 'stable') {
        events.push(`stable:${root.dataset.phoneInputState}`);
      }
    });

    expect(orchestrator.resolveIntent(intent())).toBe('claim-boundary');
    session?.reportPresentedFrame();
    session?.reportEndpointCommit('receiver');
    session?.reportPresentedFrame();
    session?.provideRelease({
      releaseGeometry: () => events.push('geometry'),
      releaseResources: () => events.push('resources')
    });
    session?.reportEndpointCommit('receiver');
    session?.reportTargetPresented();

    expect(events).toEqual(['geometry']);
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { phase: 'measuring-landing' }
    });
    frames.shift()?.();
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { phase: 'aligning-scroll' }
    });
    frames.shift()?.();
    expect(events).toEqual(['geometry', 'stable:free']);
    frames.shift()?.();
    expect(events).toEqual(['geometry', 'stable:free', 'resources']);
  });

  it('returns a failed run through the same source candidate precommit pipeline', () => {
    const root = element();
    const frames: Array<() => void> = [];
    let actualY = 0;
    let session: PhoneOrchestratedRunSession | undefined;
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      root,
      scrollY: () => actualY,
      scrollTo: (nextY) => { actualY = nextY; },
      scheduleFrame: (callback) => frames.push(callback)
    });
    orchestrator.registerRunCapability('brand-services', 'test', capability(100, (
      _direction,
      activeSession
    ) => {
      session = activeSession;
    }));
    registerCorridor(orchestrator);

    expect(orchestrator.resolveIntent(intent())).toBe('claim-boundary');
    session?.reportFailure();

    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { phase: 'rollback-measuring-landing' },
      projection: { commitState: 'candidate', semanticScene: 'brand' }
    });
    expect(root.dataset.phoneInputState).toBe('locked');
    frames.shift()?.();
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { phase: 'rollback-aligning-scroll' }
    });
    frames.shift()?.();
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'stable',
      scene: 'brand',
      session: null,
      diagnostics: { lastRollback: { reason: 'capability-failed' } }
    });
    expect(root.dataset.phoneInputState).toBe('free');
  });

  it('uses at most one bounded scroll correction before a stable target hold', () => {
    const root = element();
    const frames: Array<() => void> = [];
    const commands: number[] = [];
    let actualY = 0;
    let session: PhoneOrchestratedRunSession | undefined;
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      root,
      scrollY: () => actualY,
      scrollTo: (nextY) => {
        commands.push(nextY);
        if (commands.length >= 2) actualY = nextY;
      },
      scheduleFrame: (callback) => frames.push(callback)
    });
    orchestrator.registerRunCapability('brand-services', 'test', capability(100, (
      _direction,
      activeSession
    ) => {
      session = activeSession;
    }));
    registerCorridor(orchestrator);

    expect(orchestrator.resolveIntent(intent())).toBe('claim-boundary');
    session?.reportPresentedFrame();
    session?.reportEndpointCommit('receiver');
    session?.reportPresentedFrame();
    session?.reportEndpointCommit('receiver');
    session?.reportTargetPresented();
    frames.shift()?.();
    frames.shift()?.();
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { alignment: { correctionCount: 1 } }
    });
    frames.shift()?.();

    // The boundary claim no longer performs an eager scroll command. The two
    // commands are the transaction-owned alignment and its single correction.
    expect(commands).toHaveLength(2);
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'stable',
      scene: 'services'
    });
  });

  it('aligns an authored Grade A reverse settle to the Method target marker', () => {
    const root = element();
    const frames: Array<() => void> = [];
    const commands: number[] = [];
    let actualY = 5_042;
    let session: PhoneOrchestratedRunSession | undefined;
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'figure2-animation',
      root,
      scrollY: () => actualY,
      scrollTo: (nextY) => {
        commands.push(nextY);
        actualY = nextY;
      },
      scheduleFrame: (callback) => frames.push(callback)
    });
    orchestrator.registerRunCapability('method-figure2', 'test', capability(5_886, (
      _direction,
      activeSession
    ) => {
      session = activeSession;
    }));
    orchestrator.registerScrollCorridor({
      id: 'method-grade-a',
      scenes: ['method-top', 'figure2-animation'],
      sample: () => null,
      boundary: () => 5_886,
      landing: (scene) => scene === 'method-top' ? 4_051 : 5_042
    });

    expect(orchestrator.resolveIntent([
      1,
      -1,
      actualY,
      actualY - 100
    ])).toBe('claim-boundary');
    session?.reportPresentedFrame();
    session?.provideRelease({
      releaseGeometry: () => undefined,
      releaseResources: () => undefined
    });
    session?.reportEndpointCommit('receiver');
    session?.reportTargetPresented();
    frames.shift()?.();
    frames.shift()?.();

    expect(commands).toEqual([4_051]);
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'stable',
      scene: 'method-top',
      scroll: { actualY: 4_051 }
    });
  });

  it('claims a direct Contact reverse input at the canonical Group67 boundary', () => {
    const canonicalBoundary = 6_435.6875;
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'contact',
      scrollY: () => canonicalBoundary + 1,
      scrollTo: () => undefined
    });
    orchestrator.registerScrollCorridor({
      id: 'group67-direct-contact',
      scenes: ['education', 'crane-animation', 'contact'],
      sample: () => null,
      boundary: (run) => run === 'education-contact'
        ? canonicalBoundary
        : null,
      landing: (scene) => scene === 'contact' ? canonicalBoundary : null
    });

    expect(orchestrator.resolveIntent([
      1,
      -1,
      canonicalBoundary + 1,
      canonicalBoundary - 120
    ])).toBe('claim-boundary');
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: {
        operation: {
          run: 'education-contact',
          from: 'contact',
          to: 'education',
          direction: -1
        },
        anchor: { y: canonicalBoundary }
      }
    });
  });

  it('does not publish a next snapshot when a connected root disconnects during preflight', () => {
    const root = Object.assign(element(), { isConnected: true });
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      root,
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    const observed = vi.fn();
    orchestrator.subscribe(observed);
    root.isConnected = false;

    orchestrator.dispatch({
      type: 'HOLD_RECONCILED',
      authorityId: orchestrator.getSnapshot().authorityId,
      scene: 'services'
    });

    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'stable',
      scene: 'brand',
      revision: 0
    });
    expect(observed).not.toHaveBeenCalled();
  });

  it('keeps a canonical direct entry on its own candidate stable surface', () => {
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'ph-animation',
      scrollY: () => 0,
      scrollTo: () => undefined
    });

    orchestrator.dispatch({
      type: 'DIRECT_ENTRY_REQUESTED',
      authorityId: orchestrator.getSnapshot().authorityId,
      target: 'ph-animation',
      source: 'initial',
      fallbackScene: 'lab',
      cinematic: null
    });

    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: {
        phase: 'verifying-target',
        operation: {
          trigger: 'entry',
          run: null,
          from: 'lab',
          to: 'ph-animation'
        }
      },
      projection: { semanticScene: 'ph-animation', commitState: 'candidate' }
    });
  });

  it('replays a stable direct entry after its route root becomes projectable', () => {
    const routeRoot = Object.assign(element(), { isConnected: false });
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'ph-animation',
      root: routeRoot,
      scrollY: () => 0,
      scrollTo: () => undefined
    });

    orchestrator.dispatch({
      type: 'DIRECT_ENTRY_REQUESTED',
      authorityId: orchestrator.getSnapshot().authorityId,
      target: 'ph-animation',
      source: 'initial',
      fallbackScene: 'lab',
      cinematic: null
    });
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'stable',
      scene: 'ph-animation'
    });

    routeRoot.isConnected = true;
    orchestrator.syncDiagnostics();

    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: {
        phase: 'verifying-target',
        operation: { run: null, legIndex: 0, to: 'ph-animation' }
      }
    });
  });

  it('waits for a matching late capability without reviving an old stable input', () => {
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    registerCorridor(orchestrator);

    expect(orchestrator.resolveIntent(intent())).toBe('claim-boundary');
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { phase: 'preparing', inputEpoch: 1 }
    });

    let session: PhoneOrchestratedRunSession | undefined;
    orchestrator.registerRunCapability('brand-services', 'late', capability(100, (
      _direction,
      activeSession
    ) => {
      session = activeSession;
    }));

    expect(session).toMatchObject({
      sessionId: expect.any(String),
      generation: expect.any(Number),
      leg: 0,
      direction: 1
    });
  });

  it('does not replay an unclaimed input when a corridor appears later', () => {
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    let starts = 0;
    orchestrator.registerRunCapability('brand-services', 'test', capability(100, () => {
      starts += 1;
    }));

    expect(orchestrator.resolveIntent(intent())).toBe('pass-native');
    registerCorridor(orchestrator);

    expect(starts).toBe(0);
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'stable',
      scene: 'brand'
    });
  });

  it('uses the same alignment transaction for a stable direct entry after its corridor is ready', () => {
    const frames: Array<() => void> = [];
    let actualY = 0;
    const commands: number[] = [];
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      scrollY: () => actualY,
      scrollTo: (nextY) => {
        commands.push(nextY);
        actualY = nextY;
      },
      scheduleFrame: (callback) => frames.push(callback)
    });

    orchestrator.dispatch({
      type: 'DIRECT_ENTRY_REQUESTED',
      authorityId: orchestrator.getSnapshot().authorityId,
      target: 'services',
      source: 'menu',
      fallbackScene: 'brand',
      cinematic: null
    });
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { phase: 'verifying-target' },
      projection: { semanticScene: 'services', commitState: 'candidate' }
    });
    expect(commands).toEqual([]);

    orchestrator.registerScrollCorridor({
      id: 'direct-services',
      scenes: ['brand', 'services'],
      sample: () => null,
      boundary: () => 100,
      landing: (scene) => scene === 'services' ? 220 : 0
    });
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { phase: 'verifying-target' }
    });
    orchestrator.registerSurface({
      id: 'native:services',
      scene: 'services',
      kind: 'native',
      root: () => element(),
      presented: () => true
    });
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { phase: 'measuring-landing' }
    });
    frames.shift()?.();
    frames.shift()?.();

    expect(commands).toEqual([220]);
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'stable',
      scene: 'services',
      session: null
    });
  });

  it('retries a direct entry when route geometry becomes ready after its candidate frame', () => {
    const frames: Array<() => void> = [];
    let actualY = 0;
    let landingReady = false;
    const commands: number[] = [];
    const root = element();
    const services = element();
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      root,
      scrollY: () => actualY,
      scrollTo: (nextY) => {
        commands.push(nextY);
        actualY = nextY;
      },
      scheduleFrame: (callback) => frames.push(callback)
    });

    orchestrator.registerScrollCorridor({
      id: 'direct-services-delayed-geometry',
      scenes: ['brand', 'services'],
      sample: () => null,
      boundary: () => 100,
      landing: (scene) => (
        landingReady && scene === 'services' ? 220 : null
      )
    });
    orchestrator.registerSurface({
      id: 'native:services',
      scene: 'services',
      kind: 'native',
      root: () => services,
      presented: () => true
    });

    orchestrator.dispatch({
      type: 'DIRECT_ENTRY_REQUESTED',
      authorityId: orchestrator.getSnapshot().authorityId,
      target: 'services',
      source: 'initial',
      fallbackScene: 'brand',
      cinematic: null
    });
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { phase: 'verifying-target' }
    });

    landingReady = true;
    orchestrator.syncDiagnostics();

    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'transaction',
      session: { phase: 'measuring-landing' }
    });
    frames.shift()?.();
    frames.shift()?.();

    expect(commands).toEqual([220]);
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'stable',
      scene: 'services',
      session: null
    });
  });

  it.each(['hash', 'menu', 'history'] as const)(
    'normalizes %s navigation into the same direct-entry transaction',
    (source) => {
      const orchestrator = createPhoneStoryOrchestrator({
        initialScene: 'brand',
        scrollY: () => 0,
        scrollTo: () => undefined
      });

      orchestrator.dispatch({
        type: 'NAVIGATE_REQUESTED',
        authorityId: orchestrator.getSnapshot().authorityId,
        scene: 'services',
        source
      });

      expect(orchestrator.getSnapshot()).toMatchObject({
        status: 'transaction',
        session: {
          operation: {
            trigger: 'entry',
            run: null,
            direction: 1,
            from: 'brand',
            to: 'services'
          }
        }
      });
    }
  );
});
