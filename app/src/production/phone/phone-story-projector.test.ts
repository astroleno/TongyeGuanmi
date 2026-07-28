import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPhoneStorySnapshot,
  reducePhoneStorySnapshot
} from './phone-story-state';
import { createPhoneStoryProjector } from './phone-story-projector';

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

describe('phone story projector', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('applies the full stable projection synchronously to one route root', () => {
    const root = element();
    const projector = createPhoneStoryProjector({
      authorityId: 'phone-authority-test',
      scope: 'formal',
      root: () => root
    });
    const snapshot = createPhoneStorySnapshot({
      authorityId: 'phone-authority-test',
      scene: 'brand',
      actualY: 120
    });

    const plan = projector.preflight(snapshot);
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
    const projector = createPhoneStoryProjector({
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
    const plan = projector.preflight(transaction);
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

    const stablePlan = projector.preflight(createPhoneStorySnapshot({
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
    const projector = createPhoneStoryProjector({
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
    const transactionPlan = projector.preflight(transaction);
    if (!transactionPlan) throw new Error('Expected a transaction projection plan');
    projector.apply(transactionPlan);
    expect(transientSource.dataset).toMatchObject({
      phoneSurfaceRole: 'transition-source',
      phoneBoundarySession: 'phone-session-1',
      phoneBoundaryGeneration: '1',
      phoneBoundaryEndpoint: 'source'
    });

    projector.clearTransitionEndpoints();
    const stablePlan = projector.preflight(createPhoneStorySnapshot({
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
    const theme = { content: '#010203' } as HTMLMetaElement;
    vi.stubGlobal('document', {
      documentElement,
      querySelector: () => theme
    } as unknown as Document);
    const oldProjector = createPhoneStoryProjector({
      authorityId: 'phone-authority-old',
      scope: 'formal',
      root: () => routeRoot
    });
    const newProjector = createPhoneStoryProjector({
      authorityId: 'phone-authority-new',
      scope: 'brand-lab',
      root: () => routeRoot
    });
    const apply = (
      projector: ReturnType<typeof createPhoneStoryProjector>,
      authorityId: string,
      scene: 'brand' | 'services'
    ) => {
      const plan = projector.preflight(createPhoneStorySnapshot({
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
    expect(theme.content).not.toBe('#010203');

    newProjector.dispose();
    expect(routeRoot.dataset.phoneAuthorityId).toBeUndefined();
    expect(documentElement.dataset.portraitEdgeScene).toBeUndefined();
    expect(theme.content).toBe('#010203');
  });

  it('[Task 4] assigns one fixed front surface role and retires sibling roots', () => {
    const root = element();
    const hero = element();
    const pattern = element();
    const projector = createPhoneStoryProjector({
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
    const plan = projector.preflight(createPhoneStorySnapshot({
      authorityId: 'phone-authority-test',
      scene: 'hero'
    }));
    if (!plan) throw new Error('Expected front projection plan');
    projector.apply(plan);

    expect(hero.dataset.phoneSurfaceRole).toBe('fixed-current');
    expect(pattern.dataset.phoneSurfaceRole).toBe('retired');
  });
});
