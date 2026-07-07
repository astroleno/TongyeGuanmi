import { renderPatternProgress } from '../../scenes/pattern';
import { renderStarMapProgress } from '../../scenes/star-map';
import { createInkSegmentTransition } from '../shared/ink';
import type { TransitionModule } from '../../story/types';

export function createPatternStarMapTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createInkSegmentTransition({
    id: 'pattern-star-map',
    delayMs: options.delayMs,
    origin: { x: 0.24, y: 0.55 },
    renderFrom: (root, progress) => renderPatternProgress(root, 0.58 + Math.max(0, progress) * 0.405),
    renderTo: renderStarMapProgress,
    transitionAttr: 'pattern-star-map-left-ink'
  });
}

export const patternStarMapTransition = createPatternStarMapTransition();
