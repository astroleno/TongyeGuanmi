import { describe, expect, it } from 'vitest';
import { phoneManifest } from './manifest';
import {
  createPhoneSceneRegistry,
  loadPhoneSceneModule
} from './scenes';
import {
  createPhoneTransitionRegistry,
  loadPhoneTransitionModule
} from './transitions';

describe('complete clean phone leaf registries', () => {
  it('loads one clean scene module for all 16 canonical holds', async () => {
    const modules = await Promise.all(phoneManifest.scenes.map(async ({ id }) => ({
      id,
      module: await loadPhoneSceneModule(id)
    })));
    expect(modules).toHaveLength(16);
    for (const { id, module } of modules) {
      expect(module.default).toBeTypeOf('function');
      expect(module.phoneSceneId).toBe(id);
    }
  });

  it('loads one clean transition module for all 15 canonical segments', async () => {
    const modules = await Promise.all(phoneManifest.segments.map(async ({ id }) => ({
      id,
      module: await loadPhoneTransitionModule(id)
    })));
    expect(modules).toHaveLength(15);
    for (const { id, module } of modules) {
      expect(module.default).toBeTypeOf('function');
      expect(module.phoneSegmentId).toBe(id);
    }
  });

  it('fails closed when a scene loader resolves a module declaring another canonical ID', async () => {
    const registry = createPhoneSceneRegistry({
      hero: async () => ({
        default: () => null,
        phoneSceneId: 'pattern'
      })
    });

    await expect(registry.load('hero')).rejects.toMatchObject({
      code: 'phone-scene-leaf-mismatch'
    });
  });

  it('fails closed when a transition loader resolves a module declaring another canonical ID', async () => {
    const registry = createPhoneTransitionRegistry({
      'hero-pattern': async () => ({
        default: () => null,
        phoneSegmentId: 'pattern-star-map'
      })
    });

    await expect(registry.load('hero-pattern')).rejects.toMatchObject({
      code: 'phone-transition-leaf-mismatch'
    });
  });
});
