import { describe, expect, it } from 'vitest';
import { PHONE_HERO_PATTERN_INK_OPTIONS } from './phone';

describe('clean Hero → Pattern transition leaf', () => {
  it('freezes the accepted radial field, origin, seed, grade, and surface', () => {
    expect(PHONE_HERO_PATTERN_INK_OPTIONS).toEqual({
      segmentId: 'hero-pattern', surfaceId: 'fx:hero-pattern',
      field: { kind: 'radial', origin: { x: .5, y: .44 }, seed: 'portrait-hero-pattern-r5' },
      grade: 'dark', canvasClassName: 'portrait-scroll-spike__ink',
      portraitInk: 'hero-pattern'
    });
  });
});
