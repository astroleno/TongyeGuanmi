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
    super(`Ink renderer ${failure.reason} for ${segmentId} (${failure.generation})`);
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
  grade?: InkGradePreset;
  generation?: string;
  onInvalidated?: (failure: InkRendererFailure) => void;
}>;

export type TransitionInkCanvasOptions = {
  renderer: 'field';
  grade?: InkGradePreset;
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

function markGradePreset(
  canvas: HTMLCanvasElement,
  renderer: TransitionInkCanvasOptions['renderer'],
  grade: InkGradePreset,
  options: InkBoundaryTransitionOptions,
  generation: string
): void {
  canvas.dataset.r4InkPreset = grade;
  canvas.dataset.r4InkGrade = grade;
  canvas.dataset.r4InkPresetApplied = 'true';
  canvas.dataset.r4InkParticleProfile = 'jade-gold';
  canvas.dataset.r4InkRenderer = renderer;
  canvas.dataset.r4InkColorLift = (options.colorLift ?? 0).toFixed(3);
  canvas.dataset.r4InkCoverAlpha = (options.coverAlpha ?? 0).toFixed(3);
  canvas.dataset.r4InkDprLimit = (options.dprLimit ?? 1).toFixed(2);
  canvas.dataset.r4InkGeneration = generation;
}

function markBoundaryFrame(canvas: HTMLCanvasElement, frame: InkFieldFrame): void {
  const origin = inkFieldOrigin(frame.spec);
  canvas.dataset.r4InkBoundaryKind = frame.spec.kind;
  canvas.dataset.r4InkBoundaryOrigin = `${origin.x.toFixed(4)},${origin.y.toFixed(4)}`;
  canvas.dataset.r4InkBoundaryProgress = frame.progress.toFixed(4);
  canvas.dataset.r4InkFieldSeed = String(frame.seed);
  if (frame.spec.kind === 'horizontal' && 'revision' in frame) {
    markHorizontalInkDiagnostics(canvas, frame);
  } else {
    clearHorizontalInkDiagnostics(canvas);
  }
}

function clearBoundaryFrameMark(canvas: HTMLCanvasElement): void {
  delete canvas.dataset.r4InkBoundaryKind;
  delete canvas.dataset.r4InkBoundaryOrigin;
  delete canvas.dataset.r4InkBoundaryProgress;
  delete canvas.dataset.r4InkFieldSeed;
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
  options: TransitionInkCanvasOptions
): HTMLCanvasElement | null {
  if (!host) {
    return null;
  }
  const documentRef = typeof host.ownerDocument?.createElement === 'function'
    ? host.ownerDocument
    : typeof document === 'undefined'
      ? null
      : document;
  if (!documentRef) {
    return null;
  }
  const canvas = documentRef.createElement('canvas');
  const grade = options.grade ?? 'edge-only';
  canvas.className = ['r4-ink-transition-canvas', options.className ?? '']
    .filter(Boolean)
    .join(' ');
  canvas.dataset.r4InkSegment = segmentId;
  canvas.dataset.r4InkEffectOnly = 'true';
  canvas.dataset.r4InkRenderer = options.renderer;
  canvas.dataset.r4InkPreset = grade;
  canvas.dataset.r4InkGrade = grade;
  canvas.dataset.r4InkGeneration = options.generation ?? 'unscoped';
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
  const generation = lifecycle.generation ?? canvas?.dataset.r4InkGeneration ?? 'unscoped';
  if (canvas) {
    markGradePreset(canvas, 'field', grade, resolvedOptions, generation);
  }
  let transition: InkBoundaryTransition | null = null;
  try {
    transition = createInkBoundaryTransition(canvas, resolvedOptions);
  } catch {
    transition = null;
  }
  if (!canvas || !transition) {
    if (canvas) {
      canvas.dataset.r4InkRendererActive = 'false';
      canvas.dataset.r4InkRendererStatus = 'unavailable';
    }
    lifecycle.onInvalidated?.({ generation, reason: 'unavailable' });
    return null;
  }

  let destroyed = false;
  let invalidated = false;
  let transitionDestroyed = false;
  let failure: InkRendererFailure | null = null;
  const matchesGeneration = () => canvas.dataset.r4InkGeneration === generation;
  const releaseTransition = () => {
    if (transitionDestroyed) {
      return;
    }
    transitionDestroyed = true;
    const activeTransition = transition;
    transition = null;
    activeTransition?.destroy();
  };
  const invalidate = (reason: Exclude<InkRendererFailureReason, 'unavailable'>) => {
    if (destroyed || invalidated) {
      return;
    }
    invalidated = true;
    failure = Object.freeze({ generation, reason });
    canvas.dataset.r4InkRendererActive = 'false';
    canvas.dataset.r4InkRendererStatus = reason;
    releaseTransition();
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
  canvas.dataset.r4InkRendererActive = 'true';
  canvas.dataset.r4InkRendererStatus = 'active';

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
        canvas.dataset.r4InkRendererActive = 'false';
        canvas.dataset.r4InkRendererStatus = 'disposed';
      }
      clearBoundaryFrameMark(canvas);
      if (lifecycle.removeCanvasOnDestroy !== false) {
        canvas.remove();
      }
    }
  };
}
