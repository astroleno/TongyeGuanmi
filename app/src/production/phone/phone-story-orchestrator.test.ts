import { describe, expect, it, vi } from 'vitest';
import {
  createPhoneStoryOrchestrator,
  type PhoneOrchestratedRunSession,
  type PhoneRunCapability
} from './phone-story-orchestrator';

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
  return { inputEpoch: 1, direction: 1 as const, startY: 0, projectedY: 240 };
}

describe('single phone story projector transaction', () => {
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

    orchestrator.reconcileHold('services');

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
    orchestrator.reconcileHold('services');
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

    expect(orchestrator.handleIntent(intent())).toBe(true);
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
    orchestrator.subscribe(() => {
      if (orchestrator.getSnapshot().status === 'stable') {
        events.push(`stable:${root.dataset.phoneInputState}`);
      }
    });

    orchestrator.handleIntent(intent());
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

    orchestrator.handleIntent(intent());
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
        if (commands.length >= 3) actualY = nextY;
      },
      scheduleFrame: (callback) => frames.push(callback)
    });
    orchestrator.registerRunCapability('brand-services', 'test', capability(100, (
      _direction,
      activeSession
    ) => {
      session = activeSession;
    }));

    orchestrator.handleIntent(intent());
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

    expect(commands).toHaveLength(3);
    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'stable',
      scene: 'services'
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

    orchestrator.reconcileHold('services');

    expect(orchestrator.getSnapshot()).toMatchObject({
      status: 'stable',
      scene: 'brand',
      revision: 0
    });
    expect(observed).not.toHaveBeenCalled();
  });

  it('captures immutable direct-entry execution identity at the cinematic leg', () => {
    let session: PhoneOrchestratedRunSession | undefined;
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'ph-animation',
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    orchestrator.registerRunCapability('lab-education', 'test', {
      ...capability(0, () => undefined),
      startAtLeg: (_leg, activeSession) => {
        session = activeSession;
      }
    });

    orchestrator.activateDirectEntry();

    expect(session).toMatchObject({
      authorityId: expect.any(String),
      sessionId: expect.any(String),
      generation: expect.any(Number),
      leg: 1,
      direction: 1
    });
  });
});
