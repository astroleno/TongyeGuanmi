import { PilotProgressTimeline } from '../../pilot/progress-timeline';
import { applyLayerVisibility, fadeVisibility, hiddenVisibility, holdVisibility, smoothStep } from '../../pilot/visibility';
import { renderMethodBottomProgress } from '../../scenes/method-bottom';
import type { LayerVisibilityState, TransitionContext, TransitionModule } from '../../story/types';

function sceneRoot(element: HTMLElement | null | undefined, scene: string): HTMLElement | null {
  return element?.querySelector<HTMLElement>(`[data-r4-scene="${scene}"], [data-r3-scene="${scene}"]`) ?? element ?? null;
}

function sampleMethodTopBottom(progress: number): { from: LayerVisibilityState; to: LayerVisibilityState } {
  const p = smoothStep(progress);
  return {
    from: fadeVisibility(1 - p),
    to: fadeVisibility(p)
  };
}

function completeReducedMotion(context: TransitionContext): void {
  applyLayerVisibility(context.from, hiddenVisibility());
  applyLayerVisibility(context.to, holdVisibility(true));
  renderMethodBottomProgress(sceneRoot(context.to.element, 'method-bottom'), 1);
}

export function createMethodTopMethodBottomTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return {
    id: 'method-top-method-bottom',
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
        sample: sampleMethodTopBottom,
        render: (progress) => {
          const eased = smoothStep(progress);
          context.to.element?.setAttribute('data-r4-transition', 'method-top-method-bottom');
          renderMethodBottomProgress(sceneRoot(context.to.element, 'method-bottom'), eased);
        }
      });
    }
  };
}

export const methodTopMethodBottomTransition = createMethodTopMethodBottomTransition();
