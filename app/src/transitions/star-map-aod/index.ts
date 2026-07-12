import { PilotProgressTimeline } from '../../pilot/progress-timeline';
import { fadeVisibility, smoothStep } from '../../pilot/visibility';
import type { LayerVisibilityState, TransitionModule } from '../../story/types';
import { applyRevealBoundary, clearBoundaryGeometry } from '../shared/ink';
import { createInkFieldFrame, inkFieldOrigin, type InkFieldFrame } from '../shared/inkField';
import {
  createInkFieldRenderer,
  mountTransitionInkCanvas,
  type InkGradePreset
} from '../shared/sceneInk';
import { createTransitionLayerElevation } from '../shared/layerElevation';

const STAR_MAP_AOD_FIELD = {
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

function sharedStageHost(context: Parameters<TransitionModule['buildTimeline']>[0]): HTMLElement | null {
  const fromParent = context.from.element?.parentElement ?? null;
  const toParent = context.to.element?.parentElement ?? null;
  return fromParent && fromParent === toParent
    ? fromParent
    : toParent ?? fromParent ?? context.to.element ?? context.from.element ?? null;
}

function fieldViewport(
  canvas: HTMLCanvasElement | null,
  fallback: HTMLElement | null
): Readonly<{ width: number; height: number }> {
  const rect = canvas?.getBoundingClientRect?.() ?? fallback?.getBoundingClientRect?.();
  return {
    width: rect?.width || (typeof window === 'undefined' ? 1440 : window.innerWidth) || 1440,
    height: rect?.height || (typeof window === 'undefined' ? 900 : window.innerHeight) || 900
  };
}

function markAodFieldCanvas(
  canvas: HTMLCanvasElement | null,
  frame: InkFieldFrame,
  rendererActive: boolean
): void {
  if (!canvas) {
    return;
  }
  const fieldVisible = frame.progress > 0.002 && frame.progress < 0.999;
  const active = fieldVisible && rendererActive;
  const origin = inkFieldOrigin(frame.spec);
  canvas.dataset.r4InkEffectOnly = 'true';
  canvas.dataset.r4InkRenderer = 'field';
  canvas.dataset.r4InkSegment = 'star-map-aod';
  if (!fieldVisible) {
    delete canvas.dataset.r4InkActive;
    delete canvas.dataset.r4InkProgress;
    delete canvas.dataset.r4InkBoundaryKind;
    delete canvas.dataset.r4InkBoundaryOrigin;
    delete canvas.dataset.r4InkBoundaryProgress;
    delete canvas.dataset.r4InkBoundaryRevision;
    delete canvas.dataset.r4InkFieldSeed;
    return;
  }
  if (active) {
    canvas.dataset.r4InkActive = 'true';
    canvas.dataset.r4InkBodyVisible = 'true';
  } else {
    delete canvas.dataset.r4InkActive;
    delete canvas.dataset.r4InkBodyVisible;
  }
  canvas.dataset.r4InkProgress = frame.progress.toFixed(4);
  canvas.dataset.r4InkBoundaryKind = frame.spec.kind;
  canvas.dataset.r4InkBoundaryOrigin = `${origin.x.toFixed(4)},${origin.y.toFixed(4)}`;
  canvas.dataset.r4InkBoundaryProgress = frame.progress.toFixed(4);
  canvas.dataset.r4InkFieldSeed = String(frame.seed);
  delete canvas.dataset.r4InkBoundaryRevision;
}

export function createStarMapAodTransition(options: {
  delayMs?: () => number;
  grade?: InkGradePreset | (() => InkGradePreset);
} = {}): TransitionModule {
  return {
    id: 'star-map-aod',
    requiredMilestones: ['targetReady', 'buildReady'],
    buildTimeline: async (context) => {
      const delay = options.delayMs?.() ?? 0;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      const grade = typeof options.grade === 'function' ? options.grade() : options.grade ?? 'edge-only';
      const generation = `${context.runId}:${context.prepareToken}`;
      const stageHost = sharedStageHost(context);
      const inkCanvas = context.prefersReducedMotion ? null : mountTransitionInkCanvas(
        stageHost,
        'star-map-aod',
        { renderer: 'field', grade, generation }
      );
      const inkRenderer = context.prefersReducedMotion ? null : createInkFieldRenderer(inkCanvas, {
        grade,
        generation
      });
      const elevation = createTransitionLayerElevation(context.to.element, 40);
      const viewport = fieldViewport(inkCanvas, stageHost);
      inkRenderer?.prewarm(createInkFieldFrame(STAR_MAP_AOD_FIELD, 0.003, viewport));
      return new PilotProgressTimeline({
        from: context.from,
        to: context.to,
        durationMs: context.prefersReducedMotion ? 0 : context.segment.virtualDuration,
        direction: context.direction,
        sample: sampleStarMapAod,
        render: (progress) => {
          const fieldProgress = context.prefersReducedMotion ? 1 : smoothStep(progress);
          const frame = createInkFieldFrame(STAR_MAP_AOD_FIELD, fieldProgress, viewport);
          const revealSurface = getAodRevealSurface(context.to.element);
          elevation.elevate();
          if (revealSurface) {
            revealSurface.style.removeProperty('opacity');
            revealSurface.style.removeProperty('visibility');
            applyRevealBoundary(revealSurface, frame);
          }
          context.to.element?.setAttribute('data-r3-transition', 'star-map-aod');
          markAodFieldCanvas(inkCanvas, frame, Boolean(inkRenderer?.isActive()));
          inkRenderer?.render(frame);
        },
        dispose: () => {
          inkRenderer?.destroy();
          inkCanvas?.remove();
          clearBoundaryGeometry(getAodRevealSurface(context.to.element));
          if (inkCanvas) {
            delete inkCanvas.dataset.r4InkActive;
            delete inkCanvas.dataset.r4InkProgress;
            delete inkCanvas.dataset.r4InkBodyVisible;
          }
          elevation.restore();
          context.to.element?.removeAttribute('data-r3-transition');
        }
      });
    }
  };
}
