import { PilotProgressTimeline } from '../../pilot/progress-timeline';
import { fadeVisibility, smoothStep } from '../../pilot/visibility';
import type { LayerVisibilityState, TransitionModule } from '../../story/types';
import { createInkCurtainTransition } from './inkCurtain';

function sampleStarMapAod(progress: number): { from: LayerVisibilityState; to: LayerVisibilityState } {
  const p = smoothStep(progress);
  if (p <= 0.001) {
    return {
      from: fadeVisibility(1),
      to: fadeVisibility(0)
    };
  }
  if (p >= 0.999) {
    return {
      from: fadeVisibility(0),
      to: fadeVisibility(1)
    };
  }
  return {
    from: fadeVisibility(1),
    to: fadeVisibility(1)
  };
}

function getAodRevealSurface(element: HTMLElement | null | undefined): HTMLElement | null {
  return element?.querySelector<HTMLElement>('[data-aod-reveal-surface]') ?? null;
}

function liftInkLayerOverSource(element: HTMLElement | null | undefined): void {
  if (!element) {
    return;
  }
  element.style.zIndex = '40';
}

function renderLiveRevealClip(surface: HTMLElement | null, progress: number): void {
  if (!surface) {
    return;
  }
  surface.style.removeProperty('opacity');
  surface.style.removeProperty('visibility');
  if (progress >= 0.999) {
    surface.style.removeProperty('clip-path');
    surface.style.removeProperty('-webkit-clip-path');
    surface.removeAttribute('data-r4-reveal-progress');
    return;
  }
  const clipPath = `inset(${((1 - progress) * 100).toFixed(3)}% 0 0 0)`;
  surface.style.clipPath = clipPath;
  surface.style.setProperty('-webkit-clip-path', clipPath);
  surface.dataset.r4RevealProgress = progress.toFixed(4);
}

export function createStarMapAodTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return {
    id: 'star-map-aod',
    requiredMilestones: ['targetReady', 'buildReady'],
    buildTimeline: async (context) => {
      const delay = options.delayMs?.() ?? 0;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      const inkCanvas = context.prefersReducedMotion
        ? null
        : context.to.element?.querySelector<HTMLCanvasElement>('[data-aod-ink-canvas]');
      const inkTransition = context.prefersReducedMotion ? null : createInkCurtainTransition(inkCanvas ?? null, {
        direction: 'bottom-up',
        colorLift: 0.56,
        coverAlpha: 0.82,
        fadeOutStart: 0.74,
        fadeOutEnd: 0.98,
        progressSpan: 1
      });
      inkTransition?.prewarm();
      return new PilotProgressTimeline({
        from: context.from,
        to: context.to,
        durationMs: context.prefersReducedMotion ? 0 : context.segment.virtualDuration,
        direction: context.direction,
        sample: sampleStarMapAod,
        render: (progress) => {
          const inkProgress = smoothStep(progress);
          liftInkLayerOverSource(context.to.element);
          renderLiveRevealClip(getAodRevealSurface(context.to.element), context.prefersReducedMotion ? 1 : inkProgress);
          context.to.element?.setAttribute('data-r3-transition', 'star-map-aod');
          inkTransition?.render(inkProgress);
        },
        dispose: () => {
          inkTransition?.destroy();
          renderLiveRevealClip(getAodRevealSurface(context.to.element), 1);
          context.to.element?.removeAttribute('data-r3-transition');
        }
      });
    }
  };
}
