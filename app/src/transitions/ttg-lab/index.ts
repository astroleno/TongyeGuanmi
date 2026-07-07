import { renderLabProgress } from '../../scenes/lab';
import { renderTtgAnimationProgress } from '../../scenes/ttg-animation';
import { createInkSegmentTransition } from '../shared/ink';
import type { TransitionModule } from '../../story/types';

export function createTtgLabTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createInkSegmentTransition({
    id: 'ttg-lab',
    delayMs: options.delayMs,
    origin: { x: 0.5, y: -0.04 },
    renderFrom: renderTtgAnimationProgress,
    renderTo: renderLabProgress,
    transitionAttr: 'ttg-lab-top-ink'
  });
}

export const ttgLabTransition = createTtgLabTransition();
