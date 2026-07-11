import { renderProofCardsProgress } from '../../scenes/figure2-proof-cards';
import { renderProofOpeningProgress } from '../../scenes/figure2-proof-opening';
import { createSectionHandoffTransition } from '../shared/sectionHandoff';
import type { TransitionModule } from '../../story/types';

export function createFigure2ProofOpeningCardsTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createSectionHandoffTransition({
    id: 'figure2-proof-opening-cards',
    delayMs: options.delayMs,
    renderFrom: renderProofOpeningProgress,
    renderTo: renderProofCardsProgress
  });
}

export const figure2ProofOpeningCardsTransition = createFigure2ProofOpeningCardsTransition();
