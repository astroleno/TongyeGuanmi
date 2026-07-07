import { renderEducationProgress } from '../../scenes/education';
import { renderPhAnimationProgress } from '../../scenes/ph-animation';
import { createInkSegmentTransition } from '../shared/ink';
import type { TransitionModule } from '../../story/types';

export function createPhEducationTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createInkSegmentTransition({
    id: 'ph-education',
    delayMs: options.delayMs,
    origin: { x: 0.5, y: -0.04 },
    renderFrom: renderPhAnimationProgress,
    renderTo: renderEducationProgress,
    transitionAttr: 'ph-education-top-ink'
  });
}

export const phEducationTransition = createPhEducationTransition();
