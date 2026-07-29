import type {
  CanonicalPhoneSegmentId,
  PhoneSegmentPresentationTuple,
  PhoneSurfaceId
} from './phone-presentation-contract';

/**
 * These are presentation roles, not scene-specific CSS tiers. The projector
 * assigns them atomically from the reducer snapshot so fixed, native, and
 * portaled surfaces all share one stacking plane.
 */
export type PhoneSurfaceRole =
  | 'stable'
  | 'candidate-stable'
  | 'fixed-current'
  | 'transition-source'
  | 'transition-receiver'
  | 'retained-under-stage'
  | 'retired';

export type PhonePresentationLayer =
  | 'coverage'
  | 'retained'
  | 'fixed'
  | 'stable'
  | 'transition-source'
  | 'transition-effect-inside'
  | 'transition-effect-between'
  | 'transition-receiver'
  | 'transition-effect-above';

export type PhoneLayerAssignment = Readonly<{
  role: PhonePresentationLayer;
}>;

export type PhoneTransitionLayerPlan = Readonly<{
  segment: CanonicalPhoneSegmentId;
  source: PhoneLayerAssignment & Readonly<{ surface: PhoneSurfaceId }>;
  receiver: PhoneLayerAssignment & Readonly<{ surface: PhoneSurfaceId }>;
  effect: PhoneLayerAssignment & Readonly<{
    host: PhoneSurfaceId;
    placement: PhoneSegmentPresentationTuple[7];
  }>;
}>;

const layerZIndex = {
  coverage: 100,
  retained: 200,
  fixed: 300,
  stable: 400,
  'transition-source': 500,
  'transition-effect-inside': 525,
  'transition-effect-between': 550,
  'transition-receiver': 600,
  'transition-effect-above': 700
} as const satisfies Readonly<Record<PhonePresentationLayer, number>>;

/** Test/tooling view of the CSS-owned global ladder. */
export function phonePresentationLayerZIndex(role: PhonePresentationLayer): number {
  return layerZIndex[role];
}

/** Kept as a small test helper; production plans carry roles, never z values. */
export function phonePresentationLayer(
  role: PhonePresentationLayer
): PhoneLayerAssignment {
  return { role };
}

/** Stable/retained layers remain independent of any local scene stylesheet. */
export function phoneLayerForSurfaceRole(
  role: PhoneSurfaceRole
): PhonePresentationLayer {
  switch (role) {
    case 'retained-under-stage':
    case 'retired':
      return 'retained';
    case 'fixed-current':
      return 'fixed';
    case 'stable':
    case 'candidate-stable':
      return 'stable';
    case 'transition-source':
      return 'transition-source';
    case 'transition-receiver':
      return 'transition-receiver';
  }
}

function effectLayer(
  contract: PhoneSegmentPresentationTuple,
  source: PhoneSurfaceId,
  receiver: PhoneSurfaceId
): PhonePresentationLayer {
  if (contract[6] === source) return 'transition-source';
  if (contract[6] === receiver) return 'transition-receiver';
  switch (contract[7]) {
    case 'above-both':
      return 'transition-effect-above';
    case 'between':
      return 'transition-effect-between';
    case 'inside-owner':
      return 'transition-effect-inside';
  }
}

/**
 * Direction is part of the layer contract: during reverse travel, the
 * canonical receiver becomes the departing endpoint and cannot keep covering
 * the scene that is being restored.
 */
export function phoneTransitionLayerPlan(
  contract: PhoneSegmentPresentationTuple,
  direction: 1 | -1,
  _progress: number
): PhoneTransitionLayerPlan {
  const source = direction === 1
    ? contract[4]
    : contract[5];
  const receiver = direction === 1
    ? contract[5]
    : contract[4];
  return {
    segment: contract[1],
    source: { surface: source, role: 'transition-source' },
    receiver: { surface: receiver, role: 'transition-receiver' },
    effect: {
      host: contract[6],
      placement: contract[7],
      role: effectLayer(contract, source, receiver)
    }
  };
}

/* Adapters own resource IDs; the manifest owns the canonical transition ID. */
const effectSegmentAliases = {
  'portrait-hero-pattern-ink': 'hero-pattern',
  'hero-pattern': 'hero-pattern',
  'portrait-pattern-star-ink': 'pattern-star-map',
  'pattern-star-map': 'pattern-star-map',
  'portrait-star-aod-ink': 'star-map-aod',
  'star-map-aod': 'star-map-aod',
  'phone-method-bottom-figure2': 'method-bottom-figure2',
  'method-bottom-figure2': 'method-bottom-figure2',
  'figure2-distance-expand': 'figure2-distance-expand',
  'phone-figure2-proof-brand': 'figure2-proof-brand',
  'figure2-proof-brand': 'figure2-proof-brand',
  'phone-brand-figure3': 'brand-figure3',
  'brand-figure3': 'brand-figure3',
  'phone-services-ttg': 'services-ttg',
  'services-ttg': 'services-ttg',
  'phone-lab-ph-ink': 'lab-ph',
  'lab-ph': 'lab-ph',
  'phone-education-crane-ink': 'education-crane',
  'education-crane': 'education-crane'
} as const satisfies Readonly<Record<string, CanonicalPhoneSegmentId>>;

export function canonicalPhoneEffectSegment(
  effectId: string | undefined
): CanonicalPhoneSegmentId | null {
  if (!effectId) return null;
  return effectSegmentAliases[effectId as keyof typeof effectSegmentAliases] ?? null;
}
