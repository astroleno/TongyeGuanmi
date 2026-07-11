import type { TransitionModule } from '../../story/types';
import {
  createPatternBloomTransition,
  PATTERN_STAR_MAP_INK_TARGET_IMAGE,
  PATTERN_STAR_MAP_INK_PROGRESS_SPAN,
  patternSecondRevealProgressForStarMap,
  patternTopSceneOpacityForStarMap,
  starMapPresentationProgressForPatternStarMap
} from '../pattern-bloom/timeline';

export {
  PATTERN_STAR_MAP_INK_TARGET_IMAGE,
  PATTERN_STAR_MAP_INK_PROGRESS_SPAN,
  patternSecondRevealProgressForStarMap,
  patternTopSceneOpacityForStarMap,
  starMapPresentationProgressForPatternStarMap
};

export function createPatternStarMapTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createPatternBloomTransition({
    id: 'pattern-star-map',
    delayMs: options.delayMs,
    variant: 'pattern-star-map'
  });
}

export const patternStarMapTransition = createPatternStarMapTransition();
