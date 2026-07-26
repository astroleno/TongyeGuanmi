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
const phoneBootstrapSource = readFileSync(
  new URL('./phone/PhoneStoryBootstrap.tsx', import.meta.url),
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

  it('starts one lightweight Loader before the media-heavy formal shell', () => {
    expect(phoneBootstrapSource).toContain(
      "lazy(() => import('./PhoneStoryShell')"
    );
    expect(phoneBootstrapSource).toContain('<StoryLoader');
    expect(phoneBootstrapSource.match(/<StoryLoader\s+mode=/g)).toHaveLength(1);
    expect(phoneBootstrapSource).toContain('ready={shellPrepared}');
    expect(phoneBootstrapSource).toContain('failed={shellFailed}');
    expect(phoneBootstrapSource).toContain('onHidden={markLoaderHidden}');
    expect(phoneBootstrapSource).toContain(
      'startedAt={loaderStartedAtRef.current}'
    );
    expect(phoneBootstrapSource).toContain(
      '{ startupLoaderExitReason: loaderExitReason }'
    );
    expect(phoneBootstrapSource).toContain(
      'onStartupPrepared={markShellPrepared}'
    );
    expect(phoneBootstrapSource).toContain('mode={loaderMode}');
    expect(phoneBootstrapSource).toContain(
      "get('portrait-spike-motion') === 'reduce'"
    );
    expect(phoneShellSource).not.toContain("import { PhoneLoader }");
    expect(phoneShellSource).not.toContain('LoaderComponent');
    expect(phoneShellSource).not.toContain('<StoryLoader');
    expect(phoneShellSource).not.toContain('<PhoneLoader');
    expect(phoneShellSource).toContain(
      'finishLoader(props.startupLoaderExitReason)'
    );
    expect(phoneShellSource).toContain(
      'if (directContinuationEntry || ready || failed)'
    );
  });
});
