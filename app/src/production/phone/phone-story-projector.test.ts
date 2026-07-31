import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPhoneStorySnapshot,
  phonePresentationSnapshot,
  reducePhoneStorySnapshot
} from './phone-story/machine';
import { createPhoneStoryPresentation } from './phone-story/presentation';

function element() {
  const styles = new Map<string, string>();
  return {
    dataset: {} as DOMStringMap,
    style: {
      setProperty(name: string, value: string) {
        styles.set(name, value);
      },
      removeProperty(name: string) {
        styles.delete(name);
      },
      getPropertyValue(name: string) {
        return styles.get(name) ?? '';
      }
    }
  } as unknown as HTMLElement;
}

function preflight(
  projector: ReturnType<typeof createPhoneStoryPresentation>,
  snapshot: Parameters<typeof phonePresentationSnapshot>[0]
) {
  return projector.preflight(phonePresentationSnapshot(snapshot));
}

describe('phone story projector', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('applies the full stable projection synchronously to one route root', () => {
    const root = element();
    const projector = createPhoneStoryPresentation({
      authorityId: 'phone-authority-test',
      scope: 'formal',
      root: () => root
    });
    const snapshot = createPhoneStorySnapshot({
      authorityId: 'phone-authority-test',
      scene: 'brand',
      actualY: 120
    });

    const plan = preflight(projector, snapshot);
    expect(plan).not.toBeNull();
    if (!plan) throw new Error('Expected a stable projection plan');
    projector.apply(plan);

    expect(root.dataset).toMatchObject({
      phoneAuthorityId: 'phone-authority-test',
      phoneAuthorityScope: 'formal',
      phoneCursor: 'hold:brand',
      phoneRevision: '0',
      phoneInputState: 'free',
      phoneStageOwner: 'native',
      phoneStageScene: 'none',
      phoneProjectionState: 'stable',
      phoneStableScene: 'brand',
      portraitCheckpoint: 'brand-reading',
      portraitEdgeScene: 'brand'
    });
    expect(root.dataset.portraitStageActive).toBeUndefined();
  });

  it('publishes one transaction identity and progress sample for browser acceptance', () => {
    const root = element();
    const projector = createPhoneStoryPresentation({
      authorityId: 'phone-authority-test',
      scope: 'formal',
      root: () => root
    });
    const initial = createPhoneStorySnapshot({
      authorityId: 'phone-authority-test',
      scene: 'brand',
      actualY: 120
    });
    const transaction = reducePhoneStorySnapshot(initial, {
      type: 'DIRECT_ENTRY_REQUESTED',
      authorityId: 'phone-authority-test',
      target: 'services',
      source: 'initial',
      fallbackScene: 'brand',
      cinematic: { run: 'brand-services', direction: 1, legIndex: 0 }
    }).snapshot;
    const plan = preflight(projector, transaction);
    expect(plan).not.toBeNull();
    if (!plan) throw new Error('Expected a transaction projection plan');
    projector.apply(plan);

    expect(root.dataset).toMatchObject({
      phoneAuthorityId: 'phone-authority-test',
      phoneSession: 'phone-session-1',
      phoneTransitionGeneration: '1',
      phoneTransitionLeg: '0',
      phoneTransitionDirection: '1',
      phoneTransitionProgress: '0.0000',
      phoneTransitionPhase: 'preparing',
      phoneInputState: 'locked'
    });

    const stablePlan = preflight(projector, createPhoneStorySnapshot({
      authorityId: 'phone-authority-test',
      scene: 'services',
      actualY: 220
    }));
    if (!stablePlan) throw new Error('Expected a stable projection plan');
    projector.apply(stablePlan);
    expect(root.dataset.phoneTransitionGeneration).toBeUndefined();
    expect(root.dataset.phoneTransitionLeg).toBeUndefined();
    expect(root.dataset.phoneTransitionDirection).toBeUndefined();
    expect(root.dataset.phoneTransitionProgress).toBeUndefined();
  });

  it('clears decorated non-surface endpoints before the next stable projection', () => {
    const root = element();
    const brand = element();
    const services = element();
    const transientSource = element();
    const transientReceiver = element();
    const projector = createPhoneStoryPresentation({
      authorityId: 'phone-authority-test',
      scope: 'formal',
      root: () => root
    });
    projector.registerSurface({
      id: 'native:brand',
      scene: 'brand',
      kind: 'native',
      root: () => brand
    });
    projector.registerSurface({
      id: 'native:services',
      scene: 'services',
      kind: 'native',
      root: () => services
    });
    const initial = createPhoneStorySnapshot({
      authorityId: 'phone-authority-test',
      scene: 'brand'
    });
    const transaction = reducePhoneStorySnapshot(initial, {
      type: 'DIRECT_ENTRY_REQUESTED',
      authorityId: 'phone-authority-test',
      target: 'services',
      source: 'initial',
      fallbackScene: 'brand',
      cinematic: { run: 'brand-services', direction: 1, legIndex: 0 }
    }).snapshot;
    projector.registerTransitionEndpoints({
      source: transientSource,
      receiver: transientReceiver,
      sessionId: 'phone-session-1',
      generation: 1
    });
    const transactionPlan = preflight(projector, transaction);
    if (!transactionPlan) throw new Error('Expected a transaction projection plan');
    projector.apply(transactionPlan);
    expect(transientSource.dataset).toMatchObject({
      phoneSurfaceRole: 'transition-source',
      phoneBoundarySession: 'phone-session-1',
      phoneBoundaryGeneration: '1',
      phoneBoundaryEndpoint: 'source'
    });

    projector.clearTransitionEndpoints();
    const stablePlan = preflight(projector, createPhoneStorySnapshot({
      authorityId: 'phone-authority-test',
      scene: 'services'
    }));
    if (!stablePlan) throw new Error('Expected a stable projection plan');
    projector.apply(stablePlan);

    for (const endpoint of [transientSource, transientReceiver]) {
      expect(endpoint.dataset.phoneSurfaceRole).toBeUndefined();
      expect(endpoint.dataset.phoneBoundarySession).toBeUndefined();
      expect(endpoint.dataset.phoneBoundaryGeneration).toBeUndefined();
      expect(endpoint.dataset.phoneBoundaryEndpoint).toBeUndefined();
    }
  });

  it('does not let a late old disposal clear the new root or document lease', () => {
    const routeRoot = element();
    const documentElement = element();
    const themeAttributes = new Map([['content', '#010203']]);
    const theme = {
      getAttribute(name: string) {
        return themeAttributes.get(name) ?? null;
      },
      setAttribute(name: string, value: string) {
        themeAttributes.set(name, value);
      }
    } as unknown as HTMLMetaElement;
    vi.stubGlobal('document', {
      documentElement,
      querySelector: () => theme
    } as unknown as Document);
    const oldProjector = createPhoneStoryPresentation({
      authorityId: 'phone-authority-old',
      scope: 'formal',
      root: () => routeRoot
    });
    const newProjector = createPhoneStoryPresentation({
      authorityId: 'phone-authority-new',
      scope: 'brand-lab',
      root: () => routeRoot
    });
    const apply = (
      projector: ReturnType<typeof createPhoneStoryPresentation>,
      authorityId: string,
      scene: 'brand' | 'services'
    ) => {
      const plan = preflight(projector, createPhoneStorySnapshot({
        authorityId,
        scene
      }));
      if (!plan) throw new Error('Expected a projection plan');
      projector.apply(plan);
    };

    apply(oldProjector, 'phone-authority-old', 'brand');
    apply(newProjector, 'phone-authority-new', 'services');
    oldProjector.dispose();

    expect(routeRoot.dataset).toMatchObject({
      phoneAuthorityId: 'phone-authority-new',
      phoneAuthorityScope: 'brand-lab',
      phoneCursor: 'hold:services',
      portraitEdgeScene: 'services'
    });
    expect(documentElement.dataset).toMatchObject({
      portraitEdgeScene: 'services',
      portraitCheckpoint: 'services-reading'
    });
    expect(theme.getAttribute('content')).not.toBe('#010203');

    newProjector.dispose();
    expect(routeRoot.dataset.phoneAuthorityId).toBeUndefined();
    expect(documentElement.dataset.portraitEdgeScene).toBeUndefined();
    expect(theme.getAttribute('content')).toBe('#010203');
  });

  it('[Task 4] assigns one fixed front surface role and retires sibling roots', () => {
    const root = element();
    const hero = element();
    const pattern = element();
    const projector = createPhoneStoryPresentation({
      authorityId: 'phone-authority-test',
      scope: 'formal',
      root: () => root
    });
    projector.registerSurface({
      id: 'front:hero',
      scene: 'hero',
      kind: 'fixed',
      root: () => hero
    });
    projector.registerSurface({
      id: 'front:pattern',
      scene: 'pattern',
      kind: 'fixed',
      root: () => pattern
    });
    const plan = preflight(projector, createPhoneStorySnapshot({
      authorityId: 'phone-authority-test',
      scene: 'hero'
    }));
    if (!plan) throw new Error('Expected front projection plan');
    projector.apply(plan);

    expect(hero.dataset.phoneSurfaceRole).toBe('fixed-current');
    expect(pattern.dataset.phoneSurfaceRole).toBe('retired');
  });

  it('[R5] rejects a selected surface whose evidence reader says it is hidden or lacks live coverage', () => {
    const root = element();
    const hero = element();
    const projector = createPhoneStoryPresentation({
      authorityId: 'phone-authority-test',
      scope: 'formal',
      root: () => root
    });
    projector.registerSurface({
      id: 'front:hero',
      scene: 'hero',
      kind: 'fixed',
      root: () => hero,
      coverageRoot: () => hero,
      presentation: () => [true, false, false, true, null]
    } as never);

    expect(preflight(projector, createPhoneStorySnapshot({
      authorityId: 'phone-authority-test',
      scene: 'hero'
    }))).toBeNull();
  });

  it('[R5] permits a projector-dormant receiver only during preflight', () => {
    const root = element();
    const method = element();
    const modes: string[] = [];
    const projector = createPhoneStoryPresentation({
      authorityId: 'phone-authority-test',
      scope: 'formal',
      root: () => root
    });
    projector.registerSurface({
      id: 'native:method',
      scene: 'method-top',
      kind: 'native',
      root: () => method,
      coverageRoot: () => method,
      presentation: (mode) => {
        modes.push(mode);
        return [true, mode === 'preflight', true, true, 'static-poster'];
      }
    });

    const plan = preflight(projector, createPhoneStorySnapshot({
      authorityId: 'phone-authority-test',
      scene: 'method-top'
    }));
    expect(plan).not.toBeNull();
    if (!plan) throw new Error('Expected a preflight plan for the dormant receiver');
    projector.apply(plan);

    expect(method.dataset.phoneSurfaceRole).toBe('stable');
    expect(projector.hasPresentedSurface('method-top')).toBe(false);
    expect(modes).toEqual(['preflight', 'committed']);
  });

  it('[R5] admits a preparing transition before its inactive receiver becomes live', () => {
    const root = element();
    const figure2 = element();
    const proof = element();
    const projector = createPhoneStoryPresentation({
      authorityId: 'phone-authority-test',
      scope: 'formal',
      root: () => root
    });
    projector.registerSurface({
      id: 'grade-a:figure2',
      scene: 'figure2-animation',
      kind: 'fixed',
      root: () => figure2,
      coverageRoot: () => figure2,
      presentation: () => [true, true, true, false, null]
    });
    projector.registerSurface({
      id: 'grade-a:proof',
      scene: 'figure2-proof',
      kind: 'fixed',
      root: () => proof,
      coverageRoot: () => proof,
      // The Figure2 → Proof receiver starts inert and is activated only after
      // the authority applies this transaction's transition roles.
      presentation: () => [true, false, false, false, null]
    });
    const transaction = reducePhoneStorySnapshot(createPhoneStorySnapshot({
      authorityId: 'phone-authority-test',
      scene: 'figure2-animation'
    }), {
      type: 'RUN_STARTED',
      authorityId: 'phone-authority-test',
      sessionId: 'phone-session-1',
      generation: 1,
      leg: 0,
      direction: 1,
      run: 'figure2-proof',
      anchorY: 720,
      inputEpoch: 1
    }).snapshot;

    const plan = preflight(projector, transaction);

    expect(transaction).toMatchObject({
      status: 'transaction',
      session: { phase: 'preparing' },
      projection: { commitState: 'transition' }
    });
    expect(plan).not.toBeNull();
    if (!plan) throw new Error('Expected preparing Figure2 → Proof transition plan');
    projector.apply(plan);
    expect(proof.dataset.phoneSurfaceRole).toBe('transition-receiver');
  });

  it('[R5] keeps one live physical plane through a source-led media handoff', () => {
    const root = element();
    const figure3 = element();
    const services = element();
    let receiverVisible = false;
    const projector = createPhoneStoryPresentation({
      authorityId: 'phone-authority-test',
      scope: 'formal',
      root: () => root
    });
    projector.registerSurface({
      id: 'group45:figure3',
      scene: 'figure3-animation',
      kind: 'fixed',
      root: () => figure3,
      coverageRoot: () => figure3,
      presentation: () => [true, true, true, false, null]
    });
    projector.registerSurface({
      id: 'native:services',
      scene: 'services',
      kind: 'native',
      root: () => services,
      coverageRoot: () => services,
      presentation: () => [true, receiverVisible, true, false, null]
    });
    const preparing = reducePhoneStorySnapshot(createPhoneStorySnapshot({
      authorityId: 'phone-authority-test',
      scene: 'brand'
    }), {
      type: 'RUN_STARTED',
      authorityId: 'phone-authority-test',
      sessionId: 'phone-session-1',
      generation: 1,
      leg: 1,
      legIndex: 1,
      direction: 1,
      run: 'brand-services',
      anchorY: 720,
      inputEpoch: 1
    }).snapshot;
    if (preparing.status !== 'transaction') {
      throw new Error('Expected a Figure3 → Services transaction');
    }
    const { session } = preparing;
    const animating = reducePhoneStorySnapshot(preparing, {
      type: 'PRESENTATION_PROOF_REPORTED',
      authorityId: preparing.authorityId,
      sessionId: session.sessionId,
      generation: session.generation,
      leg: session.operation.legIndex,
      direction: session.operation.direction,
      proof: {
        token: {
          authorityId: preparing.authorityId,
          sessionId: session.sessionId,
          generation: session.generation,
          leg: session.operation.legIndex,
          revision: session.presentationRevision,
          subject: 'group45:figure3',
          kind: 'packed-canvas-frame'
        },
        frameSequence: 1,
        observedAt: 42,
        connected: true,
        visible: true,
        coverageComplete: true,
        edge: 'services'
      }
    }).snapshot;

    expect(animating).toMatchObject({
      status: 'transaction',
      session: { phase: 'animating', operation: { legIndex: 1 } }
    });
    expect(preflight(projector, animating)).not.toBeNull();

    figure3.hidden = true;
    receiverVisible = true;
    expect(preflight(projector, animating)).not.toBeNull();

    receiverVisible = false;
    expect(preflight(projector, animating)).toBeNull();
  });

  it('[R5] prepares only the manifest receiver for a visual direct entry', async () => {
    const root = element();
    const stalePrepare = vi.fn();
    const receiverPrepare = vi.fn();
    const projector = createPhoneStoryPresentation({
      authorityId: 'phone-authority-test',
      scope: 'formal',
      root: () => root
    });
    projector.registerSurface({
      id: 'stale:figure3',
      scene: 'figure3-animation',
      kind: 'fixed',
      root: () => element(),
      prepareDirectEntry: stalePrepare
    });
    projector.registerSurface({
      id: 'group45:figure3',
      scene: 'figure3-animation',
      kind: 'fixed',
      root: () => element(),
      prepareDirectEntry: receiverPrepare
    });
    const controller = new AbortController();

    await projector.prepareDirectEntry('figure3-animation', {
      scene: 'figure3-animation',
      sessionId: 'phone-session-test',
      generation: 7,
      token: {
        authorityId: 'phone-authority-test',
        sessionId: 'phone-session-test',
        generation: 7,
        leg: 0,
        revision: 1,
        subject: 'group45:figure3',
        kind: 'packed-canvas-frame'
      },
      signal: controller.signal
    });

    expect(receiverPrepare).toHaveBeenCalledTimes(1);
    expect(stalePrepare).not.toHaveBeenCalled();
  });
});
