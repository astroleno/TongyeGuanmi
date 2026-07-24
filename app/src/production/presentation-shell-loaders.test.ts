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

  it('keeps direct Contact cold instead of selecting front-half adapters', async () => {
    const before = loadedPhoneAdapters();
    const shell = await loadPhoneStoryShell('#contact');
    expect(shell.default).toBeTypeOf('function');
    expect(loadedPhoneAdapters()).toEqual(before);
  });

  it('preloads the complete Loader → Method adapter group for a front-half entry', async () => {
    const shell = await loadPhoneStoryShell('#home');
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
