import { PilotProgressTimeline } from '../../pilot/progress-timeline';
import { fadeVisibility, smoothStep } from '../../pilot/visibility';
import type { LayerVisibilityState, TransitionModule } from '../../story/types';
import { applyRevealBoundary, clearBoundaryGeometry } from '../shared/ink';
import { createInkBoundaryFrame, type InkBoundaryFrame } from '../shared/inkBoundary';
import { createBoundaryInkRenderer } from '../shared/sceneInk';

const STAR_MAP_AOD_BOUNDARY = {
  kind: 'horizontal',
  direction: 'bottom-to-top',
  seed: 'star-map-aod'
} as const;

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

function boundaryViewport(
  canvas: HTMLCanvasElement | null,
  fallback: HTMLElement | null
): Readonly<{ width: number; height: number }> {
  const rect = canvas?.getBoundingClientRect?.() ?? fallback?.getBoundingClientRect?.();
  return {
    width: rect?.width || (typeof window === 'undefined' ? 1440 : window.innerWidth) || 1440,
    height: rect?.height || (typeof window === 'undefined' ? 900 : window.innerHeight) || 900
  };
}

function markAodBoundaryCanvas(canvas: HTMLCanvasElement | null, frame: InkBoundaryFrame): void {
  if (!canvas) {
    return;
  }
  canvas.dataset.r4InkEffectOnly = 'true';
  canvas.dataset.r4InkRenderer = 'boundary';
  canvas.dataset.r4InkSegment = 'star-map-aod';
  canvas.dataset.r4InkActive = String(frame.progress > 0.002 && frame.progress < 0.999);
  canvas.dataset.r4InkProgress = frame.progress.toFixed(4);
  canvas.dataset.r4InkBoundaryKind = frame.kind;
  canvas.dataset.r4InkBoundaryOrigin = `${frame.origin.x.toFixed(4)},${frame.origin.y.toFixed(4)}`;
  canvas.dataset.r4InkBoundaryProgress = frame.progress.toFixed(4);
  canvas.dataset.r4InkBoundaryRevision = frame.revision;
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
      const inkCanvas = context.to.element?.querySelector<HTMLCanvasElement>('[data-aod-ink-canvas]') ?? null;
      const inkRenderer = context.prefersReducedMotion ? null : createBoundaryInkRenderer(inkCanvas, {
        colorLift: 0.56,
        coverAlpha: 0.82,
        fadeOutStart: 0.74,
        fadeOutEnd: 0.98
      }, { removeCanvasOnDestroy: false });
      const viewport = boundaryViewport(inkCanvas, context.to.element);
      inkRenderer?.prewarm(createInkBoundaryFrame(STAR_MAP_AOD_BOUNDARY, 0.003, viewport));
      return new PilotProgressTimeline({
        from: context.from,
        to: context.to,
        durationMs: context.prefersReducedMotion ? 0 : context.segment.virtualDuration,
        direction: context.direction,
        sample: sampleStarMapAod,
        render: (progress) => {
          const boundaryProgress = context.prefersReducedMotion ? 1 : smoothStep(progress);
          const frame = createInkBoundaryFrame(STAR_MAP_AOD_BOUNDARY, boundaryProgress, viewport);
          const revealSurface = getAodRevealSurface(context.to.element);
          liftInkLayerOverSource(context.to.element);
          if (revealSurface) {
            revealSurface.style.removeProperty('opacity');
            revealSurface.style.removeProperty('visibility');
            applyRevealBoundary(revealSurface, frame);
          }
          context.to.element?.setAttribute('data-r3-transition', 'star-map-aod');
          markAodBoundaryCanvas(inkCanvas, frame);
          inkRenderer?.render(frame);
        },
        dispose: () => {
          inkRenderer?.destroy();
          clearBoundaryGeometry(getAodRevealSurface(context.to.element));
          if (inkCanvas) {
            inkCanvas.dataset.r4InkActive = 'false';
          }
          context.to.element?.removeAttribute('data-r3-transition');
        }
      });
    }
  };
}
