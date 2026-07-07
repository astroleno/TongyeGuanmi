import { renderServicesProgress } from '../../scenes/services';
import { renderTtgAnimationProgress } from '../../scenes/ttg-animation';
import { createInkSegmentTransition } from '../shared/ink';
import type { TransitionModule } from '../../story/types';

export function createServicesTtgTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createInkSegmentTransition({
    id: 'services-ttg',
    delayMs: options.delayMs,
    origin: { x: 0.5, y: 1.04 },
    renderFrom: renderServicesProgress,
    renderTo: (root, progress) => renderTtgAnimationProgress(root, progress, { playback: true }),
    transitionAttr: 'services-ttg-bottom-ink'
  });
}

export const servicesTtgTransition = createServicesTtgTransition();
