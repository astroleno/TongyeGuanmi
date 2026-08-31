import { canonicalSpine } from './canonical-spine';
import { METHOD_COPY as sharedMethodCopy } from './copy';
import {
  CRANE_CONTACT_DURATION_MS,
  FIGURE3_SERVICES_DURATION_MS,
  HERO_PATTERN_TOTAL_MS,
  INTRA_CHAPTER_DISSOLVE_MS,
  PATTERN_COLLAPSE_MS,
  PATTERN_COLLAPSE_STOP,
  PATTERN_STAR_MAP_INK_MS,
  PATTERN_TOTAL_MS,
  PH_PLAYBACK_MS,
  TERMINAL_DWELL_MS,
  TTG_PLAYBACK_MS
} from './timings';
import type {
  MediaPlaybackContract,
  MilestoneKey,
  SceneId,
  SegmentId,
  SegmentPolicy,
  SegmentVisual,
  StagedBoundaryAdvance,
  SpineHoldNode,
  SpineNode,
  SpineSegmentNode,
  StoryManifest
} from './types';

const inventoryGeneratedAt = '2026-07-06';
const interruptibleSegmentIds: readonly SegmentId[] = [];

// The inventory is also the no-JS copy authority. Keep the production Method
// holds on those same strings instead of duplicating them across lazy chunks.
export const METHOD_COPY = sharedMethodCopy.slice(0, 23);
export const METHOD_TOP_COPY = METHOD_COPY.slice(0, 8);
export const METHOD_STEPS_COPY = METHOD_COPY.slice(8, 23);

const defaults = {
  buildTimeoutMs: 1800,
  chargeThreshold: 0.1,
  chargeDecayPerMs: 0.001,
  settlingMs: 420
} as const;

const fallbackDurations = {
  snapMs: 1200,
  readingMs: 900
} as const;

const stagedMediaPreparingTimeoutMs = 8000;

function snapPolicy(segment: SegmentId): SegmentPolicy {
  const isInterruptible = interruptibleSegmentIds.includes(segment);
  return {
    kind: 'snap',
    chargeThreshold: defaults.chargeThreshold,
    ...(isInterruptible ? { interruptible: true } : {})
  };
}

function stagedPolicy(
  stageStops: readonly number[] | undefined,
  stagePlayMs: readonly number[] | undefined,
  advance: readonly StagedBoundaryAdvance[],
  postScrollVh?: number
): SegmentPolicy {
  if (!stageStops || !stagePlayMs) {
    throw new Error('R-1 staged policy seed is missing stageStops or stagePlayMs');
  }
  return {
    kind: 'stagedSnap',
    stops: stageStops,
    playMs: stagePlayMs,
    advance,
    ...(postScrollVh !== undefined ? { postScrollVh } : {})
  };
}

function readingPolicy(anchor: SceneId, edgeArm: 'bottom' | 'top' = 'bottom'): SegmentPolicy {
  return { kind: 'reading', anchor, edgeArm };
}

function durationFromPlayMs(value: number | undefined): number {
  return value ?? fallbackDurations.snapMs;
}

function durationFromStages(playMs: readonly number[] | undefined): number {
  return playMs?.reduce((sum, value) => sum + value, 0) ?? fallbackDurations.snapMs;
}

function leadingStageStop(leadMs: number, tailMs: number): number {
  return leadMs / Math.max(1, leadMs + tailMs);
}

function visualFor(segment: SegmentId): SegmentVisual | undefined {
  switch (segment) {
    case 'hero-pattern':
      return { type: 'ink', ink: 'left-rotate-expand' };
    case 'pattern-star-map':
      return { type: 'ink', ink: 'left-rotate-expand' };
    case 'star-map-aod':
    case 'method-bottom-figure2':
    case 'figure2-proof-brand':
    case 'brand-figure3':
    case 'services-ttg':
    case 'education-crane':
      return { type: 'ink', ink: 'horizontal', direction: 'bottom-to-top' };
    case 'lab-ph':
      return { type: 'ink', ink: 'horizontal', direction: 'top-to-bottom' };
    case 'ttg-lab':
      return { type: 'disappear', media: ['ttg-figure-motion'] };
    case 'ph-education':
      return { type: 'disappear', media: ['ph-figure-motion'] };
    case 'aod-method-top':
      return { type: 'disappear', media: ['aod-figure-motion'] };
    case 'figure2-distance-expand':
      return { type: 'disappear', media: ['figure2-pair-motion'] };
    case 'figure3-services':
      return { type: 'disappear', media: ['figure3-motion'] };
    case 'crane-contact':
      return { type: 'disappear', media: ['crane-figure-motion', 'crane-flock-motion'] };
    case 'figure2-proof-opening-cards':
    case 'figure2-proof-cards-closing':
      return undefined;
  }
}

function policyAndDuration(segment: SegmentId): Pick<SpineSegmentNode, 'policy' | 'virtualDuration'> {
  switch (segment) {
    case 'aod-method-top':
      return {
        policy: snapPolicy(segment),
        virtualDuration: durationFromPlayMs(2600)
      };
    case 'method-top-method-bottom':
      return {
        policy: snapPolicy(segment),
        virtualDuration: 600
      };
    case 'method-bottom-figure2':
      return {
        policy: snapPolicy(segment),
        virtualDuration: fallbackDurations.snapMs
      };
    case 'figure2-distance-expand':
      return {
        policy: stagedPolicy(
          [0.72],
          [2600, 1500],
          [{ kind: 'delay', ms: TERMINAL_DWELL_MS }],
          56
        ),
        virtualDuration: durationFromStages([2600, 1500])
      };
    case 'figure2-proof-opening-cards':
      return {
        policy: readingPolicy('figure2-proof-cards'),
        virtualDuration: fallbackDurations.readingMs
      };
    case 'figure2-proof-cards-closing':
      return {
        policy: readingPolicy('figure2-proof-closing'),
        virtualDuration: fallbackDurations.readingMs
      };
    case 'figure3-services':
      return {
        policy: snapPolicy(segment),
        virtualDuration: FIGURE3_SERVICES_DURATION_MS
      };
    case 'ttg-lab':
      return {
        policy: stagedPolicy(
          [leadingStageStop(TTG_PLAYBACK_MS, INTRA_CHAPTER_DISSOLVE_MS)],
          [TTG_PLAYBACK_MS, INTRA_CHAPTER_DISSOLVE_MS],
          [{ kind: 'delay', ms: TERMINAL_DWELL_MS }]
        ),
        virtualDuration: TTG_PLAYBACK_MS + INTRA_CHAPTER_DISSOLVE_MS
      };
    case 'ph-education':
      return {
        policy: stagedPolicy(
          [leadingStageStop(PH_PLAYBACK_MS, INTRA_CHAPTER_DISSOLVE_MS)],
          [PH_PLAYBACK_MS, INTRA_CHAPTER_DISSOLVE_MS],
          [{ kind: 'delay', ms: TERMINAL_DWELL_MS }]
        ),
        virtualDuration: PH_PLAYBACK_MS + INTRA_CHAPTER_DISSOLVE_MS
      };
    case 'crane-contact':
      return {
        policy: snapPolicy(segment),
        virtualDuration: CRANE_CONTACT_DURATION_MS
      };
    case 'hero-pattern':
      return {
        policy: snapPolicy(segment),
        virtualDuration: HERO_PATTERN_TOTAL_MS
      };
    case 'pattern-star-map':
      return {
        policy: stagedPolicy(
          [PATTERN_COLLAPSE_STOP],
          [PATTERN_COLLAPSE_MS, PATTERN_STAR_MAP_INK_MS],
          [{ kind: 'gesture' }]
        ),
        virtualDuration: PATTERN_TOTAL_MS
      };
    case 'star-map-aod':
    case 'figure2-proof-brand':
    case 'brand-figure3':
    case 'services-ttg':
    case 'lab-ph':
    case 'education-crane':
      return {
        policy: snapPolicy(segment),
        virtualDuration: fallbackDurations.snapMs
      };
  }
}

function copyCueFor(segment: SegmentId) {
  switch (segment) {
    case 'aod-method-top':
      return { targetScene: 'method-top', atProgress: 0.8 } as const;
    case 'figure3-services':
      return { targetScene: 'services', atProgress: 0.8 } as const;
    case 'crane-contact':
      return { targetScene: 'contact', atProgress: 0.8 } as const;
    default:
      return undefined;
  }
}

function mediaPlaybackContract(
  id: string,
  media: readonly string[],
  terminalFallbackScene: SceneId,
  options: {
    forwardMode?: MediaPlaybackContract['forward']['mode'];
    reverseMode?: MediaPlaybackContract['reverse']['mode'];
    reverseRequired?: boolean;
    forwardMedia?: readonly string[];
    reverseMedia?: readonly string[];
    preparingTimeoutMs?: number;
  } = {}
): MediaPlaybackContract {
  return {
    id,
    media,
    forward: {
      mode: options.forwardMode ?? 'play',
      required: true,
      ...(options.forwardMedia ? { media: options.forwardMedia } : {})
    },
    reverse: {
      mode: options.reverseMode ?? 'static-fallback',
      required: options.reverseRequired ?? false,
      ...(options.reverseMedia ? { media: options.reverseMedia } : {})
    },
    readyMilestones: ['targetReady', 'mediaReady'],
    terminalFallbackScene,
    preparingTimeoutMs: options.preparingTimeoutMs ?? defaults.buildTimeoutMs
  };
}

const aodAnimationMedia = ['aod-figure-motion'] as const;
const figure2AnimationMedia = ['figure2-pair-motion'] as const;
const heroAnimationMedia = ['hero-figure-motion'] as const;
const figure3AnimationMedia = ['figure3-motion'] as const;
const ttgAnimationMedia = ['ttg-figure-motion'] as const;
const phAnimationMedia = ['ph-figure-motion'] as const;
const craneAnimationMedia = ['crane-figure-motion', 'crane-flock-motion'] as const;

const animationMediaByScene = {
  'aod-animation': aodAnimationMedia,
  'figure2-animation': figure2AnimationMedia,
  'figure3-animation': figure3AnimationMedia,
  'ttg-animation': ttgAnimationMedia,
  'ph-animation': phAnimationMedia,
  'crane-animation': craneAnimationMedia
} as const;

type AnimationMediaScene = keyof typeof animationMediaByScene;

function incomingAnimationMediaPlayback(
  segment: SegmentId,
  targetScene: SceneId
): readonly MediaPlaybackContract[] | undefined {
  const media = animationMediaByScene[targetScene as AnimationMediaScene];
  if (!media) {
    return undefined;
  }
  const reverseRequired = segment === 'method-bottom-figure2'
    || segment === 'lab-ph'
    || segment === 'brand-figure3'
    || segment === 'services-ttg'
    || segment === 'education-crane';
  const frameLock = (
    segment === 'star-map-aod' && targetScene === 'aod-animation'
  ) || (
    segment === 'method-bottom-figure2' && targetScene === 'figure2-animation'
  ) || (
    segment === 'lab-ph' && targetScene === 'ph-animation'
  ) || (
    segment === 'brand-figure3' && targetScene === 'figure3-animation'
  ) || (
    segment === 'services-ttg' && targetScene === 'ttg-animation'
  ) || (
    segment === 'education-crane' && targetScene === 'crane-animation'
  );
  const reverseFrameLock = frameLock && (reverseRequired || segment === 'star-map-aod');
  return [
    mediaPlaybackContract(
      segment,
      media,
      targetScene,
      {
        forwardMode: frameLock ? 'frame-lock' : 'timeline',
        ...(reverseRequired || segment === 'star-map-aod' ? {
          reverseMode: reverseFrameLock ? 'frame-lock' : 'timeline' as const,
          reverseRequired: true
        } : {}),
        preparingTimeoutMs: stagedMediaPreparingTimeoutMs
      }
    )
  ];
}

export function mediaPlaybackFor(segment: SegmentId): readonly MediaPlaybackContract[] | undefined {
  switch (segment) {
    case 'hero-pattern':
      return [
        mediaPlaybackContract(
          'hero-figure-pattern',
          heroAnimationMedia,
          'pattern',
          {
            forwardMode: 'frame-lock',
            reverseMode: 'frame-lock',
            reverseRequired: true,
            preparingTimeoutMs: stagedMediaPreparingTimeoutMs
          }
        )
      ];
    case 'aod-method-top':
      return [
        mediaPlaybackContract(
          'aod-front-figure',
          aodAnimationMedia,
          'method-top',
          {
            forwardMode: 'frame-lock',
            reverseMode: 'frame-lock',
            reverseRequired: true
          }
        )
      ];
    case 'figure3-services':
      return [
        mediaPlaybackContract(
          'figure3-alpha',
          figure3AnimationMedia,
          'services',
          {
            forwardMode: 'frame-lock',
            reverseMode: 'frame-lock',
            reverseRequired: true
          }
        )
      ];
    case 'figure2-distance-expand':
      return [
        mediaPlaybackContract(
          'figure2-pair',
          figure2AnimationMedia,
          'figure2-proof',
          {
            forwardMode: 'frame-lock',
            reverseMode: 'frame-lock',
            reverseRequired: true,
            forwardMedia: figure2AnimationMedia,
            reverseMedia: figure2AnimationMedia,
            preparingTimeoutMs: stagedMediaPreparingTimeoutMs
          }
        )
      ];
    case 'ttg-lab':
      return [
        mediaPlaybackContract(
          'ttg-alpha',
          ttgAnimationMedia,
          'lab',
          {
            forwardMode: 'frame-lock',
            reverseMode: 'frame-lock',
            reverseRequired: true,
            forwardMedia: ttgAnimationMedia,
            reverseMedia: ttgAnimationMedia,
            preparingTimeoutMs: stagedMediaPreparingTimeoutMs
          }
        )
      ];
    case 'ph-education':
      return [
        mediaPlaybackContract(
          'ph-alpha',
          phAnimationMedia,
          'education',
          {
            forwardMode: 'frame-lock',
            reverseMode: 'frame-lock',
            reverseRequired: true,
            preparingTimeoutMs: stagedMediaPreparingTimeoutMs
          }
        )
      ];
    case 'crane-contact':
      return [
        mediaPlaybackContract(
          'crane-transition',
          craneAnimationMedia,
          'contact',
          {
            forwardMode: 'frame-lock',
            reverseMode: 'frame-lock',
            reverseRequired: true,
            forwardMedia: craneAnimationMedia,
            reverseMedia: craneAnimationMedia
          }
        )
      ];
    default:
      return undefined;
  }
}

export function requiredMilestonesFor(
  segment: SegmentId,
  mediaPlayback = mediaPlaybackFor(segment)
): readonly MilestoneKey[] {
  const milestones: MilestoneKey[] = ['targetReady'];
  if (mediaPlayback?.length) {
    milestones.push('mediaReady');
  }
  milestones.push('buildReady');
  if (segment === 'figure2-distance-expand') {
    milestones.push('timelineReady');
  }
  return milestones;
}

function buildNodes(): readonly SpineNode[] {
  return canonicalSpine.map((node): SpineNode => {
    if (node.kind === 'hold') {
      return {
        kind: 'hold',
        scene: node.scene,
        reading: node.reading,
        staticFallback: node.staticFallback,
        ...(node.freshInput ? { freshInput: true } : {}),
        buildTimeoutMs: defaults.buildTimeoutMs
      };
    }

    const policy = policyAndDuration(node.id);
    const visual = visualFor(node.id);
    const copyCue = copyCueFor(node.id);
    const incomingMediaPlayback = incomingAnimationMediaPlayback(node.id, node.to);
    const mediaPlayback = incomingMediaPlayback ?? mediaPlaybackFor(node.id);
    const requiredMilestones = requiredMilestonesFor(node.id, mediaPlayback);
    const mediaPreparingTimeoutMs = Math.max(
      defaults.buildTimeoutMs,
      ...(mediaPlayback ?? []).map((contract) => contract.preparingTimeoutMs)
    );
    return {
      kind: 'segment',
      id: node.id,
      from: node.from,
      to: node.to,
      policy: policy.policy,
      virtualDuration: policy.virtualDuration,
      requiredMilestones,
      buildTimeoutMs: node.id === 'hero-pattern'
        ? stagedMediaPreparingTimeoutMs
        : mediaPreparingTimeoutMs,
      ...(visual ? { visual } : {}),
      ...(copyCue ? { copyCue } : {}),
      ...(mediaPlayback ? { mediaPlayback } : {})
    };
  });
}

export const storyManifest: StoryManifest = {
  version: 0,
  defaults,
  inventory: {
    source: 'R-1',
    generatedAt: inventoryGeneratedAt,
    interruptibleCandidates: interruptibleSegmentIds
  },
  nodes: buildNodes()
};

export function validateStoryManifest(
  manifest: StoryManifest,
  allowedInterruptibleSegments: readonly SegmentId[] = interruptibleSegmentIds
): void {
  if (manifest.defaults.buildTimeoutMs <= 0) {
    throw new Error('manifest defaults must include a positive buildTimeoutMs');
  }

  if (manifest.nodes.length < 3 || manifest.nodes[0]?.kind !== 'hold') {
    throw new Error('manifest nodes must start with a hold');
  }

  const hasStaticFallback = manifest.nodes.some((node) => node.kind === 'hold' && node.staticFallback);
  if (!hasStaticFallback) {
    throw new Error('manifest must include at least one staticFallback hold');
  }

  const heroHold = manifest.nodes.find((node): node is SpineHoldNode => node.kind === 'hold' && node.scene === 'hero');
  if (!heroHold?.staticFallback) {
    throw new Error('hero hold must be a staticFallback hold');
  }

  for (let index = 0; index < manifest.nodes.length; index += 1) {
    const node = manifest.nodes[index];
    if (!node) {
      throw new Error(`manifest node ${index} is missing`);
    }
    const expectedKind = index % 2 === 0 ? 'hold' : 'segment';
    if (node.kind !== expectedKind) {
      throw new Error(`manifest node ${index} must be ${expectedKind}`);
    }
  }

  for (let index = 1; index < manifest.nodes.length - 1; index += 2) {
    const previous = manifest.nodes[index - 1];
    const segment = manifest.nodes[index];
    const next = manifest.nodes[index + 1];
    if (previous?.kind !== 'hold' || segment?.kind !== 'segment' || next?.kind !== 'hold') {
      throw new Error(`manifest segment triplet at index ${index} is malformed`);
    }

    if (segment.from !== previous.scene || segment.to !== next.scene) {
      throw new Error(`segment ${segment.id} from/to must match neighboring holds`);
    }

    if (segment.virtualDuration <= 0) {
      throw new Error(`segment ${segment.id} virtualDuration must be positive`);
    }

    if (segment.copyCue) {
      if (segment.copyCue.atProgress <= 0 || segment.copyCue.atProgress >= 1) {
        throw new Error(`segment ${segment.id} copyCue.atProgress must be inside 0..1`);
      }
      const targetExists = manifest.nodes.some((node) => node.kind === 'hold' && node.scene === segment.copyCue?.targetScene);
      if (!targetExists) {
        throw new Error(`segment ${segment.id} copyCue targetScene must exist`);
      }
    }

    if (segment.visual?.type === 'disappear' && segment.visual.media?.length && !segment.mediaPlayback?.length) {
      throw new Error(`segment ${segment.id} disappear media requires mediaPlayback seed`);
    }

    const requiresMedia = segment.mediaPlayback?.some(
      (contract) => contract.forward.required || contract.reverse.required
    ) ?? false;
    if (requiresMedia && !segment.requiredMilestones?.includes('mediaReady')) {
      throw new Error(`segment ${segment.id} media playback requires a mediaReady requiredMilestone`);
    }

    for (const mediaPlayback of segment.mediaPlayback ?? []) {
      if (mediaPlayback.media.length === 0) {
        throw new Error(`segment ${segment.id} mediaPlayback ${mediaPlayback.id} must declare media`);
      }
      if (mediaPlayback.readyMilestones.length === 0) {
        throw new Error(`segment ${segment.id} mediaPlayback ${mediaPlayback.id} must declare readyMilestones`);
      }
      for (const direction of [mediaPlayback.forward, mediaPlayback.reverse]) {
        if (direction.mode === 'frame-lock' && !direction.required) {
          throw new Error(
            `segment ${segment.id} mediaPlayback ${mediaPlayback.id} frame-lock direction must be required`
          );
        }
        if (direction.required && direction.media?.length === 0) {
          throw new Error(
            `segment ${segment.id} mediaPlayback ${mediaPlayback.id} required direction must declare media`
          );
        }
        if (direction.media?.some((key) => !mediaPlayback.media.includes(key))) {
          throw new Error(
            `segment ${segment.id} mediaPlayback ${mediaPlayback.id} direction media must belong to contract media`
          );
        }
      }
      const terminalFallbackExists = manifest.nodes.some(
        (node) => node.kind === 'hold' && node.scene === mediaPlayback.terminalFallbackScene
      );
      if (!terminalFallbackExists) {
        throw new Error(
          `segment ${segment.id} mediaPlayback ${mediaPlayback.id} terminalFallbackScene must exist`
        );
      }
      if (mediaPlayback.preparingTimeoutMs <= 0) {
        throw new Error(`segment ${segment.id} mediaPlayback ${mediaPlayback.id} preparingTimeoutMs must be positive`);
      }
    }

    if (segment.policy.kind === 'stagedSnap') {
      const stops = segment.policy.stops;
      const allInsideRange = stops.every((stop) => stop > 0 && stop < 1);
      const strictlyIncreasing = stops.every((stop, stopIndex) =>
        stopIndex === 0 || stop > (stops[stopIndex - 1] ?? 0)
      );
      if (!allInsideRange || !strictlyIncreasing) {
        throw new Error(`segment ${segment.id} stagedSnap stops must be strictly increasing and inside 0..1`);
      }
      if (segment.policy.playMs.length !== stops.length + 1) {
        throw new Error(`segment ${segment.id} stagedSnap playMs must have stops.length + 1 entries`);
      }
      if (segment.policy.advance.length !== stops.length) {
        throw new Error(`segment ${segment.id} stagedSnap advance must match stops length`);
      }
      for (const boundary of segment.policy.advance) {
        if (!['immediate', 'gesture', 'delay'].includes(boundary.kind)) {
          throw new Error(`segment ${segment.id} stagedSnap advance has unknown kind`);
        }
        if (boundary.kind === 'delay' && (!Number.isFinite(boundary.ms) || boundary.ms < 0)) {
          throw new Error(`segment ${segment.id} stagedSnap delay must be non-negative`);
        }
      }
    }

    if (segment.policy.kind === 'snap' && segment.policy.interruptible) {
      if (!allowedInterruptibleSegments.includes(segment.id)) {
        throw new Error(`segment ${segment.id} interruptible must come from R-1 candidates`);
      }
    }
  }
}

validateStoryManifest(storyManifest);
