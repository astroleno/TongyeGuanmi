import { describe, expect, it } from 'vitest';
import {
  PHONE_LOADER_COMPLETE_KEY,
  PHONE_LOADER_HIDDEN_AT_KEY,
  PHONE_LOADER_RESUME_HASH_KEY,
  markPhoneLoaderResumeHash,
  phoneLoaderCompletedInDocument
} from './phone-loader-lifecycle';

describe('phone loader lifecycle', () => {
  it('keeps the migrated shell aligned with the v16 recovery gate', () => {
    expect(PHONE_LOADER_COMPLETE_KEY).toBe('tongye:portrait-spike:v16:loader-complete');
    expect(PHONE_LOADER_HIDDEN_AT_KEY).toBe('tongye:portrait-spike:v16:hidden-at');
    expect(PHONE_LOADER_RESUME_HASH_KEY).toBe(
      'tongye:portrait-spike:v16:resume-hash'
    );
  });

  it('marks only an explicit recovery as completed before Loader mounts', () => {
    const state = { completed: false };

    expect(phoneLoaderCompletedInDocument(state, false)).toBe(false);
    expect(phoneLoaderCompletedInDocument(state, true)).toBe(true);
    expect(phoneLoaderCompletedInDocument(state, false)).toBe(true);
  });

  it('stores only a safe semantic hash for lock-screen recovery', () => {
    const values = new Map<string, string>();
    const store = {
      removeItem(key: string) {
        values.delete(key);
      },
      setItem(key: string, value: string) {
        values.set(key, value);
      }
    };

    markPhoneLoaderResumeHash('#crane-animation', store);
    expect(values.get(PHONE_LOADER_RESUME_HASH_KEY)).toBe('#crane-animation');

    markPhoneLoaderResumeHash('javascript:alert(1)', store);
    expect(values.get(PHONE_LOADER_RESUME_HASH_KEY)).toBe('#crane-animation');
  });
});
