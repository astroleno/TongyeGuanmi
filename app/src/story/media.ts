import type { SceneId } from './types';

export type ProductMediaKind = 'image' | 'video';

export type ProductMediaSpec = Readonly<{
  id: string;
  owner: SceneId;
  asset: string;
  kind: ProductMediaKind;
}>;

/**
 * Identity and ownership live in the product layer. Presentation adapters may
 * choose an appropriate URL resolver and compositor, but cannot claim another
 * scene's media surface.
 */
export const frontHalfProductMedia = [
  { id: 'hero-back', owner: 'hero', asset: 'hero-back.webp', kind: 'image' },
  { id: 'hero-middle', owner: 'hero', asset: 'hero-middle.webp', kind: 'image' },
  { id: 'hero-figure-poster', owner: 'hero', asset: 'hero-figure-poster.webp', kind: 'image' },
  { id: 'hero-figure-packed', owner: 'hero', asset: 'figure1-rgb-alpha.mp4', kind: 'video' },
  { id: 'pattern-background', owner: 'pattern', asset: 'pattern-background.webp', kind: 'image' },
  { id: 'star-map-source', owner: 'star-map', asset: 'back2.webp', kind: 'image' },
  { id: 'aod-figure-packed', owner: 'aod-animation', asset: 'aod-figure-motion-rgb-alpha.mp4', kind: 'video' }
] as const satisfies readonly ProductMediaSpec[];

/**
 * Grade A media that is specific to the phone presentation. The canonical
 * Figure2 scene still owns the one media element; the phone adapter only
 * replaces its decode/composite format so Safari never flattens HEVC alpha.
 */
export const phoneGradeAProductMedia = [
  {
    id: 'figure2-pair-poster',
    owner: 'figure2-animation',
    asset: 'figure2-pair-opening.webp',
    kind: 'image'
  },
  {
    id: 'figure2-foreground-arch',
    owner: 'figure2-animation',
    asset: 'figure2-phone-foreground-arch.webp',
    kind: 'image'
  },
  {
    id: 'figure2-pair-packed',
    owner: 'figure2-animation',
    asset: 'figure2-pair-motion-rgb-alpha.mp4',
    kind: 'video'
  }
] as const satisfies readonly ProductMediaSpec[];

export const phoneProductMedia = [
  ...frontHalfProductMedia,
  ...phoneGradeAProductMedia
] as const satisfies readonly ProductMediaSpec[];

export type FrontHalfProductMediaId = (typeof frontHalfProductMedia)[number]['id'];
export type PhoneProductMediaId = (typeof phoneProductMedia)[number]['id'];

const frontHalfMediaById = new Map(
  frontHalfProductMedia.map((media) => [media.id, media])
);
const phoneMediaById = new Map<
  PhoneProductMediaId,
  (typeof phoneProductMedia)[number]
>(phoneProductMedia.map((media) => [media.id, media]));

export function frontHalfProductMediaFor(id: FrontHalfProductMediaId): (typeof frontHalfProductMedia)[number] {
  const media = frontHalfMediaById.get(id);
  if (!media) throw new Error(`Unknown front-half media: ${id}`);
  return media;
}

export function assertFrontHalfMediaOwner(
  id: FrontHalfProductMediaId,
  owner: SceneId
): (typeof frontHalfProductMedia)[number] {
  const media = frontHalfProductMediaFor(id);
  if (media.owner !== owner) {
    throw new Error(`${owner} cannot own ${id}; canonical owner is ${media.owner}`);
  }
  return media;
}

export function phoneProductMediaFor(
  id: PhoneProductMediaId
): (typeof phoneProductMedia)[number] {
  const media = phoneMediaById.get(id);
  if (!media) throw new Error(`Unknown phone media: ${id}`);
  return media;
}

export function assertPhoneMediaOwner(
  id: PhoneProductMediaId,
  owner: SceneId
): (typeof phoneProductMedia)[number] {
  const media = phoneProductMediaFor(id);
  if (media.owner !== owner) {
    throw new Error(`${owner} cannot own ${id}; canonical owner is ${media.owner}`);
  }
  return media;
}
