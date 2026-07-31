import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPhoneStorySnapshot,
  phonePresentationSnapshot,
  reducePhoneStorySnapshot
} from './phone-story/machine';
import { createPhoneStoryPresentation } from './phone-story/presentation';

function element(): HTMLElement {
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

function transaction(
  direction: 1 | -1
): Readonly<{
  root: HTMLElement;
  method: HTMLElement;
  figure2: HTMLElement;
  effect: HTMLElement;
}> {
  const effect = element();
  const root = element();
  const method = element();
  const figure2 = element();
  const projector = createPhoneStoryPresentation({
    authorityId: 'phone-authority-test',
    scope: 'formal',
    root: () => root
  });
  projector.registerSurface({
    id: 'native:method',
    scene: 'method-top',
    kind: 'native',
    root: () => method
  });
  projector.registerSurface({
    id: 'grade-a:figure2',
    scene: 'figure2-animation',
    kind: 'fixed',
    root: () => figure2
  });
  projector.registerEffect({
    id: 'phone-method-bottom-figure2',
    host: () => root,
    element: () => effect
  });
  const initial = createPhoneStorySnapshot({
    authorityId: 'phone-authority-test',
    scene: direction === 1 ? 'method-top' : 'figure2-animation'
  });
  const next = reducePhoneStorySnapshot(initial, {
    type: 'RUN_STARTED',
    authorityId: 'phone-authority-test',
    sessionId: `phone-effect-${direction}`,
    generation: 1,
    leg: 0,
    direction,
    run: 'method-figure2',
    anchorY: 0,
    inputEpoch: 1
  }).snapshot;
  const plan = projector.preflight(phonePresentationSnapshot(next));
  if (!plan) throw new Error('Expected an effect projection plan');
  projector.apply(plan);
  return { root, method, figure2, effect };
}

describe('phone effect presentation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('[R5] atomically publishes the forward endpoint/effect ladder without DOM scanning', () => {
    vi.stubGlobal('MutationObserver', class {
      constructor() {
        throw new Error('MutationObserver must not be constructed by presentation');
      }
    });
    const { root, method, figure2, effect } = transaction(1);

    expect(root.dataset).toMatchObject({
      phoneLayerSegment: 'method-bottom-figure2'
    });
    expect(method.dataset).toMatchObject({
      phoneSurfaceRole: 'transition-source',
      phoneLayerRole: 'transition-source'
    });
    expect(figure2.dataset).toMatchObject({
      phoneSurfaceRole: 'transition-receiver',
      phoneLayerRole: 'transition-receiver'
    });
    expect(effect.dataset).toMatchObject({
      phoneLayerRole: 'transition-effect-above',
      phoneEffectSegment: 'method-bottom-figure2',
      phoneEffectHost: 'grade-a:ink'
    });
    expect(method.style.getPropertyValue('--phone-presentation-z')).toBe('');
  });

  it('[R5] reverses source and receiver while keeping the effect above both', () => {
    vi.stubGlobal('MutationObserver', class {
      constructor() {
        throw new Error('MutationObserver must not be constructed by presentation');
      }
    });
    const { method, figure2, effect } = transaction(-1);

    expect(figure2.dataset.phoneSurfaceRole).toBe('transition-source');
    expect(figure2.dataset.phoneLayerRole).toBe('transition-source');
    expect(method.dataset.phoneSurfaceRole).toBe('transition-receiver');
    expect(method.dataset.phoneLayerRole).toBe('transition-receiver');
    expect(effect.dataset.phoneLayerRole).toBe('transition-effect-above');
  });
});
