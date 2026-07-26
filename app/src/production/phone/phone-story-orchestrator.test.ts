import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPhoneStoryOrchestrator,
  type PhoneRunCapability
} from './phone-story-orchestrator';
import type { PhoneIntent } from './phone-transition-coordinator';

function intent(
  inputEpoch: number,
  direction: 1 | -1 = 1
): PhoneIntent {
  return {
    inputEpoch,
    direction,
    startY: direction === 1 ? 0 : 300,
    projectedY: direction === 1 ? 300 : 0
  };
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('single phone story orchestrator', () => {
  it('runs only the cursor-adjacent boundary and never scans ahead', () => {
    const starts: string[] = [];
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    orchestrator.registerRunCapability(
      'services-lab',
      'group45-services',
      capability(200, () => {
        starts.push('services-lab');
      })
    );

    expect(orchestrator.handleIntent(intent(1))).toBe(false);
    expect(starts).toEqual([]);
    expect(orchestrator.cursor()).toMatchObject({
      kind: 'hold',
      scene: 'brand'
    });
  });

  it.fails('[Task 3] does not resurrect an unclaimed gesture after the source revision changes', () => {
    const start = vi.fn();
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'star-map',
      scrollY: () => 0,
      scrollTo: () => undefined
    });

    expect(orchestrator.handleIntent(intent(1))).toBe(false);
    orchestrator.registerRunCapability(
      'aod-method',
      'front-half-aod',
      capability(100, start)
    );
    expect(start).not.toHaveBeenCalled();

    orchestrator.reconcileHold('aod-animation');
    expect(start).not.toHaveBeenCalled();
    expect(orchestrator.cursor()).toMatchObject({
      kind: 'hold',
      scene: 'aod-animation'
    });
  });

  it('latches a programmatic boundary request without consuming a gesture epoch', () => {
    let session: Parameters<PhoneRunCapability['start']>[1] | undefined;
    const start = vi.fn((_direction, activeSession) => {
      session = activeSession;
    });
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'aod-animation',
      scrollY: () => 100,
      scrollTo: () => undefined
    });
    orchestrator.registerRunCapability(
      'aod-method',
      'front-half-aod',
      capability(100, start)
    );

    expect(orchestrator.requestRun(1)).toBe(true);
    expect(orchestrator.requestRun(1)).toBe(false);
    expect(start).toHaveBeenCalledTimes(1);

    session?.reportFailure();
    expect(orchestrator.handleIntent(intent(1))).toBe(true);
    expect(start).toHaveBeenCalledTimes(2);
  });

  it('consumes at most one adjacent run from a gesture epoch', () => {
    let brandSession: Parameters<PhoneRunCapability['start']>[1] | undefined;
    let servicesSession: Parameters<PhoneRunCapability['start']>[1] | undefined;
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    orchestrator.registerRunCapability(
      'brand-services',
      'group45-brand',
      capability(100, (_direction, session) => {
        brandSession = session;
      })
    );
    orchestrator.registerRunCapability(
      'services-lab',
      'group45-services',
      capability(200, (_direction, session) => {
        servicesSession = session;
      })
    );

    expect(orchestrator.handleIntent(intent(1))).toBe(true);
    brandSession?.reportPresentedFrame();
    brandSession?.reportEndpointCommit('receiver');
    brandSession?.reportPresentedFrame();
    brandSession?.reportEndpointCommit('receiver');
    expect(orchestrator.cursor()).toMatchObject({
      kind: 'hold',
      scene: 'services'
    });
    expect(orchestrator.handleIntent(intent(1))).toBe(true);
    expect(servicesSession).toBeUndefined();
    expect(orchestrator.handleIntent(intent(2))).toBe(true);
    expect(servicesSession).toBeDefined();
  });

  it('claims a boundary crossed by the cumulative wheel epoch after native overshoot', () => {
    const start = vi.fn();
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'services',
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    orchestrator.registerRunCapability(
      'services-lab',
      'group45-services',
      capability(200, start)
    );

    expect(orchestrator.handleIntent({
      ...intent(1),
      startY: 0,
      projectedY: 80
    })).toBe(false);
    expect(orchestrator.handleIntent({
      ...intent(1),
      startY: 240,
      projectedY: 320
    })).toBe(true);
    expect(start).toHaveBeenCalledOnce();
  });

  it('keeps the latest Strict Mode registration when stale cleanup runs', () => {
    const firstStart = vi.fn();
    const secondStart = vi.fn();
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    const stale = orchestrator.registerRunCapability(
      'brand-services',
      'group45-brand',
      capability(100, firstStart)
    );
    orchestrator.registerRunCapability(
      'brand-services',
      'group45-brand',
      capability(100, secondStart)
    );

    stale.dispose();
    expect(orchestrator.handleIntent(intent(1))).toBe(true);
    expect(firstStart).not.toHaveBeenCalled();
    expect(secondStart).toHaveBeenCalledTimes(1);
  });

  it('rolls abort back before unlocking and ignores stale completion', () => {
    let session: Parameters<PhoneRunCapability['start']>[1] | undefined;
    const inputStates: boolean[] = [];
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    orchestrator.subscribe(() => {
      inputStates.push(orchestrator.getSnapshot().status === 'transaction');
    });
    orchestrator.registerRunCapability(
      'brand-services',
      'group45-brand',
      capability(100, (_direction, activeSession) => {
        session = activeSession;
      })
    );

    orchestrator.handleIntent(intent(1));
    session?.reportFailure();
    expect(orchestrator.cursor()).toMatchObject({ kind: 'hold', scene: 'brand' });
    expect(inputStates).toEqual([true, true, false]);
    session?.reportAnimationComplete();
    expect(orchestrator.cursor()).toMatchObject({
      kind: 'hold',
      scene: 'brand'
    });
  });

  it('keeps the accepted boundary as the only run anchor', () => {
    let session: Parameters<PhoneRunCapability['start']>[1] | undefined;
    const scrollTo = vi.fn();
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      scrollY: () => 0,
      scrollTo
    });
    orchestrator.registerRunCapability(
      'brand-services',
      'group45-brand',
      capability(100, (_direction, activeSession) => {
        session = activeSession;
      })
    );

    orchestrator.handleIntent(intent(1));
    expect(session).not.toHaveProperty('moveTo');
    expect(orchestrator.handleIntent(intent(2))).toBe(true);
    expect(scrollTo).toHaveBeenLastCalledWith(100);
  });

  it('derives transition presentation from the canonical cursor', () => {
    let session: Parameters<PhoneRunCapability['start']>[1] | undefined;
    const onPresentation = vi.fn();
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'method-top',
      scrollY: () => 0,
      scrollTo: () => undefined,
      onPresentation
    });
    orchestrator.registerRunCapability(
      'method-figure2',
      'grade-a-method',
      capability(100, (_direction, activeSession) => {
        session = activeSession;
      })
    );

    orchestrator.handleIntent(intent(1));
    expect(onPresentation).toHaveBeenLastCalledWith(expect.objectContaining({
      scene: 'method-top',
      checkpoint: 'method-to-figure2',
      edge: 'method'
    }));

    session?.reportPresentedFrame();
    session?.reportProgress(0.5);
    expect(onPresentation).toHaveBeenLastCalledWith(expect.objectContaining({
      scene: 'figure2-animation',
      checkpoint: 'method-to-figure2',
      edge: 'method'
    }));
  });

  it('reconciles front-half handoffs through the canonical cursor', () => {
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'hero',
      scrollY: () => 0,
      scrollTo: () => undefined
    });

    orchestrator.reconcileScrollRun('hero-pattern-scroll', 1, 0.5);
    expect(orchestrator.cursor()).toMatchObject({
      kind: 'transition',
      run: 'hero-pattern-scroll',
      segment: 'hero-pattern',
      phase: 'animating',
      progress: 0.5
    });

    orchestrator.reconcileScrollHold('pattern');
    expect(orchestrator.cursor()).toMatchObject({
      kind: 'hold',
      scene: 'pattern'
    });
  });

  it('rejects stale front-half refresh after AOD commits Method', () => {
    let session: Parameters<PhoneRunCapability['start']>[1] | undefined;
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'aod-animation',
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    orchestrator.registerRunCapability(
      'aod-method',
      'front-half-aod',
      capability(100, (_direction, activeSession) => {
        session = activeSession;
      })
    );

    orchestrator.handleIntent(intent(1));
    session?.reportPresentedFrame();
    session?.reportAnimationComplete();
    expect(orchestrator.cursor()).toMatchObject({
      kind: 'hold',
      scene: 'method-top'
    });

    orchestrator.reconcileScrollHold('aod-animation');
    expect(orchestrator.cursor()).toMatchObject({
      kind: 'hold',
      scene: 'method-top'
    });
  });

  it('derives input state from the single snapshot through terminal settlement', () => {
    let session: Parameters<PhoneRunCapability['start']>[1] | undefined;
    const frames: Array<() => void> = [];
    const events: string[] = [];
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      scrollY: () => 0,
      scrollTo: (y) => events.push(`scroll:${y}`),
      scheduleFrame: (callback) => {
        frames.push(callback);
      }
    });
    orchestrator.registerRunCapability(
      'brand-services',
      'group45-brand',
      capability(100, (_direction, activeSession) => {
        session = activeSession;
      })
    );

    orchestrator.handleIntent(intent(1));
    session?.reportPresentedFrame();
    session?.reportEndpointCommit('receiver');
    session?.reportPresentedFrame();
    session?.provideRelease(() => events.push('release'));
    session?.reportEndpointCommit('receiver');

    expect(orchestrator.cursor()).toMatchObject({
      kind: 'transition',
      phase: 'measuring-landing'
    });
    expect(orchestrator.getSnapshot().status).toBe('transaction');
    expect(events).toEqual(['scroll:100', 'scroll:100']);

    expect(frames).toHaveLength(1);
    frames.shift()?.();
    expect(orchestrator.cursor()).toMatchObject({
      kind: 'hold',
      scene: 'services'
    });
    expect(orchestrator.getSnapshot().status).toBe('stable');
    expect(events).toEqual(['scroll:100', 'scroll:100']);
    expect(frames).toHaveLength(1);

    frames.shift()?.();
    expect(events).toEqual([
      'scroll:100',
      'scroll:100',
      'release',
      'scroll:100'
    ]);
  });

  it('requires the controller-owned target surface commit before it can publish hold', () => {
    let session: Parameters<PhoneRunCapability['start']>[1] | undefined;
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'aod-animation',
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    orchestrator.registerRunCapability(
      'aod-method',
      'front-half-aod',
      capability(100, (_direction, activeSession) => {
        session = activeSession;
      })
    );
    const source = { dataset: {} } as HTMLElement;
    const receiver = { dataset: {} } as HTMLElement;

    orchestrator.handleIntent(intent(1));
    session?.reportEndpoints(source, receiver);
    session?.reportPresentedFrame();
    session?.reportAnimationComplete();

    expect(orchestrator.cursor()).toMatchObject({
      kind: 'transition',
      phase: 'animating'
    });
    expect(receiver.dataset.phoneSurfaceRole).toBe('transition-endpoint');

    session?.reportEndpointCommit('receiver');
    expect(orchestrator.cursor()).toMatchObject({
      kind: 'hold',
      scene: 'method-top'
    });
    expect(receiver.dataset.phoneSurfaceRole).toBe('native-stable');
  });

  it('owns the authored progress clock and only commits after its endpoint renders', () => {
    const frames = new Map<number, FrameRequestCallback>();
    let sequence = 0;
    vi.stubGlobal('window', {
      requestAnimationFrame(callback: FrameRequestCallback) {
        const id = ++sequence;
        frames.set(id, callback);
        return id;
      },
      cancelAnimationFrame(id: number) {
        frames.delete(id);
      }
    });
    let session: Parameters<PhoneRunCapability['start']>[1] | undefined;
    const rendered: number[] = [];
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'aod-animation',
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    orchestrator.registerRunCapability(
      'aod-method',
      'front-half-aod',
      capability(100, (_direction, activeSession) => {
        session = activeSession;
      })
    );

    orchestrator.handleIntent(intent(1));
    session?.reportPresentedFrame();
    session?.animate(0, 1, 1500, (progress) => rendered.push(progress), () => {
      session?.reportAnimationComplete();
    });
    const flush = (now: number) => {
      const pending = [...frames.values()];
      frames.clear();
      for (const frame of pending) frame(now);
    };

    flush(0);
    flush(1499);
    expect(orchestrator.cursor()).toMatchObject({
      kind: 'transition',
      phase: 'animating'
    });
    expect(rendered.at(-1)).toBeCloseTo(1499 / 1500, 4);
    flush(1500);
    expect(orchestrator.cursor()).toMatchObject({
      kind: 'hold',
      scene: 'method-top'
    });
  });

  it('starts a cinematic direct entry at its canonical media leg', () => {
    let session: Parameters<
      NonNullable<PhoneRunCapability['startAtLeg']>
    >[1] | undefined;
    const startAtLeg = vi.fn((legIndex, activeSession) => {
      expect(legIndex).toBe(1);
      session = activeSession;
    });
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'ph-animation',
      scrollY: () => 240,
      scrollTo: () => undefined
    });

    orchestrator.registerRunCapability(
      'lab-education',
      'group67-ph',
      {
        ...capability(240, () => undefined),
        startAtLeg
      }
    );

    expect(startAtLeg).not.toHaveBeenCalled();
    orchestrator.activateDirectEntry();
    expect(startAtLeg).toHaveBeenCalledTimes(1);
    expect(orchestrator.cursor()).toMatchObject({
      kind: 'transition',
      run: 'lab-education',
      legIndex: 1,
      segment: 'ph-education',
      progress: 0
    });

    session?.reportPresentedFrame();
    session?.reportAnimationComplete();
    expect(orchestrator.cursor()).toMatchObject({
      kind: 'hold',
      scene: 'education'
    });
  });

  it('routes cinematic direct-entry rollback through the same snapshot trace', () => {
    let session: Parameters<
      NonNullable<PhoneRunCapability['startAtLeg']>
    >[1] | undefined;
    const presentations: string[] = [];
    const retryable = vi.fn();
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'ph-animation',
      scrollY: () => 240,
      scrollTo: () => undefined,
      onPresentation: ({ scene }) => {
        if (scene) presentations.push(scene);
      },
      onRetryable: retryable
    });
    orchestrator.registerRunCapability('lab-education', 'group67-ph', {
      ...capability(240, () => undefined),
      startAtLeg: (_legIndex, activeSession) => {
        session = activeSession;
      }
    });
    orchestrator.activateDirectEntry();

    session?.reportFailure();

    expect(orchestrator.cursor()).toMatchObject({
      kind: 'hold',
      scene: 'lab'
    });
    expect(presentations).toContain('ph-animation');
    expect(presentations.at(-1)).toBe('lab');
    expect(retryable).toHaveBeenCalledWith('lab-education');
  });

  it('publishes a stable hold only through cursor reconciliation', () => {
    const onPresentation = vi.fn();
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      scrollY: () => 0,
      scrollTo: () => undefined,
      onPresentation
    });

    expect(onPresentation).not.toHaveBeenCalled();

    orchestrator.reconcileHold('brand');
    expect(onPresentation).toHaveBeenCalledWith(expect.objectContaining({
      scene: 'brand',
      checkpoint: 'brand-reading',
      edge: 'brand'
    }));
  });

  it('is the only owner that commits the selected stable scene adapter', () => {
    const brand = vi.fn();
    const services = vi.fn();
    const brandRoot = { dataset: {} } as HTMLElement;
    const servicesRoot = { dataset: {} } as HTMLElement;
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      scrollY: () => 0,
      scrollTo: () => undefined
    });

    orchestrator.registerStableSceneAdapter('brand', 'brand', {
      root: () => brandRoot,
      commit: brand
    });
    orchestrator.registerStableSceneAdapter('services', 'services', {
      root: () => servicesRoot,
      commit: services
    });

    // Registration makes the current hold visible, but it cannot choose a
    // different scene. The next commit is still made by reconciliation.
    expect(brand).toHaveBeenCalledOnce();
    expect(services).not.toHaveBeenCalled();
    expect(brandRoot.dataset.phoneSurfaceRole).toBe('native-stable');
    orchestrator.reconcileHold('services');
    expect(brand).toHaveBeenCalledOnce();
    expect(services).toHaveBeenCalledOnce();
    expect(brandRoot.dataset.phoneSurfaceRole).toBe('native-under-stage');
    expect(servicesRoot.dataset.phoneSurfaceRole).toBe('native-stable');
    // A lazily mounted root may report readiness later. Diagnostics replays
    // the already-selected hold; it never lets the adapter select a scene.
    orchestrator.syncDiagnostics();
    expect(services).toHaveBeenCalledTimes(2);
  });

  it.fails('[Task 2] keeps stable visibility out of adapter commit callbacks', () => {
    const commit = vi.fn();
    const root = { dataset: {} } as HTMLElement;
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'brand',
      root,
      scrollY: () => 0,
      scrollTo: () => undefined
    });

    orchestrator.registerStableSceneAdapter('brand', 'brand', {
      root: () => root,
      commit
    });
    orchestrator.syncDiagnostics();

    expect(commit).not.toHaveBeenCalled();
  });

  it('keeps the fixed-stage surface active through every canonical cursor', () => {
    const root = { dataset: {} } as HTMLElement;
    let session: Parameters<PhoneRunCapability['start']>[1] | undefined;
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'method-top',
      root,
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    orchestrator.registerRunCapability(
      'method-figure2',
      'grade-a-method',
      capability(100, (_direction, activeSession) => {
        session = activeSession;
      })
    );

    orchestrator.syncDiagnostics();
    expect(root.dataset.portraitStageActive).toBe('true');
    expect(root.dataset.portraitAodMethodVisible).toBe('true');

    orchestrator.handleIntent(intent(1));
    expect(root.dataset.portraitStageActive).toBe('true');
    session?.reportPresentedFrame();
    session?.reportEndpointCommit('receiver');
    expect(orchestrator.cursor()).toMatchObject({
      kind: 'hold',
      scene: 'figure2-animation'
    });
    expect(root.dataset.portraitStageActive).toBe('true');
    expect(root.dataset.portraitAodMethodVisible).toBe('false');
  });

  it('lands a committed document receiver at its natural coordinate', () => {
    let session: Parameters<PhoneRunCapability['start']>[1] | undefined;
    const scrolls: number[] = [];
    const brandRoot = {
      dataset: {},
      getBoundingClientRect: () => ({ top: 844 })
    } as unknown as HTMLElement;
    const orchestrator = createPhoneStoryOrchestrator({
      initialScene: 'figure2-proof',
      scrollY: () => 9105,
      scrollTo: (y) => scrolls.push(y)
    });
    orchestrator.registerStableSceneAdapter('brand', 'brand', {
      root: () => brandRoot,
      commit: () => undefined
    });
    orchestrator.registerRunCapability(
      'proof-brand',
      'grade-a-brand',
      capability(9105, (_direction, activeSession) => {
        session = activeSession;
      })
    );

    expect(orchestrator.handleIntent({
      inputEpoch: 1,
      direction: 1,
      startY: 9000,
      projectedY: 9200
    })).toBe(true);
    session?.reportPresentedFrame();
    session?.reportEndpointCommit('receiver');

    expect(orchestrator.cursor()).toMatchObject({
      kind: 'hold',
      scene: 'brand'
    });
    expect(scrolls[0]).toBe(9105);
    expect(scrolls.slice(1)).toEqual([9949, 9949]);
  });
});
