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

  it('loads Method steps as a canonical, lazy reading scene', async () => {
    const module = await loadSceneModule('method-bottom');

    expect(module.id).toBe('method-bottom');
    expect(loadedProductionModules().scenes).toContain('method-bottom');
  });

  it('exposes idle prewarm only for the two cold-start transitions', async () => {
    expect((await loadTransitionModule('hero-pattern')).prewarm).toBeTypeOf('function');
    expect((await loadTransitionModule('method-bottom-figure2')).prewarm).toBeTypeOf('function');
  });

  it('keeps retired Proof ids as URL aliases without loading compatibility runtime', async () => {
    await expect(loadSceneModule('figure2-proof-opening')).rejects.toThrow('retired');
    await expect(loadTransitionModule('figure2-proof-opening-cards')).rejects.toThrow('retired');
    expect(loadedProductionModules().scenes).not.toContain('figure2-proof-opening');
    expect(loadedProductionModules().transitions).not.toContain('figure2-proof-opening-cards');
  });
});
