import { renderEducationHold } from '../../scenes/education';
import {
  craneSegmentProgressReceipt,
  prepareCraneAnimationFrame,
  renderCraneHold,
  requestCraneAnimationFrame
} from '../../scenes/crane-animation';
import { createInkSegmentTransition } from '../shared/ink';
import type {
  SegmentProgressRequest,
  TransitionModule
} from '../../story/types';

export function createEducationCraneTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createInkSegmentTransition({
    id: 'education-crane',
    delayMs: options.delayMs,
    field: {
      kind: 'horizontal',
      direction: 'bottom-to-top',
      seed: 'education-crane'
    },
    prepareEndpoints: ({ from, to }) => {
      renderEducationHold(from);
      renderCraneHold(to);
    },
    prepareTargetPresentation: ({ to }, context) => {
      if (context.direction === -1 || context.prefersReducedMotion) {
        return;
      }
      return prepareCraneAnimationFrame(to, 0, {
        runId: context.runId,
        direction: 1,
        reducedMotion: context.prefersReducedMotion
      });
    },
    presentSourceProgress: (_root, request, context) => presentCraneProgress(context.roots.to, request, context),
    presentTargetProgress: (root, request, context) => presentCraneProgress(root, request, context),
    transitionAttr: 'education-crane-bottom-ink'
  });
}

function presentCraneProgress(
  root: HTMLElement | null,
  request: SegmentProgressRequest,
  context: { runId: string; direction: -1 | 1 }
) {
  return requestCraneAnimationFrame(root, request.desiredProgress, {
    runId: context.runId,
    direction: context.direction,
    sequence: request.sequence,
    signal: request.signal
  }).then((receipt) => craneSegmentProgressReceipt(request, receipt));
}

export const educationCraneTransition = createEducationCraneTransition();
