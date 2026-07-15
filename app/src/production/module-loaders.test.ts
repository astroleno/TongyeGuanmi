import { describe, expect, it } from 'vitest';
import {
  loadSceneModule,
  loadTransitionModule,
  loadedProductionModules,
  productionSceneIds,
  productionSegmentIds
} from './module-loaders';

describe('production lazy module registry', () => {
  it('loads every canonical scene without a harness dependency', async () => {
    const modules = await Promise.all(productionSceneIds.map(loadSceneModule));
    expect(modules.map(({ id }) => id)).toEqual(productionSceneIds);
  });

  it('loads every canonical transition with matching identity', async () => {
    const modules = await Promise.all(productionSegmentIds.map(loadTransitionModule));
    expect(modules.map(({ id }) => id)).toEqual(productionSegmentIds);
  });

  it('evicts a rejected scene import instead of serving a stale rejection', async () => {
    const firstAttempt = loadSceneModule('method-bottom');
    await expect(firstAttempt).rejects.toThrow('retired');
    const secondAttempt = loadSceneModule('method-bottom');
    expect(secondAttempt).not.toBe(firstAttempt);
    await expect(secondAttempt).rejects.toThrow('retired');
    expect(loadedProductionModules().scenes).not.toContain('method-bottom');
  });

  it('keeps retired Proof ids as URL aliases without loading compatibility runtime', async () => {
    await expect(loadSceneModule('figure2-proof-opening')).rejects.toThrow('retired');
    await expect(loadTransitionModule('figure2-proof-opening-cards')).rejects.toThrow('retired');
    expect(loadedProductionModules().scenes).not.toContain('figure2-proof-opening');
    expect(loadedProductionModules().transitions).not.toContain('figure2-proof-opening-cards');
  });
});
