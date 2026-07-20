import { describe, expect, it } from 'vitest';
import {
  loadDesktopStoryShell,
  loadPhoneStoryShell
} from './presentation-shell-loaders';
import {
  loadedPhoneAdapters,
  resolvedPhoneSceneAdapter
} from './phone/module-loaders';

describe('presentation shell loaders', () => {
  it('loads the desktop family without selecting the phone adapter family', async () => {
    const before = loadedPhoneAdapters().scenes;
    const shell = await loadDesktopStoryShell();
    expect(shell.default).toBeTypeOf('function');
    expect(loadedPhoneAdapters().scenes).toEqual(before);
  });

  it('preloads the phone Hero adapter before publishing the phone shell', async () => {
    const shell = await loadPhoneStoryShell();
    expect(shell.default).toBeTypeOf('function');
    expect(resolvedPhoneSceneAdapter('hero')?.id).toBe('hero');
  });
});
