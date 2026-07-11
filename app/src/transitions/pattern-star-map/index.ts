import type { TransitionModule } from '../../story/types';
import { readPatternCenter, renderPatternHold, renderPatternProgress } from '../../scenes/pattern';
import { renderStarMapHold } from '../../scenes/star-map';
import { hiddenVisibility, holdVisibility, range01 } from '../../pilot/visibility';
import { createInkSegmentTransition, type InkSample } from '../shared/ink';

export const PATTERN_COLLAPSE_STOP = 0.5;
export const PATTERN_COLLAPSE_MS = 1800;
export const PATTERN_STAR_MAP_INK_MS = 1800;

function fieldProgress(progress: number): number {
  return range01(progress, PATTERN_COLLAPSE_STOP, 1);
}

function collapseProgress(progress: number): number {
  return range01(progress, 0, PATTERN_COLLAPSE_STOP);
}

export function samplePatternThenStarMap(revealProgress: number): InkSample {
  if (revealProgress <= 0.001) {
    return { from: holdVisibility(false), to: hiddenVisibility() };
  }
  if (revealProgress >= 0.999) {
    return { from: hiddenVisibility(), to: holdVisibility(false) };
  }
  return { from: holdVisibility(false), to: holdVisibility(false) };
}

export function createPatternStarMapTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createInkSegmentTransition({
    id: 'pattern-star-map',
    delayMs: options.delayMs,
    field: ({ from }) => ({
      kind: 'radial',
      origin: readPatternCenter(from),
      seed: 'pattern-star-map'
    }),
    fieldProgress,
    prepareEndpoints: ({ from, to }) => {
      renderPatternHold(from);
      renderStarMapHold(to);
    },
    renderSource: (root, mapped) => renderPatternProgress(root, mapped, {
      visible: true,
      copyProgress: 1,
      rotationProgress: 1
    }),
    renderSourceProgress: collapseProgress,
    sample: (progress) => samplePatternThenStarMap(fieldProgress(progress)),
    stops: [PATTERN_COLLAPSE_STOP],
    transitionAttr: 'pattern-star-map-live-circle'
  });
}

export const patternStarMapTransition = createPatternStarMapTransition();
