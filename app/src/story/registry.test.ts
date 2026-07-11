import { describe, expect, it, vi } from 'vitest';
import { HandleRegistry } from './registry';
import type { SceneModule } from './types';

function syntheticScene(requiredHandles: readonly string[] = ['copy']) {
  const preload = vi.fn(() => ({ milestones: ['targetReady'] as const }));
  const module: SceneModule = {
    id: 'hero',
    Component: () => null,
    renderHold: () => undefined,
    requiredHandles,
    preload
  };
  return {
    module,
    preload
  };
}

describe('HandleRegistry', () => {
  it('opens targetReady only after root, required handles and preload are ready', async () => {
    const registry = new HandleRegistry();
    const { module } = syntheticScene(['copy', 'media']);
    registry.registerScene(module);

    registry.registerRoot('hero', {} as HTMLElement);
    registry.registerHandle('hero', 'copy', {} as HTMLElement);
    await registry.startPreload('hero');

    expect(registry.snapshotScene('hero')).toMatchObject({
      rootReady: true,
      preloadReady: true,
      targetReady: false
    });

    registry.registerHandle('hero', 'media', {} as HTMLElement);

    expect(registry.snapshotScene('hero')).toMatchObject({
      targetReady: true,
      readyHandles: ['copy', 'media']
    });
  });

  it('dedupes StrictMode preload starts', async () => {
    const registry = new HandleRegistry();
    const { module, preload } = syntheticScene();
    registry.registerScene(module);

    const first = registry.startPreload('hero');
    const second = registry.startPreload('hero');
    await Promise.all([first, second]);

    expect(preload).toHaveBeenCalledTimes(1);
  });

  it('evicts a rejected preload so a later readiness attempt can recover', async () => {
    const registry = new HandleRegistry();
    const preload = vi.fn()
      .mockRejectedValueOnce(new Error('temporary image outage'))
      .mockResolvedValueOnce({ milestones: ['targetReady'] as const });
    const module: SceneModule = {
      id: 'hero',
      Component: () => null,
      renderHold: () => undefined,
      preload
    };
    registry.registerScene(module);

    await expect(registry.startPreload('hero')).rejects.toThrow('temporary image outage');
    await expect(registry.startPreload('hero')).resolves.toEqual({ milestones: ['targetReady'] });

    expect(preload).toHaveBeenCalledTimes(2);
    expect(registry.snapshotScene('hero').preloadReady).toBe(true);
  });

  it('accepts duplicate mediaReady only once and rejects stale events', () => {
    const registry = new HandleRegistry();
    registry.beginMediaGate('synthetic-video', { prepareToken: 'epoch:prepare:1' });

    expect(registry.reportMediaReady('synthetic-video', { prepareToken: 'epoch:prepare:2' })).toEqual({
      accepted: false,
      key: 'synthetic-video',
      milestone: 'mediaReady',
      reason: 'stale'
    });
    expect(registry.reportMediaReady('synthetic-video', { prepareToken: 'epoch:prepare:1' })).toEqual({
      accepted: true,
      key: 'synthetic-video',
      milestone: 'mediaReady'
    });
    expect(registry.reportMediaReady('synthetic-video', { prepareToken: 'epoch:prepare:1' })).toEqual({
      accepted: false,
      key: 'synthetic-video',
      milestone: 'mediaReady',
      reason: 'duplicate'
    });
  });

  it('fails mediaReady and buildReady closed when their gates were not opened', () => {
    const registry = new HandleRegistry();

    expect(registry.reportMediaReady('synthetic-video', { prepareToken: 'epoch:prepare:1' })).toEqual({
      accepted: false,
      key: 'synthetic-video',
      milestone: 'mediaReady',
      reason: 'missing-gate'
    });
    expect(registry.reportBuildReady('hero-pattern', { runId: 'epoch:1', prepareToken: 'epoch:prepare:1' })).toEqual({
      accepted: false,
      key: 'hero-pattern',
      milestone: 'buildReady',
      reason: 'missing-gate'
    });
    expect(registry.snapshot().mediaReady).toEqual([]);
    expect(registry.snapshot().buildReady).toEqual([]);
  });

  it('tracks buildReady with the active run guard', () => {
    const registry = new HandleRegistry();
    registry.beginBuildGate('hero-pattern', { runId: 'epoch:1', prepareToken: 'epoch:prepare:1' });

    expect(registry.reportBuildReady('hero-pattern', { runId: 'epoch:999', prepareToken: 'epoch:prepare:1' })).toMatchObject({
      accepted: false,
      reason: 'stale'
    });
    expect(registry.reportBuildReady('hero-pattern', { runId: 'epoch:1', prepareToken: 'epoch:prepare:1' })).toMatchObject({
      accepted: true,
      milestone: 'buildReady'
    });
    expect(registry.snapshot().buildReady).toEqual(['hero-pattern:epoch:prepare:1:epoch:1']);
  });
});
