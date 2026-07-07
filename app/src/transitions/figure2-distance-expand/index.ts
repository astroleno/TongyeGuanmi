import { renderFigure2ProofTransitionProgress } from '../../scenes/figure2-animation';
import { renderProofOpeningProgress } from '../../scenes/figure2-proof-opening';
import { createInkSegmentTransition } from '../shared/ink';
import type { TransitionModule } from '../../story/types';

export function createFigure2DistanceExpandTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return {
    ...createInkSegmentTransition({
      id: 'figure2-distance-expand',
      delayMs: options.delayMs,
      origin: { x: 0.5, y: 0.52 },
      stops: [0.72],
      reportTimelineReadyAt: 0.5,
      renderFrom: renderFigure2ProofTransitionProgress,
      renderFromProgress: 'forward',
      renderTo: renderProofOpeningProgress,
      transitionAttr: 'figure2-distance-expand-stage2-ink'
    }),
    requiredMilestones: ['targetReady', 'buildReady', 'timelineReady']
  };
}

export const figure2DistanceExpandTransition = createFigure2DistanceExpandTransition();
