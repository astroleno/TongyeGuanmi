import type { TransitionModule } from '../../story/types';
import { renderPatternHold } from '../../scenes/pattern';
import { renderStarMapHold } from '../../scenes/star-map';
import { createInkSegmentTransition } from '../shared/ink';

export const PATTERN_STAR_MAP_ORIGIN = { x: 0.24, y: 0.55 } as const;

export function createPatternStarMapTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createInkSegmentTransition({
    id: 'pattern-star-map',
    delayMs: options.delayMs,
    origin: PATTERN_STAR_MAP_ORIGIN,
    revealMode: 'live-clip',
    prepareEndpoints: ({ from, to }) => {
      renderPatternHold(from);
      renderStarMapHold(to);
    },
    transitionAttr: 'pattern-star-map-live-circle'
  });
}

export const patternStarMapTransition = createPatternStarMapTransition();
