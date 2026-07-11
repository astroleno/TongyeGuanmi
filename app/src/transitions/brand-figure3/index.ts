import { renderBrandProgress } from '../../scenes/brand';
import { FIGURE3_HOLD_PROGRESS, renderFigure3AnimationProgress } from '../../scenes/figure3-animation';
import { createInkSegmentTransition } from '../shared/ink';
import type { TransitionModule } from '../../story/types';

export function createBrandFigure3Transition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createInkSegmentTransition({
    id: 'brand-figure3',
    delayMs: options.delayMs,
    origin: { x: 0.5, y: 1.04 },
    revealMode: 'live-clip',
    renderFrom: renderBrandProgress,
    renderFromProgress: 'static',
    renderTo: renderFigure3AnimationProgress,
    renderToProgress: () => FIGURE3_HOLD_PROGRESS,
    transitionAttr: 'brand-figure3-bottom-ink'
  });
}

export const brandFigure3Transition = createBrandFigure3Transition();
