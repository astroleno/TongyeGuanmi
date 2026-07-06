import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertBrowserRuntime, canUseDOM, getMatchMedia, isMediaElement, runBrowserOnly, withGsapMatchMedia } from './browser-guard';

describe('browser guard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps browser-only APIs out of SSR paths', async () => {
    expect(canUseDOM()).toBe(false);
    expect(() => assertBrowserRuntime('media API')).toThrow(/browser guard/);
    expect(runBrowserOnly(() => 'browser', 'ssr')).toBe('ssr');
    expect(getMatchMedia()).toBeUndefined();
    expect(isMediaElement({})).toBe(false);
    await expect(withGsapMatchMedia(() => 'browser')).resolves.toBeUndefined();
  });

  it('allows guarded matchMedia access in browser-like paths', () => {
    const matchMedia = vi.fn();
    vi.stubGlobal('window', { matchMedia });
    vi.stubGlobal('document', {});

    expect(canUseDOM()).toBe(true);
    expect(getMatchMedia()).toBeTypeOf('function');
    expect(runBrowserOnly(() => 'browser', 'ssr')).toBe('browser');
  });
});
