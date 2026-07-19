import { describe, expect, it } from 'vitest';
import { presentationFamilyFor } from './presentation-profile';

describe('presentation family selection', () => {
  it('selects the phone renderer for supported portrait and landscape phones', () => {
    expect(presentationFamilyFor({
      width: 390,
      height: 844,
      pointerCoarse: true,
      hoverNone: true
    })).toBe('phone');
    expect(presentationFamilyFor({
      width: 844,
      height: 390,
      pointerCoarse: true,
      hoverNone: true
    })).toBe('phone');
  });

  it('keeps tablets and touch laptops on the desktop renderer until they receive a profile', () => {
    expect(presentationFamilyFor({
      width: 768,
      height: 1024,
      pointerCoarse: true,
      hoverNone: true
    })).toBe('desktop');
    expect(presentationFamilyFor({
      width: 390,
      height: 844,
      pointerCoarse: false,
      hoverNone: false
    })).toBe('desktop');
  });
});
