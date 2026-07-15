import { renderEducationHold } from '../../scenes/education';
import {
  prepareCraneAnimationFrame,
  renderCraneHold
} from '../../scenes/crane-animation';
import { createInkSegmentTransition } from '../shared/ink';
import type { TransitionModule } from '../../story/types';

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
    transitionAttr: 'education-crane-bottom-ink'
  });
}

export const educationCraneTransition = createEducationCraneTransition();
