import { renderServicesHold } from '../../scenes/services';
import { renderTtgHold } from '../../scenes/ttg-animation';
import { createInkSegmentTransition } from '../shared/ink';
import type { TransitionModule } from '../../story/types';

export function createServicesTtgTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createInkSegmentTransition({
    id: 'services-ttg',
    delayMs: options.delayMs,
    origin: { x: 0.5, y: 1.04 },
    revealMode: 'live-clip',
    prepareEndpoints: ({ from, to }) => {
      renderServicesHold(from);
      renderTtgHold(to);
    },
    transitionAttr: 'services-ttg-bottom-ink'
  });
}

export const servicesTtgTransition = createServicesTtgTransition();
