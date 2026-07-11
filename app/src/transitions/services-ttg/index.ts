import { renderServicesProgress } from '../../scenes/services';
import { TTG_HOLD_PROGRESS, renderTtgAnimationProgress } from '../../scenes/ttg-animation';
import { createInkSegmentTransition } from '../shared/ink';
import type { TransitionModule } from '../../story/types';

export function createServicesTtgTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createInkSegmentTransition({
    id: 'services-ttg',
    delayMs: options.delayMs,
    origin: { x: 0.5, y: 1.04 },
    revealMode: 'ink-body',
    renderFrom: renderServicesProgress,
    renderTo: (root) => renderTtgAnimationProgress(root, TTG_HOLD_PROGRESS),
    transitionAttr: 'services-ttg-bottom-ink'
  });
}

export const servicesTtgTransition = createServicesTtgTransition();
