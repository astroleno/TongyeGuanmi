import { describe, expect, it } from 'vitest';
import {
  assertFrontHalfMediaOwner,
  frontHalfProductMedia,
  frontHalfProductMediaFor,
  phoneProductMedia,
  phoneProductMediaFor
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

  it('keeps the phone Figure2 packed-alpha source under the canonical scene owner', () => {
    expect(phoneProductMediaFor('figure2-pair-poster')).toEqual({
      id: 'figure2-pair-poster',
      owner: 'figure2-animation',
      asset: 'figure2-pair-opening.webp',
      kind: 'image'
    });
    expect(phoneProductMediaFor('figure2-foreground-arch')).toEqual({
      id: 'figure2-foreground-arch',
      owner: 'figure2-animation',
      asset: 'figure2-phone-foreground-arch.webp',
      kind: 'image'
    });
    expect(phoneProductMedia.map((media) => media.id)).toContain('figure2-pair-packed');
    expect(phoneProductMediaFor('figure2-pair-packed')).toEqual({
      id: 'figure2-pair-packed',
      owner: 'figure2-animation',
      asset: 'figure2-pair-motion-rgb-alpha.mp4',
      kind: 'video'
    });
  });
});
