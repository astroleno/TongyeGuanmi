import { PilotProgressTimeline } from '../../pilot/progress-timeline';
import { applyLayerVisibility, fadeVisibility, hiddenVisibility, holdVisibility, smoothStep } from '../../pilot/visibility';
import { renderFigure2AnimationProgress } from '../../scenes/figure2-animation';
import { renderMethodBottomProgress } from '../../scenes/method-bottom';
import type { LayerVisibilityState, TransitionContext, TransitionModule } from '../../story/types';

function sceneRoot(element: HTMLElement | null | undefined, scene: string): HTMLElement | null {
  return element?.querySelector<HTMLElement>(`[data-r4-scene="${scene}"]`) ?? element ?? null;
}

function sampleMethodBottomFigure2(progress: number): { from: LayerVisibilityState; to: LayerVisibilityState } {
  const p = smoothStep(progress);
  return {
    from: fadeVisibility(1 - p),
    to: fadeVisibility(p)
  };
}

function completeReducedMotion(context: TransitionContext): void {
  applyLayerVisibility(context.from, hiddenVisibility());
  applyLayerVisibility(context.to, holdVisibility(true));
  renderMethodBottomProgress(sceneRoot(context.from.element, 'method-bottom'), 0);
  renderFigure2AnimationProgress(sceneRoot(context.to.element, 'figure2-animation'), 1);
}

export function createMethodBottomFigure2Transition(options: { delayMs?: () => number } = {}): TransitionModule {
  return {
    id: 'method-bottom-figure2',
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
        sample: sampleMethodBottomFigure2,
        render: (progress) => {
          const eased = smoothStep(progress);
          context.to.element?.setAttribute('data-r4-transition', 'method-bottom-figure2');
          renderMethodBottomProgress(sceneRoot(context.from.element, 'method-bottom'), 1 - eased * 0.44);
          renderFigure2AnimationProgress(sceneRoot(context.to.element, 'figure2-animation'), eased);
        }
      });
    }
  };
}

export const methodBottomFigure2Transition = createMethodBottomFigure2Transition();
