import { describe, expect, it } from 'vitest';
import {
  phoneGroup45DocumentFlags,
  phoneGroup45EntryFromHash
} from './PhoneBrandLabStory';

describe('PhoneBrandLabStory', () => {
  it('starts scope hashes at the requested group chapter without earlier media', () => {
    expect(phoneGroup45EntryFromHash('#services')).toBe('services');
    expect(phoneGroup45EntryFromHash('#lab')).toBe('lab');
    expect(phoneGroup45EntryFromHash('#method')).toBe('brand');
  });

  it('releases the desktop document overflow lock in both motion modes', () => {
    expect(phoneGroup45DocumentFlags(false)).toEqual({
      portraitSpike: 'b',
      portraitSpikeMotion: 'force'
    });
    expect(phoneGroup45DocumentFlags(true)).toEqual({
      portraitSpike: 'b',
      portraitSpikeMotion: 'reduce'
    });
  });
});
