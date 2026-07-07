import { renderFigure2AnimationProgress } from '../../scenes/figure2-animation';
import { renderMethodBottomProgress } from '../../scenes/method-bottom';
import { createInkSegmentTransition } from '../shared/ink';
import type { TransitionModule } from '../../story/types';

export function createMethodBottomFigure2Transition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createInkSegmentTransition({
    id: 'method-bottom-figure2',
    delayMs: options.delayMs,
    origin: { x: 0.5, y: 1.04 },
    renderFrom: renderMethodBottomProgress,
    renderTo: renderFigure2AnimationProgress,
    transitionAttr: 'method-bottom-figure2-bottom-ink'
  });
}

export const methodBottomFigure2Transition = createMethodBottomFigure2Transition();
