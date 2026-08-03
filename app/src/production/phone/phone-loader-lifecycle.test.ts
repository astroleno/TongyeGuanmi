import { describe, expect, it, vi } from 'vitest';
import {
  markPhoneLoaderCompletedInDocument,
  phoneLoaderCompletedInDocument
} from './phone-loader-lifecycle';

describe('phone loader lifecycle', () => {
  it('keeps completion scoped to the current live document', () => {
    const state = { completed: false };
    const setItem = vi.fn();
    vi.stubGlobal('window', { sessionStorage: { setItem } });

    expect(phoneLoaderCompletedInDocument(state)).toBe(false);
    markPhoneLoaderCompletedInDocument(state);
    expect(phoneLoaderCompletedInDocument(state)).toBe(true);
    expect(
      setItem,
      'a refreshed document must not inherit Loader completion through sessionStorage'
    ).not.toHaveBeenCalled();
    expect(phoneLoaderCompletedInDocument({ completed: false })).toBe(false);
    vi.unstubAllGlobals();
  });

  it('[front-half gate] has no Loader visibility writer', async () => {
    const source = await import('./phone-loader-lifecycle?raw').then((module) => module.default);

    expect(source).not.toContain('visibilitychange');
    expect(source).not.toContain('sessionStorage');
    expect(source).not.toContain('hidden-at');
  });
});
