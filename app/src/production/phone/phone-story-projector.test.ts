import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPhoneStorySnapshot } from './phone-story-state';
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
});
