import { renderLabProgress } from '../../scenes/lab';
import { renderPhAnimationProgress } from '../../scenes/ph-animation';
import { createInkSegmentTransition } from '../shared/ink';
import type { TransitionModule } from '../../story/types';

export function createLabPhTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createInkSegmentTransition({
    id: 'lab-ph',
    delayMs: options.delayMs,
    origin: { x: 0.11, y: 0.36 },
    renderFrom: renderLabProgress,
    renderTo: renderPhAnimationProgress,
    transitionAttr: 'lab-ph-sun-radial-ink'
  });
}

export const labPhTransition = createLabPhTransition();
