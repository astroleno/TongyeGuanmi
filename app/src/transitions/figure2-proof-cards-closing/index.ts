import { renderProofCardsProgress } from '../../scenes/figure2-proof-cards';
import { renderProofClosingProgress } from '../../scenes/figure2-proof-closing';
import { createReadingSegmentTransition } from '../shared/reading';
import type { TransitionModule } from '../../story/types';

export function createFigure2ProofCardsClosingTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createReadingSegmentTransition({
    id: 'figure2-proof-cards-closing',
    delayMs: options.delayMs,
    renderFrom: renderProofCardsProgress,
    renderTo: renderProofClosingProgress
  });
}

export const figure2ProofCardsClosingTransition = createFigure2ProofCardsClosingTransition();
