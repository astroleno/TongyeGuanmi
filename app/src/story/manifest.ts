import migrationInventory from '../../../docs/react-refactor/inventory/migration-inventory.json';
import interruptibleCandidates from '../../../docs/react-refactor/inventory/interruptible-candidates.json';
import copyReference from '../../../docs/react-refactor/inventory/copy-reference.json';
import { canonicalSpine } from './canonical-spine';
import { parseInventoryManifestSeed, type InventoryManifestSeed } from './inventory-schema';
import {
  CRANE_CONTACT_DURATION_MS,
  FIGURE3_SERVICES_DURATION_MS,
  PATTERN_COLLAPSE_MS,
  PATTERN_COLLAPSE_STOP,
  PATTERN_STAR_MAP_INK_MS
} from './timings';
import type {
  MediaPlaybackContract,
  MilestoneKey,
  SceneId,
  SegmentId,
  SegmentPolicy,
  SegmentVisual,
  SpineHoldNode,
  SpineNode,
  SpineSegmentNode,
  StoryManifest
} from './types';

export const inventoryManifestSeed = parseInventoryManifestSeed({
  migrationInventory,
  interruptibleCandidates,
  copyReference
});

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

const stagedMediaPreparingTimeoutMs = 4000;

function transitionSeed(legacyTransitionId: string, seed: InventoryManifestSeed) {
  const found = seed.transitions.find((transition) => transition.legacyTransitionId === legacyTransitionId);
  if (!found) {
    throw new Error(`R-1 transition seed missing: ${legacyTransitionId}`);
  }
  return found;
}

const seedByLegacy = {
  homeBelief: transitionSeed('home-belief', inventoryManifestSeed),
  beliefMethod: transitionSeed('belief-method', inventoryManifestSeed),
  figure2: transitionSeed('method-tooling__method-proof', inventoryManifestSeed),
  figure3: transitionSeed('brand-services', inventoryManifestSeed),
  ttg: transitionSeed('services-lab', inventoryManifestSeed),
  ph: transitionSeed('lab-education', inventoryManifestSeed),
  crane: transitionSeed('philosophy-contact', inventoryManifestSeed)
} as const;

function snapPolicy(segment: SegmentId): SegmentPolicy {
  const isInterruptible = inventoryManifestSeed.interruptibleSegmentIds.includes(segment);
  return {
    kind: 'snap',
    chargeThreshold: defaults.chargeThreshold,
    ...(isInterruptible ? { interruptible: true } : {})
  };
}

function stagedPolicy(
  stageStops: readonly number[] | undefined,
  stagePlayMs: readonly number[] | undefined,
  postScrollVh?: number
): SegmentPolicy {
  if (!stageStops || !stagePlayMs) {
    throw new Error('R-1 staged policy seed is missing stageStops or stagePlayMs');
  }
  return {
    kind: 'stagedSnap',
    stops: stageStops,
    playMs: stagePlayMs,
    ...(postScrollVh !== undefined ? { postScrollVh } : {})
  };
}

function readingPolicy(anchor: SceneId, edgeArm: 'bottom' | 'top' = 'bottom'): SegmentPolicy {
  return { kind: 'reading', anchor, edgeArm };
}

function durationFromPlayMs(value: number | undefined): number {
  return value ?? fallbackDurations.snapMs;
}

function durationFromModulePlayMs(value: number | undefined): number {
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
    case 'ph-education':
      return { type: 'ink', ink: 'horizontal', direction: 'top-to-bottom' };
    case 'aod-method-top':
      return { type: 'media', media: ['aod_figure-alpha-front-scrub'] };
    case 'figure2-distance-expand':
      return { type: 'internal', milestone: 'figure2-distance-expand' };
    case 'figure3-services':
      return { type: 'media', media: ['figure3-alpha-scrub'] };
    case 'crane-contact':
      return { type: 'media', media: ['crane-figure-transition'] };
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
        virtualDuration: durationFromPlayMs(seedByLegacy.beliefMethod.playMs)
      };
    case 'method-bottom-figure2':
      return {
        policy: snapPolicy(segment),
        virtualDuration: fallbackDurations.snapMs
      };
    case 'figure2-distance-expand':
      return {
        policy: stagedPolicy(
          seedByLegacy.figure2.stageStops,
          seedByLegacy.figure2.stagePlayMs,
          seedByLegacy.figure2.postScrollVh
        ),
        virtualDuration: durationFromStages(seedByLegacy.figure2.stagePlayMs)
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
        policy: stagedPolicy([0.676], [durationFromModulePlayMs(seedByLegacy.ttg.modulePlayMs), 1200]),
        virtualDuration: durationFromModulePlayMs(seedByLegacy.ttg.modulePlayMs) + 1200
      };
    case 'ph-education': {
      const modulePlayMs = durationFromModulePlayMs(seedByLegacy.ph.modulePlayMs);
      const inkPlayMs = 1200;
      return {
        policy: stagedPolicy([leadingStageStop(modulePlayMs, inkPlayMs)], [modulePlayMs, inkPlayMs]),
        virtualDuration: modulePlayMs + inkPlayMs
      };
    }
    case 'crane-contact':
      return {
        policy: snapPolicy(segment),
        virtualDuration: CRANE_CONTACT_DURATION_MS
      };
    case 'hero-pattern':
      return {
        policy: snapPolicy(segment),
        virtualDuration: 2200
      };
    case 'pattern-star-map':
      return {
        policy: stagedPolicy(
          [PATTERN_COLLAPSE_STOP],
          [PATTERN_COLLAPSE_MS, PATTERN_STAR_MAP_INK_MS]
        ),
        virtualDuration: PATTERN_COLLAPSE_MS + PATTERN_STAR_MAP_INK_MS
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

export function mediaPlaybackFor(segment: SegmentId): readonly MediaPlaybackContract[] | undefined {
  switch (segment) {
    case 'aod-method-top':
      return [
        mediaPlaybackContract(
          'aod-front-figure',
          ['aod_figure-alpha-front-scrub'],
          'method-top',
          { forwardMode: 'timeline' }
        )
      ];
    case 'figure3-services':
      return [
        mediaPlaybackContract(
          'figure3-alpha',
          ['figure3-alpha-scrub'],
          'services',
          { forwardMode: 'timeline' }
        )
      ];
    case 'figure2-distance-expand':
      return [
        mediaPlaybackContract(
          'figure2-pair',
          ['figure2-left-alpha', 'figure2-right-alpha'],
          'figure2-proof-opening',
          {
            reverseMode: 'timeline',
            reverseRequired: true,
            preparingTimeoutMs: stagedMediaPreparingTimeoutMs
          }
        )
      ];
    case 'ttg-lab':
      return [
        mediaPlaybackContract(
          'ttg-alpha',
          ['ttg_figure-alpha-scrub', 'ttg_figure-alpha-scrub-reverse'],
          'lab',
          {
            reverseMode: 'play',
            reverseRequired: true,
            forwardMedia: ['ttg_figure-alpha-scrub'],
            reverseMedia: ['ttg_figure-alpha-scrub-reverse'],
            preparingTimeoutMs: stagedMediaPreparingTimeoutMs
          }
        )
      ];
    case 'ph-education':
      return [
        mediaPlaybackContract(
          'ph-alpha',
          ['ph_figure-alpha-scrub'],
          'education',
          {
            forwardMode: 'timeline',
            reverseMode: 'timeline',
            reverseRequired: true,
            preparingTimeoutMs: stagedMediaPreparingTimeoutMs
          }
        )
      ];
    case 'crane-contact':
      return [
        mediaPlaybackContract(
          'crane-transition',
          ['crane-figure1-transition', 'crane-figure2-transition'],
          'contact',
          { forwardMode: 'timeline', reverseMode: 'timeline', reverseRequired: true }
        )
      ];
    default:
      return undefined;
  }
}

export function requiredMilestonesFor(segment: SegmentId): readonly MilestoneKey[] {
  const milestones: MilestoneKey[] = ['targetReady'];
  if (mediaPlaybackFor(segment)?.some((contract) => contract.forward.required || contract.reverse.required)) {
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
    const mediaPlayback = mediaPlaybackFor(node.id);
    const requiredMilestones = requiredMilestonesFor(node.id);
    return {
      kind: 'segment',
      id: node.id,
      from: node.from,
      to: node.to,
      policy: policy.policy,
      virtualDuration: policy.virtualDuration,
      requiredMilestones,
      buildTimeoutMs: defaults.buildTimeoutMs,
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
    generatedAt: inventoryManifestSeed.generatedAt,
    interruptibleCandidates: inventoryManifestSeed.interruptibleSegmentIds
  },
  nodes: buildNodes()
};

export function validateStoryManifest(
  manifest: StoryManifest,
  allowedInterruptibleSegments: readonly SegmentId[] = inventoryManifestSeed.interruptibleSegmentIds
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

    if (segment.visual?.type === 'media' && !segment.mediaPlayback?.length) {
      throw new Error(`segment ${segment.id} media visual requires mediaPlayback seed`);
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
      const sorted = [...stops].sort((left, right) => left - right);
      const allInsideRange = stops.every((stop) => stop > 0 && stop < 1);
      const strictlySorted = stops.every((stop, stopIndex) => stop === sorted[stopIndex]);
      if (!allInsideRange || !strictlySorted) {
        throw new Error(`segment ${segment.id} stagedSnap stops must be sorted and inside 0..1`);
      }
      if (segment.policy.playMs.length !== stops.length + 1) {
        throw new Error(`segment ${segment.id} stagedSnap playMs must have stops.length + 1 entries`);
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
