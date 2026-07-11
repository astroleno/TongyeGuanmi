import { renderLabProgress } from '../../scenes/lab';
import { PH_HOLD_PROGRESS, renderPhAnimationProgress } from '../../scenes/ph-animation';
import { createInkSegmentTransition } from '../shared/ink';
import type { TransitionModule } from '../../story/types';

export function createLabPhTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createInkSegmentTransition({
    id: 'lab-ph',
    delayMs: options.delayMs,
    origin: { x: 0.5, y: -0.04 },
    revealMode: 'ink-body',
    positionFromReadingOnReverse: true,
    renderFrom: renderLabProgress,
    renderTo: (root) => renderPhAnimationProgress(root, PH_HOLD_PROGRESS),
    transitionAttr: 'lab-ph-top-ink'
  });
}

export const labPhTransition = createLabPhTransition();
