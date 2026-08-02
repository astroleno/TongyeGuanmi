// @vitest-environment jsdom

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { PhoneStoryShellProps } from './PhoneStoryShell';

const shellProps = vi.hoisted(() => vi.fn());

vi.mock('./PhoneStoryShell', () => ({
  PhoneStoryShell: (props: PhoneStoryShellProps) => {
    shellProps(props);
    return <main data-test-phone-scope={props.scope} />;
  }
}));

import { PhoneBrandLabStory } from './PhoneBrandLabStory';

describe('PhoneBrandLabStory', () => {
  it('is a thin QA wrapper over the canonical shell and passes only infrastructure authority', () => {
    const chunkRecovery = {
      reportRejectedChunk: vi.fn(async () => 'fail-closed' as const),
      markStable: vi.fn()
    };

    const markup = renderToStaticMarkup(createElement(PhoneBrandLabStory, {
      chunkRecovery
    }));

    expect(markup).toContain('data-test-phone-scope="brand-lab"');
    expect(shellProps).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'brand-lab',
      diagnostics: true,
      chunkRecovery,
      initialEntry: {
        pathname: '/brand-lab',
        hash: '#brand',
        origin: 'initial'
      }
    }));
  });

  it('contains no runtime, projector, registry, listener, or timing authority', () => {
    const source = readFileSync(resolve(
      process.cwd(), 'src/production/phone-story/PhoneBrandLabStory.tsx'
    ), 'utf8');

    for (const forbidden of [
      "from './runtime'",
      "from './presentation'",
      "from './scenes'",
      "from './transitions'",
      'createPhoneStoryRuntime',
      'addEventListener',
      'setTimeout',
      'requestAnimationFrame'
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
