import { describe, expect, it } from 'vitest';
import { phoneMethodRequestsGradeAAtMount } from './PhoneMethodTop';

describe('PhoneMethodTop direct entry', () => {
  it.each([
    '#figure2-animation',
    '#figure2-proof-opening',
    '#brand',
    '#figure3-animation',
    '#services',
    '#ttg-animation',
    '#lab'
  ])('requests Grade A during the first mount for %s', (hash) => {
    expect(phoneMethodRequestsGradeAAtMount(hash)).toBe(true);
  });

  it.each([
    '#home',
    '#method',
    '#aod-animation',
    '#crane-animation',
    '#contact'
  ])('keeps Grade A lazy for non-Grade-A entry %s', (hash) => {
    expect(phoneMethodRequestsGradeAAtMount(hash)).toBe(false);
  });
});
