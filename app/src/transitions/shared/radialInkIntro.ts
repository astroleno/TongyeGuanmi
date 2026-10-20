import { clearBoundaryGeometry } from './inkOwnership';
import { semanticBoolean } from '../../runtime/semantic-data-attribute';
import { retireDetachedCanvasContext } from '../../media/scroll-canvas-window';
import { createInkFieldFrame, type InkFieldSpec } from './inkField';
import {
  createInkFieldRenderer,
  type InkFieldRenderer
} from './sceneInk';

type RadialInkField = Extract<InkFieldSpec, { kind: 'radial' }>;

export type RadialInkIntroController = Readonly<{
  prewarm(): void;
  render(progress: number): void;
  dispose(): void;
}>;

export type CreateRadialInkIntroControllerOptions = Readonly<{
  canvas: HTMLCanvasElement;
  revealSurface: HTMLElement;
  targetImage?: HTMLImageElement | null;
  field: RadialInkField;
  generation: string;
  deferUntilVisible?: boolean;
  sharedCanvas?: HTMLCanvasElement;
  restoreSharedCanvas?(): void;
  viewport(): Readonly<{ width: number; height: number }>;
}>;

function clamp(progress: number): number {
  return Math.min(1, Math.max(0, progress));
}

/**
 * Reuses the radial field renderer for the Hero's actual background texture.
 * The canvas owns the irregular reveal until its terminal frame, then the DOM
 * image takes over.  The DOM surface deliberately never receives a CSS circle
 * ownership clip.
 */
export function createRadialInkIntroController(
  options: CreateRadialInkIntroControllerOptions
): RadialInkIntroController {
  let renderer: InkFieldRenderer | null = null;
  let disposed = false;
  let settled = false;
  let latestProgress = 1;

  const targetReady = () => !options.targetImage || (
    options.targetImage.complete
    && options.targetImage.naturalWidth > 0
    && options.targetImage.naturalHeight > 0
  );
  const ensureRenderer = () => {
    if (disposed || settled || renderer || !targetReady()
      || (options.deferUntilVisible && (latestProgress <= .002 || latestProgress >= .999))) {
      return renderer;
    }
    renderer = createInkFieldRenderer(options.canvas, {
      fieldKind: 'radial',
      grade: 'edge-only',
      generation: options.generation,
      ...(options.targetImage ? { targetImage: options.targetImage } : {}),
      removeCanvasOnDestroy: false,
      loseContextOnDestroy: false,
      ...(options.sharedCanvas ? { sharedCanvas: options.sharedCanvas } : {})
    });
    return renderer;
  };
  const applySurfaceHandoff = (progress: number) => {
    if (!options.targetImage) {
      return;
    }
    const canvasOwnsTarget = Boolean(renderer?.isActive());
    if (!canvasOwnsTarget) {
      options.revealSurface.style.removeProperty('--r4-hero-back-ink-opacity');
      return;
    }
    // The target-texture renderer retains canvas ownership through 0.995;
    // this surface reaches full opacity before that terminal fade begins.
    const settle = clamp((progress - 0.94) / 0.055);
    const eased = settle * settle * (3 - 2 * settle);
    options.revealSurface.style.setProperty('--r4-hero-back-ink-opacity', eased.toFixed(4));
  };
  const onTargetLoad = () => {
    ensureRenderer();
    if (renderer) {
      const frame = frameFor(latestProgress);
      draw(frame);
      applySurfaceHandoff(frame.progress);
    }
  };

  const frameFor = (progress: number) => createInkFieldFrame(
    options.field,
    clamp(progress),
    options.viewport()
  );
  const draw = (frame: ReturnType<typeof frameFor>, prewarm = false) => {
    if (!renderer) return;
    try {
      if (prewarm) renderer.prewarm(frame);
      else renderer.render(frame);
    } finally {
      options.restoreSharedCanvas?.();
    }
  };
  options.targetImage?.addEventListener('load', onTargetLoad);
  clearBoundaryGeometry(options.revealSurface);
  return {
    prewarm() {
      if (disposed) {
        return;
      }
      ensureRenderer();
      draw(frameFor(0.003), true);
    },
    render(progress) {
      if (disposed) {
        return;
      }
      latestProgress = progress;
      const wasSettled = settled;
      if (progress < .999) settled = false;
      const frame = frameFor(progress);
      ensureRenderer();
      if (!wasSettled || frame.progress < .999) draw(frame);
      applySurfaceHandoff(frame.progress);
      options.canvas.setAttribute(
        'data-hero-intro-ink-active',
        semanticBoolean(
          frame.progress > 0.002
          && frame.progress < 0.999
          && Boolean(renderer?.isActive())
        )
      );
      if (frame.progress >= 0.999) {
        settled = true;
        // Coherent sampling can visit desired=1, held<1, then presented=1
        // within one RAF. A shared pass belongs to the window, not that pose:
        // retaining it avoids rebuilding shaders/re-uploading the image here.
        if (!options.sharedCanvas) {
          renderer?.destroy();
          renderer = null;
        }
      }
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      options.targetImage?.removeEventListener('load', onTargetLoad);
      renderer?.destroy();
      renderer = null;
      // StrictMode may reuse a still-connected canvas. Only retire the actual
      // owned context after detach; probing unused canvases creates contexts.
      if (!options.sharedCanvas) queueMicrotask(() => retireDetachedCanvasContext(options.canvas));
      options.canvas.removeAttribute('data-hero-intro-ink-active');
      options.revealSurface.style.removeProperty('--r4-hero-back-ink-opacity');
      clearBoundaryGeometry(options.revealSurface);
    }
  };
}
