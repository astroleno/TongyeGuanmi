import { PilotProgressTimeline } from '../../pilot/progress-timeline';
import { applyLayerVisibility, fadeVisibility, hiddenVisibility, holdVisibility, smoothStep } from '../../pilot/visibility';
import { renderProofCardsProgress } from '../../scenes/figure2-proof-cards';
import { renderProofOpeningProgress } from '../../scenes/figure2-proof-opening';
import type { LayerVisibilityState, TransitionContext, TransitionModule } from '../../story/types';

function sceneRoot(element: HTMLElement | null | undefined, scene: string): HTMLElement | null {
  return element?.querySelector<HTMLElement>(`[data-r4-scene="${scene}"]`) ?? element ?? null;
}

function sampleOpeningCards(progress: number): { from: LayerVisibilityState; to: LayerVisibilityState } {
  const p = smoothStep(progress);
  return {
    from: fadeVisibility(1 - p),
    to: fadeVisibility(p)
  };
}

function completeReducedMotion(context: TransitionContext): void {
  applyLayerVisibility(context.from, hiddenVisibility());
  applyLayerVisibility(context.to, holdVisibility(true));
  renderProofOpeningProgress(sceneRoot(context.from.element, 'figure2-proof-opening'), 0);
  renderProofCardsProgress(sceneRoot(context.to.element, 'figure2-proof-cards'), 1);
}

export function createFigure2ProofOpeningCardsTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return {
    id: 'figure2-proof-opening-cards',
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
        sample: sampleOpeningCards,
        render: (progress) => {
          const eased = smoothStep(progress);
          context.to.element?.setAttribute('data-r4-transition', 'figure2-proof-opening-cards');
          renderProofOpeningProgress(sceneRoot(context.from.element, 'figure2-proof-opening'), 1 - eased * 0.72);
          renderProofCardsProgress(sceneRoot(context.to.element, 'figure2-proof-cards'), eased);
        }
      });
    }
  };
}

export const figure2ProofOpeningCardsTransition = createFigure2ProofOpeningCardsTransition();
