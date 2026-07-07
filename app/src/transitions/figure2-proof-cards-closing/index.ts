import { PilotProgressTimeline } from '../../pilot/progress-timeline';
import { applyLayerVisibility, fadeVisibility, hiddenVisibility, holdVisibility, smoothStep } from '../../pilot/visibility';
import { renderProofCardsProgress } from '../../scenes/figure2-proof-cards';
import { renderProofClosingProgress } from '../../scenes/figure2-proof-closing';
import type { LayerVisibilityState, TransitionContext, TransitionModule } from '../../story/types';

function sceneRoot(element: HTMLElement | null | undefined, scene: string): HTMLElement | null {
  return element?.querySelector<HTMLElement>(`[data-r4-scene="${scene}"]`) ?? element ?? null;
}

function sampleCardsClosing(progress: number): { from: LayerVisibilityState; to: LayerVisibilityState } {
  const p = smoothStep(progress);
  return {
    from: fadeVisibility(1 - p),
    to: fadeVisibility(p)
  };
}

function completeReducedMotion(context: TransitionContext): void {
  applyLayerVisibility(context.from, hiddenVisibility());
  applyLayerVisibility(context.to, holdVisibility(true));
  renderProofCardsProgress(sceneRoot(context.from.element, 'figure2-proof-cards'), 0);
  renderProofClosingProgress(sceneRoot(context.to.element, 'figure2-proof-closing'), 1);
}

export function createFigure2ProofCardsClosingTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return {
    id: 'figure2-proof-cards-closing',
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
        sample: sampleCardsClosing,
        render: (progress) => {
          const eased = smoothStep(progress);
          context.to.element?.setAttribute('data-r4-transition', 'figure2-proof-cards-closing');
          renderProofCardsProgress(sceneRoot(context.from.element, 'figure2-proof-cards'), 1 - eased * 0.72);
          renderProofClosingProgress(sceneRoot(context.to.element, 'figure2-proof-closing'), eased);
        }
      });
    }
  };
}

export const figure2ProofCardsClosingTransition = createFigure2ProofCardsClosingTransition();
