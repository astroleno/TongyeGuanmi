import { describe, expect, it } from 'vitest';
import {
  assertFrontHalfMediaOwner,
  frontHalfProductMedia,
  frontHalfProductMediaFor
} from './media';

describe('front-half product media', () => {
  it('keeps each accepted phone surface under one canonical scene owner', () => {
    expect(frontHalfProductMedia.map((media) => media.id)).toEqual([
      'hero-back',
      'hero-middle',
      'hero-figure-poster',
      'hero-figure-packed',
      'pattern-background',
      'star-map-source',
      'aod-figure-packed-forward',
      'aod-figure-packed-reverse'
    ]);
    expect(frontHalfProductMediaFor('star-map-source')).toMatchObject({
      owner: 'star-map',
      asset: 'back2.webp'
    });
  });

  it('rejects an adapter trying to acquire another scene’s media', () => {
    expect(() => assertFrontHalfMediaOwner('hero-figure-packed', 'pattern'))
      .toThrow('pattern cannot own hero-figure-packed');
  });
});
