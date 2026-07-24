import { describe, expect, it } from 'vitest';
import {
  loadDesktopStoryShell,
  loadPhoneStoryShell
} from './presentation-shell-loaders';
import { loadedPhoneAdapters } from './phone/module-loaders';
import { readFileSync } from 'node:fs';

const phoneShellSource = readFileSync(
  new URL('./phone/PhoneStoryShell.tsx', import.meta.url),
  'utf8'
);

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

  it('resolves the shell without holding startup on a second adapter request', async () => {
    const before = loadedPhoneAdapters();
    const shell = await loadPhoneStoryShell('#home');
    expect(shell.default).toBeTypeOf('function');
    expect(loadedPhoneAdapters()).toEqual(before);
  });

  it('keeps the animated Loader synchronously owned by the phone shell', () => {
    expect(phoneShellSource).toContain(
      "import { PhoneLoader } from './scenes/PhoneLoader'"
    );
    expect(phoneShellSource).toContain('const LoaderComponent = Loader ?? PhoneLoader');
    expect(phoneShellSource).toContain('<LoaderComponent');
  });
});
