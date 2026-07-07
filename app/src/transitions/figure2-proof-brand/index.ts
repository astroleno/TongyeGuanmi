import { renderBrandProgress } from '../../scenes/brand';
import { renderProofClosingProgress } from '../../scenes/figure2-proof-closing';
import { hiddenVisibility, holdVisibility, range01 } from '../../pilot/visibility';
import { createInkSegmentTransition } from '../shared/ink';
import type { TransitionModule } from '../../story/types';

function proofBrandVisibility(progress: number) {
  if (progress >= 0.999) {
    return { from: hiddenVisibility(), to: holdVisibility(false) };
  }
  if (progress < 0.84) {
    return { from: holdVisibility(false), to: hiddenVisibility() };
  }
  return { from: holdVisibility(false), to: holdVisibility(false) };
}

function proofBrandInkProgress(progress: number): number {
  return range01(progress, 0, 0.86);
}

function brandPresentationProgress(progress: number): number {
  return range01(progress, 0.84, 1);
}

export function createFigure2ProofBrandTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return createInkSegmentTransition({
    id: 'figure2-proof-brand',
    delayMs: options.delayMs,
    origin: { x: 0.5, y: 0.52 },
    canvasHost: 'from',
    elevateTarget: false,
    clipTarget: false,
    sample: proofBrandVisibility,
    renderFrom: renderProofClosingProgress,
    renderFromProgress: (progress) => 1 - range01(progress, 0.24, 0.84),
    renderTo: renderBrandProgress,
    renderToProgress: brandPresentationProgress,
    clipProgress: proofBrandInkProgress,
    inkProgress: proofBrandInkProgress,
    transitionAttr: 'figure2-proof-brand-ink-handoff'
  });
}

export const figure2ProofBrandTransition = createFigure2ProofBrandTransition();
