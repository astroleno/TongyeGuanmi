import { clearBoundaryGeometry } from './inkOwnership';
import { semanticBoolean } from '../../runtime/semantic-data-attribute';
import { createInkFieldFrame, type InkFieldSpec } from './inkField';
import { createHorizontalInkContour } from './horizontalInkContour';
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
  const contour = createHorizontalInkContour({
    authoredSeed: options.field.seed,
    variationKey: `radial:${options.generation}`
  });

  const targetReady = () => !options.targetImage || (
    options.targetImage.complete
    && options.targetImage.naturalWidth > 0
    && options.targetImage.naturalHeight > 0
  );
  const ensureRenderer = () => {
    if (disposed || settled || renderer || !targetReady()) {
      return renderer;
    }
    renderer = createInkFieldRenderer(options.canvas, {
      fieldKind: 'radial',
      grade: 'edge-only',
      generation: options.generation,
      ...(options.targetImage ? { targetImage: options.targetImage } : {}),
      removeCanvasOnDestroy: false
    });
    return renderer;
  };
  const applySurfaceHandoff = (progress: number) => {
    if (!options.targetImage) {
      return;
    }
    const canvasOwnsTarget = Boolean(renderer?.isActive());
    if (!canvasOwnsTarget) {
      // Keep the target texture explicitly hidden until this execution owns a
      // drawable frame. Removing the property would re-enter the CSS
      // fallback and can flash the full rectangle during cold startup.
      options.revealSurface.style.setProperty('--r4-hero-back-ink-opacity', '0');
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
      renderer.render(frame);
      applySurfaceHandoff(frame.progress);
    }
  };

  const frameFor = (progress: number) => createInkFieldFrame(
    options.field,
    clamp(progress),
    options.viewport(),
    { contour }
  );
  options.targetImage?.addEventListener('load', onTargetLoad);
  clearBoundaryGeometry(options.revealSurface);
  return {
    prewarm() {
      if (disposed) {
        return;
      }
      ensureRenderer()?.prewarm(frameFor(0.003));
    },
    render(progress) {
      if (disposed) {
        return;
      }
      latestProgress = progress;
      const frame = frameFor(progress);
      ensureRenderer()?.render(frame);
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
        renderer?.destroy();
        renderer = null;
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
      options.canvas.removeAttribute('data-hero-intro-ink-active');
      options.revealSurface.style.removeProperty('--r4-hero-back-ink-opacity');
      clearBoundaryGeometry(options.revealSurface);
    }
  };
}
