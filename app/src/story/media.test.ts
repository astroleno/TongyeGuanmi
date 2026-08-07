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
      'star-map-highlight-mask',
      'aod-figure-poster',
      'aod-figure-packed'
    ]);
    expect(frontHalfProductMediaFor('star-map-source')).toMatchObject({
      owner: 'star-map',
      asset: 'back2.webp'
    });
    expect(frontHalfProductMediaFor('star-map-highlight-mask')).toMatchObject({
      owner: 'star-map',
      asset: 'star-map-highlight-mask.webp'
    });
  });

  it('rejects an adapter trying to acquire another scene’s media', () => {
    expect(() => assertFrontHalfMediaOwner('hero-figure-packed', 'pattern'))
      .toThrow('pattern cannot own hero-figure-packed');
  });

  it('keeps frozen AOD/Figure2 static posters under their canonical scene owners', () => {
    expect(phoneProductMediaFor('aod-figure-poster')).toEqual({
      id: 'aod-figure-poster',
      owner: 'aod-animation',
      asset: 'aod-figure-opening.webp',
      kind: 'image'
    });
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
