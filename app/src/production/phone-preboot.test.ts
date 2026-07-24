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
  navigationType?: 'navigate' | 'reload';
  storage?: Record<string, string>;
  storageThrows?: boolean;
  storyClaimed?: boolean;
}>;

function runPhonePreboot({
  enabled,
  width,
  height,
  pointerCoarse = true,
  hoverNone = true,
  search = '',
  navigationType = 'navigate',
  storage: initialStorage = {},
  storageThrows = false,
  storyClaimed = false
}: PrebootInput) {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1]
    ?.replace('__PHONE_STORY_PREBOOT_ENABLED__', String(enabled));
  if (!script) throw new Error('phone preboot script was not found');

  const dataset: Record<string, string> = {};
  const styles = new Map<string, string>();
  const storage = new Map(Object.entries(initialStorage));
  const replacedUrls: string[] = [];
  const timers: Array<() => void> = [];
  let staticLoaderRemoved = false;
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
          },
          removeProperty(name: string) {
            styles.delete(name);
          }
        }
      },
      querySelector: () => storyClaimed ? {} : null,
      getElementById: (id: string) => id === 'story-loader-static'
        ? { remove: () => { staticLoaderRemoved = true; } }
        : null
    },
    history: {
      state: null,
      replaceState(_state: unknown, _title: string, url: string) {
        replacedUrls.push(url);
      }
    },
    location: { pathname: '/', search },
    performance: {
      getEntriesByType: () => [{ type: navigationType }],
      navigation: { type: navigationType === 'reload' ? 1 : 0 }
    },
    sessionStorage: {
      getItem(key: string) {
        if (storageThrows) throw new Error('storage unavailable');
        return storage.get(key) ?? null;
      },
      removeItem(key: string) {
        if (storageThrows) throw new Error('storage unavailable');
        return storage.delete(key);
      }
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
      },
      setTimeout(callback: () => void) {
        timers.push(callback);
        return timers.length;
      }
    }
  });

  return {
    dataset,
    replacedUrls,
    storage,
    styles,
    runStartupSafety() {
      for (const timer of timers) timer();
    },
    staticLoaderWasRemoved() {
      return staticLoaderRemoved;
    }
  };
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
    for (const version of ['46', '47']) {
      const result = runPhonePreboot({
        enabled: false,
        width: 390,
        height: 844,
        search: `?v=${version}`
      });

      expect(result.dataset.portraitSpike).toBe('b');
      expect(result.dataset.portraitSpikePreboot).toBe('validation');
    }
  });

  it('lets recent lock-screen recovery outrank Safari reload diagnostics', () => {
    const result = runPhonePreboot({
      enabled: true,
      width: 390,
      height: 844,
      navigationType: 'reload',
      search: '?v=47',
      storage: {
        'tongye:portrait-spike:v16:loader-complete': 'true',
        'tongye:portrait-spike:v16:hidden-at': String(Date.now() - 1_000),
        'tongye:portrait-spike:v16:resume-hash': '#brand'
      }
    });

    expect(result.dataset.portraitLoaderResume).toBe('skip');
    expect(result.dataset.portraitResumeHash).toBe('#brand');
    expect(result.replacedUrls).toEqual(['/?v=47#brand']);
    expect(result.storage.has('tongye:portrait-spike:v16:hidden-at')).toBe(false);
  });

  it('does not mistake a fresh navigation for lock-screen recovery', () => {
    const result = runPhonePreboot({
      enabled: true,
      width: 390,
      height: 844,
      navigationType: 'navigate',
      search: '?v=47',
      storage: {
        'tongye:portrait-spike:v16:loader-complete': 'true',
        'tongye:portrait-spike:v16:hidden-at': String(Date.now() - 1_000),
        'tongye:portrait-spike:v16:resume-hash': '#brand'
      }
    });

    expect(result.dataset.portraitLoaderResume).toBeUndefined();
    expect(result.replacedUrls).toEqual([]);
  });

  it('keeps an explicit visible reload on the cold Loader path', () => {
    const result = runPhonePreboot({
      enabled: true,
      width: 390,
      height: 844,
      navigationType: 'reload',
      storage: {
        'tongye:portrait-spike:v16:loader-complete': 'true',
        'tongye:portrait-spike:v16:resume-hash': '#lab'
      }
    });

    expect(result.dataset.portraitLoaderResume).toBeUndefined();
    expect(result.replacedUrls).toEqual([]);
  });

  it('releases an unclaimed phone preboot to the scrollable static story', () => {
    const result = runPhonePreboot({
      enabled: true,
      width: 390,
      height: 844
    });

    result.runStartupSafety();

    expect(result.staticLoaderWasRemoved()).toBe(true);
    expect(result.dataset.portraitSpike).toBeUndefined();
    expect(result.dataset.portraitSpikePreboot).toBeUndefined();
    expect(result.dataset.phoneStoryFallback).toBe('startup-timeout');
    expect(result.styles.has('--portrait-document-surface')).toBe(false);
  });

  it('does not release preboot after the phone story claims the document', () => {
    const result = runPhonePreboot({
      enabled: true,
      width: 390,
      height: 844,
      storyClaimed: true
    });

    result.runStartupSafety();

    expect(result.staticLoaderWasRemoved()).toBe(false);
    expect(result.dataset.portraitSpike).toBe('b');
    expect(result.dataset.phoneStoryFallback).toBeUndefined();
  });

  it('still releases preboot when Safari storage access throws', () => {
    const result = runPhonePreboot({
      enabled: true,
      width: 390,
      height: 844,
      storageThrows: true
    });

    result.runStartupSafety();

    expect(result.staticLoaderWasRemoved()).toBe(true);
    expect(result.dataset.portraitSpike).toBeUndefined();
    expect(result.dataset.phoneStoryFallback).toBe('startup-timeout');
  });
});
