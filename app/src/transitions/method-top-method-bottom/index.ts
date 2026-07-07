import { renderMethodBottomProgress } from '../../scenes/method-bottom';
import { createReadingSegmentTransition } from '../shared/reading';
import type { TransitionModule } from '../../story/types';

export function createMethodTopMethodBottomTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createReadingSegmentTransition({
    id: 'method-top-method-bottom',
    delayMs: options.delayMs,
    renderTo: renderMethodBottomProgress
  });
}

export const methodTopMethodBottomTransition = createMethodTopMethodBottomTransition();
