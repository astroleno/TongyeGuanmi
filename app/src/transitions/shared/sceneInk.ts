import {
  createInkBoundaryTransition,
  type InkBoundaryTransition,
  type InkBoundaryTransitionOptions,
} from '../../vendor/ink-scene-transition.js';
import {
  clearHorizontalInkDiagnostics,
  inkFieldOrigin,
  markHorizontalInkDiagnostics,
  type InkFieldFrame
} from './inkField';

export type InkFieldRenderer = {
  render(frame: InkFieldFrame): void;
  prewarm(frame: InkFieldFrame): void;
  rebindGeneration(generation: string): boolean;
  isActive(): boolean;
  getFailure(): InkRendererFailure | null;
  destroy(): void;
};

export type InkRendererFailureReason = 'unavailable' | 'context-lost' | 'generation-mismatch';

export type InkRendererFailure = Readonly<{
  generation: string;
  reason: InkRendererFailureReason;
}>;

export class InkRendererRunError extends Error {
  readonly code = 'INK_RENDERER_RUN_FAILED';

  constructor(
    readonly segmentId: string,
    readonly failure: InkRendererFailure
  ) {
    super(`Ink renderer ${failure.reason} (${segmentId})`);
    this.name = 'InkRendererRunError';
  }
}

export function productionInkRendererRequired(prefersReducedMotion: boolean): boolean {
  const browserCanvasRuntime = typeof window !== 'undefined'
    && typeof document !== 'undefined'
    && typeof HTMLCanvasElement !== 'undefined';
  return !prefersReducedMotion
    && (browserCanvasRuntime || typeof WebGLRenderingContext !== 'undefined');
}

export type InkGradePreset = 'edge-only' | 'edge-bright' | 'dark';

export type InkFieldRendererLifecycleOptions = Readonly<{
  removeCanvasOnDestroy?: boolean;
  loseContextOnDestroy?: boolean;
  fieldKind?: InkFieldFrame['spec']['kind'];
  grade?: InkGradePreset | undefined;
  generation?: string;
  targetImage?: HTMLImageElement | null;
  onInvalidated?: (failure: InkRendererFailure) => void;
}>;

export type TransitionInkCanvasOptions = {
  renderer: 'field';
  grade?: InkGradePreset | undefined;
  generation?: string;
  className?: string;
};

const INK_GRADE_PRESETS = Object.freeze({
  'edge-only': Object.freeze({
    colorLift: 0.92,
    coverAlpha: 0,
    fadeOutStart: 0.94,
    fadeOutEnd: 0.995,
    dprLimit: 1
  }),
  'edge-bright': Object.freeze({
    colorLift: 1,
    particleGain: 1.25,
    coverAlpha: 0,
    fadeOutStart: 0.94,
    fadeOutEnd: 0.995,
    dprLimit: 1
  }),
  dark: Object.freeze({
    colorLift: 0.92,
    coverAlpha: 0.82,
    fadeOutStart: 0.94,
    fadeOutEnd: 0.995,
    dprLimit: 1
  })
}) satisfies Readonly<Record<InkGradePreset, InkBoundaryTransitionOptions>>;

const INK_DIAGNOSTICS = import.meta.env.DEV;
const INK_GENERATION = 'r4InkGeneration';
const INK_RENDERER_ACTIVE = 'r4InkRendererActive';
const INK_RENDERER_STATUS = 'r4InkRendererStatus';

function markGradePreset(
  canvas: HTMLCanvasElement,
  grade: InkGradePreset,
  generation: string
): void {
  canvas.dataset[INK_GENERATION] = generation;
  if (!INK_DIAGNOSTICS) {
    return;
  }
  canvas.dataset.r4InkGrade = grade;
}

function markBoundaryFrame(canvas: HTMLCanvasElement, frame: InkFieldFrame): void {
  canvas.dataset.r4InkBoundaryKind = frame.spec.kind;
  if (!INK_DIAGNOSTICS) {
    return;
  }
  const origin = inkFieldOrigin(frame.spec);
  canvas.dataset.r4InkBoundaryOrigin = `${origin.x.toFixed(4)},${origin.y.toFixed(4)}`;
  canvas.dataset.r4InkBoundaryProgress = frame.progress.toFixed(4);
  if (frame.spec.kind === 'horizontal' && 'revision' in frame) {
    markHorizontalInkDiagnostics(canvas, frame);
  } else {
    clearHorizontalInkDiagnostics(canvas);
  }
}

function clearBoundaryFrameMark(canvas: HTMLCanvasElement): void {
  delete canvas.dataset.r4InkBoundaryKind;
  if (!INK_DIAGNOSTICS) {
    return;
  }
  delete canvas.dataset.r4InkBoundaryOrigin;
  delete canvas.dataset.r4InkBoundaryProgress;
  clearHorizontalInkDiagnostics(canvas);
}

/**
 * Shared DOM surface for every R4 ink handoff. Keeping the canvas beside the
 * scene layers prevents receiver masks and scene overflow from clipping the
 * colored particle field.
 */
export function mountTransitionInkCanvas(
  host: HTMLElement | null,
  segmentId: string,
  options: TransitionInkCanvasOptions,
  existingCanvas?: HTMLCanvasElement
): HTMLCanvasElement | null {
  if (!host) {
    return null;
  }
  const canvas = existingCanvas ?? (typeof host.ownerDocument?.createElement === 'function'
    ? host.ownerDocument
    : typeof document === 'undefined'
      ? null
      : document
  )?.createElement('canvas');
  if (!canvas) {
    return null;
  }
  const grade = options.grade ?? 'edge-only';
  canvas.className = ['r4-ink-transition-canvas', options.className ?? '']
    .filter(Boolean)
    .join(' ');
  canvas.dataset.r4InkSegment = segmentId;
  canvas.dataset.r4InkEffectOnly = 'true';
  canvas.dataset[INK_GENERATION] = options.generation ?? 'unscoped';
  if (INK_DIAGNOSTICS) {
    canvas.dataset.r4InkRenderer = options.renderer;
    canvas.dataset.r4InkGrade = grade;
  }
  canvas.setAttribute('aria-hidden', 'true');
  host.append(canvas);
  return canvas;
}

export function createInkFieldRenderer(
  canvas: HTMLCanvasElement | null,
  lifecycle: InkFieldRendererLifecycleOptions = {}
): InkFieldRenderer | null {
  const grade = lifecycle.grade ?? (canvas?.dataset.r4InkGrade as InkGradePreset | undefined) ?? 'edge-only';
  const resolvedOptions = INK_GRADE_PRESETS[grade] ?? INK_GRADE_PRESETS['edge-only'];
  let generation = lifecycle.generation ?? canvas?.dataset[INK_GENERATION] ?? 'unscoped';
  if (canvas) {
    markGradePreset(canvas, grade, generation);
  }
  let transition: InkBoundaryTransition | null = null;
  try {
    transition = createInkBoundaryTransition(canvas, {
      ...resolvedOptions,
      ...(lifecycle.fieldKind ? { fieldKind: lifecycle.fieldKind } : {}),
      ...(lifecycle.targetImage ? { targetImage: lifecycle.targetImage } : {})
    });
  } catch {
    transition = null;
  }
  if (!canvas || !transition) {
    if (canvas) {
      canvas.dataset[INK_RENDERER_ACTIVE] = 'false';
      canvas.dataset[INK_RENDERER_STATUS] = 'unavailable';
    }
    lifecycle.onInvalidated?.({ generation, reason: 'unavailable' });
    return null;
  }

  let destroyed = false;
  let invalidated = false;
  let failure: InkRendererFailure | null = null;
  const matchesGeneration = () => canvas.dataset[INK_GENERATION] === generation;
  const releaseTransition = (
    loseContext = lifecycle.loseContextOnDestroy ?? true
  ) => {
    const activeTransition = transition;
    transition = null;
    activeTransition?.destroy(loseContext);
  };
  const invalidate = (reason: Exclude<InkRendererFailureReason, 'unavailable'>) => {
    if (destroyed || invalidated) {
      return;
    }
    invalidated = true;
    failure = Object.freeze({ generation, reason });
    canvas.dataset[INK_RENDERER_ACTIVE] = 'false';
    canvas.dataset[INK_RENDERER_STATUS] = reason;
    releaseTransition(false);
    lifecycle.onInvalidated?.(failure);
  };
  const isActive = () => {
    if (destroyed || invalidated || transition === null) {
      return false;
    }
    if (!matchesGeneration()) {
      invalidate('generation-mismatch');
      return false;
    }
    return true;
  };
  const onContextLost = (event: Event) => {
    if (destroyed || invalidated) {
      return;
    }
    event.preventDefault();
    invalidate('context-lost');
  };
  canvas.addEventListener?.('webglcontextlost', onContextLost);
  canvas.dataset[INK_RENDERER_ACTIVE] = 'true';
  canvas.dataset[INK_RENDERER_STATUS] = 'active';

  return {
    render(frame: InkFieldFrame) {
      if (!isActive()) {
        return;
      }
      if (frame.progress <= 0.002 || frame.progress >= 0.999) {
        clearBoundaryFrameMark(canvas);
      } else {
        markBoundaryFrame(canvas, frame);
      }
      transition?.render(frame, 0, 0);
    },
    prewarm(frame: InkFieldFrame) {
      if (!isActive()) {
        return;
      }
      markBoundaryFrame(canvas, frame);
      transition?.prewarm(frame);
    },
    rebindGeneration(nextGeneration: string) {
      return isActive() && (canvas.dataset[INK_GENERATION] = generation = nextGeneration, true);
    },
    isActive,
    getFailure: () => failure,
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      canvas.removeEventListener?.('webglcontextlost', onContextLost);
      releaseTransition();
      if (matchesGeneration()) {
        canvas.dataset[INK_RENDERER_ACTIVE] = 'false';
        canvas.dataset[INK_RENDERER_STATUS] = 'disposed';
      }
      clearBoundaryFrameMark(canvas);
      if (lifecycle.removeCanvasOnDestroy !== false) {
        canvas.remove();
      }
    }
  };
}
