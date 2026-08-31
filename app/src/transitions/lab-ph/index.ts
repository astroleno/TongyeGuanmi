import { renderLabHold } from '../../scenes/lab';
import {
  phSegmentProgressReceipt,
  renderPhHold,
  requestPhAnimationFrame
} from '../../scenes/ph-animation';
import { createRuntimeSegmentProgressReceipt } from '../../story/presented-progress-coordinator';
import { createInkSegmentTransition } from '../shared/ink';
import type { SegmentProgressRequest, TransitionModule } from '../../story/types';

function sceneIs(root: HTMLElement | null, scene: string): boolean {
  return root?.matches(`[data-r4-scene="${scene}"]`) === true;
}

function renderLabOrPhHold(root: HTMLElement | null): void {
  if (sceneIs(root, 'lab')) {
    renderLabHold(root);
  } else if (sceneIs(root, 'ph-animation')) {
    renderPhHold(root);
  }
}

function presentPhEndpoint(
  root: HTMLElement | null,
  request: SegmentProgressRequest
) {
  if (!root || !sceneIs(root, 'ph-animation')) {
    return createRuntimeSegmentProgressReceipt(request);
  }
  return requestPhAnimationFrame(root, 0, {
    runId: request.runId,
    direction: request.direction,
    sequence: request.sequence,
    signal: request.signal
  }).then((frame) => phSegmentProgressReceipt(request, frame));
}

export function createLabPhTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  const transition = createInkSegmentTransition({
    id: 'lab-ph',
    delayMs: options.delayMs,
    field: {
      kind: 'horizontal',
      direction: 'top-to-bottom',
      seed: 'lab-ph'
    },
    prepareEndpoints: ({ from, to }) => {
      renderLabOrPhHold(from);
      renderLabOrPhHold(to);
    },
    prepareTargetPresentation: (roots, context) => {
      const root = context.target === 'to' ? roots.to : roots.from;
      if (!root || !sceneIs(root, 'ph-animation') || !root.querySelector('[data-ph-alpha-video]')) {
        return;
      }
      return requestPhAnimationFrame(root, 0, {
        runId: context.runId,
        direction: context.direction,
        reducedMotion: context.prefersReducedMotion
      }).then((frame) => {
        if (frame.status !== 'ready') {
          throw new Error('PH endpoint frame became stale');
        }
      });
    },
    presentSourceProgress: presentPhEndpoint,
    presentTargetProgress: presentPhEndpoint,
    transitionAttr: 'lab-ph-top-ink'
  });
  return {
    ...transition,
    requiredMilestones: ['targetReady', 'mediaReady', 'buildReady']
  };
}

export const labPhTransition = createLabPhTransition();
