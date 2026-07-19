import { describe, expect, it } from 'vitest';
import {
  PORTRAIT_LOADER_COMPLETE_KEY,
  PORTRAIT_LOADER_HIDDEN_AT_KEY,
  attachPortraitLoaderVisibilityLifecycle,
  markPortraitLoaderCompletedInDocument,
  portraitLoaderCompletedInDocument
} from './portrait-loader-lifecycle';

describe('portrait Loader document lifecycle', () => {
  it('survives an in-document remount while a normal refresh starts incomplete', () => {
    const values = new Map<string, string>();
    const store = {
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    };
    const firstDocument = { completed: false };
    expect(portraitLoaderCompletedInDocument(firstDocument)).toBe(false);

    markPortraitLoaderCompletedInDocument(firstDocument, store);
    expect(portraitLoaderCompletedInDocument(firstDocument)).toBe(true);
    expect(values.get(PORTRAIT_LOADER_COMPLETE_KEY)).toBe('true');

    // A refresh creates a new JavaScript document/module state.
    const refreshedDocument = { completed: false };
    expect(portraitLoaderCompletedInDocument(refreshedDocument)).toBe(false);
  });

  it('marks only a completed hidden document for lock-screen recovery', () => {
    class VisibilityDocument extends EventTarget {
      hidden = false;
    }
    const visibility = new VisibilityDocument();
    const values = new Map<string, string>();
    const store = {
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    };
    const state = { completed: true };
    const dispose = attachPortraitLoaderVisibilityLifecycle(
      state,
      store,
      visibility,
      () => 123_456
    );

    visibility.hidden = true;
    visibility.dispatchEvent(new Event('visibilitychange'));
    expect(values.get(PORTRAIT_LOADER_HIDDEN_AT_KEY)).toBe('123456');

    visibility.hidden = false;
    visibility.dispatchEvent(new Event('visibilitychange'));
    expect(values.has(PORTRAIT_LOADER_HIDDEN_AT_KEY)).toBe(false);

    expect(portraitLoaderCompletedInDocument({ completed: false }, true)).toBe(true);
    dispose();
  });
});
