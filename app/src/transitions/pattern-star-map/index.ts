import type { TransitionModule } from '../../story/types';
import {
  createPatternBloomTransition,
  patternSecondRevealProgressForStarMap,
  patternTopSceneOpacityForStarMap
} from '../pattern-bloom/timeline';

export { patternSecondRevealProgressForStarMap, patternTopSceneOpacityForStarMap };

export function createPatternStarMapTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createPatternBloomTransition({
    id: 'pattern-star-map',
    delayMs: options.delayMs,
    variant: 'pattern-star-map'
  });
}

export const patternStarMapTransition = createPatternStarMapTransition();
