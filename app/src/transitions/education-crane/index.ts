import { renderEducationProgress } from '../../scenes/education';
import { CRANE_HOLD_PROGRESS, renderCraneAnimationProgress } from '../../scenes/crane-animation';
import { createInkSegmentTransition } from '../shared/ink';
import type { TransitionModule } from '../../story/types';

export function createEducationCraneTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createInkSegmentTransition({
    id: 'education-crane',
    delayMs: options.delayMs,
    origin: { x: 0.5, y: 1.04 },
    positionFromReadingOnReverse: true,
    revealMode: 'ink-body',
    renderFrom: renderEducationProgress,
    renderTo: (root) => renderCraneAnimationProgress(root, CRANE_HOLD_PROGRESS),
    renderToProgress: () => CRANE_HOLD_PROGRESS,
    transitionAttr: 'education-crane-bottom-ink'
  });
}

export const educationCraneTransition = createEducationCraneTransition();
