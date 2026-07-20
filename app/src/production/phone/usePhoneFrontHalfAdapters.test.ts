import { describe, expect, it } from 'vitest';
import {
  phoneFrontHalfInitialVisualsReady,
  phoneFrontHalfNeedsStaticFallback
} from './usePhoneFrontHalfAdapters';

describe('phone front-half adapter recovery', () => {
  it('holds Loader until Hero, its handoff, and Pattern are ready', () => {
    expect(phoneFrontHalfInitialVisualsReady(true, true, true)).toBe(true);
    expect(phoneFrontHalfInitialVisualsReady(true, true, false)).toBe(false);
    expect(phoneFrontHalfInitialVisualsReady(true, false, true)).toBe(false);
    expect(phoneFrontHalfInitialVisualsReady(false, true, true)).toBe(false);
  });

  it('publishes the story only after a ready Loader exit', () => {
    expect(phoneFrontHalfNeedsStaticFallback('ready', false, false)).toBe(false);
  });

  it('uses the static document after import failure, error, or safety exit', () => {
    expect(phoneFrontHalfNeedsStaticFallback(undefined, true, true)).toBe(true);
    expect(phoneFrontHalfNeedsStaticFallback('error', false, true)).toBe(true);
    expect(phoneFrontHalfNeedsStaticFallback('safety', false, false)).toBe(true);
  });
});
