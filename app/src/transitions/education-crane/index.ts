import { renderEducationProgress } from '../../scenes/education';
import { renderCraneAnimationProgress } from '../../scenes/crane-animation';
import { createInkSegmentTransition } from '../shared/ink';
import type { TransitionModule } from '../../story/types';

export function createEducationCraneTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createInkSegmentTransition({
    id: 'education-crane',
    delayMs: options.delayMs,
    origin: { x: 0.5, y: 1.04 },
    renderFrom: renderEducationProgress,
    renderTo: (root, progress) => renderCraneAnimationProgress(root, progress, { playback: true }),
    transitionAttr: 'education-crane-bottom-ink'
  });
}

export const educationCraneTransition = createEducationCraneTransition();
