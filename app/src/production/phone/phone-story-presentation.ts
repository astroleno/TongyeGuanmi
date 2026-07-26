import type {
  PhoneCheckpointId
} from '../../story/semantic-checkpoints';
import type { SceneId, SegmentId } from '../../story/types';
import type { PhoneEdgeScene } from './phone-edge-surface';
import type { PhoneStoryCursor } from './phone-story-state';

export type PhonePresentationEvidence = Readonly<{
  scene?: SceneId;
  checkpoint?: PhoneCheckpointId;
  edge?: PhoneEdgeScene;
}>;

type StablePresentation = readonly [
  checkpoint: PhoneCheckpointId,
  edge: PhoneEdgeScene
];

const stablePresentation: Readonly<Record<SceneId, StablePresentation>> = {
  hero: ['hero-entered', 'hero'],
  pattern: ['pattern-complete', 'pattern'],
  'star-map': ['star-map-reading', 'star'],
  'aod-animation': ['aod-stage', 'aod'],
  'method-top': ['method-intro', 'method'],
  'method-bottom': ['method-to-figure2', 'method'],
  'figure2-animation': ['figure2-stage', 'figure2'],
  'figure2-proof': ['figure2-proof-opening', 'proof'],
  'figure2-proof-opening': ['figure2-proof-opening', 'proof'],
  'figure2-proof-cards': ['figure2-proof-cards', 'proof'],
  'figure2-proof-closing': ['figure2-proof-closing', 'proof'],
  brand: ['brand-reading', 'brand'],
  'figure3-animation': ['figure3-stage', 'figure3'],
  services: ['services-reading', 'services'],
  'ttg-animation': ['ttg-stage', 'ttg'],
  lab: ['lab-stable', 'lab'],
  'ph-animation': ['ph-stage', 'ph'],
  education: ['education-reading', 'education'],
  'crane-animation': ['crane-stage', 'crane'],
  contact: ['contact-stable', 'contact']
};

const segmentCheckpoint: Readonly<Record<SegmentId, PhoneCheckpointId>> = {
  'hero-pattern': 'hero-to-pattern',
  'pattern-star-map': 'pattern-to-star-map',
  'star-map-aod': 'star-map-to-aod',
  'aod-method-top': 'aod-to-method',
  'method-top-method-bottom': 'method-to-figure2',
  'method-bottom-figure2': 'method-to-figure2',
  'figure2-distance-expand': 'figure2-to-proof',
  'figure2-proof-opening-cards': 'figure2-proof-cards',
  'figure2-proof-cards-closing': 'figure2-proof-closing',
  'figure2-proof-brand': 'proof-to-brand',
  'brand-figure3': 'brand-to-figure3',
  'figure3-services': 'figure3-to-services',
  'services-ttg': 'services-to-ttg',
  'ttg-lab': 'ttg-to-lab',
  'lab-ph': 'lab-to-ph',
  'ph-education': 'ph-to-education',
  'education-crane': 'education-to-crane',
  'crane-contact': 'crane-to-contact'
};

export function phoneStablePresentation(
  scene: SceneId
): Required<PhonePresentationEvidence> {
  const [checkpoint, edge] = stablePresentation[scene];
  return { scene, checkpoint, edge };
}

export function phoneStoryPresentation(
  cursor: PhoneStoryCursor
): Required<PhonePresentationEvidence> {
  if (cursor.kind === 'hold') return phoneStablePresentation(cursor.scene);
  const scene = cursor.progress > 0.001 ? cursor.to : cursor.from;
  const edgeScene = cursor.direction === 1
    ? (cursor.progress === 1 ? cursor.to : cursor.from)
    : (cursor.progress === 0 ? cursor.from : cursor.to);
  return {
    scene,
    checkpoint: cursor.segment === 'aod-method-top'
      && cursor.progress <= 0.001
      ? 'aod-autoplay'
      : segmentCheckpoint[cursor.segment],
    edge: stablePresentation[edgeScene][1]
  };
}
