import {
  createInkBoundaryTransition,
  type InkBoundaryTransition,
  type InkBoundaryTransitionOptions,
} from '../../vendor/ink-scene-transition.js';
import type { InkBoundaryFrame } from './inkBoundary';

export type BoundaryInkOptions = InkBoundaryTransitionOptions;

export type BoundaryInkRenderer = {
  render(frame: InkBoundaryFrame): void;
  prewarm(frame: InkBoundaryFrame): void;
  destroy(): void;
};

export type BoundaryInkRendererLifecycleOptions = Readonly<{
  removeCanvasOnDestroy?: boolean;
}>;

export type TransitionInkCanvasOptions = {
  renderer: 'boundary';
  preset?: 'cinematic-color';
  className?: string;
};

const CINEMATIC_BOUNDARY_PRESET = Object.freeze({
  colorLift: 0.92,
  particleStrength: 1,
  coverAlpha: 0.82,
  fadeOutStart: 0.78,
  fadeOutEnd: 0.995,
  dprLimit: 1
}) satisfies InkBoundaryTransitionOptions;

function markCinematicPreset(
  canvas: HTMLCanvasElement,
  renderer: TransitionInkCanvasOptions['renderer'],
  colorLift: number,
  particleStrength: number,
  dprLimit: number,
  dynamicTextureFps?: number
): void {
  canvas.dataset.r4InkPreset = 'cinematic-color';
  canvas.dataset.r4InkPresetApplied = 'true';
  canvas.dataset.r4InkParticleProfile = 'jade-gold';
  canvas.dataset.r4InkParticleStrength = particleStrength.toFixed(3);
  canvas.dataset.r4InkRenderer = renderer;
  canvas.dataset.r4InkColorLift = colorLift.toFixed(3);
  canvas.dataset.r4InkDprLimit = dprLimit.toFixed(2);
  if (dynamicTextureFps !== undefined) {
    canvas.dataset.r4InkTextureFps = String(dynamicTextureFps);
  }
}

function markBoundaryFrame(canvas: HTMLCanvasElement, frame: InkBoundaryFrame): void {
  canvas.dataset.r4InkBoundaryKind = frame.kind;
  canvas.dataset.r4InkBoundaryOrigin = `${frame.origin.x.toFixed(4)},${frame.origin.y.toFixed(4)}`;
  canvas.dataset.r4InkBoundaryProgress = frame.progress.toFixed(4);
  canvas.dataset.r4InkBoundaryRevision = frame.revision;
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

export function createBoundaryInkRenderer(
  canvas: HTMLCanvasElement | null,
  options: BoundaryInkOptions = {},
  lifecycle: BoundaryInkRendererLifecycleOptions = {}
): BoundaryInkRenderer | null {
  const resolvedOptions: InkBoundaryTransitionOptions = {
    ...CINEMATIC_BOUNDARY_PRESET,
    ...options
  };
  if (canvas) {
    markCinematicPreset(
      canvas,
      'boundary',
      resolvedOptions.colorLift ?? CINEMATIC_BOUNDARY_PRESET.colorLift,
      resolvedOptions.particleStrength ?? CINEMATIC_BOUNDARY_PRESET.particleStrength,
      resolvedOptions.dprLimit ?? CINEMATIC_BOUNDARY_PRESET.dprLimit
    );
  }
  const transition: InkBoundaryTransition | null = createInkBoundaryTransition(canvas, resolvedOptions);
  if (!canvas || !transition) {
    return null;
  }

  let destroyed = false;

  return {
    render(frame: InkBoundaryFrame) {
      if (destroyed) {
        return;
      }
      markBoundaryFrame(canvas, frame);
      transition.render(frame, 0, 0);
    },
    prewarm(frame: InkBoundaryFrame) {
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
        delete canvas.dataset.r4InkBoundaryKind;
        delete canvas.dataset.r4InkBoundaryOrigin;
        delete canvas.dataset.r4InkBoundaryProgress;
        delete canvas.dataset.r4InkBoundaryRevision;
      }
    }
  };
}
