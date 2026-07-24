import { describe, expect, it } from 'vitest';
import {
  loadDesktopStoryShell,
  loadPhoneStoryShell
} from './presentation-shell-loaders';
import {
  loadedPhoneAdapters,
  resolvedPhoneLoaderAdapter
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

  it('mounts the animated Loader before selecting the remaining front-half adapters', async () => {
    const before = loadedPhoneAdapters();
    const shell = await loadPhoneStoryShell('#home');
    expect(shell.default).toBeTypeOf('function');
    expect(resolvedPhoneLoaderAdapter()?.id).toBe('loader');
    expect(loadedPhoneAdapters()).toEqual({
      loader: true,
      scenes: before.scenes,
      transitions: before.transitions
    });
  });
});
