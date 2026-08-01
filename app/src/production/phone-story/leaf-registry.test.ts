import { describe, expect, it } from 'vitest';
import { phoneManifest } from './manifest';
import { loadPhoneSceneModule } from './scenes';
import { loadPhoneTransitionModule } from './transitions';

describe('complete clean phone leaf registries', () => {
  it('loads one clean scene module for all 16 canonical holds', async () => {
    const modules = await Promise.all(phoneManifest.scenes.map(async ({ id }) => ({
      id,
      module: await loadPhoneSceneModule(id)
    })));
    expect(modules).toHaveLength(16);
    for (const { module } of modules) expect(module.default).toBeTypeOf('function');
  });

  it('loads one clean transition module for all 15 canonical segments', async () => {
    const modules = await Promise.all(phoneManifest.segments.map(async ({ id }) => ({
      id,
      module: await loadPhoneTransitionModule(id)
    })));
    expect(modules).toHaveLength(15);
    for (const { module } of modules) expect(module.default).toBeTypeOf('function');
  });
});
