import { renderLabHold } from '../../scenes/lab';
import { renderPhHold } from '../../scenes/ph-animation';
import { createInkSegmentTransition } from '../shared/ink';
import type { TransitionModule } from '../../story/types';

export function createLabPhTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createInkSegmentTransition({
    id: 'lab-ph',
    delayMs: options.delayMs,
    boundary: {
      kind: 'horizontal',
      direction: 'top-to-bottom',
      seed: 'lab-ph'
    },
    positionFromReadingOnReverse: true,
    prepareEndpoints: ({ from, to }) => {
      renderLabHold(from);
      renderPhHold(to);
    },
    transitionAttr: 'lab-ph-top-ink'
  });
}

export const labPhTransition = createLabPhTransition();
