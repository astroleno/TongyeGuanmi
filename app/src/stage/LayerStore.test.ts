import { describe, expect, it, vi } from 'vitest';
import { hiddenVisibility, holdVisibility } from '../pilot/visibility';
import { LayerStore } from './LayerStore';

function fakeElement() {
  const attributes = new Map<string, string>();
  return {
    style: {
      opacity: '',
      visibility: '',
      pointerEvents: ''
    },
    dataset: {} as Record<string, string>,
    inert: false,
    setAttribute(name: string, value: string) {
      attributes.set(name, value);
    },
    getAttribute(name: string) {
      return attributes.get(name) ?? null;
    }
  } as unknown as HTMLElement;
}

describe('LayerStore', () => {
  it('paints animation opacity without notifying React, but publishes ownership changes', () => {
    const store = new LayerStore({ hero: holdVisibility(false) });
    const listener = vi.fn(), render = vi.fn(), element = fakeElement();
    store.subscribe(listener);
    const remove = store.subscribeRender(render);
    store.bindElement('hero', element);
    const initial = store.getRenderSnapshot();
    for (const opacity of [.9, .8, .7]) store.setVisibility('hero', { ...holdVisibility(false), opacity });
    expect(element.style.opacity).toBe('0.7');
    expect(listener).toHaveBeenCalledTimes(3);
    expect(render).not.toHaveBeenCalled();
    expect(store.getRenderSnapshot()).toBe(initial);
    store.setVisibility('hero', hiddenVisibility());
    expect(render).toHaveBeenCalledOnce();
    expect(store.getRenderSnapshot()).toBe(store.getSnapshot());
    remove();
    store.setVisibility('hero', holdVisibility(true));
    expect(render).toHaveBeenCalledOnce();
  });
  it('publishes one atomic revision and synchronizes the DOM for each changed visibility', () => {
    const store = new LayerStore({ hero: holdVisibility(true) });
    const listener = vi.fn();
    const element = fakeElement();
    store.subscribe(listener);
    store.bindElement('hero', element);

    expect(store.setVisibility('hero', hiddenVisibility())).toBe(true);
    expect(store.getSnapshot().revision).toBe(1);
    expect(store.getSnapshot().visibilityByScene.hero).toEqual(hiddenVisibility());
    expect(element.style.opacity).toBe('0');
    expect(element.style.visibility).toBe('hidden');
    expect(element.dataset.visible).toBe('false');
    expect(element.getAttribute('aria-hidden')).toBe('true');
    expect(listener).toHaveBeenCalledOnce();

    expect(store.setVisibility('hero', hiddenVisibility())).toBe(false);
    expect(store.getSnapshot().revision).toBe(1);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('applies the latest snapshot to a remounted layer', () => {
    const store = new LayerStore({ pattern: hiddenVisibility() });
    store.setVisibility('pattern', holdVisibility(false));
    const remounted = fakeElement();

    store.bindElement('pattern', remounted);

    expect(remounted.style.opacity).toBe('1');
    expect(remounted.style.visibility).toBe('visible');
    expect(remounted.dataset.interactable).toBe('false');
  });

  it('rejects a stale revision before it can overwrite newer state', () => {
    const store = new LayerStore({ hero: holdVisibility(true) });
    const staleRevision = store.revision;
    store.setVisibility('hero', hiddenVisibility());

    expect(store.setVisibilityAtRevision('hero', holdVisibility(true), staleRevision)).toBe(false);
    expect(store.getSnapshot().visibilityByScene.hero).toEqual(hiddenVisibility());
  });
});
