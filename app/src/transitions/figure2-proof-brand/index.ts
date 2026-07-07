import { renderBrandProgress } from '../../scenes/brand';
import { renderProofClosingProgress } from '../../scenes/figure2-proof-closing';
import { createReadingSegmentTransition } from '../shared/reading';
import type { TransitionModule } from '../../story/types';

export function createFigure2ProofBrandTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createReadingSegmentTransition({
    id: 'figure2-proof-brand',
    delayMs: options.delayMs,
    renderFrom: renderProofClosingProgress,
    renderTo: renderBrandProgress
  });
}

export const figure2ProofBrandTransition = createFigure2ProofBrandTransition();
