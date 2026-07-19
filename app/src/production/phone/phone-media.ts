import type { SceneId } from '../../story/types';
import {
  assertFrontHalfMediaOwner,
  type FrontHalfProductMediaId
} from '../../story/media';

/**
 * Phone-only URL resolution. The product layer owns identity and scene
 * ownership; this adapter layer owns the bundler-specific asset URL.
 */
export function phoneMediaUrlFor(id: FrontHalfProductMediaId, owner: SceneId): string {
  assertFrontHalfMediaOwner(id, owner);
  switch (id) {
    case 'hero-back':
      return new URL('../../../../assets/hero-back.webp', import.meta.url).href;
    case 'hero-middle':
      return new URL('../../../../assets/hero-middle.webp', import.meta.url).href;
    case 'hero-figure-poster':
      return new URL('../../../../assets/hero-figure-poster.webp', import.meta.url).href;
    case 'hero-figure-packed':
      return new URL('../../../../assets/figure1-rgb-alpha.mp4', import.meta.url).href;
    case 'pattern-background':
      return new URL('../../../../assets/pattern-background.webp', import.meta.url).href;
    case 'star-map-source':
      return new URL('../../../../assets/back2.webp', import.meta.url).href;
    case 'aod-figure-packed-forward':
      return new URL('../../../../assets/aod-figure-motion-rgb-alpha.mp4', import.meta.url).href;
    case 'aod-figure-packed-reverse':
      return new URL('../../../../assets/aod-figure-motion-rgb-alpha-reverse.mp4', import.meta.url).href;
  }
}
