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
import {
  gradeAPhoneSceneIds,
  gradeAPhoneTransitionIds
} from './adapter-groups/grade-a';
import {
  group45PhoneSceneIds,
  group45PhoneTransitionIds
} from './adapter-groups/group4-5';
import {
  group67PhoneSceneIds,
  group67PhoneTransitionIds
} from './adapter-groups/group6-7';

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

  it('publishes the reviewed phone AOD 0.49 → 0.59 interval', async () => {
    const aod = await loadPhoneSceneAdapter('aod-animation');
    expect(aod.aodAlphaStartProgress).toBe(0.49);
    expect(aod.aodAlphaEndProgress).toBe(0.59);
  });

  it('returns the cached Hero module for adjacent prewarm and shell handoff', async () => {
    const first = await loadPhoneSceneAdapter('hero');
    const second = await loadPhoneSceneAdapter('hero');
    expect(second).toBe(first);
    expect(resolvedPhoneSceneAdapter('hero')).toBe(first);
  });

  it('registers the complete Grade A chain behind its own lazy group', () => {
    expect(gradeAPhoneSceneIds).toEqual([
      'figure2-animation',
      'figure2-proof'
    ]);
    expect(gradeAPhoneTransitionIds).toEqual([
      'method-bottom-figure2',
      'figure2-distance-expand',
      'figure2-proof-brand'
    ]);
  });

  it('resolves Unit7-A and Unit7-B through the same shared caches', () => {
    expect(phoneSceneAdapterIds).toEqual(expect.arrayContaining(
      [...group45PhoneSceneIds, ...group67PhoneSceneIds]
    ));
    expect(phoneTransitionAdapterIds).toEqual(expect.arrayContaining(
      [...group45PhoneTransitionIds, ...group67PhoneTransitionIds]
    ));
  });
});
