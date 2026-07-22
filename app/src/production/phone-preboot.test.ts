import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

type PrebootInput = Readonly<{
  enabled: boolean;
  width: number;
  height: number;
  pointerCoarse?: boolean;
  hoverNone?: boolean;
  search?: string;
}>;

function runPhonePreboot({
  enabled,
  width,
  height,
  pointerCoarse = true,
  hoverNone = true,
  search = ''
}: PrebootInput) {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1]
    ?.replace('__PHONE_STORY_PREBOOT_ENABLED__', String(enabled));
  if (!script) throw new Error('phone preboot script was not found');

  const dataset: Record<string, string> = {};
  const styles = new Map<string, string>();
  runInNewContext(script, {
    Date,
    Math,
    Number,
    URLSearchParams,
    document: {
      documentElement: {
        dataset,
        style: {
          setProperty(name: string, value: string) {
            styles.set(name, value);
          }
        }
      }
    },
    location: { search },
    performance: {
      getEntriesByType: () => [{ type: 'navigate' }],
      navigation: { type: 0 }
    },
    sessionStorage: {
      getItem: () => null,
      removeItem: () => undefined
    },
    window: {
      innerHeight: height,
      innerWidth: width,
      visualViewport: { height, width },
      matchMedia(query: string) {
        return {
          matches: query === '(pointer: coarse)'
            ? pointerCoarse
            : query === '(hover: none)' && hoverNone
        };
      }
    }
  });

  return { dataset, styles };
}

describe('phone preboot ownership', () => {
  it('publishes the Hero edge synchronously for the enabled bare phone route', () => {
    const result = runPhonePreboot({ enabled: true, width: 390, height: 844 });

    expect(result.dataset).toMatchObject({
      portraitEdgeScene: 'hero',
      portraitSpike: 'b',
      portraitSpikePreboot: 'production'
    });
    expect(result.styles.get('--portrait-document-surface')).toBe('#07110e');
  });

  it('does not claim tablets or phone-disabled production routes', () => {
    expect(runPhonePreboot({
      enabled: true,
      width: 768,
      height: 1024
    }).dataset).toEqual({});
    expect(runPhonePreboot({
      enabled: false,
      width: 390,
      height: 844
    }).dataset).toEqual({});
  });

  it('keeps numbered physical-device routes independent from the release flag', () => {
    const result = runPhonePreboot({
      enabled: false,
      width: 390,
      height: 844,
      search: '?v=46'
    });

    expect(result.dataset.portraitSpike).toBe('b');
    expect(result.dataset.portraitSpikePreboot).toBe('validation');
  });
});
