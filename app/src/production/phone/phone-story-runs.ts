import { canonicalSegments } from '../../story/canonical-spine';
import type { SceneId, SegmentId } from '../../story/types';
import type {
  PhoneSceneAdapterId,
  PhoneTransitionAdapterId
} from './types';

export type PhoneScrollRunId =
  | 'star-aod-scroll';

export type PhoneRunId =
  | 'hero-pattern'
  | 'pattern-collapse'
  | 'pattern-star-map'
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
  | 'timed-scene'
  | 'media-handoff'
  | 'media-dissolve';

export type PhoneRunLeg = Readonly<{
  segment: SegmentId;
  from: SceneId;
  to: SceneId;
  kind: PhoneRunLegKind;
}>;

export type PhoneRunAnchorPolicy =
  | 'front-corridor'
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

/**
 * Positional run views are the only production transport for definitions that
 * may otherwise be emitted into a separately property-mangled chunk.
 */
export type PhoneScrollRunTuple = readonly [
  from: SceneId,
  to: SceneId,
  segment: SegmentId
];

export type PhoneRunTuple = readonly [
  id: PhoneRunId,
  from: SceneId,
  to: SceneId,
  legCount: number,
  anchor: PhoneRunAnchorPolicy
];

export type PhoneRunLegTuple = readonly [
  segment: SegmentId,
  from: SceneId,
  to: SceneId,
  kind: PhoneRunLegKind
];

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

/**
 * Phone's Pattern compact checkpoint is intentionally not a desktop spine
 * segment. Keep the explicit physical endpoints with the one phone runner
 * rather than inventing a second scroll-owned state machine.
 */
function stagedLeg(
  segment: SegmentId,
  from: SceneId,
  to: SceneId,
  kind: PhoneRunLegKind
): PhoneRunLeg {
  return { segment, from, to, kind };
}

export const phoneScrollRuns = [
  {
    id: 'star-aod-scroll',
    from: 'star-map',
    to: 'aod-animation',
    segment: 'star-map-aod'
  }
] as const;

export function phoneScrollRun(_id: PhoneScrollRunId) {
  return phoneScrollRuns[0]!;
}

export function phoneScrollRunTuple(id: PhoneScrollRunId): PhoneScrollRunTuple {
  const run = phoneScrollRun(id);
  return [run.from, run.to, run.segment];
}

/** Primitive bridge for consumers that may be emitted into another chunk. */
export function phoneScrollSegment(id: PhoneScrollRunId): SegmentId {
  return phoneScrollRunTuple(id)[2];
}

export const phoneIntentRuns = [
  {
    id: 'hero-pattern',
    from: 'hero',
    to: 'pattern',
    legs: [leg('hero-pattern', 'timed-ink')],
    dependencies: {
      scenes: ['hero', 'pattern'],
      transitions: ['hero-pattern']
    },
    anchor: 'front-corridor'
  },
  {
    id: 'pattern-collapse',
    from: 'pattern',
    to: 'pattern-compact',
    legs: [stagedLeg('pattern-collapse', 'pattern', 'pattern-compact', 'timed-scene')],
    dependencies: {
      scenes: ['pattern'],
      transitions: []
    },
    anchor: 'front-corridor'
  },
  {
    id: 'pattern-star-map',
    from: 'pattern-compact',
    to: 'star-map',
    legs: [stagedLeg('pattern-star-map', 'pattern-compact', 'star-map', 'timed-ink')],
    dependencies: {
      scenes: ['pattern', 'star-map'],
      transitions: ['pattern-star-map']
    },
    anchor: 'front-corridor'
  },
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

export function phoneRunTuple(id: PhoneRunId): PhoneRunTuple {
  const run = phoneRun(id);
  return [run.id, run.from, run.to, run.legs.length, run.anchor];
}

export function phoneRunLegTuple(
  id: PhoneRunId,
  legIndex: number
): PhoneRunLegTuple | null {
  const leg = phoneRun(id).legs[legIndex];
  return leg ? [leg.segment, leg.from, leg.to, leg.kind] : null;
}

/** Primitive dependency list for lazy capability preloading. */
export function phoneRunDependencies(id: PhoneRunId): readonly string[] {
  const run = phoneRun(id);
  return [...run.dependencies.scenes, ...run.dependencies.transitions];
}

/**
 * Presentation only needs the canonical segment. Keep the run-definition
 * object private to this module so property mangling cannot split it.
 */
export function phoneRunLegSegment(
  id: PhoneRunId,
  legIndex: number
): SegmentId | null {
  return phoneRunLegTuple(id, legIndex)?.[0] ?? null;
}

export function phoneRunForHold(
  scene: SceneId,
  direction: 1 | -1
): PhoneRunDefinition | undefined {
  return phoneIntentRuns.find((run) => (
    direction === 1 ? run.from === scene : run.to === scene
  ));
}

export function phoneRunForHoldTuple(
  scene: SceneId,
  direction: 1 | -1
): PhoneRunTuple | null {
  const run = phoneRunForHold(scene, direction);
  return run
    ? [run.id, run.from, run.to, run.legs.length, run.anchor]
    : null;
}

/**
 * A hash always names a canonical stable scene. Animated scenes are stable
 * projections in their own right; they must not silently play into the next
 * document chapter during a cold entry.
 */
export type PhoneEntryPlan = Readonly<{
  kind: 'hold';
  scene: SceneId;
}>;

export function phoneEntryPlan(scene: SceneId): PhoneEntryPlan {
  return { kind: 'hold', scene };
}
