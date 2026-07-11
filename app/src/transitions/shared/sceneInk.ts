import {
  createInkBoundaryTransition,
  type InkBoundaryTransition,
  type InkBoundaryTransitionOptions,
} from '../../vendor/ink-scene-transition.js';
import { inkFieldOrigin, type InkFieldFrame } from './inkField';

export type InkFieldRenderer = {
  render(frame: InkFieldFrame): void;
  prewarm(frame: InkFieldFrame): void;
  destroy(): void;
};

export type InkFieldRendererLifecycleOptions = Readonly<{
  removeCanvasOnDestroy?: boolean;
}>;

export type TransitionInkCanvasOptions = {
  renderer: 'field';
  preset?: 'cinematic-color';
  className?: string;
};

const CINEMATIC_BOUNDARY_PRESET = Object.freeze({
  colorLift: 0.92,
  coverAlpha: 0.82,
  fadeOutStart: 0.94,
  fadeOutEnd: 0.995,
  dprLimit: 1
}) satisfies InkBoundaryTransitionOptions;

function markCinematicPreset(
  canvas: HTMLCanvasElement,
  renderer: TransitionInkCanvasOptions['renderer'],
  colorLift: number,
  dprLimit: number,
  dynamicTextureFps?: number
): void {
  canvas.dataset.r4InkPreset = 'cinematic-color';
  canvas.dataset.r4InkPresetApplied = 'true';
  canvas.dataset.r4InkParticleProfile = 'jade-gold';
  delete canvas.dataset.r4InkParticleStrength;
  canvas.dataset.r4InkRenderer = renderer;
  canvas.dataset.r4InkColorLift = colorLift.toFixed(3);
  canvas.dataset.r4InkDprLimit = dprLimit.toFixed(2);
  if (dynamicTextureFps !== undefined) {
    canvas.dataset.r4InkTextureFps = String(dynamicTextureFps);
  }
}

function markBoundaryFrame(canvas: HTMLCanvasElement, frame: InkFieldFrame): void {
  const origin = inkFieldOrigin(frame.spec);
  canvas.dataset.r4InkBoundaryKind = frame.spec.kind;
  canvas.dataset.r4InkBoundaryOrigin = `${origin.x.toFixed(4)},${origin.y.toFixed(4)}`;
  canvas.dataset.r4InkBoundaryProgress = frame.progress.toFixed(4);
  canvas.dataset.r4InkFieldSeed = String(frame.seed);
  delete canvas.dataset.r4InkBoundaryRevision;
}

function clearBoundaryFrameMark(canvas: HTMLCanvasElement): void {
  delete canvas.dataset.r4InkBoundaryKind;
  delete canvas.dataset.r4InkBoundaryOrigin;
  delete canvas.dataset.r4InkBoundaryProgress;
  delete canvas.dataset.r4InkBoundaryRevision;
  delete canvas.dataset.r4InkFieldSeed;
}

/**
 * Shared DOM surface for every R4 ink handoff. Keeping the canvas beside the
 * scene layers prevents receiver masks and scene overflow from clipping the
 * colored particle field.
 */
export function mountTransitionInkCanvas(
  host: HTMLElement | null,
  segmentId: string,
  options: TransitionInkCanvasOptions
): HTMLCanvasElement | null {
  if (!host) {
    return null;
  }
  const existing = host.querySelector<HTMLCanvasElement>(`:scope > canvas[data-r4-ink-segment="${segmentId}"]`);
  if (existing) {
    return existing;
  }
  const canvas = document.createElement('canvas');
  canvas.className = ['r4-ink-transition-canvas', options.className ?? '']
    .filter(Boolean)
    .join(' ');
  canvas.dataset.r4InkSegment = segmentId;
  canvas.dataset.r4InkEffectOnly = 'true';
  canvas.dataset.r4InkRenderer = options.renderer;
  canvas.dataset.r4InkPreset = options.preset ?? 'cinematic-color';
  canvas.setAttribute('aria-hidden', 'true');
  host.append(canvas);
  return canvas;
}

export function createInkFieldRenderer(
  canvas: HTMLCanvasElement | null,
  lifecycle: InkFieldRendererLifecycleOptions = {}
): InkFieldRenderer | null {
  const resolvedOptions: InkBoundaryTransitionOptions = CINEMATIC_BOUNDARY_PRESET;
  if (canvas) {
    markCinematicPreset(
      canvas,
      'field',
      resolvedOptions.colorLift ?? CINEMATIC_BOUNDARY_PRESET.colorLift,
      resolvedOptions.dprLimit ?? CINEMATIC_BOUNDARY_PRESET.dprLimit
    );
  }
  const transition: InkBoundaryTransition | null = createInkBoundaryTransition(canvas, resolvedOptions);
  if (!canvas || !transition) {
    return null;
  }

  let destroyed = false;

  return {
    render(frame: InkFieldFrame) {
      if (destroyed) {
        return;
      }
      if (frame.progress <= 0.002 || frame.progress >= 0.999) {
        clearBoundaryFrameMark(canvas);
      } else {
        markBoundaryFrame(canvas, frame);
      }
      transition.render(frame, 0, 0);
    },
    prewarm(frame: InkFieldFrame) {
      if (destroyed) {
        return;
      }
      markBoundaryFrame(canvas, frame);
      transition.prewarm(frame);
    },
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      transition.destroy();
      if (lifecycle.removeCanvasOnDestroy !== false) {
        canvas.remove();
      } else {
        clearBoundaryFrameMark(canvas);
      }
    }
  };
}
