import type { SceneId, SegmentId } from './types';

/**
 * Product-facing names for the accepted Route B front-half states.  These are
 * deliberately expressed in canonical story terms, not scroll percentages or
 * presentation implementation details, so desktop and phone can refer to the
 * same journey without sharing a renderer.
 */
export const FRONT_HALF_CHECKPOINT_IDS = [
  'loader',
  'hero-entered',
  'hero-to-pattern',
  'pattern-complete',
  'pattern-to-star-map',
  'star-map-reading',
  'star-map-to-aod',
  'aod-stage',
  'aod-autoplay',
  'aod-to-method',
  'method-intro'
] as const;

export type FrontHalfCheckpointId = (typeof FRONT_HALF_CHECKPOINT_IDS)[number];

export const GRADE_A_CHECKPOINT_IDS = [
  'method-to-figure2',
  'figure2-stage',
  'figure2-to-proof',
  'figure2-proof-opening',
  'figure2-proof-cards',
  'figure2-proof-closing'
] as const;

export type GradeACheckpointId = (typeof GRADE_A_CHECKPOINT_IDS)[number];

export const GROUP45_CHECKPOINT_IDS = [
  'proof-to-brand',
  'brand-reading',
  'brand-to-figure3',
  'figure3-stage',
  'figure3-to-services',
  'services-reading',
  'services-to-ttg',
  'ttg-stage',
  'ttg-to-lab',
  'lab-stable'
] as const;

export type Group45CheckpointId = (typeof GROUP45_CHECKPOINT_IDS)[number];

export const GROUP67_CHECKPOINT_IDS = [
  'lab-to-ph',
  'ph-stage',
  'ph-to-education',
  'education-reading',
  'education-to-crane',
  'crane-stage',
  'crane-to-contact',
  'contact-stable'
] as const;

export type Group67CheckpointId = (typeof GROUP67_CHECKPOINT_IDS)[number];
export type PhoneCheckpointId =
  | FrontHalfCheckpointId
  | GradeACheckpointId
  | Group45CheckpointId
  | Group67CheckpointId;

export type SemanticCheckpoint = Readonly<{
  id: FrontHalfCheckpointId;
  scene: SceneId;
  segment?: SegmentId;
  media?: 'aod-figure-motion';
}>;

export const frontHalfSemanticCheckpoints: readonly SemanticCheckpoint[] = [
  { id: 'loader', scene: 'hero' },
  { id: 'hero-entered', scene: 'hero' },
  { id: 'hero-to-pattern', scene: 'hero', segment: 'hero-pattern' },
  { id: 'pattern-complete', scene: 'pattern' },
  { id: 'pattern-to-star-map', scene: 'pattern', segment: 'pattern-star-map' },
  { id: 'star-map-reading', scene: 'star-map' },
  { id: 'star-map-to-aod', scene: 'star-map', segment: 'star-map-aod' },
  { id: 'aod-stage', scene: 'aod-animation' },
  { id: 'aod-autoplay', scene: 'aod-animation', media: 'aod-figure-motion' },
  { id: 'aod-to-method', scene: 'aod-animation', segment: 'aod-method-top', media: 'aod-figure-motion' },
  { id: 'method-intro', scene: 'method-top' }
] as const;

const checkpointsById = new Map(
  frontHalfSemanticCheckpoints.map((checkpoint) => [checkpoint.id, checkpoint])
);

export function frontHalfCheckpoint(id: FrontHalfCheckpointId): SemanticCheckpoint {
  const checkpoint = checkpointsById.get(id);
  if (!checkpoint) {
    throw new Error(`Unknown front-half semantic checkpoint: ${id}`);
  }
  return checkpoint;
}
