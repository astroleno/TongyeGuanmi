import { assign, setup } from 'xstate';
import { createChargeState, applyChargeDelta, mergeQueuedIntent, sampleQueuedIntent } from './charge';
import { createRecoveryPlan } from './recovery';
import { storyManifest } from '../story/manifest';
import { StorySpine } from '../story/spine';
import {
  advanceLayerWindow,
  createLayerWindow,
  fallbackLayerWindow,
  releaseRetiringLayers,
  type LayerWindowSnapshot
} from '../stage/LayerWindow';
import type {
  Direction,
  DirectorEvent,
  PausePoint,
  PrepareToken,
  QueuedIntent,
  SceneId,
  SegmentId,
  SegmentRunId,
  SpineSegmentNode,
  StoryCursor,
  StoryManifest
} from '../story/types';
import type { ChargeState } from './charge';

export const DIRECTOR_STATES = [
  'booting',
  'hold',
  'preparing',
  'scrubbing',
  'playing',
  'staged-paused',
  'settling',
  'recovering',
  'seeking'
] as const;

export type DirectorStateName = (typeof DIRECTOR_STATES)[number];

export type DirectorContext = {
  actorEpoch: string;
  manifest: StoryManifest;
  cursor: StoryCursor;
  charge: ChargeState;
  queuedIntent: QueuedIntent | undefined;
  activeRunId: SegmentRunId | undefined;
  activeSegment: SegmentId | undefined;
  activeDirection: Direction | undefined;
  prepareToken: PrepareToken | undefined;
  pendingSegment: SegmentId | undefined;
  pendingDirection: Direction | undefined;
  settlingSegment: SegmentId | undefined;
  settlingTarget: SceneId | undefined;
  pausePoint: PausePoint | undefined;
  layerWindow: LayerWindowSnapshot;
  chargeThreshold: number;
  queuedIntentTtlMs: number;
  decayRatePerMs: number;
  settlingMs: number;
  prepareTimeoutMs: number;
  runCounter: number;
  prepareCounter: number;
  lastError: Error | undefined;
};

export type DirectorMachineOptions = {
  manifest?: StoryManifest;
  actorEpoch?: string;
  prepareTimeoutMs?: number;
  initialScene?: SceneId;
};

function nowFrom(event: DirectorEvent): number {
  if ('now' in event && typeof event.now === 'number') {
    return event.now;
  }
  return Date.now();
}

function firstHold(manifest: StoryManifest): SceneId {
  const hold = manifest.nodes.find((node) => node.kind === 'hold');
  if (hold?.kind !== 'hold') {
    throw new Error('Director manifest requires at least one hold');
  }
  return hold.scene;
}

function holdRequiresFreshInput(manifest: StoryManifest, scene: SceneId): boolean {
  return manifest.nodes.some((node) => node.kind === 'hold' && node.scene === scene && node.freshInput === true);
}

function createInitialContext(options: DirectorMachineOptions = {}): DirectorContext {
  const manifest = options.manifest ?? storyManifest;
  const initialScene = options.initialScene ?? firstHold(manifest);
  if (!manifest.nodes.some((node) => node.kind === 'hold' && node.scene === initialScene)) {
    throw new Error(`Director initial scene is not a manifest hold: ${initialScene}`);
  }
  const now = Date.now();
  return {
    actorEpoch: options.actorEpoch ?? `director-${Math.random().toString(36).slice(2)}`,
    manifest,
    cursor: { status: 'hold', scene: initialScene },
    charge: createChargeState(now, manifest.defaults.chargeThreshold, manifest.defaults.chargeDecayPerMs),
    queuedIntent: undefined,
    activeRunId: undefined,
    activeSegment: undefined,
    activeDirection: undefined,
    prepareToken: undefined,
    pendingSegment: undefined,
    pendingDirection: undefined,
    settlingSegment: undefined,
    settlingTarget: undefined,
    pausePoint: undefined,
    layerWindow: createLayerWindow(initialScene, manifest),
    chargeThreshold: manifest.defaults.chargeThreshold,
    queuedIntentTtlMs: manifest.defaults.settlingMs,
    decayRatePerMs: manifest.defaults.chargeDecayPerMs,
    settlingMs: manifest.defaults.settlingMs,
    prepareTimeoutMs: options.prepareTimeoutMs ?? manifest.defaults.buildTimeoutMs,
    runCounter: 0,
    prepareCounter: 0,
    lastError: undefined
  };
}

function spineFor(context: DirectorContext): StorySpine {
  const spine = new StorySpine(context.manifest);
  if (context.cursor.status === 'hold') {
    spine.enterHold(context.cursor.scene);
  } else if (context.cursor.status === 'segment') {
    spine.enterSegment(context.cursor.segment);
  } else {
    spine.enterSettling(context.cursor.segment, context.cursor.target);
  }
  return spine;
}

function endpointFor(segment: SpineSegmentNode, direction: Direction): SceneId {
  return direction === 1 ? segment.to : segment.from;
}

function segmentFor(context: DirectorContext, direction: Direction, scene?: SceneId): SpineSegmentNode | null {
  const source = scene ?? (context.cursor.status === 'hold' ? context.cursor.scene : undefined);
  if (!source) {
    return null;
  }
  return spineFor(context).segmentForDirection(source, direction);
}

function nextPrepareToken(context: DirectorContext): PrepareToken {
  return `${context.actorEpoch}:prepare:${context.prepareCounter + 1}`;
}

function nextRunId(context: DirectorContext): SegmentRunId {
  return `${context.actorEpoch}:${context.runCounter + 1}`;
}

function directionFromInput(event: DirectorEvent): Direction | null {
  if (event.type === 'INPUT_DELTA') {
    return event.delta >= 0 ? 1 : -1;
  }
  if (event.type === 'CHARGE_FIRED') {
    return event.direction;
  }
  return null;
}

function chargeFireDirection(context: DirectorContext, event: DirectorEvent): Direction | null {
  if (event.type === 'CHARGE_FIRED') {
    return event.direction;
  }
  if (event.type !== 'INPUT_DELTA') {
    return null;
  }
  return applyChargeDelta(context.charge, event.delta, nowFrom(event)).fired;
}

function preparePatch(context: DirectorContext, direction: Direction, scene?: SceneId): Partial<DirectorContext> {
  const segment = segmentFor(context, direction, scene);
  if (!segment) {
    return {
      pendingDirection: undefined,
      pendingSegment: undefined,
      prepareToken: undefined,
      queuedIntent: undefined
    };
  }
  return {
    pendingDirection: direction,
    pendingSegment: segment.id,
    prepareToken: nextPrepareToken(context),
    prepareCounter: context.prepareCounter + 1,
    queuedIntent: undefined
  };
}

function targetScene(context: DirectorContext): SceneId | undefined {
  if (!context.pendingSegment || !context.pendingDirection) {
    return undefined;
  }
  const segment = spineFor(context).segment(context.pendingSegment);
  return endpointFor(segment, context.pendingDirection);
}

function appendErrorPatch(error: unknown): Pick<DirectorContext, 'lastError'> {
  return { lastError: createRecoveryPlan('playback-failed', error).error };
}

function isRunEvent(event: DirectorEvent): event is Extract<
  DirectorEvent,
  | { type: 'PLAYBACK_DONE' }
  | { type: 'PLAYBACK_FAILED' }
  | { type: 'STAGE_PAUSED' }
  | { type: 'STAGE_RESUMED' }
  | { type: 'SEGMENT_ABORTED' }
> {
  return (
    event.type === 'PLAYBACK_DONE' ||
    event.type === 'PLAYBACK_FAILED' ||
    event.type === 'STAGE_PAUSED' ||
    event.type === 'STAGE_RESUMED' ||
    event.type === 'SEGMENT_ABORTED'
  );
}

const directorSetup = setup({
  types: {} as {
    context: DirectorContext;
    events: DirectorEvent;
  },
  delays: {
    settlingDelay: ({ context }) => context.settlingMs,
    preparingDelay: ({ context }) => context.prepareTimeoutMs,
    immediate: () => 0
  },
  guards: {
    hasChargeTarget: ({ context, event }) => {
      const direction = chargeFireDirection(context, event);
      return Boolean(direction && segmentFor(context, direction));
    },
    inputWouldFireCharge: ({ context, event }) => {
      if (event.type !== 'INPUT_DELTA') {
        return false;
      }
      return Boolean(applyChargeDelta(context.charge, event.delta, nowFrom(event)).fired);
    },
    nextTargetIsScrub: ({ context, event }) => {
      const direction = chargeFireDirection(context, event);
      const segment = direction ? segmentFor(context, direction) : null;
      return segment?.policy.kind === 'scrub';
    },
    validPrepareToken: ({ context, event }) => {
      if (!('prepareToken' in event)) {
        return false;
      }
      return event.prepareToken === context.prepareToken;
    },
    targetReadyMatches: ({ context, event }) => {
      if (event.type !== 'TARGET_READY' || event.prepareToken !== context.prepareToken) {
        return false;
      }
      return event.scene === targetScene(context);
    },
    validRunId: ({ context, event }) => {
      return isRunEvent(event) && event.runId === context.activeRunId;
    },
    inputOpposesPending: ({ context, event }) => {
      if (event.type !== 'INPUT_DELTA' || !context.pendingDirection) {
        return false;
      }
      return directionFromInput(event) === -context.pendingDirection;
    },
    queuedIntentCanFlush: ({ context, event }) => {
      const now = nowFrom(event);
      const sampled = context.queuedIntent ? sampleQueuedIntent(context.queuedIntent, now) : null;
      if (!sampled || sampled.strength < context.chargeThreshold) {
        return false;
      }
      const scene = context.settlingTarget ?? (context.cursor.status === 'hold' ? context.cursor.scene : undefined);
      if (scene && holdRequiresFreshInput(context.manifest, scene)) {
        return false;
      }
      return Boolean(scene && segmentFor(context, sampled.direction, scene));
    }
  },
  actions: {
    applyInputCharge: assign(({ context, event }) => {
      if (event.type !== 'INPUT_DELTA') {
        return {};
      }
      return { charge: applyChargeDelta(context.charge, event.delta, nowFrom(event)).state };
    }),
    startPreparingFromCharge: assign(({ context, event }) => {
      const direction = chargeFireDirection(context, event);
      if (direction === null) {
        return {};
      }
      return {
        ...preparePatch(context, direction),
        charge: createChargeState(nowFrom(event), context.chargeThreshold, context.decayRatePerMs)
      };
    }),
    enterScrubbing: assign(({ context, event }) => {
      const direction = chargeFireDirection(context, event);
      if (direction === null) {
        return {};
      }
      const segment = segmentFor(context, direction);
      if (!segment) {
        return {};
      }
      return {
        cursor: {
          status: 'segment',
          segment: segment.id,
          from: segment.from,
          to: segment.to
        },
        pendingDirection: direction,
        pendingSegment: segment.id,
        activeRunId: nextRunId(context),
        activeSegment: segment.id,
        activeDirection: direction,
        runCounter: context.runCounter + 1
      };
    }),
    supersedePreparingFromInput: assign(({ context, event }) => {
      if (event.type !== 'INPUT_DELTA') {
        return {};
      }
      const direction = directionFromInput(event);
      if (direction === null) {
        return {};
      }
      return preparePatch(context, direction);
    }),
    startPlaying: assign(({ context }) => {
      if (!context.pendingSegment || !context.pendingDirection) {
        return {};
      }
      const segment = spineFor(context).segment(context.pendingSegment);
      const runId = nextRunId(context);
      return {
        activeRunId: runId,
        activeSegment: segment.id,
        activeDirection: context.pendingDirection,
        runCounter: context.runCounter + 1,
        cursor: {
          status: 'segment',
          segment: segment.id,
          from: segment.from,
          to: segment.to
        },
        prepareToken: undefined,
        pendingSegment: undefined,
        pendingDirection: undefined
      };
    }),
    bufferInputIntent: assign(({ context, event }) => {
      if (event.type === 'INPUT_DELTA') {
        return {
          queuedIntent: mergeQueuedIntent(
            context.queuedIntent,
            event.delta,
            nowFrom(event),
            context.queuedIntentTtlMs,
            context.decayRatePerMs
          )
        };
      }
      if (event.type === 'CHARGE_FIRED') {
        return {
          queuedIntent: mergeQueuedIntent(
            context.queuedIntent,
            event.direction * context.chargeThreshold,
            nowFrom(event),
            context.queuedIntentTtlMs,
            context.decayRatePerMs
          )
        };
      }
      return {};
    }),
    enterSettling: assign(({ context }) => {
      if (!context.activeSegment || !context.activeDirection) {
        return {};
      }
      const segment = spineFor(context).segment(context.activeSegment);
      const target = endpointFor(segment, context.activeDirection);
      return {
        cursor: {
          status: 'settling',
          segment: segment.id,
          from: segment.from,
          to: segment.to,
          target
        },
        settlingSegment: segment.id,
        settlingTarget: target,
        activeRunId: undefined,
        activeSegment: undefined,
        activeDirection: undefined,
        pausePoint: undefined
      };
    }),
    finalizeSettling: assign(({ context }) => {
      if (!context.settlingTarget) {
        return { queuedIntent: undefined };
      }
      return {
        cursor: { status: 'hold', scene: context.settlingTarget },
        layerWindow: advanceLayerWindow(context.layerWindow, context.settlingTarget, context.manifest),
        settlingSegment: undefined,
        settlingTarget: undefined,
        queuedIntent: undefined
      };
    }),
    finalizeAndPrepareQueued: assign(({ context, event }) => {
      if (!context.settlingTarget || !context.queuedIntent) {
        return {};
      }
      const now = nowFrom(event);
      const sampled = sampleQueuedIntent(context.queuedIntent, now);
      if (!sampled || sampled.strength < context.chargeThreshold) {
        return {
          cursor: { status: 'hold', scene: context.settlingTarget },
          layerWindow: advanceLayerWindow(context.layerWindow, context.settlingTarget, context.manifest),
          settlingSegment: undefined,
          settlingTarget: undefined,
          queuedIntent: undefined
        };
      }
      return {
        cursor: { status: 'hold', scene: context.settlingTarget },
        layerWindow: advanceLayerWindow(context.layerWindow, context.settlingTarget, context.manifest),
        settlingSegment: undefined,
        settlingTarget: undefined,
        ...preparePatch(context, sampled.direction, context.settlingTarget)
      };
    }),
    setStagePaused: assign(({ event }) => {
      if (event.type !== 'STAGE_PAUSED') {
        return {};
      }
      return {
        pausePoint: {
          segmentId: event.segment,
          stageIndex: event.stageIndex
        }
      };
    }),
    resumeStagedPlayback: assign(({ context, event }) => {
      const direction = chargeFireDirection(context, event);
      if (direction === null) {
        return {};
      }
      return {
        activeDirection: direction,
        pausePoint: undefined,
        queuedIntent: undefined,
        charge: createChargeState(nowFrom(event), context.chargeThreshold, context.decayRatePerMs)
      };
    }),
    clearPausePoint: assign(() => ({ pausePoint: undefined })),
    recoverFromEvent: assign(({ context, event }) => {
      const error =
        event.type === 'BOOT_FAILED' || event.type === 'PLAYBACK_FAILED'
          ? event.error
          : event.type === 'BUILD_TIMEOUT' || event.type === 'PREPARE_TIMEOUT'
            ? new Error(event.type)
            : new Error('recovery');
      const fallback = createRecoveryPlan(event.type === 'BOOT_FAILED' ? 'boot-failed' : 'playback-failed', error, context.manifest);
      return {
        cursor: { status: 'hold', scene: fallback.fallbackScene },
        layerWindow: fallbackLayerWindow(context.manifest),
        activeRunId: undefined,
        activeSegment: undefined,
        activeDirection: undefined,
        prepareToken: undefined,
        pendingSegment: undefined,
        pendingDirection: undefined,
        settlingSegment: undefined,
        settlingTarget: undefined,
        queuedIntent: undefined,
        pausePoint: undefined,
        lastError: fallback.error
      };
    }),
    beginSeek: assign(({ context, event }) => {
      if (event.type !== 'SEEK') {
        return {};
      }
      const label = event.label.startsWith('scene:') ? event.label : `scene:${event.label}`;
      const scene = label.slice('scene:'.length) as SceneId;
      const exists = context.manifest.nodes.some((node) => node.kind === 'hold' && node.scene === scene);
      const target = exists ? scene : createRecoveryPlan('jump-to-end-failed', `Unknown seek label ${event.label}`, context.manifest).fallbackScene;
      return {
        cursor: { status: 'hold', scene: target },
        layerWindow: createLayerWindow(target, context.manifest),
        activeRunId: nextRunId(context),
        runCounter: context.runCounter + 1,
        activeSegment: undefined,
        activeDirection: undefined,
        prepareToken: undefined,
        pendingSegment: undefined,
        pendingDirection: undefined,
        settlingSegment: undefined,
        settlingTarget: undefined,
        queuedIntent: undefined,
        pausePoint: undefined
      };
    }),
    clearSeekingRun: assign(() => ({
      activeRunId: undefined
    })),
    notePlaybackFailure: assign(({ event }) => {
      if (event.type !== 'PLAYBACK_FAILED') {
        return {};
      }
      return appendErrorPatch(event.error);
    }),
    releaseRetiring: assign(({ context }) => ({
      layerWindow: releaseRetiringLayers(context.layerWindow)
    })),
    finalizeAndPrepareQueuedWithRetiringReleased: assign(({ context, event }) => {
      if (!context.settlingTarget || !context.queuedIntent) {
        return {};
      }
      const now = nowFrom(event);
      const sampled = sampleQueuedIntent(context.queuedIntent, now);
      if (!sampled || sampled.strength < context.chargeThreshold) {
        return {
          cursor: { status: 'hold', scene: context.settlingTarget },
          layerWindow: releaseRetiringLayers(advanceLayerWindow(context.layerWindow, context.settlingTarget, context.manifest)),
          settlingSegment: undefined,
          settlingTarget: undefined,
          queuedIntent: undefined
        };
      }
      return {
        cursor: { status: 'hold', scene: context.settlingTarget },
        layerWindow: releaseRetiringLayers(advanceLayerWindow(context.layerWindow, context.settlingTarget, context.manifest)),
        settlingSegment: undefined,
        settlingTarget: undefined,
        ...preparePatch(context, sampled.direction, context.settlingTarget)
      };
    })
  }
});

export function createDirectorMachine(options: DirectorMachineOptions = {}) {
  return directorSetup.createMachine({
    id: 'director',
    initial: 'booting',
    context: () => createInitialContext(options),
    on: {
      RETIRING_RELEASED: {
        actions: 'releaseRetiring'
      },
      SEEK: {
        target: '.seeking',
        actions: 'beginSeek'
      }
    },
    states: {
      booting: {
        on: {
          BOOT_READY: {
            target: 'hold'
          },
          BOOT_FAILED: {
            target: 'recovering',
            actions: 'recoverFromEvent'
          }
        }
      },
      hold: {
        always: {
          guard: 'queuedIntentCanFlush',
          target: 'preparing',
          actions: 'finalizeAndPrepareQueuedWithRetiringReleased'
        },
        on: {
          INPUT_DELTA: [
            {
              guard: 'nextTargetIsScrub',
              target: 'scrubbing',
              actions: ['applyInputCharge', 'releaseRetiring', 'enterScrubbing']
            },
            {
              guard: 'inputWouldFireCharge',
              target: 'preparing',
              actions: ['releaseRetiring', 'startPreparingFromCharge']
            },
            {
              actions: 'applyInputCharge'
            }
          ],
          CHARGE_FIRED: [
            {
              guard: 'nextTargetIsScrub',
              target: 'scrubbing',
              actions: ['releaseRetiring', 'enterScrubbing']
            },
            {
              guard: 'hasChargeTarget',
              target: 'preparing',
              actions: ['releaseRetiring', 'startPreparingFromCharge']
            }
          ]
        }
      },
      preparing: {
        after: {
          preparingDelay: {
            target: 'recovering',
            actions: 'recoverFromEvent'
          }
        },
        on: {
          TARGET_READY: {
            guard: 'targetReadyMatches',
            target: 'playing',
            actions: 'startPlaying'
          },
          PREPARE_TIMEOUT: {
            guard: 'validPrepareToken',
            target: 'recovering',
            actions: 'recoverFromEvent'
          },
          BUILD_TIMEOUT: {
            guard: 'validPrepareToken',
            target: 'recovering',
            actions: 'recoverFromEvent'
          },
          INPUT_DELTA: {
            guard: 'inputOpposesPending',
            target: 'preparing',
            reenter: true,
            actions: 'supersedePreparingFromInput'
          },
          CHARGE_FIRED: {
            target: 'preparing',
            reenter: true,
            actions: 'startPreparingFromCharge'
          }
        }
      },
      scrubbing: {
        on: {
          INPUT_DELTA: {
            actions: 'applyInputCharge'
          },
          PLAYBACK_DONE: {
            guard: 'validRunId',
            target: 'settling',
            actions: 'enterSettling'
          },
          PLAYBACK_FAILED: {
            guard: 'validRunId',
            target: 'recovering',
            actions: ['notePlaybackFailure', 'recoverFromEvent']
          },
          BUILD_TIMEOUT: {
            target: 'recovering',
            actions: 'recoverFromEvent'
          },
          SETTLING_DONE: {
            target: 'settling',
            actions: 'enterSettling'
          }
        }
      },
      playing: {
        on: {
          INPUT_DELTA: {
            actions: 'bufferInputIntent'
          },
          CHARGE_FIRED: {
            actions: 'bufferInputIntent'
          },
          PLAYBACK_DONE: {
            guard: 'validRunId',
            target: 'settling',
            actions: 'enterSettling'
          },
          PLAYBACK_FAILED: {
            guard: 'validRunId',
            target: 'recovering',
            actions: ['notePlaybackFailure', 'recoverFromEvent']
          },
          STAGE_PAUSED: {
            guard: 'validRunId',
            target: 'staged-paused',
            actions: 'setStagePaused'
          },
          STAGE_RESUMED: {
            guard: 'validRunId'
          },
          SEGMENT_ABORTED: {
            guard: 'validRunId',
            target: 'recovering',
            actions: 'recoverFromEvent'
          }
        }
      },
      'staged-paused': {
        on: {
          CHARGE_FIRED: {
            target: 'playing',
            actions: 'resumeStagedPlayback'
          },
          STAGE_RESUMED: {
            guard: 'validRunId',
            target: 'playing',
            actions: 'clearPausePoint'
          },
          STAGE_PAUSED: {
            guard: 'validRunId',
            actions: 'setStagePaused'
          },
          INPUT_DELTA: [
            {
              guard: 'inputWouldFireCharge',
              target: 'playing',
              actions: 'resumeStagedPlayback'
            },
            {
              actions: 'applyInputCharge'
            }
          ]
        }
      },
      settling: {
        after: {
          settlingDelay: [
            {
              guard: 'queuedIntentCanFlush',
              target: 'preparing',
              actions: 'finalizeAndPrepareQueuedWithRetiringReleased'
            },
            {
              target: 'hold',
              actions: 'finalizeSettling'
            }
          ]
        },
        on: {
          INPUT_DELTA: {
            actions: 'bufferInputIntent'
          },
          CHARGE_FIRED: {
            actions: 'bufferInputIntent'
          },
          SETTLING_DONE: [
            {
              guard: 'queuedIntentCanFlush',
              target: 'preparing',
              actions: 'finalizeAndPrepareQueuedWithRetiringReleased'
            },
            {
              target: 'hold',
              actions: 'finalizeSettling'
            }
          ]
        }
      },
      recovering: {
        after: {
          immediate: {
            target: 'hold'
          }
        }
      },
      seeking: {
        after: {
          immediate: {
            target: 'hold',
            actions: 'clearSeekingRun'
          }
        }
      }
    }
  });
}

export const directorMachine = createDirectorMachine();
