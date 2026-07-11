import { renderLabHold } from '../../scenes/lab';
import { renderPhHold } from '../../scenes/ph-animation';
import { createInkSegmentTransition } from '../shared/ink';
import type { TransitionModule } from '../../story/types';

export function createLabPhTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createInkSegmentTransition({
    id: 'lab-ph',
    delayMs: options.delayMs,
    origin: { x: 0.5, y: -0.04 },
    revealMode: 'live-clip',
    positionFromReadingOnReverse: true,
    renderFrom: renderLabHold,
    renderTo: renderPhHold,
    transitionAttr: 'lab-ph-top-ink'
  });
}

export const labPhTransition = createLabPhTransition();
