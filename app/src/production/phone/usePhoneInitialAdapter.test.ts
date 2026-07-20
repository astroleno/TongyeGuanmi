import { describe, expect, it } from 'vitest';
import {
  phoneInitialAdapterNeedsStaticFallback,
  phoneInitialAdaptersReady
} from './usePhoneInitialAdapter';

describe('phone initial adapter recovery', () => {
  it('holds Loader until both Hero and the adjacent transition are ready', () => {
    expect(phoneInitialAdaptersReady(true, true)).toBe(true);
    expect(phoneInitialAdaptersReady(true, false)).toBe(false);
    expect(phoneInitialAdaptersReady(false, true)).toBe(false);
  });

  it('publishes the story only after a ready Loader exit', () => {
    expect(phoneInitialAdapterNeedsStaticFallback('ready', false, false)).toBe(false);
  });

  it('uses the static document after import failure, error, or safety exit', () => {
    expect(phoneInitialAdapterNeedsStaticFallback(undefined, true, true)).toBe(true);
    expect(phoneInitialAdapterNeedsStaticFallback('error', false, true)).toBe(true);
    expect(phoneInitialAdapterNeedsStaticFallback('safety', false, false)).toBe(true);
  });
});
