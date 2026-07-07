import { PilotProgressTimeline } from '../../pilot/progress-timeline';
import { applyLayerVisibility, fadeVisibility, hiddenVisibility, holdVisibility, smoothStep } from '../../pilot/visibility';
import { renderBrandProgress } from '../../scenes/brand';
import { renderProofClosingProgress } from '../../scenes/figure2-proof-closing';
import type { LayerVisibilityState, TransitionContext, TransitionModule } from '../../story/types';

function sceneRoot(element: HTMLElement | null | undefined, scene: string): HTMLElement | null {
  return element?.querySelector<HTMLElement>(`[data-r4-scene="${scene}"]`) ?? element ?? null;
}

function sampleProofBrand(progress: number): { from: LayerVisibilityState; to: LayerVisibilityState } {
  const p = smoothStep(progress);
  return {
    from: fadeVisibility(1 - p),
    to: fadeVisibility(p)
  };
}

function completeReducedMotion(context: TransitionContext): void {
  applyLayerVisibility(context.from, hiddenVisibility());
  applyLayerVisibility(context.to, holdVisibility(true));
  renderProofClosingProgress(sceneRoot(context.from.element, 'figure2-proof-closing'), 0);
  renderBrandProgress(sceneRoot(context.to.element, 'brand'), 1);
}

export function createFigure2ProofBrandTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return {
    id: 'figure2-proof-brand',
    requiredMilestones: ['targetReady', 'buildReady'],
    reducedMotionFallback: completeReducedMotion,
    buildTimeline: async (context) => {
      const delay = options.delayMs?.() ?? 0;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      return new PilotProgressTimeline({
        from: context.from,
        to: context.to,
        durationMs: context.prefersReducedMotion ? 0 : context.segment.virtualDuration,
        sample: sampleProofBrand,
        render: (progress) => {
          const eased = smoothStep(progress);
          context.to.element?.setAttribute('data-r4-transition', 'figure2-proof-brand');
          renderProofClosingProgress(sceneRoot(context.from.element, 'figure2-proof-closing'), 1 - eased * 0.62);
          renderBrandProgress(sceneRoot(context.to.element, 'brand'), eased);
        }
      });
    }
  };
}

export const figure2ProofBrandTransition = createFigure2ProofBrandTransition();
