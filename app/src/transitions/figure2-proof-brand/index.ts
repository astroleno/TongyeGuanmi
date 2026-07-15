import { renderBrandHold } from '../../scenes/brand';
import { renderProofClosingHold } from '../../scenes/figure2-proof-closing';
import { figure2ProofPanelElement } from '../../scenes/figure2-proof';
import { createInkSegmentTransition } from '../shared/ink';
import type { TransitionModule } from '../../story/types';

export function createFigure2ProofBrandTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createInkSegmentTransition({
    id: 'figure2-proof-brand',
    delayMs: options.delayMs,
    field: {
      kind: 'horizontal',
      direction: 'bottom-to-top',
      seed: 'figure2-proof-brand'
    },
    ownershipSurfaces: ({ stage }) => ({
      conceal: [
        stage?.querySelector<HTMLElement>('[data-stage-retained-figure2-arch="true"]')
      ].filter((element): element is HTMLElement => Boolean(element))
    }),
    prepareEndpoints: ({ from, to }) => {
      const proofRoot = from?.querySelector<HTMLElement>('[data-r4-scene="figure2-proof"]') ?? from;
      renderProofClosingHold(figure2ProofPanelElement(proofRoot, 'closing'));
      renderBrandHold(to);
    },
    transitionAttr: 'figure2-proof-brand-live-clip'
  });
}

export const figure2ProofBrandTransition = createFigure2ProofBrandTransition();
