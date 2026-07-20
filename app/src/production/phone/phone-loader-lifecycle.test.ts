import { describe, expect, it } from 'vitest';
import {
  PHONE_LOADER_COMPLETE_KEY,
  PHONE_LOADER_HIDDEN_AT_KEY,
  phoneLoaderCompletedInDocument
} from './phone-loader-lifecycle';

describe('phone loader lifecycle', () => {
  it('keeps the migrated shell aligned with the v16 recovery gate', () => {
    expect(PHONE_LOADER_COMPLETE_KEY).toBe('tongye:portrait-spike:v16:loader-complete');
    expect(PHONE_LOADER_HIDDEN_AT_KEY).toBe('tongye:portrait-spike:v16:hidden-at');
  });

  it('marks only an explicit recovery as completed before Loader mounts', () => {
    const state = { completed: false };

    expect(phoneLoaderCompletedInDocument(state, false)).toBe(false);
    expect(phoneLoaderCompletedInDocument(state, true)).toBe(true);
    expect(phoneLoaderCompletedInDocument(state, false)).toBe(true);
  });
});
