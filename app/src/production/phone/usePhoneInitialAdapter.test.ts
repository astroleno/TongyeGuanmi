import { describe, expect, it } from 'vitest';
import { phoneInitialAdapterNeedsStaticFallback } from './usePhoneInitialAdapter';

describe('phone initial adapter recovery', () => {
  it('publishes the story only after a ready Loader exit', () => {
    expect(phoneInitialAdapterNeedsStaticFallback('ready', false, false)).toBe(false);
  });

  it('uses the static document after import failure, error, or safety exit', () => {
    expect(phoneInitialAdapterNeedsStaticFallback(undefined, true, true)).toBe(true);
    expect(phoneInitialAdapterNeedsStaticFallback('error', false, true)).toBe(true);
    expect(phoneInitialAdapterNeedsStaticFallback('safety', false, false)).toBe(true);
  });
});
