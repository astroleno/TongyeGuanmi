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

function setRevealSurfaceVisible(surface: HTMLElement | null, visible: boolean): void {
  if (!surface) {
    return;
  }
  if (visible) {
    surface.style.opacity = '';
    surface.style.visibility = '';
    return;
  }
  surface.style.opacity = '0';
  surface.style.visibility = 'hidden';
}

function drawableSize(element: HTMLImageElement | HTMLVideoElement): { width: number; height: number } {
  if (element instanceof HTMLVideoElement) {
    return { width: element.videoWidth, height: element.videoHeight };
  }
  return { width: element.naturalWidth, height: element.naturalHeight };
}

function drawDrawable(
  context: CanvasRenderingContext2D,
  layerRect: DOMRect,
  element: HTMLImageElement | HTMLVideoElement | null
): void {
  if (!element) {
    return;
  }
  if (element instanceof HTMLImageElement && !element.complete) {
    return;
  }
  if (element instanceof HTMLVideoElement && element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    return;
  }
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return;
  }
  const { width: sourceWidth, height: sourceHeight } = drawableSize(element);
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return;
  }

  const x = rect.left - layerRect.left;
  const y = rect.top - layerRect.top;
  const style = window.getComputedStyle(element);
  if (style.objectFit === 'cover') {
    const sourceRatio = sourceWidth / sourceHeight;
    const targetRatio = rect.width / rect.height;
    const cropWidth = sourceRatio > targetRatio ? sourceHeight * targetRatio : sourceWidth;
    const cropHeight = sourceRatio > targetRatio ? sourceHeight : sourceWidth / targetRatio;
    const cropX = (sourceWidth - cropWidth) * 0.5;
    const cropY = (sourceHeight - cropHeight) * 0.5;
    context.drawImage(element, cropX, cropY, cropWidth, cropHeight, x, y, rect.width, rect.height);
    return;
  }
  context.drawImage(element, x, y, rect.width, rect.height);
}

function renderAodSourceCanvas(layer: HTMLElement | null | undefined, sourceCanvas: HTMLCanvasElement): void {
  if (!layer) {
    delete sourceCanvas.dataset.inkTextureReady;
    return;
  }
  const rect = layer.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    delete sourceCanvas.dataset.inkTextureReady;
    return;
  }
  const ratio = Math.min(window.devicePixelRatio || 1, 1.25);
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (sourceCanvas.width !== width || sourceCanvas.height !== height) {
    sourceCanvas.width = width;
    sourceCanvas.height = height;
  }
  const context = sourceCanvas.getContext('2d');
  if (!context) {
    delete sourceCanvas.dataset.inkTextureReady;
    return;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);
  context.fillStyle = '#ede4d2';
  context.fillRect(0, 0, rect.width, rect.height);
  drawDrawable(context, rect, layer.querySelector<HTMLImageElement>('[data-aod-cloud-layer]'));
  drawDrawable(context, rect, layer.querySelector<HTMLImageElement>('[data-aod-sun-layer]'));
  drawDrawable(context, rect, layer.querySelector<HTMLVideoElement>('[data-aod-figure-video]'));
  sourceCanvas.dataset.inkTextureReady = 'true';
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
      const sourceCanvas = context.prefersReducedMotion || typeof document === 'undefined'
        ? null
        : document.createElement('canvas');
      const inkTransition = context.prefersReducedMotion ? null : createInkCurtainTransition(inkCanvas ?? null, {
        direction: 'bottom-up',
        colorLift: 0.56,
        coverAlpha: 0.82,
        fadeOutStart: 0.74,
        fadeOutEnd: 0.98,
        progressSpan: 1,
        ...(sourceCanvas
          ? {
              targetElement: sourceCanvas,
              renderTarget: () => renderAodSourceCanvas(context.to.element, sourceCanvas)
            }
          : {})
      });
      inkTransition?.prewarm();
      return new PilotProgressTimeline({
        from: context.from,
        to: context.to,
        durationMs: context.prefersReducedMotion ? 0 : context.segment.virtualDuration,
        sample: sampleStarMapAod,
        render: (progress) => {
          const inkProgress = smoothStep(progress);
          liftInkLayerOverSource(context.to.element);
          setRevealSurfaceVisible(
            getAodRevealSurface(context.to.element),
            context.prefersReducedMotion || inkProgress >= 0.999
          );
          context.to.element?.setAttribute('data-r3-transition', 'star-map-aod');
          inkTransition?.render(inkProgress);
        },
        dispose: () => {
          inkTransition?.destroy();
          if (sourceCanvas) {
            sourceCanvas.width = 0;
            sourceCanvas.height = 0;
            delete sourceCanvas.dataset.inkTextureReady;
          }
        }
      });
    }
  };
}
