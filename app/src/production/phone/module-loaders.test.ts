import { describe, expect, it } from 'vitest';
import {
  loadPhoneLoaderAdapter,
  loadPhoneSceneAdapter,
  loadPhoneTransitionAdapter,
  phoneSceneAdapterIds,
  phoneTransitionAdapterIds,
  resolvedPhoneLoaderAdapter,
  resolvedPhoneSceneAdapter,
  resolvedPhoneTransitionAdapter
} from './module-loaders';

describe('phone presentation adapter registry', () => {
  it('loads Loader as the first formal front-half presentation adapter', async () => {
    const loader = await loadPhoneLoaderAdapter();
    expect(loader.id).toBe('loader');
    expect(resolvedPhoneLoaderAdapter()).toBe(loader);
  });

  it('loads and resolves every registered scene with matching identity', async () => {
    const modules = await Promise.all(phoneSceneAdapterIds.map(loadPhoneSceneAdapter));
    expect(modules.map(({ id }) => id)).toEqual(phoneSceneAdapterIds);
    for (const id of phoneSceneAdapterIds) {
      expect(resolvedPhoneSceneAdapter(id)?.id).toBe(id);
    }
  });

  it('loads every registered transition with matching identity', async () => {
    const modules = await Promise.all(
      phoneTransitionAdapterIds.map(loadPhoneTransitionAdapter)
    );
    expect(modules.map(({ id }) => id)).toEqual(phoneTransitionAdapterIds);
    for (const id of phoneTransitionAdapterIds) {
      expect(resolvedPhoneTransitionAdapter(id)?.id).toBe(id);
    }
  });

  it('returns the cached Hero module for adjacent prewarm and shell handoff', async () => {
    const first = await loadPhoneSceneAdapter('hero');
    const second = await loadPhoneSceneAdapter('hero');
    expect(second).toBe(first);
    expect(resolvedPhoneSceneAdapter('hero')).toBe(first);
  });
});
