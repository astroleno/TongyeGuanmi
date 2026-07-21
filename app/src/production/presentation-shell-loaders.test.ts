import { describe, expect, it } from 'vitest';
import {
  loadDesktopStoryShell,
  loadPhoneStoryShell
} from './presentation-shell-loaders';
import {
  loadedPhoneAdapters,
  initialPhoneSceneAdapterIds,
  initialPhoneTransitionAdapterIds,
  resolvedPhoneLoaderAdapter,
  resolvedPhoneSceneAdapter,
  resolvedPhoneTransitionAdapter
} from './phone/module-loaders';

describe('presentation shell loaders', () => {
  it('loads the desktop family without selecting the phone adapter family', async () => {
    const before = loadedPhoneAdapters();
    const shell = await loadDesktopStoryShell();
    expect(shell.default).toBeTypeOf('function');
    expect(loadedPhoneAdapters()).toEqual(before);
  });

  it('preloads the complete Loader → Method adapter group before publishing the phone shell', async () => {
    const shell = await loadPhoneStoryShell();
    expect(shell.default).toBeTypeOf('function');
    expect(resolvedPhoneLoaderAdapter()?.id).toBe('loader');
    for (const id of initialPhoneSceneAdapterIds) {
      expect(resolvedPhoneSceneAdapter(id)?.id).toBe(id);
    }
    for (const id of initialPhoneTransitionAdapterIds) {
      expect(resolvedPhoneTransitionAdapter(id)?.id).toBe(id);
    }
  });
});
