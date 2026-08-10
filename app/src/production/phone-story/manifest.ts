import { canonicalSceneIds, canonicalSegments } from '../../story/canonical-spine';
import { storyManifest } from '../../story/manifest';
import {
  CRANE_CONTACT_DURATION_MS, FIGURE3_SERVICES_DURATION_MS,
  HERO_PATTERN_INK_MS, HERO_PATTERN_MOTION_MS, HERO_PATTERN_TOTAL_MS,
  INTRA_CHAPTER_DISSOLVE_MS, PATTERN_COLLAPSE_MS, PATTERN_COLLAPSE_STOP,
  PATTERN_STAR_MAP_INK_MS, PATTERN_TOTAL_MS, PH_PLAYBACK_MS,
  TERMINAL_DWELL_MS, TTG_PLAYBACK_MS
} from '../../story/timings';
import type { SegmentPolicy } from '../../story/types';
import {
  PHONE_FINAL_EVIDENCE_KINDS,
  PHONE_PREPARED_EVIDENCE_KINDS,
  type PhoneDeadlinePolicy, type PhoneDependencyClosure, type PhoneDependencyRef,
  type PhoneDirection,
  type PhoneFinalEvidenceKind, type PhoneMountRole,
  type PhonePreparedEvidenceKind, type PhoneProofBoundary,
  type PhoneResourceBudget, type PhoneSurfaceId
} from './protocol';

export type PhoneSceneId = (typeof canonicalSceneIds)[number];
export type PhoneSegmentId = (typeof canonicalSegments)[number]['id'];
export type PhonePlane = 'front' | 'grade-a' | 'group45' | 'group67' | 'native';
export type PhoneEffectPlacement = 'between' | 'above-both';
export type PhoneDeadlineProfileId = 'D-static' | 'D-single-media' | 'D-multi-media';

export type { PhoneDeadlinePolicy } from './protocol';
export type PhoneLanding = Readonly<{
  kind: 'front-corridor' | 'authored-boundary' | 'semantic-edge' | 'persistent-compositor';
  anchor: string;
}>;
export type PhoneContentProof = Readonly<{
  mode: 'all-visible';
  selectors: readonly string[];
}>;
export type PhoneFrameProof = Readonly<{
  kind: 'decoded-or-static-post-paint' | 'image-decode-composite-paint'
    | 'canvas-or-static-post-paint' | 'packed-canvas-draw'
    | 'content-post-paint' | 'decoded-composited-frame';
  surfaceIds: readonly string[];
}>;
export type PhoneReducedMotionPolicy = Readonly<{
  sampling: 'terminal-static'; proof: 'full-visible-quorum'; closure: 'unchanged'
}>;
export type PhonePreparePolicy = Readonly<{
  sourceCover: 'source-or-loader-through-prepared'; receiverMount: 'inert';
  prewarm: 'module-and-immutable-metadata-only'; receiverExposure: 'atomic-candidate-plane'
}>;
export type PhoneTerminalEvidencePolicy = Readonly<{
  required: readonly PhoneFinalEvidenceKind[];
  retirementProof: 'R-standard' | 'R-pair' | 'loader-after-stable'
}>;
export type PhoneInputBoundary = Readonly<{
  claim: 'one-fresh-physical-epoch'; arrivingTail: 'reject-until-fresh';
  release: 'stable-or-rollback'; canonicalPolicy: SegmentPolicy
}>;
export type PhoneMediaActivationPolicy = Readonly<{
  mode: 'none' | 'gesture-or-muted-autoplay'; prewarmMayActivate: false;
  requiresPhysicalCredit: boolean;
  directEntry: 'none' | 'muted-plays-inline-then-covered-cta';
  rejection: 'not-applicable' | 'await-accessible-physical-gesture'
}>;
export type PhoneDirectEntryPolicy = Readonly<{
  canonicalHash: `#${string}`; aliases: readonly `#${string}`[];
  closure: PhoneDependencyClosure; preparePolicy: PhonePreparePolicy;
  terminalEvidence: PhoneTerminalEvidencePolicy;
  deadlineProfile: PhoneDeadlineProfileId; deadlinePolicy: PhoneDeadlinePolicy;
  mediaActivation: PhoneMediaActivationPolicy
}>;
export type PhoneSceneManifest = Readonly<{
  id: PhoneSceneId; checkpoint: string; edgeSurface: `#${string}`; plane: PhonePlane;
  landing: PhoneLanding; content: PhoneContentProof; frame: PhoneFrameProof;
  navigationId: PhoneSceneId; reducedMotion: PhoneReducedMotionPolicy;
  dependencies: readonly PhoneDependencyRef[]; surfaces: readonly string[];
  directEntry: PhoneDirectEntryPolicy
}>;
export type PhoneTimingExportName = keyof typeof canonicalTimingValues;
export type PhoneTimingReference = Readonly<{
  manifestSegmentId: PhoneSegmentId; policy: SegmentPolicy; virtualDuration: number;
  namedExports: readonly PhoneTimingExportName[]
}>;
export type PhoneRollbackPolicy = Readonly<{
  kind: 'source-reproof'; stableCommit: 'preserve-object-identity';
  commitSequence: 'unchanged'; sourceProof: 'replace-after-full-quorum';
  failureRetirement: 'never-before-source-reproof'; deadlinePolicy: PhoneDeadlinePolicy
}>;
export type PhoneSegmentLeg = Readonly<{
  direction: PhoneDirection; source: PhoneSceneId; target: PhoneSceneId;
  effectSurface: string; closure: PhoneDependencyClosure;
  preparePolicy: PhonePreparePolicy; terminalEvidence: PhoneTerminalEvidencePolicy;
  inputBoundary: PhoneInputBoundary; deadlineProfile: PhoneDeadlineProfileId;
  deadlinePolicy: PhoneDeadlinePolicy; mediaActivation: PhoneMediaActivationPolicy
}>;
export type PhoneSegmentManifest = Readonly<{
  id: PhoneSegmentId; source: PhoneSceneId; target: PhoneSceneId;
  timing: PhoneTimingReference; effectPlacement: PhoneEffectPlacement;
  forward: PhoneSegmentLeg; reverse: PhoneSegmentLeg; rollback: PhoneRollbackPolicy
}>;

type PhoneProgressCurve = 0 | 1 | 'linear' | Readonly<[
  'range' | 'inverse-range' | 'smooth' | 'fade' | 'step', number, number?
]>;
export type PhoneSegmentChoreography = Readonly<{
  sourceProgress: PhoneProgressCurve;
  targetProgress: PhoneProgressCurve;
  effectProgress: PhoneProgressCurve;
  sourceOpacity: PhoneProgressCurve;
  targetOpacity: PhoneProgressCurve;
  activationOwner: 'none' | 'source' | 'target'; mediaClockOwner: 'none' | 'source' | 'target';
  foregroundOwner: 'canonical-source' | 'canonical-target';
}>;
export type PhoneSegmentChoreographyFrame = Readonly<{
  sourceProgress: number;
  targetProgress: number;
  effectProgress: number;
  sourceOpacity: number;
  targetOpacity: number;
  stableHold: Readonly<{ source: 0 | 1; target: 0 | 1 }>;
  activationOwner: PhoneSegmentChoreography['activationOwner']; mediaClockOwner: PhoneSegmentChoreography['mediaClockOwner'];
  foregroundOwner: 'source' | 'target';
}>;
export type PhoneInkOwnership = Readonly<{
  revealClip?: string;
  concealClip?: string;
  revealMask?: string;
  concealMask?: string;
}>;
export type PhoneTransitionProjection = Readonly<{
  sourceOpacity: number;
  targetOpacity: number;
  ownership: PhoneInkOwnership | null;
  direction: PhoneDirection;
  foregroundOwner: 'source' | 'target';
}>;

function freezeCurve(curve: PhoneProgressCurve): PhoneProgressCurve {
  return Array.isArray(curve) ? Object.freeze([...curve]) as PhoneProgressCurve : curve;
}

function choreography(
  sourceProgress: PhoneProgressCurve,
  targetProgress: PhoneProgressCurve,
  effectProgress: PhoneProgressCurve,
  activationOwner: PhoneSegmentChoreography['activationOwner'], mediaClockOwner: PhoneSegmentChoreography['mediaClockOwner'],
  sourceOpacity: PhoneProgressCurve = 1,
  targetOpacity: PhoneProgressCurve = 1,
  foregroundOwner: PhoneSegmentChoreography['foregroundOwner'] = 'canonical-target'
): PhoneSegmentChoreography {
  return Object.freeze({
    sourceProgress: freezeCurve(sourceProgress),
    targetProgress: freezeCurve(targetProgress),
    effectProgress: freezeCurve(effectProgress),
    sourceOpacity: freezeCurve(sourceOpacity),
    targetOpacity: freezeCurve(targetOpacity),
    activationOwner, mediaClockOwner,
    foregroundOwner
  });
}

const heroMotionStop = HERO_PATTERN_MOTION_MS / HERO_PATTERN_TOTAL_MS;
const ttgPlaybackStop = TTG_PLAYBACK_MS
  / (TTG_PLAYBACK_MS + INTRA_CHAPTER_DISSOLVE_MS);
const phPlaybackStop = PH_PLAYBACK_MS
  / (PH_PLAYBACK_MS + INTRA_CHAPTER_DISSOLVE_MS);

export const phoneSegmentChoreography = Object.freeze({
  'hero-pattern': choreography(
    ['range', 0, heroMotionStop], 0, ['range', heroMotionStop, 1], 'source', 'source'
  ),
  'pattern-star-map': choreography(
    ['range', 0, PATTERN_COLLAPSE_STOP], 1,
    ['range', PATTERN_COLLAPSE_STOP, 1], 'none', 'none'
  ),
  'star-map-aod': choreography(1, 0, 'linear', 'none', 'none'),
  'aod-method-top': choreography(
    'linear', ['step', .8], 'linear', 'source', 'source', ['fade', .7, 1], 1,
    'canonical-source'
  ),
  'method-bottom-figure2': choreography(
    1, 0, ['range', 0, .8], 'none', 'none'
  ),
  'figure2-distance-expand': choreography(
    ['range', 0, .72], 0, ['smooth', .748, .9832], 'source', 'source',
    1, ['smooth', .748, .9832]
  ),
  'figure2-proof-brand': choreography(1, 1, 'linear', 'none', 'none'),
  'brand-figure3': choreography(1, 0, 'linear', 'none', 'none', 1, 1,
    'canonical-source'),
  'figure3-services': choreography(
    ['smooth', 0, .96], ['smooth', .8, .94], 'linear', 'source', 'source',
    ['fade', .9, .98], ['smooth', .8, .96]
  ),
  'services-ttg': choreography(1, 0, 'linear', 'target', 'none'),
  'ttg-lab': choreography(
    ['range', 0, ttgPlaybackStop], 1, 'linear', 'source', 'source',
    ['inverse-range', ttgPlaybackStop, 1], ['range', ttgPlaybackStop, 1]
  ),
  'lab-ph': choreography(1, 0, 'linear', 'target', 'none'),
  'ph-education': choreography(
    ['range', 0, phPlaybackStop], 1, 'linear', 'source', 'source',
    ['inverse-range', phPlaybackStop, 1], ['range', phPlaybackStop, 1]
  ),
  'education-crane': choreography(1, 0, 'linear', 'target', 'none'),
  'crane-contact': choreography(
    'linear', ['range', .8, 1], 'linear', 'source', 'source',
    ['fade', .999, 1], ['step', .8]
  )
} satisfies Readonly<Record<PhoneSegmentId, PhoneSegmentChoreography>>);

const phoneStableHolds = Object.freeze({
  hero: 0,
  pattern: 0,
  'star-map': 1,
  'aod-animation': 0,
  'method-top': 1,
  'figure2-animation': 0,
  'figure2-proof': 0,
  brand: 1,
  'figure3-animation': 0,
  services: 1,
  'ttg-animation': 0,
  lab: 1,
  'ph-animation': 0,
  education: 1,
  'crane-animation': 0,
  contact: 1
} as const satisfies Readonly<Record<PhoneSceneId, 0 | 1>>);

const phoneSegmentEndpoints = Object.freeze(Object.fromEntries(
  canonicalSegments.map(({ id, from, to }) => [id, Object.freeze({ from, to })])
) as Readonly<Record<PhoneSegmentId, Readonly<{
  from: PhoneSceneId;
  to: PhoneSceneId;
}>>>);

export function phoneSceneStableHold(scene: PhoneSceneId): 0 | 1 {
  return phoneStableHolds[scene];
}

function projectPhoneCurve(curve: PhoneProgressCurve, rawProgress: number): number {
  const progress = Math.min(1, Math.max(0, rawProgress));
  if (typeof curve === 'number') return curve;
  if (curve === 'linear') return progress;
  const [kind, start, suppliedEnd] = curve;
  if (kind === 'step') return progress >= start ? 1 : 0;
  const value = Math.min(1, Math.max(0,
    (progress - start) / Math.max(.0001, (suppliedEnd ?? 1) - start)
  ));
  const eased = value * value * (3 - 2 * value);
  if (kind === 'smooth') return eased;
  if (kind === 'fade') return 1 - eased;
  return kind === 'inverse-range' ? 1 - value : value;
}

export function phoneSegmentChoreographyFrame(
  segmentId: PhoneSegmentId,
  progress: number,
  direction: PhoneDirection = 'forward',
  stageIndex = 0
): PhoneSegmentChoreographyFrame {
  const spec = phoneSegmentChoreography[segmentId];
  const endpoint = phoneSegmentEndpoints[segmentId];
  const canonicalMediaClockOwner = segmentId === 'figure2-distance-expand'
    && (direction === 'forward' ? stageIndex > 0 : stageIndex === 0)
    ? 'none' : spec.mediaClockOwner;
  const canonical: PhoneSegmentChoreographyFrame = {
    sourceProgress: projectPhoneCurve(spec.sourceProgress, progress),
    targetProgress: projectPhoneCurve(spec.targetProgress, progress),
    effectProgress: projectPhoneCurve(spec.effectProgress, progress),
    sourceOpacity: projectPhoneCurve(spec.sourceOpacity, progress),
    targetOpacity: projectPhoneCurve(spec.targetOpacity, progress),
    stableHold: Object.freeze({
      source: phoneSceneStableHold(endpoint.from),
      target: phoneSceneStableHold(endpoint.to)
    }),
    activationOwner: spec.activationOwner, mediaClockOwner: canonicalMediaClockOwner,
    foregroundOwner: spec.foregroundOwner === 'canonical-source'
      ? 'source'
      : 'target'
  };
  if (direction === 'forward') return Object.freeze(canonical);
  return Object.freeze({
    ...canonical,
    sourceProgress: canonical.targetProgress,
    targetProgress: canonical.sourceProgress,
    sourceOpacity: canonical.targetOpacity,
    targetOpacity: canonical.sourceOpacity,
    stableHold: Object.freeze({
      source: canonical.stableHold.target,
      target: canonical.stableHold.source
    }),
    activationOwner: canonical.activationOwner === 'none' ? 'none'
      : canonical.activationOwner === 'source' ? 'target' : 'source',
    mediaClockOwner: canonical.mediaClockOwner === 'none' ? 'none'
      : canonical.mediaClockOwner === 'source' ? 'target' : 'source',
    foregroundOwner: canonical.foregroundOwner === 'source' ? 'target' : 'source'
  });
}

const canonicalTimingValues = {
  CRANE_CONTACT_DURATION_MS, FIGURE3_SERVICES_DURATION_MS,
  HERO_PATTERN_INK_MS, HERO_PATTERN_MOTION_MS, HERO_PATTERN_TOTAL_MS,
  INTRA_CHAPTER_DISSOLVE_MS, PATTERN_COLLAPSE_MS, PATTERN_COLLAPSE_STOP,
  PATTERN_STAR_MAP_INK_MS, PATTERN_TOTAL_MS, PH_PLAYBACK_MS,
  TERMINAL_DWELL_MS, TTG_PLAYBACK_MS
} as const;

const deadlineProfiles: Readonly<Record<PhoneDeadlineProfileId, PhoneDeadlinePolicy>> = {
  'D-static': {
    moduleLoad: 8000, mediaPrepare: 0, firstFrame: 1500,
    planeApply: 1500, scrollConfirm: 1500, rollback: 4000
  },
  'D-single-media': {
    moduleLoad: 8000, mediaPrepare: 8000, firstFrame: 3000,
    planeApply: 1500, scrollConfirm: 1500, rollback: 5000
  },
  'D-multi-media': {
    moduleLoad: 10000, mediaPrepare: 10000, firstFrame: 4000,
    planeApply: 1500, scrollConfirm: 1500, rollback: 6000
  }
};

export const phoneManifestFetchDeadlineMs = 3000;
function freezeOwned<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  for (const [key, nested] of Object.entries(value)) {
    if (key !== 'policy' && key !== 'canonicalPolicy') {
      freezeOwned(nested);
    }
  }
  return Object.isFrozen(value) ? value : Object.freeze(value);
}
const budget = (
  videos: number, activeDecoders: number, canvases: number, webglContexts: number
): PhoneResourceBudget => ({
  videos, activeDecoders, canvases, webglContexts
});

type SceneSeed = Readonly<Omit<
  PhoneSceneManifest,
  'content' | 'dependencies' | 'directEntry' | 'navigationId' | 'reducedMotion'
> & {
  additionalDependencies: readonly PhoneDependencyRef[]; contentSelectors: readonly string[];
  resourceBudget: PhoneResourceBudget; deadlineProfile: PhoneDeadlineProfileId;
}>;

const sceneSeeds: Readonly<Record<PhoneSceneId, SceneSeed>> = {
  hero: { id: 'hero', checkpoint: 'hero-entered', edgeSurface: '#040807', plane: 'front', landing: { kind: 'front-corridor', anchor: '#portrait-spike-home' }, frame: { kind: 'decoded-or-static-post-paint', surfaceIds: ['hero-figure-canvas', 'hero-figure-poster'] }, additionalDependencies: ['media:hero-back', 'media:hero-middle', 'media:hero-figure-poster', 'media:hero-figure-packed', 'compositor:hero-packed'], surfaces: ['hero-back-image', 'hero-middle-image', 'hero-figure-poster', 'hero-figure-video', 'hero-figure-canvas', 'hero-intro-ink'], contentSelectors: ['#portrait-spike-home'], resourceBudget: budget(1, 1, 2, 1), deadlineProfile: 'D-single-media' },
  pattern: { id: 'pattern', checkpoint: 'pattern-complete', edgeSurface: '#8f7f61', plane: 'front', landing: { kind: 'authored-boundary', anchor: '[data-portrait-pattern-bloom]' }, frame: { kind: 'image-decode-composite-paint', surfaceIds: ['pattern-image'] }, additionalDependencies: ['media:pattern-background'], surfaces: ['pattern-image'], contentSelectors: ['[data-portrait-pattern-bloom]'], resourceBudget: budget(0, 0, 0, 0), deadlineProfile: 'D-static' },
  'star-map': { id: 'star-map', checkpoint: 'star-map-reading', edgeSurface: '#06100d', plane: 'front', landing: { kind: 'authored-boundary', anchor: '#portrait-spike-star-title' }, frame: { kind: 'image-decode-composite-paint', surfaceIds: ['star-map-source', 'star-map-canvas'] }, additionalDependencies: ['media:star-map-source'], surfaces: ['star-map-source', 'star-map-canvas'], contentSelectors: ['#portrait-spike-star-title'], resourceBudget: budget(0, 0, 1, 0), deadlineProfile: 'D-static' },
  'aod-animation': { id: 'aod-animation', checkpoint: 'aod-stage', edgeSurface: '#ede4d2', plane: 'front', landing: { kind: 'semantic-edge', anchor: 'aod-semantic-edge' }, frame: { kind: 'image-decode-composite-paint', surfaceIds: ['aod-figure-poster'] }, additionalDependencies: ['media:aod-figure-poster', 'media:aod-figure-packed', 'compositor:aod-packed'], surfaces: ['aod-figure-video', 'aod-figure-poster', 'aod-figure-canvas'], contentSelectors: ['[data-phone-aod-figure-poster]'], resourceBudget: budget(1, 1, 1, 1), deadlineProfile: 'D-single-media' },
  'method-top': { id: 'method-top', checkpoint: 'method-intro', edgeSurface: '#ede4d2', plane: 'native', landing: { kind: 'authored-boundary', anchor: '#method' }, frame: { kind: 'content-post-paint', surfaceIds: ['method-root'] }, additionalDependencies: [], surfaces: ['method-root'], contentSelectors: ['#method'], resourceBudget: budget(0, 0, 0, 0), deadlineProfile: 'D-static' },
  'figure2-animation': { id: 'figure2-animation', checkpoint: 'figure2-stage', edgeSurface: '#e2dac9', plane: 'grade-a', landing: { kind: 'authored-boundary', anchor: '[data-r4-scene="figure2-animation"]' }, frame: { kind: 'image-decode-composite-paint', surfaceIds: ['figure2-pair-poster', 'figure2-foreground-arch'] }, additionalDependencies: ['media:figure2-pair-poster', 'media:figure2-foreground-arch', 'media:figure2-pair-packed', 'compositor:figure2-packed'], surfaces: ['figure2-pair-video', 'figure2-pair-poster', 'figure2-pair-canvas', 'figure2-foreground-arch'], contentSelectors: ['[data-r4-scene="figure2-animation"] [data-phone-figure2-poster]'], resourceBudget: budget(1, 1, 1, 1), deadlineProfile: 'D-single-media' },
  'figure2-proof': { id: 'figure2-proof', checkpoint: 'figure2-proof-opening', edgeSurface: '#ede4d2', plane: 'native', landing: { kind: 'authored-boundary', anchor: '#figure2-proof-opening' }, frame: { kind: 'content-post-paint', surfaceIds: ['figure2-proof-root', 'figure2-foreground-arch'] }, additionalDependencies: ['media:figure2-foreground-arch'], surfaces: ['figure2-proof-root', 'figure2-foreground-arch'], contentSelectors: ['#figure2-proof-opening .r4-proof-opening__title'], resourceBudget: budget(0, 0, 0, 0), deadlineProfile: 'D-static' },
  brand: { id: 'brand', checkpoint: 'brand-reading', edgeSurface: '#ede4d2', plane: 'native', landing: { kind: 'authored-boundary', anchor: '#brand' }, frame: { kind: 'content-post-paint', surfaceIds: ['brand-root'] }, additionalDependencies: [], surfaces: ['brand-root'], contentSelectors: ['.phone-brand__definition:first-of-type h2', '.phone-brand__definition:first-of-type p'], resourceBudget: budget(0, 0, 0, 0), deadlineProfile: 'D-static' },
  'figure3-animation': { id: 'figure3-animation', checkpoint: 'figure3-stage', edgeSurface: '#ede4d2', plane: 'group45', landing: { kind: 'persistent-compositor', anchor: '[data-phone-scene="figure3-animation"]' }, frame: { kind: 'canvas-or-static-post-paint', surfaceIds: ['figure3-initial-composite'] }, additionalDependencies: ['media:figure3-motion', 'compositor:figure3-paper', 'media:figure3-initial-poster'], surfaces: ['figure3-video', 'figure3-paper-canvas', 'figure3-initial-poster', 'figure3-initial-composite'], contentSelectors: ['[data-phone-scene="figure3-animation"] [data-phone-figure3-initial-composite]'], resourceBudget: budget(1, 1, 1, 0), deadlineProfile: 'D-single-media' },
  services: { id: 'services', checkpoint: 'services-reading', edgeSurface: '#ede4d2', plane: 'native', landing: { kind: 'authored-boundary', anchor: '#services' }, frame: { kind: 'content-post-paint', surfaceIds: ['services-root'] }, additionalDependencies: [], surfaces: ['services-root'], contentSelectors: ['.phone-services__hero h2', '.phone-services__hero > p'], resourceBudget: budget(0, 0, 0, 0), deadlineProfile: 'D-static' },
  'ttg-animation': { id: 'ttg-animation', checkpoint: 'ttg-stage', edgeSurface: '#080d10', plane: 'group45', landing: { kind: 'persistent-compositor', anchor: '[data-r4-scene="ttg-animation"]' }, frame: { kind: 'decoded-composited-frame', surfaceIds: ['ttg-figure-video'] }, additionalDependencies: ['media:ttg-figure-motion'], surfaces: ['ttg-figure-video'], contentSelectors: ['[data-r4-scene="ttg-animation"] [data-ttg-figure-video]'], resourceBudget: budget(1, 1, 0, 0), deadlineProfile: 'D-single-media' },
  lab: { id: 'lab', checkpoint: 'lab-stable', edgeSurface: '#ede4d2', plane: 'native', landing: { kind: 'authored-boundary', anchor: '#lab' }, frame: { kind: 'content-post-paint', surfaceIds: ['lab-root'] }, additionalDependencies: [], surfaces: ['lab-root'], contentSelectors: ['.phone-lab__hero h2', '.phone-lab__hero > p:first-of-type'], resourceBudget: budget(0, 0, 0, 0), deadlineProfile: 'D-static' },
  'ph-animation': { id: 'ph-animation', checkpoint: 'ph-stage', edgeSurface: '#9889a5', plane: 'group67', landing: { kind: 'persistent-compositor', anchor: '[data-r4-scene="ph-animation"]' }, frame: { kind: 'packed-canvas-draw', surfaceIds: ['ph-figure-canvas'] }, additionalDependencies: ['media:ph-figure-packed', 'compositor:ph-packed'], surfaces: ['ph-figure-video', 'ph-figure-canvas'], contentSelectors: ['[data-r4-scene="ph-animation"] [data-phone-packed-alpha-canvas="ph-figure"]'], resourceBudget: budget(1, 1, 1, 1), deadlineProfile: 'D-single-media' },
  education: { id: 'education', checkpoint: 'education-reading', edgeSurface: '#ede4d2', plane: 'native', landing: { kind: 'authored-boundary', anchor: '#education' }, frame: { kind: 'content-post-paint', surfaceIds: ['education-root'] }, additionalDependencies: [], surfaces: ['education-root'], contentSelectors: ['.r4-education__lead h2', '.r4-education__lead p'], resourceBudget: budget(0, 0, 0, 0), deadlineProfile: 'D-static' },
  'crane-animation': { id: 'crane-animation', checkpoint: 'crane-stage', edgeSurface: '#ede4d2', plane: 'group67', landing: { kind: 'persistent-compositor', anchor: '[data-r4-scene="crane-animation"]' }, frame: { kind: 'packed-canvas-draw', surfaceIds: ['crane-figure-canvas', 'crane-flock-canvas'] }, additionalDependencies: ['media:crane-figure-packed', 'media:crane-flock-packed', 'compositor:crane-figure-packed', 'compositor:crane-flock-packed'], surfaces: ['crane-figure-video', 'crane-figure-canvas', 'crane-flock-video', 'crane-flock-canvas'], contentSelectors: ['[data-r4-scene="crane-animation"] [data-phone-packed-alpha-canvas="crane-figure"]', '[data-phone-packed-alpha-canvas="crane-flock"]'], resourceBudget: budget(2, 2, 2, 2), deadlineProfile: 'D-multi-media' },
  contact: { id: 'contact', checkpoint: 'contact-stable', edgeSurface: '#ede4d2', plane: 'native', landing: { kind: 'authored-boundary', anchor: '#contact' }, frame: { kind: 'content-post-paint', surfaceIds: ['contact-root'] }, additionalDependencies: [], surfaces: ['contact-root'], contentSelectors: ['.r4-contact__content h2', '.r4-contact__content p'], resourceBudget: budget(0, 0, 0, 0), deadlineProfile: 'D-static' }
};

const preferredHashes: Readonly<Partial<Record<PhoneSceneId, `#${string}`>>> = {
  hero: '#home', 'method-top': '#method'
};
const aliasScenes = {
  '': 'hero', top: 'hero', home: 'hero', belief: 'star-map', method: 'method-top',
  'figure2-proof-opening': 'figure2-proof',
  'figure2-proof-cards': 'figure2-proof',
  'figure2-proof-closing': 'figure2-proof',
  brand: 'brand', services: 'services', lab: 'lab',
  education: 'education', contact: 'contact'
} as const satisfies Readonly<Record<string, PhoneSceneId>>;
const proofAliases = {
  'figure2-proof-opening': 'opening',
  'figure2-proof-cards': 'cards',
  'figure2-proof-closing': 'closing'
} as const;
const preparePolicy: PhonePreparePolicy = {
  sourceCover: 'source-or-loader-through-prepared', receiverMount: 'inert',
  prewarm: 'module-and-immutable-metadata-only',
  receiverExposure: 'atomic-candidate-plane'
};
const reducedMotion: PhoneReducedMotionPolicy = {
  sampling: 'terminal-static', proof: 'full-visible-quorum', closure: 'unchanged'
};

function sceneDependencies(id: PhoneSceneId): readonly PhoneDependencyRef[] {
  return [`scene:${id}`, `root:${id}`, ...sceneSeeds[id].additionalDependencies];
}
function sceneMounts(
  role: 'source' | 'receiver', id: PhoneSceneId
): readonly PhoneMountRole[] {
  return [
    `${role}:root:${id}`,
    ...sceneSeeds[id].surfaces.map((surface) => `${role}:${surface}` as PhoneMountRole)
  ];
}
function prewarmDependencies(id: PhoneSceneId): readonly PhoneDependencyRef[] {
  return sceneDependencies(id).filter((dependency) => (
    dependency.startsWith('scene:') || dependency.startsWith('media:')
  ));
}
function preparedEvidence(id: PhoneSceneId): readonly PhonePreparedEvidenceKind[] { const kind = sceneSeeds[id].frame.kind;
  const readiness: PhonePreparedEvidenceKind = kind === 'image-decode-composite-paint' || kind === 'canvas-or-static-post-paint' ? 'image-decoded' : kind === 'content-post-paint' ? 'static-ready' : kind === 'decoded-composited-frame' && sceneSeeds[id].resourceBudget.canvases === 0 ? 'video-decoded' : 'canvas-drawn';
  return ['module-loaded', 'root-connected', ...(id === 'star-map' ? ['image-decoded', 'canvas-drawn'] as const : [readiness]), ...(id === 'figure2-proof' ? ['image-decoded' as const] : []), 'layout-measurable', 'resource-budget-valid'];
}
function mediaActivation(resourceBudget: PhoneResourceBudget, needsPhysicalActivation = resourceBudget.videos > 0): PhoneMediaActivationPolicy {
  return !needsPhysicalActivation
    ? {
        mode: 'none', prewarmMayActivate: false, requiresPhysicalCredit: false,
        directEntry: 'none', rejection: 'not-applicable'
      }
    : {
        mode: 'gesture-or-muted-autoplay', prewarmMayActivate: false,
        requiresPhysicalCredit: true,
        directEntry: 'muted-plays-inline-then-covered-cta',
        rejection: 'await-accessible-physical-gesture'
      };
}
function canonicalHash(id: PhoneSceneId): `#${string}` {
  return preferredHashes[id] ?? `#${id}`;
}
function aliasesFor(id: PhoneSceneId): readonly `#${string}`[] {
  return Object.entries(aliasScenes)
    .filter(([alias, scene]) => alias.length > 0 && scene === id)
    .map(([alias]) => `#${alias}` as `#${string}`);
}

function directEntry(seed: SceneSeed): PhoneDirectEntryPolicy {
  const closure: PhoneDependencyClosure = {
    load: sceneDependencies(seed.id), mount: sceneMounts('receiver', seed.id),
    prewarm: [], retainUntil: 'loader-through-prepared',
    exposeReceiverAfter: preparedEvidence(seed.id),
    retireAfter: 'loader-after-visible-stable', resourceBudget: seed.resourceBudget
  };
  return {
    canonicalHash: canonicalHash(seed.id), aliases: aliasesFor(seed.id),
    closure, preparePolicy,
    terminalEvidence: {
      required: PHONE_FINAL_EVIDENCE_KINDS, retirementProof: 'loader-after-stable'
    },
    deadlineProfile: seed.deadlineProfile, deadlinePolicy: deadlineProfiles[seed.deadlineProfile],
    mediaActivation: mediaActivation(
      seed.resourceBudget,
      seed.resourceBudget.videos > 0
        && !['aod-animation', 'figure3-animation'].includes(seed.id)
    )
  };
}

const phoneScenes = Object.freeze(canonicalSceneIds.map((id): PhoneSceneManifest => {
  const seed = sceneSeeds[id];
  return {
    id, checkpoint: seed.checkpoint, edgeSurface: seed.edgeSurface, plane: seed.plane,
    landing: seed.landing,
    content: { mode: 'all-visible', selectors: seed.contentSelectors },
    frame: seed.frame, navigationId: id, reducedMotion,
    dependencies: sceneDependencies(id), surfaces: seed.surfaces,
    directEntry: directEntry(seed)
  };
}));

type SegmentProfile = Readonly<{
  effectPlacement: PhoneEffectPlacement; effectSurface: string;
  retirement: 'R-standard' | 'R-pair'; resourceBudget: PhoneResourceBudget;
  deadlineProfile: PhoneDeadlineProfileId;
}>;

const segmentProfiles: Readonly<Record<PhoneSegmentId, SegmentProfile>> = {
  'hero-pattern': { effectPlacement: 'above-both', effectSurface: 'fx:hero-pattern', retirement: 'R-standard', resourceBudget: budget(1, 1, 3, 2), deadlineProfile: 'D-single-media' },
  'pattern-star-map': { effectPlacement: 'above-both', effectSurface: 'fx:pattern-star-map', retirement: 'R-standard', resourceBudget: budget(0, 0, 2, 1), deadlineProfile: 'D-static' },
  'star-map-aod': { effectPlacement: 'above-both', effectSurface: 'fx:star-map-aod', retirement: 'R-standard', resourceBudget: budget(1, 1, 3, 2), deadlineProfile: 'D-single-media' },
  'aod-method-top': { effectPlacement: 'between', effectSurface: 'between:aod-method-top', retirement: 'R-standard', resourceBudget: budget(1, 1, 1, 1), deadlineProfile: 'D-single-media' },
  'method-bottom-figure2': { effectPlacement: 'above-both', effectSurface: 'fx:method-bottom-figure2', retirement: 'R-standard', resourceBudget: budget(1, 1, 2, 2), deadlineProfile: 'D-single-media' },
  'figure2-distance-expand': { effectPlacement: 'above-both', effectSurface: 'fx:figure2-distance-expand', retirement: 'R-standard', resourceBudget: budget(1, 1, 4, 2), deadlineProfile: 'D-single-media' },
  'figure2-proof-brand': { effectPlacement: 'above-both', effectSurface: 'fx:figure2-proof-brand', retirement: 'R-standard', resourceBudget: budget(0, 0, 1, 1), deadlineProfile: 'D-static' },
  'brand-figure3': { effectPlacement: 'between', effectSurface: 'fx:brand-figure3', retirement: 'R-standard', resourceBudget: budget(1, 1, 2, 1), deadlineProfile: 'D-single-media' },
  'figure3-services': { effectPlacement: 'between', effectSurface: 'between:figure3-services', retirement: 'R-pair', resourceBudget: budget(1, 1, 1, 0), deadlineProfile: 'D-single-media' },
  'services-ttg': { effectPlacement: 'above-both', effectSurface: 'fx:services-ttg', retirement: 'R-standard', resourceBudget: budget(1, 1, 1, 1), deadlineProfile: 'D-single-media' },
  'ttg-lab': { effectPlacement: 'between', effectSurface: 'between:ttg-lab', retirement: 'R-pair', resourceBudget: budget(1, 1, 0, 0), deadlineProfile: 'D-single-media' },
  'lab-ph': { effectPlacement: 'above-both', effectSurface: 'fx:lab-ph', retirement: 'R-standard', resourceBudget: budget(1, 1, 2, 2), deadlineProfile: 'D-single-media' },
  'ph-education': { effectPlacement: 'between', effectSurface: 'between:ph-education', retirement: 'R-pair', resourceBudget: budget(1, 1, 1, 1), deadlineProfile: 'D-single-media' },
  'education-crane': { effectPlacement: 'above-both', effectSurface: 'fx:education-crane', retirement: 'R-standard', resourceBudget: budget(2, 2, 3, 3), deadlineProfile: 'D-multi-media' },
  'crane-contact': { effectPlacement: 'between', effectSurface: 'between:crane-contact', retirement: 'R-pair', resourceBudget: budget(2, 2, 2, 2), deadlineProfile: 'D-multi-media' }
};

const namedTimingExports: Readonly<Record<PhoneSegmentId, readonly PhoneTimingExportName[]>> = {
  'hero-pattern': ['HERO_PATTERN_MOTION_MS', 'HERO_PATTERN_INK_MS', 'HERO_PATTERN_TOTAL_MS'],
  'pattern-star-map': ['PATTERN_COLLAPSE_MS', 'PATTERN_STAR_MAP_INK_MS', 'PATTERN_TOTAL_MS', 'PATTERN_COLLAPSE_STOP'],
  'star-map-aod': [], 'aod-method-top': [], 'method-bottom-figure2': [],
  'figure2-distance-expand': ['TERMINAL_DWELL_MS'],
  'figure2-proof-brand': [], 'brand-figure3': [],
  'figure3-services': ['FIGURE3_SERVICES_DURATION_MS'],
  'services-ttg': [],
  'ttg-lab': ['TTG_PLAYBACK_MS', 'INTRA_CHAPTER_DISSOLVE_MS', 'TERMINAL_DWELL_MS'],
  'lab-ph': [],
  'ph-education': ['PH_PLAYBACK_MS', 'INTRA_CHAPTER_DISSOLVE_MS', 'TERMINAL_DWELL_MS'],
  'education-crane': [],
  'crane-contact': ['CRANE_CONTACT_DURATION_MS']
};

function timingReference(id: PhoneSegmentId): PhoneTimingReference {
  const canonical = storyManifest.nodes.find((node) => (
    node.kind === 'segment' && node.id === id
  ));
  if (!canonical || canonical.kind !== 'segment') {
    throw new Error(`Canonical story timing is missing for ${id}`);
  }
  return {
    manifestSegmentId: id, policy: canonical.policy,
    virtualDuration: canonical.virtualDuration,
    namedExports: namedTimingExports[id]
  };
}

function segmentClosure(
  id: PhoneSegmentId, source: PhoneSceneId, target: PhoneSceneId,
  profile: SegmentProfile
): PhoneDependencyClosure {
  const retireAfter: PhoneProofBoundary = profile.retirement === 'R-pair'
    ? 'pair-exit-or-route-dispose'
    : 'target-stable-rollback-closed';
  return {
    load: [...sceneDependencies(source), `transition:${id}`, ...sceneDependencies(target)],
    mount: [...sceneMounts('source', source), `effect:${profile.effectSurface}`, ...sceneMounts('receiver', target)],
    prewarm: [`transition:${id}`, ...prewarmDependencies(target)], retainUntil: 'source-through-prepared',
    exposeReceiverAfter: preparedEvidence(target),
    retireAfter, resourceBudget: profile.resourceBudget
  };
}

function segmentLeg(
  id: PhoneSegmentId, direction: PhoneDirection,
  source: PhoneSceneId, target: PhoneSceneId,
  timing: PhoneTimingReference, profile: SegmentProfile
): PhoneSegmentLeg {
  return {
    direction, source, target, effectSurface: profile.effectSurface,
    closure: segmentClosure(id, source, target, profile), preparePolicy,
    terminalEvidence: {
      required: PHONE_FINAL_EVIDENCE_KINDS, retirementProof: profile.retirement
    },
    inputBoundary: {
      claim: 'one-fresh-physical-epoch', arrivingTail: 'reject-until-fresh',
      release: 'stable-or-rollback',
      canonicalPolicy: timing.policy
    },
    deadlineProfile: profile.deadlineProfile, deadlinePolicy: deadlineProfiles[profile.deadlineProfile],
    mediaActivation: mediaActivation(
      profile.resourceBudget,
      (phoneSegmentChoreographyFrame(id, 0, direction).activationOwner === 'source'
        && sceneSeeds[source].resourceBudget.videos > 0)
        || (phoneSegmentChoreographyFrame(id, 0, direction).activationOwner === 'target'
          && sceneSeeds[target].resourceBudget.videos > 0)
    )
  };
}

const phoneSegments = Object.freeze(canonicalSegments.map((seed): PhoneSegmentManifest => {
  const profile = segmentProfiles[seed.id];
  const timing = timingReference(seed.id);
  return {
    id: seed.id, source: seed.from, target: seed.to, timing,
    effectPlacement: profile.effectPlacement,
    forward: segmentLeg(seed.id, 'forward', seed.from, seed.to, timing, profile),
    reverse: segmentLeg(seed.id, 'reverse', seed.to, seed.from, timing, profile),
    rollback: {
      kind: 'source-reproof', stableCommit: 'preserve-object-identity',
      commitSequence: 'unchanged',
      sourceProof: 'replace-after-full-quorum',
      failureRetirement: 'never-before-source-reproof',
      deadlinePolicy: deadlineProfiles[profile.deadlineProfile]
    }
  };
}));

export const phoneManifest = freezeOwned({
  scenes: phoneScenes, segments: phoneSegments
});

export function phoneSceneById(id: PhoneSceneId): PhoneSceneManifest {
  const scene = phoneManifest.scenes.find((entry) => entry.id === id);
  if (!scene) throw new Error(`Unknown phone scene: ${id}`);
  return scene;
}

export function phonePreparedSurfaceIds(
  sceneId: PhoneSceneId,
  kind: PhonePreparedEvidenceKind
): readonly (PhoneSurfaceId | null)[] {
  const scene = phoneSceneById(sceneId);
  if (kind === 'module-loaded' || kind === 'resource-budget-valid') return [null];
  if (kind === 'root-connected' || kind === 'layout-measurable') return [`root:${sceneId}`];
  if (scene.id === 'star-map') return kind === 'image-decoded' ? ['star-map-source'] : kind === 'canvas-drawn' ? ['star-map-canvas'] : scene.frame.surfaceIds;
  if (scene.id === 'figure2-animation' && kind === 'canvas-drawn') return ['figure2-pair-canvas'];
  if (scene.frame.kind === 'packed-canvas-draw') return scene.frame.surfaceIds;
  if (kind === 'image-decoded' && scene.id === 'figure2-proof') {
    return ['figure2-foreground-arch'];
  }
  return scene.frame.kind === 'image-decode-composite-paint'
    ? scene.frame.surfaceIds : [scene.frame.surfaceIds[0] ?? null];
}
export function phoneSegmentBetween(
  source: PhoneSceneId, target: PhoneSceneId
): PhoneSegmentManifest | null {
  return phoneManifest.segments.find((segment) => (
    (segment.source === source && segment.target === target)
    || (segment.source === target && segment.target === source)
  )) ?? null;
}
export function phoneAdjacentTarget(
  scene: PhoneSceneId, direction: PhoneDirection
): PhoneSceneId | null {
  const index = canonicalSceneIds.indexOf(scene);
  const target = canonicalSceneIds[index + (direction === 'forward' ? 1 : -1)];
  return target ?? null;
}
export const phoneDirectEntryClosure = (scene: PhoneSceneId): PhoneDependencyClosure =>
  phoneSceneById(scene).directEntry.closure;
export function phoneSegmentClosure(
  segment: PhoneSegmentId, direction: PhoneDirection
): PhoneDependencyClosure {
  const record = phoneManifest.segments.find((entry) => entry.id === segment);
  if (!record) throw new Error(`Unknown phone segment: ${segment}`);
  return record[direction].closure;
}
export const phoneDeadlinePolicy = (profile: PhoneDeadlineProfileId): PhoneDeadlinePolicy =>
  deadlineProfiles[profile];
export function phoneMediaActivationPolicy(
  sceneOrSegment: PhoneSceneId | PhoneSegmentId,
  direction: PhoneDirection = 'forward'
): PhoneMediaActivationPolicy {
  const scene = phoneManifest.scenes.find((entry) => entry.id === sceneOrSegment);
  if (scene) return scene.directEntry.mediaActivation;
  const segment = phoneManifest.segments.find((entry) => entry.id === sceneOrSegment);
  if (!segment) throw new Error(`Unknown phone scene or segment: ${sceneOrSegment}`);
  return segment[direction].mediaActivation;
}

function assertDifferentEntryScenes(source: PhoneSceneId, target: PhoneSceneId): void {
  if (source === target) throw new Error(
    `same-scene warm entry uses proof correction: ${source}`
  );
}
function warmEntryClosure(
  source: PhoneSceneId, target: PhoneSceneId
): PhoneDependencyClosure {
  assertDifferentEntryScenes(source, target);
  return freezeOwned({
    load: sceneDependencies(target),
    mount: [...sceneMounts('source', source), ...sceneMounts('receiver', target)],
    prewarm: prewarmDependencies(target), retainUntil: 'source-through-prepared',
    exposeReceiverAfter: preparedEvidence(target),
    retireAfter: 'target-stable-rollback-closed',
    resourceBudget: budget(3, 2, 4, 3)
  });
}
export const phoneWarmEntryClosure = warmEntryClosure;

export type PhoneWarmEntryPolicy = Readonly<{
  mode: 'entry'; source: PhoneSceneId; target: PhoneSceneId;
  closure: PhoneDependencyClosure;
  deadlineProfile: PhoneDeadlineProfileId; deadlinePolicy: PhoneDeadlinePolicy;
  retirement: Readonly<{
    success: 'target-stable-rollback-closed'; failure: 'source-reproof-after-failure';
    stableCommit: 'preserve-object-identity'; commitSequence: 'unchanged';
  }>;
}>;
const deadlineProfileRank: Readonly<Record<PhoneDeadlineProfileId, number>> = {
  'D-static': 0, 'D-single-media': 1, 'D-multi-media': 2
};
export function phoneWarmEntryPolicy(
  source: PhoneSceneId, target: PhoneSceneId
): PhoneWarmEntryPolicy {
  const sourceProfile = phoneSceneById(source).directEntry.deadlineProfile;
  const targetProfile = phoneSceneById(target).directEntry.deadlineProfile;
  const deadlineProfile = deadlineProfileRank[sourceProfile] >= deadlineProfileRank[targetProfile]
    ? sourceProfile : targetProfile;
  return freezeOwned({
    mode: 'entry', source, target, closure: warmEntryClosure(source, target),
    deadlineProfile, deadlinePolicy: deadlineProfiles[deadlineProfile],
    retirement: {
      success: 'target-stable-rollback-closed', failure: 'source-reproof-after-failure',
      stableCommit: 'preserve-object-identity', commitSequence: 'unchanged'
    }
  });
}

export type PhoneEntryResolution = Readonly<{
  sceneId: PhoneSceneId; canonicalHash: `#${string}`;
  landingAlias: 'opening' | 'cards' | 'closing' | null; scope: 'formal' | 'brand-lab';
}>;
function normalizedHash(hash: string): string {
  try {
    return decodeURIComponent(hash.replace(/^#/, '').trim()).toLowerCase();
  } catch { return ''; }
}
export function phoneEntryForLocation(
  pathname: string, hash: string
): PhoneEntryResolution {
  const value = normalizedHash(hash);
  const fallback: PhoneSceneId = pathname === '/brand-lab' ? 'brand' : 'hero';
  const canonical = canonicalSceneIds.find((scene) => scene === value);
  const sceneId = value === '' ? fallback
    : canonical ?? aliasScenes[value as keyof typeof aliasScenes] ?? fallback;
  return {
    sceneId, canonicalHash: canonicalHash(sceneId),
    landingAlias: proofAliases[value as keyof typeof proofAliases] ?? null,
    scope: pathname === '/brand-lab' ? 'brand-lab' : 'formal'
  };
}

export function phoneManifestIntegrity(): readonly string[] {
  const violations: string[] = [];
  const sceneIds = phoneManifest.scenes.map((scene) => scene.id);
  const segmentIds = phoneManifest.segments.map((segment) => segment.id);
  const reject = (condition: boolean, message: string): void => {
    if (condition) violations.push(message);
  };
  reject(
    sceneIds.join('|') !== canonicalSceneIds.join('|'),
    'phone scene order differs from canonicalSceneIds'
  );
  reject(
    segmentIds.join('|') !== canonicalSegments.map(({ id }) => id).join('|'),
    'phone segment order differs from canonicalSegments'
  );
  reject(
    new Set(sceneIds).size !== 16 || new Set(segmentIds).size !== 15,
    'phone scene/segment IDs are not exhaustive and unique'
  );
  for (const scene of phoneManifest.scenes) {
    const closure = scene.directEntry.closure;
    reject(
      !closure.load.length || !closure.mount.length || !closure.exposeReceiverAfter.length,
      `${scene.id} direct-entry closure is incomplete`
    );
    reject(closure.load.some((dependency) => (
      dependency.startsWith('scene:') && dependency !== `scene:${scene.id}`
    )), `${scene.id} direct entry loads an earlier/different scene`);
  }
  for (const [index, segment] of phoneManifest.segments.entries()) {
    const canonical = canonicalSegments[index];
    reject(
      canonical?.id !== segment.id || canonical.from !== segment.source
        || canonical.to !== segment.target,
      `${segment.id} adjacency differs from canonicalSegments`
    );
    for (const leg of [segment.forward, segment.reverse]) {
      reject(
        !leg.closure.load.length || !leg.closure.mount.length,
        `${segment.id}:${leg.direction} closure is incomplete`
      );
      reject(
        leg.closure.exposeReceiverAfter.some(
          (kind) => !PHONE_PREPARED_EVIDENCE_KINDS.includes(kind)
        ),
        `${segment.id}:${leg.direction} exposure uses final evidence`
      );
      reject(
        leg.terminalEvidence.required.length !== PHONE_FINAL_EVIDENCE_KINDS.length,
        `${segment.id}:${leg.direction} terminal quorum is incomplete`
      );
    }
  }
  for (const names of Object.values(namedTimingExports)) {
    reject(
      names.some((name) => !Number.isFinite(canonicalTimingValues[name])),
      'named canonical timing export is missing'
    );
  }
  return violations;
}

const manifestViolations = phoneManifestIntegrity();
if (manifestViolations.length > 0) {
  throw new Error(`Invalid phone manifest: ${manifestViolations.join('; ')}`);
}
