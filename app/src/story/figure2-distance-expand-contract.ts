import type { SpineSegmentNode } from './types';

/**
 * Small runtime projection of the canonical Figure2 segment. Phone adapters
 * need this build contract, but must not pull the complete desktop manifest
 * and its inventory validation graph into the phone presentation closure.
 *
 * The equality test beside this module keeps the projection locked to
 * `storyManifest`.
 */
export const FIGURE2_DISTANCE_EXPAND_SEGMENT = {
  kind: 'segment',
  id: 'figure2-distance-expand',
  from: 'figure2-animation',
  to: 'figure2-proof',
  policy: {
    kind: 'stagedSnap',
    stops: [0.72],
    playMs: [2600, 1500],
    advance: [{ kind: 'delay', ms: 1000 }],
    postScrollVh: 56
  },
  virtualDuration: 4100,
  requiredMilestones: [
    'targetReady',
    'mediaReady',
    'buildReady',
    'timelineReady'
  ],
  buildTimeoutMs: 8000,
  visual: {
    type: 'disappear',
    media: ['figure2-pair-motion']
  },
  mediaPlayback: [{
    id: 'figure2-pair',
    media: ['figure2-pair-motion'],
    forward: {
      mode: 'frame-lock',
      required: true,
      media: ['figure2-pair-motion']
    },
    reverse: {
      mode: 'frame-lock',
      required: true,
      media: ['figure2-pair-motion']
    },
    readyMilestones: ['targetReady', 'mediaReady'],
    terminalFallbackScene: 'figure2-proof',
    preparingTimeoutMs: 8000
  }]
} as const satisfies SpineSegmentNode;
