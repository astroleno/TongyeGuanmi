import { describe, expect, it } from 'vitest';
import { portraitSpikeRouteForSearch, portraitTrackProgress } from './route';

describe('portrait spike route helpers', () => {
  it('mounts the current mobile preview from its short version route', () => {
    expect(portraitSpikeRouteForSearch('?v=16')).toBe('b');
    expect(portraitSpikeRouteForSearch('?v=17')).toBe('b');
    expect(portraitSpikeRouteForSearch('?v=18')).toBe('b');
    expect(portraitSpikeRouteForSearch('?v=19')).toBe('b');
    expect(portraitSpikeRouteForSearch('?v=20')).toBe('b');
    expect(portraitSpikeRouteForSearch('?v=21')).toBe('b');
    expect(portraitSpikeRouteForSearch('?v=22')).toBe('b');
    expect(portraitSpikeRouteForSearch('?v=23')).toBe('b');
    expect(portraitSpikeRouteForSearch('?v=24')).toBe('b');
    expect(portraitSpikeRouteForSearch('?v=15')).toBeUndefined();
  });

  it('keeps the two explicit experimental routes available internally', () => {
    expect(portraitSpikeRouteForSearch('?portrait-spike=a')).toBe('a');
    expect(portraitSpikeRouteForSearch('?portrait-spike=b')).toBe('b');
    expect(portraitSpikeRouteForSearch('?portrait-spike=production')).toBeUndefined();
    expect(portraitSpikeRouteForSearch('')).toBeUndefined();
  });

  it('maps a sticky track to a bounded local scroll progress', () => {
    expect(portraitTrackProgress(0, 2_400, 800)).toBe(0);
    expect(portraitTrackProgress(-800, 2_400, 800)).toBe(0.5);
    expect(portraitTrackProgress(-1_900, 2_400, 800)).toBe(1);
  });
});
