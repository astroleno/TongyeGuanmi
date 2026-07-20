import { describe, expect, it } from 'vitest';
import {
  loadDesktopStoryShell,
  loadPhoneStoryShell
} from './presentation-shell-loaders';
import {
  loadedPhoneAdapters,
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

  it('preloads Hero and its adjacent handoff before publishing the phone shell', async () => {
    const shell = await loadPhoneStoryShell();
    expect(shell.default).toBeTypeOf('function');
    expect(resolvedPhoneSceneAdapter('hero')?.id).toBe('hero');
    expect(resolvedPhoneTransitionAdapter('hero-pattern')?.id).toBe('hero-pattern');
  });
});
