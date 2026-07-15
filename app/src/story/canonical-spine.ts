import type { SceneId, SegmentId } from './types';

export type CanonicalHoldSeed = {
  kind: 'hold';
  scene: SceneId;
  reading: boolean;
  staticFallback: boolean;
  freshInput?: boolean;
};

export type CanonicalSegmentSeed = {
  kind: 'segment';
  id: SegmentId;
  from: SceneId;
  to: SceneId;
};

export type CanonicalSpineSeed = CanonicalHoldSeed | CanonicalSegmentSeed;

export const canonicalSceneIds = [
  'hero',
  'pattern',
  'star-map',
  'aod-animation',
  'method-top',
  'figure2-animation',
  'figure2-proof',
  'brand',
  'figure3-animation',
  'services',
  'ttg-animation',
  'lab',
  'ph-animation',
  'education',
  'crane-animation',
  'contact'
] as const satisfies readonly SceneId[];

export const canonicalSegments = [
  { id: 'hero-pattern', from: 'hero', to: 'pattern' },
  { id: 'pattern-star-map', from: 'pattern', to: 'star-map' },
  { id: 'star-map-aod', from: 'star-map', to: 'aod-animation' },
  { id: 'aod-method-top', from: 'aod-animation', to: 'method-top' },
  { id: 'method-bottom-figure2', from: 'method-top', to: 'figure2-animation' },
  { id: 'figure2-distance-expand', from: 'figure2-animation', to: 'figure2-proof' },
  { id: 'figure2-proof-brand', from: 'figure2-proof', to: 'brand' },
  { id: 'brand-figure3', from: 'brand', to: 'figure3-animation' },
  { id: 'figure3-services', from: 'figure3-animation', to: 'services' },
  { id: 'services-ttg', from: 'services', to: 'ttg-animation' },
  { id: 'ttg-lab', from: 'ttg-animation', to: 'lab' },
  { id: 'lab-ph', from: 'lab', to: 'ph-animation' },
  { id: 'ph-education', from: 'ph-animation', to: 'education' },
  { id: 'education-crane', from: 'education', to: 'crane-animation' },
  { id: 'crane-contact', from: 'crane-animation', to: 'contact' }
] as const satisfies readonly Omit<CanonicalSegmentSeed, 'kind'>[];

const readingSceneIds = new Set<SceneId>([
  'method-top',
  'figure2-proof',
  'services',
  'lab',
  'education'
]);

const staticFallbackSceneIds = new Set<SceneId>([
  'hero',
  'method-top',
  'figure2-proof',
  'brand',
  'services',
  'lab',
  'education',
  'contact'
]);

const freshInputSceneIds = new Set<SceneId>([
  'aod-animation',
  'figure2-animation',
  'figure3-animation',
  'ttg-animation',
  'ph-animation',
  'crane-animation'
]);

export const canonicalSpine = canonicalSceneIds.flatMap((scene, index) => {
  const hold: CanonicalHoldSeed = {
    kind: 'hold',
    scene,
    reading: readingSceneIds.has(scene),
    staticFallback: staticFallbackSceneIds.has(scene),
    ...(freshInputSceneIds.has(scene) ? { freshInput: true } : {})
  };
  const next = canonicalSegments[index];
  if (!next) {
    return [hold];
  }
  const segment: CanonicalSegmentSeed = {
    kind: 'segment',
    id: next.id,
    from: next.from,
    to: next.to
  };
  return [hold, segment];
}) satisfies readonly CanonicalSpineSeed[];
