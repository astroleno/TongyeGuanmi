import { applyRevealBoundary, clearBoundaryGeometry } from './inkOwnership';
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
  field: RadialInkField;
  generation: string;
  viewport(): Readonly<{ width: number; height: number }>;
}>;

function clamp(progress: number): number {
  return Math.min(1, Math.max(0, progress));
}

/**
 * Reuses the same field frame, edge-only renderer and ownership boundary as
 * radial scene handoffs while keeping an intro's reveal surface local.
 */
export function createRadialInkIntroController(
  options: CreateRadialInkIntroControllerOptions
): RadialInkIntroController {
  let renderer: InkFieldRenderer | null = createInkFieldRenderer(options.canvas, {
    fieldKind: 'radial',
    grade: 'edge-only',
    generation: options.generation,
    removeCanvasOnDestroy: false
  });
  let disposed = false;

  const frameFor = (progress: number) => createInkFieldFrame(
    options.field,
    clamp(progress),
    options.viewport()
  );
  return {
    prewarm() {
      if (disposed) {
        return;
      }
      renderer?.prewarm(frameFor(0.003));
    },
    render(progress) {
      if (disposed) {
        return;
      }
      const frame = frameFor(progress);
      renderer?.render(frame);
      applyRevealBoundary(options.revealSurface, frame);
      options.canvas.setAttribute(
        'data-hero-intro-ink-active',
        String(frame.progress > 0.002 && frame.progress < 0.999)
      );
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      renderer?.destroy();
      renderer = null;
      options.canvas.removeAttribute('data-hero-intro-ink-active');
      clearBoundaryGeometry(options.revealSurface);
    }
  };
}
