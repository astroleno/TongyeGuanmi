import { renderServicesHold } from '../../scenes/services';
import { prepareTtgAnimationFrame, renderTtgHold } from '../../scenes/ttg-animation';
import { createInkSegmentTransition } from '../shared/ink';
import type { TransitionModule } from '../../story/types';

export function createServicesTtgTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createInkSegmentTransition({
    id: 'services-ttg',
    delayMs: options.delayMs,
    field: {
      kind: 'horizontal',
      direction: 'bottom-to-top',
      seed: 'services-ttg'
    },
    prepareEndpoints: ({ from, to }) => {
      renderServicesHold(from);
      renderTtgHold(to);
    },
    prepareTargetPresentation: (roots, context) => {
      if (context.target !== 'to' || context.prefersReducedMotion) {
        return;
      }
      return prepareTtgAnimationFrame(roots.to, 0, {
        runId: context.runId,
        direction: context.direction,
        reducedMotion: context.prefersReducedMotion
      });
    },
    transitionAttr: 'services-ttg-bottom-ink'
  });
}

export const servicesTtgTransition = createServicesTtgTransition();
