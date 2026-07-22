import { describe, expect, it } from 'vitest';
import {
  phoneGroup45BoundaryProgress,
  phoneGroup45EntryFromHash,
  phoneGroup45TrackProgress
} from './PhoneBrandLabStory';

describe('PhoneBrandLabStory', () => {
  it('starts scope hashes at the requested group chapter without earlier media', () => {
    expect(phoneGroup45EntryFromHash('#services')).toBe('services');
    expect(phoneGroup45EntryFromHash('#lab')).toBe('lab');
    expect(phoneGroup45EntryFromHash('#method')).toBe('brand');
  });

  it('maps forward and reverse document scroll positions to exact visual endpoints', () => {
    expect(phoneGroup45TrackProgress(800, 1200, 800)).toBe(0);
    expect(phoneGroup45TrackProgress(-400, 1200, 800)).toBe(1);
    expect(phoneGroup45BoundaryProgress(800, 1200, 800)).toBe(0);
    expect(phoneGroup45BoundaryProgress(608, 1200, 800)).toBe(1);
  });
});
