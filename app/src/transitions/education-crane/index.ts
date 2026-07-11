import { renderEducationHold } from '../../scenes/education';
import { renderCraneHold } from '../../scenes/crane-animation';
import { createInkSegmentTransition } from '../shared/ink';
import type { TransitionModule } from '../../story/types';

export function createEducationCraneTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createInkSegmentTransition({
    id: 'education-crane',
    delayMs: options.delayMs,
    boundary: {
      kind: 'horizontal',
      direction: 'bottom-to-top',
      seed: 'education-crane'
    },
    positionFromReadingOnReverse: true,
    prepareEndpoints: ({ from, to }) => {
      renderEducationHold(from);
      renderCraneHold(to);
    },
    transitionAttr: 'education-crane-bottom-ink'
  });
}

export const educationCraneTransition = createEducationCraneTransition();
