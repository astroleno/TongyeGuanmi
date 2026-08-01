import { describe, expect, it } from 'vitest';
import { phoneMediaUrlFor } from './phone-media';

describe('canonical phone media resolver', () => {
  it.each([
    ['hero-back', 'hero', 'hero-back.webp'],
    ['pattern-background', 'pattern', 'pattern-background.webp'],
    ['aod-figure-packed', 'aod-animation', 'aod-figure-motion-rgb-alpha.mp4'],
    ['crane-flock-packed', 'crane-animation', 'crane-flock-motion-rgb-alpha.mp4']
  ] as const)('resolves %s only for its immutable owner', (id, owner, asset) => {
    expect(phoneMediaUrlFor(id, owner)).toContain(asset);
  });

  it('fails closed when a scene asks for another scene owner\'s media', () => {
    expect(() => phoneMediaUrlFor('aod-figure-packed', 'hero'))
      .toThrow(/canonical owner is aod-animation/i);
  });
});
