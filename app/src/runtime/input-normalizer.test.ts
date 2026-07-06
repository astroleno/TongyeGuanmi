import { describe, expect, it } from 'vitest';
import { keyToViewportFraction, normalizeInputDelta, wheelDeltaPixels } from './input-normalizer';

describe('input normalizer', () => {
  it('translates wheel pixels into viewport fractions', () => {
    expect(normalizeInputDelta({ type: 'wheel', deltaY: 100, viewportHeight: 1000 })).toEqual({
      source: 'wheel',
      delta: 0.1
    });
  });

  it('keeps old line and page delta conversion numbers', () => {
    expect(wheelDeltaPixels({ deltaY: 3, deltaMode: 1, viewportHeight: 900 })).toBe(48);
    expect(wheelDeltaPixels({ deltaY: 1, deltaMode: 2, viewportHeight: 900 })).toBe(900);
  });

  it('normalizes touch drag direction like wheel direction', () => {
    expect(normalizeInputDelta({ type: 'touch', previousY: 500, currentY: 400, viewportHeight: 1000 })).toEqual({
      source: 'touch',
      delta: 0.1
    });
  });

  it('maps keyboard navigation to the legacy charge threshold', () => {
    expect(keyToViewportFraction('ArrowDown')).toBe(0.1);
    expect(keyToViewportFraction('PageUp')).toBe(-0.1);
    expect(keyToViewportFraction('Tab')).toBe(0);
  });
});
