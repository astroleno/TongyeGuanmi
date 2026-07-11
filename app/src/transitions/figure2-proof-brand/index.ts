import { renderBrandHold } from '../../scenes/brand';
import { renderProofClosingHold } from '../../scenes/figure2-proof-closing';
import { createInkSegmentTransition } from '../shared/ink';
import type { TransitionModule } from '../../story/types';

export const PROOF_BRAND_ORIGIN = { x: 0.5, y: 1.04 } as const;

export function createFigure2ProofBrandTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createInkSegmentTransition({
    id: 'figure2-proof-brand',
    delayMs: options.delayMs,
    origin: PROOF_BRAND_ORIGIN,
    revealMode: 'live-clip',
    prepareEndpoints: ({ from, to }) => {
      renderProofClosingHold(from);
      renderBrandHold(to);
    },
    transitionAttr: 'figure2-proof-brand-live-clip'
  });
}

export const figure2ProofBrandTransition = createFigure2ProofBrandTransition();
