import { describe, expect, it } from 'vitest';
import { phonePanDirection } from './phone-horizontal-pan-guard';

describe('phone horizontal pan guard', () => {
  it('waits through small diagonal movement before choosing an axis', () => {
    expect(phonePanDirection({ x: 10, y: 10 }, { x: 14, y: 13 })).toBeUndefined();
  });

  it('blocks only a decisively horizontal pan', () => {
    expect(phonePanDirection({ x: 10, y: 10 }, { x: 32, y: 16 })).toBe('horizontal');
    expect(phonePanDirection({ x: 10, y: 10 }, { x: 16, y: 32 })).toBe('vertical');
  });
});
