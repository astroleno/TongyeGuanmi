import { canonicalSegments } from '../../story/canonical-spine';
import type { SceneId, SegmentId } from '../../story/types';
import type {
  PhoneSceneAdapterId,
  PhoneTransitionAdapterId
} from './types';

export type PhoneScrollRunId =
  | 'hero-pattern-scroll'
  | 'pattern-star-scroll'
  | 'star-aod-scroll';

export type PhoneRunId =
  | 'aod-method'
  | 'method-figure2'
  | 'figure2-proof'
  | 'proof-brand'
  | 'brand-services'
  | 'services-lab'
  | 'lab-education'
  | 'education-contact';

export type PhoneCursorRunId = PhoneRunId | PhoneScrollRunId;

export type PhoneRunLegKind =
  | 'timed-ink'
  | 'media-handoff'
  | 'media-dissolve';

export type PhoneRunLeg = Readonly<{
  segment: SegmentId;
  from: SceneId;
  to: SceneId;
  kind: PhoneRunLegKind;
}>;

export type PhoneRunAnchorPolicy =
  | 'aod-semantic-edge'
  | 'authored-boundary'
  | 'preserve-composite';

export type PhoneRunDefinition = Readonly<{
  id: PhoneRunId;
  from: SceneId;
  to: SceneId;
  legs: readonly PhoneRunLeg[];
  dependencies: Readonly<{
    scenes: readonly PhoneSceneAdapterId[];
    transitions: readonly PhoneTransitionAdapterId[];
  }>;
  anchor: PhoneRunAnchorPolicy;
}>;

function leg(
  segment: SegmentId,
  kind: PhoneRunLegKind
): PhoneRunLeg {
  const canonical = canonicalSegments.find((candidate) => (
    candidate.id === segment
  ));
  if (!canonical) {
    throw new Error(`Unknown canonical phone segment: ${segment}`);
  }
  return {
    segment,
    from: canonical.from,
    to: canonical.to,
    kind
  };
}

export const phoneScrollRuns = [
  {
    id: 'hero-pattern-scroll',
    from: 'hero',
    to: 'pattern',
    segment: 'hero-pattern'
  },
  {
    id: 'pattern-star-scroll',
    from: 'pattern',
    to: 'star-map',
    segment: 'pattern-star-map'
  },
  {
    id: 'star-aod-scroll',
    from: 'star-map',
    to: 'aod-animation',
    segment: 'star-map-aod'
  }
] as const;

export function phoneScrollRun(id: PhoneScrollRunId) {
  return phoneScrollRuns[
    id === 'hero-pattern-scroll'
      ? 0
      : id === 'pattern-star-scroll' ? 1 : 2
  ];
}

export const phoneIntentRuns = [
  {
    id: 'aod-method',
    from: 'aod-animation',
    to: 'method-top',
    legs: [leg('aod-method-top', 'media-handoff')],
    dependencies: {
      scenes: ['aod-animation', 'method-top'],
      transitions: ['aod-method-top']
    },
    anchor: 'aod-semantic-edge'
  },
  {
    id: 'method-figure2',
    from: 'method-top',
    to: 'figure2-animation',
    legs: [leg('method-bottom-figure2', 'timed-ink')],
    dependencies: {
      scenes: ['method-top', 'figure2-animation'],
      transitions: ['method-bottom-figure2']
    },
    anchor: 'authored-boundary'
  },
  {
    id: 'figure2-proof',
    from: 'figure2-animation',
    to: 'figure2-proof',
    legs: [leg('figure2-distance-expand', 'timed-ink')],
    dependencies: {
      scenes: ['figure2-animation', 'figure2-proof'],
      transitions: ['figure2-distance-expand']
    },
    anchor: 'authored-boundary'
  },
  {
    id: 'proof-brand',
    from: 'figure2-proof',
    to: 'brand',
    legs: [leg('figure2-proof-brand', 'timed-ink')],
    dependencies: {
      scenes: ['figure2-proof', 'brand'],
      transitions: ['figure2-proof-brand']
    },
    anchor: 'authored-boundary'
  },
  {
    id: 'brand-services',
    from: 'brand',
    to: 'services',
    legs: [
      leg('brand-figure3', 'timed-ink'),
      leg('figure3-services', 'media-dissolve')
    ],
    dependencies: {
      scenes: ['brand', 'figure3-animation', 'services'],
      transitions: ['brand-figure3', 'figure3-services']
    },
    anchor: 'preserve-composite'
  },
  {
    id: 'services-lab',
    from: 'services',
    to: 'lab',
    legs: [
      leg('services-ttg', 'timed-ink'),
      leg('ttg-lab', 'media-dissolve')
    ],
    dependencies: {
      scenes: ['services', 'ttg-animation', 'lab'],
      transitions: ['services-ttg', 'ttg-lab']
    },
    anchor: 'preserve-composite'
  },
  {
    id: 'lab-education',
    from: 'lab',
    to: 'education',
    legs: [
      leg('lab-ph', 'timed-ink'),
      leg('ph-education', 'media-dissolve')
    ],
    dependencies: {
      scenes: ['lab', 'ph-animation', 'education'],
      transitions: ['lab-ph', 'ph-education']
    },
    anchor: 'preserve-composite'
  },
  {
    id: 'education-contact',
    from: 'education',
    to: 'contact',
    legs: [
      leg('education-crane', 'timed-ink'),
      leg('crane-contact', 'media-dissolve')
    ],
    dependencies: {
      scenes: ['education', 'crane-animation', 'contact'],
      transitions: ['education-crane', 'crane-contact']
    },
    anchor: 'preserve-composite'
  }
] as const satisfies readonly PhoneRunDefinition[];

export const phoneStoryRuns = phoneIntentRuns;

export function phoneRun(
  id: PhoneRunId
): PhoneRunDefinition {
  const run = phoneStoryRuns.find((candidate) => candidate.id === id);
  if (!run) throw new Error(`Unknown run: ${id}`);
  return run;
}

export function phoneRunForHold(
  scene: SceneId,
  direction: 1 | -1
): PhoneRunDefinition | undefined {
  return phoneIntentRuns.find((run) => (
    direction === 1 ? run.from === scene : run.to === scene
  ));
}

export type PhoneEntryPlan =
  | Readonly<{
      kind: 'hold';
      scene: SceneId;
    }>
  | Readonly<{
      kind: 'cinematic';
      scene: SceneId;
      run: PhoneRunId;
      legIndex: number;
      direction: 1;
      target: SceneId;
    }>;

const cinematicEntryPlans = new Map<SceneId, PhoneEntryPlan>([
  ['figure3-animation', {
    kind: 'cinematic',
    scene: 'figure3-animation',
    run: 'brand-services',
    legIndex: 1,
    direction: 1,
    target: 'services'
  }],
  ['ttg-animation', {
    kind: 'cinematic',
    scene: 'ttg-animation',
    run: 'services-lab',
    legIndex: 1,
    direction: 1,
    target: 'lab'
  }],
  ['ph-animation', {
    kind: 'cinematic',
    scene: 'ph-animation',
    run: 'lab-education',
    legIndex: 1,
    direction: 1,
    target: 'education'
  }],
  ['crane-animation', {
    kind: 'cinematic',
    scene: 'crane-animation',
    run: 'education-contact',
    legIndex: 1,
    direction: 1,
    target: 'contact'
  }]
]);

export function phoneEntryPlan(scene: SceneId): PhoneEntryPlan {
  return cinematicEntryPlans.get(scene) ?? { kind: 'hold', scene };
}
