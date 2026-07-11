import { renderEducationHold } from '../../scenes/education';
import { renderCraneHold } from '../../scenes/crane-animation';
import { createInkSegmentTransition } from '../shared/ink';
import type { TransitionModule } from '../../story/types';

export function createEducationCraneTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createInkSegmentTransition({
    id: 'education-crane',
    delayMs: options.delayMs,
    origin: { x: 0.5, y: 1.04 },
    positionFromReadingOnReverse: true,
    revealMode: 'live-clip',
    prepareEndpoints: ({ from, to }) => {
      renderEducationHold(from);
      renderCraneHold(to);
    },
    transitionAttr: 'education-crane-bottom-ink'
  });
}

export const educationCraneTransition = createEducationCraneTransition();
