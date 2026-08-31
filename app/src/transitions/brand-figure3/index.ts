import { renderBrandHold } from '../../scenes/brand';
import {
  prepareFigure3AnimationFrame,
  renderFigure3Hold
} from '../../scenes/figure3-animation';
import { createInkSegmentTransition } from '../shared/ink';
import type { TransitionModule } from '../../story/types';

export function createBrandFigure3Transition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createInkSegmentTransition({
    id: 'brand-figure3',
    delayMs: options.delayMs,
    field: {
      kind: 'horizontal',
      direction: 'bottom-to-top',
      seed: 'brand-figure3'
    },
    prepareEndpoints: ({ from, to }) => {
      renderBrandHold(from);
      renderFigure3Hold(to);
    },
    prepareTargetPresentation: (roots, context) => {
      if (context.target !== 'to' || context.prefersReducedMotion) {
        return;
      }
      return prepareFigure3AnimationFrame(roots.to, 0, {
        runId: context.runId,
        direction: context.direction,
        reducedMotion: context.prefersReducedMotion
      });
    },
    transitionAttr: 'brand-figure3-bottom-ink'
  });
}

export const brandFigure3Transition = createBrandFigure3Transition();
