import { renderFigure2AnimationProgress, renderFigure2ProofTransitionProgress } from '../../scenes/figure2-animation';
import { renderProofOpeningProgress } from '../../scenes/figure2-proof-opening';
import { applyLayerVisibility, hiddenVisibility, holdVisibility, range01, smoothStep } from '../../pilot/visibility';
import type {
  Direction,
  LayerVisibilityState,
  SegmentTimelineHandle,
  TransitionContext,
  TransitionModule
} from '../../story/types';
import { createTransitionLayerElevation, type TransitionLayerElevation } from '../shared/layerElevation';
import { createSceneInkRenderer, mountTransitionInkCanvas, type SceneInkRenderer } from '../shared/sceneInk';
import { mediaPlaybackFor, requiredMilestonesFor } from '../../story/manifest';

const FIGURE2_DEPTH_IMAGE = new URL('../../../../assets/figure2-middle-depth.png', import.meta.url).href;
const FIGURE2_NEXT_WHITE_IMAGE = new URL('../../../../assets/figure2-next-white.png', import.meta.url).href;
export const FIGURE2_INTRO_END = 0.72;
export const FIGURE2_PROOF_REVEAL_START = FIGURE2_INTRO_END;
const PROOF_LAYER_SHOW_START = FIGURE2_PROOF_REVEAL_START;
const PROOF_INK_BRIGHTNESS_START = 0.62;
const PROOF_INK_BRIGHTNESS_END = 0.99;
const PROOF_INK_OPACITY_START = 0.24;
const PROOF_INK_OPACITY_END = 0.82;

type Figure2ProofSample = {
  from: LayerVisibilityState;
  to: LayerVisibilityState;
};

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function sceneRoot(element: HTMLElement | null | undefined, scene: string): HTMLElement | null {
  return element?.querySelector<HTMLElement>(`[data-r4-scene="${scene}"], [data-r3-scene="${scene}"]`) ?? element ?? null;
}

function sampleFigure2Proof(progress: number): Figure2ProofSample {
  const clamped = clamp(progress);
  if (clamped >= 0.999) {
    return { from: hiddenVisibility(), to: holdVisibility(false) };
  }
  if (clamped <= PROOF_LAYER_SHOW_START) {
    return { from: holdVisibility(false), to: hiddenVisibility() };
  }
  return { from: holdVisibility(false), to: holdVisibility(false) };
}

function sharedStageHost(context: TransitionContext): HTMLElement | null {
  const fromParent = context.from.element?.parentElement ?? null;
  const toParent = context.to.element?.parentElement ?? null;
  return fromParent && fromParent === toParent ? fromParent : toParent ?? fromParent ?? context.to.element ?? null;
}

type ProofOpeningSceneTexture = {
  canvas: HTMLCanvasElement;
  update(proofRoot: HTMLElement | null): void;
  destroy(): void;
};

function collectDocumentStyleText(): string {
  let styleText = '';
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      styleText += Array.from(sheet.cssRules).map((rule) => rule.cssText).join('\n');
    } catch {
      // Cross-origin stylesheets are not expected in the harness, but can be skipped safely.
    }
  }
  return styleText;
}

function imageFromSvg(svg: string): HTMLImageElement {
  const image = new Image();
  image.decoding = 'async';
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return image;
}

function cloneProofOpeningScene(proofRoot: HTMLElement, viewportWidth: number, viewportHeight: number): string {
  const clone = proofRoot.cloneNode(true) as HTMLElement;
  clone.style.setProperty('width', `${viewportWidth}px`);
  clone.style.setProperty('height', `${viewportHeight}px`);
  clone.style.setProperty('min-height', `${viewportHeight}px`);
  clone.style.setProperty('position', 'absolute');
  clone.style.setProperty('inset', '0');
  clone.style.setProperty('z-index', '30');
  clone.style.setProperty('--r4-proof-opening-progress', '1.0000');
  clone.style.setProperty('--r4-proof-opening-opacity', '1.0000');
  clone.style.setProperty('--r4-proof-opening-y', '0px');
  clone.style.setProperty('--r4-proof-overlay-opacity', '1.0000');
  clone.style.setProperty('--r4-proof-scroll-y', '0px');
  clone.removeAttribute('data-r4-proof-transition-active');
  clone.setAttribute('data-proof-opening-progress', '1.0000');
  clone.setAttribute('data-figure2-proof-overlay-progress', '1.0000');

  return `
    <div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:${viewportWidth}px;height:${viewportHeight}px;overflow:hidden;">
      <style><![CDATA[${collectDocumentStyleText()}]]></style>
      <div style="position:absolute;inset:0;z-index:30;">${clone.outerHTML}</div>
    </div>
  `;
}

function sampleCanvasAlpha(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D): number {
  if (!canvas.width || !canvas.height) {
    return 0;
  }
  const samplePoints = [
    [0.5, 0.5],
    [0.5, 0.42],
    [0.5, 0.58],
    [0.35, 0.5],
    [0.65, 0.5]
  ] as const;
  let alpha = 0;
  for (const [x, y] of samplePoints) {
    const pixel = context.getImageData(
      Math.min(canvas.width - 1, Math.max(0, Math.round(canvas.width * x))),
      Math.min(canvas.height - 1, Math.max(0, Math.round(canvas.height * y))),
      1,
      1
    ).data;
    alpha = Math.max(alpha, pixel[3] ?? 0);
  }
  return alpha;
}

function createProofOpeningSceneTexture(): ProofOpeningSceneTexture | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) {
    return null;
  }

  let width = 0;
  let height = 0;
  let disposed = false;
  let rebuildCount = 0;
  let pendingImage: HTMLImageElement | null = null;

  return {
    canvas,
    update(proofRoot) {
      if (disposed || !proofRoot) {
        return;
      }
      const viewportWidth = Math.max(1, window.innerWidth || 1);
      const viewportHeight = Math.max(1, window.innerHeight || 1);
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      const nextWidth = Math.round(viewportWidth * ratio);
      const nextHeight = Math.round(viewportHeight * ratio);
      const hasReadyTexture = canvas.dataset.inkTextureReady === 'true' || pendingImage !== null;
      if (nextWidth === width && nextHeight === height && hasReadyTexture) {
        return;
      }
      const markup = cloneProofOpeningScene(proofRoot, viewportWidth, viewportHeight);
      width = nextWidth;
      height = nextHeight;
      rebuildCount += 1;
      canvas.width = width;
      canvas.height = height;
      canvas.dataset.inkTextureReady = 'false';
      canvas.dataset.figure2ProofTextureAlpha = '0';
      canvas.dataset.figure2ProofTextureRebuildCount = String(rebuildCount);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, viewportWidth, viewportHeight);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${viewportWidth}" height="${viewportHeight}" viewBox="0 0 ${viewportWidth} ${viewportHeight}"><foreignObject width="100%" height="100%">${markup}</foreignObject></svg>`;
      const image = imageFromSvg(svg);
      pendingImage = image;
      image.onload = () => {
        if (disposed || pendingImage !== image) {
          return;
        }
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, viewportWidth, viewportHeight);
        context.drawImage(image, 0, 0, viewportWidth, viewportHeight);
        const alpha = sampleCanvasAlpha(canvas, context);
        pendingImage = null;
        canvas.dataset.inkTextureReady = 'true';
        canvas.dataset.figure2ProofTexture = 'proof-opening-dom-scene';
        canvas.dataset.figure2ProofTextureAlpha = alpha.toFixed(0);
      };
      image.onerror = () => {
        if (pendingImage === image) {
          pendingImage = null;
        }
      };
    },
    destroy() {
      disposed = true;
      pendingImage = null;
      canvas.dataset.inkTextureReady = 'false';
    }
  };
}

function ensureFigureMaskCanvas(fromRoot: HTMLElement | null): HTMLCanvasElement | null {
  const figureGroup = fromRoot?.querySelector<HTMLElement>('.r4-figure2__figures') ?? null;
  if (!figureGroup || typeof document === 'undefined') {
    return null;
  }
  const existing = figureGroup.querySelector<HTMLCanvasElement>(':scope > canvas[data-r4-figure2-mask-canvas="true"]');
  if (existing) {
    return existing;
  }
  const canvas = document.createElement('canvas');
  canvas.className = 'r4-figure2__figure-mask-canvas';
  canvas.dataset.r4Figure2MaskCanvas = 'true';
  canvas.dataset.inkTextureReady = 'false';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.position = 'absolute';
  canvas.style.inset = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.opacity = '0';
  canvas.style.pointerEvents = 'none';
  figureGroup.append(canvas);
  return canvas;
}

function updateFigureMaskCanvas(canvas: HTMLCanvasElement | null, fromRoot: HTMLElement | null, inkProgress: number): void {
  const figureGroup = fromRoot?.querySelector<HTMLElement>('.r4-figure2__figures') ?? null;
  const context = canvas?.getContext('2d', { alpha: true }) ?? null;
  if (!canvas || !context || !figureGroup || inkProgress <= 0.001) {
    if (canvas) {
      canvas.dataset.inkTextureReady = 'false';
    }
    return;
  }

  const groupRect = figureGroup.getBoundingClientRect();
  if (groupRect.width <= 0 || groupRect.height <= 0) {
    canvas.dataset.inkTextureReady = 'false';
    return;
  }
  const ratio = Math.min(window.devicePixelRatio || 1, 1.35);
  const width = Math.max(1, Math.round(groupRect.width * ratio));
  const height = Math.max(1, Math.round(groupRect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  context.clearRect(0, 0, width, height);
  let drewFrame = false;

  for (const video of fromRoot?.querySelectorAll<HTMLVideoElement>('[data-figure2-video]') ?? []) {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
      continue;
    }
    const rect = video.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      continue;
    }
    try {
      context.drawImage(
        video,
        (rect.left - groupRect.left) * ratio,
        (rect.top - groupRect.top) * ratio,
        rect.width * ratio,
        rect.height * ratio
      );
      drewFrame = true;
    } catch {
      // Video buffers can miss a decoded frame while the browser swaps data.
    }
  }

  canvas.dataset.inkTextureReady = drewFrame ? 'true' : 'false';
}

export function figure2ProofRevealProgress(progress: number): number {
  const transitionProgress = range01(progress, FIGURE2_INTRO_END, 1);
  return smoothStep(range01(transitionProgress, 0.10, 0.94));
}

export function figure2ProofSourceExitProgress(revealProgress: number): number {
  return smoothStep(range01(revealProgress, 0.82, 1));
}

export function figure2ProofCopyProgress(revealProgress: number): number {
  return figure2ProofSourceExitProgress(revealProgress) >= 0.999 ? 1 : 0;
}

export function figure2ProofInkSceneBrightness(revealProgress: number): number {
  return 0.50 + smoothStep(range01(revealProgress, PROOF_INK_BRIGHTNESS_START, PROOF_INK_BRIGHTNESS_END)) * 0.16;
}

export function figure2ProofInkCanvasOpacity(revealProgress: number): number {
  const entranceOpacity = 0.34 + smoothStep(range01(revealProgress, PROOF_INK_OPACITY_START, PROOF_INK_OPACITY_END)) * 0.42;
  const exitFade = 1 - smoothStep(range01(revealProgress, 0.86, 0.97));
  return entranceOpacity * exitFade;
}

export function figure2IntroProgress(progress: number): number {
  return range01(progress, 0, FIGURE2_INTRO_END);
}

export function figure2ProofTransitionProgress(progress: number): number {
  return range01(progress, FIGURE2_INTRO_END, 1);
}

export function figure2VideoModeForProofTransition(
  transitionProgress: number,
  direction: Direction = 1
): 'native' | 'seek' | 'none' {
  if (direction === -1) {
    return 'none';
  }
  if (transitionProgress > 0.001) {
    return 'none';
  }
  return 'native';
}

class Figure2DistanceExpandTimeline implements SegmentTimelineHandle {
  readonly labels: Readonly<Record<string, number>> = { start: 0, 'stage:0': FIGURE2_INTRO_END, reveal: PROOF_LAYER_SHOW_START, end: 1 };
  readonly pauses: readonly string[] = ['stage:0'];

  private progressValue = 0;
  private playbackDirection: Direction;
  private disposed = false;
  private animationFrame = 0;
  private reportedTimelineReady = false;
  private readonly inkCanvas: HTMLCanvasElement | null;
  private readonly inkRenderer: SceneInkRenderer | null;
  private readonly elevation: TransitionLayerElevation;
  private readonly proofTexture: ProofOpeningSceneTexture | null;
  private readonly figureMaskCanvas: HTMLCanvasElement | null;

  constructor(private readonly context: TransitionContext) {
    this.playbackDirection = context.direction;
    const fromRoot = sceneRoot(context.from.element, 'figure2-animation');
    const proofRoot = sceneRoot(context.to.element, 'figure2-proof-opening');
    this.elevation = createTransitionLayerElevation(context.to.element);
    this.proofTexture = createProofOpeningSceneTexture();
    this.proofTexture?.update(proofRoot);
    this.figureMaskCanvas = ensureFigureMaskCanvas(fromRoot);
    this.inkCanvas = mountTransitionInkCanvas(sharedStageHost(context), 'figure2-distance-expand', {
      renderer: 'scene',
      origin: { x: 0.5, y: 0.52 },
      preset: 'cinematic-color',
      className: 'r4-figure2-proof-ink-canvas'
    });
    if (this.inkCanvas) {
      this.inkCanvas.dataset.figure2ProofInkRenderer = 'scene';
    }
    this.inkRenderer = createSceneInkRenderer(this.inkCanvas, {
      assets: {
        nextSceneSrc: FIGURE2_NEXT_WHITE_IMAGE,
        backDepthSrc: FIGURE2_DEPTH_IMAGE,
        middleDepthSrc: FIGURE2_DEPTH_IMAGE
      },
      targetSrc: FIGURE2_NEXT_WHITE_IMAGE,
      nextSceneElement: this.proofTexture?.canvas ?? null,
      figureMaskElement: this.figureMaskCanvas,
      hideAtEnd: true,
      progressSpan: 1,
      depthThresholdMode: true,
      perlinOverlay: false,
      perlinStrength: 0,
      sceneBrightness: 1,
      inkCenterX: 0.5,
      inkCenterY: 0.52
    });
    proofRoot?.setAttribute('data-figure2-proof-ink-renderer', 'scene');
    proofRoot?.setAttribute('data-figure2-proof-ink-target', 'proof-opening-dom-scene');
    this.inkRenderer?.prewarm();
    this.progress(0);
  }

  play(): Promise<void> {
    return this.animateTo(1);
  }

  reverse(): Promise<void> {
    return this.animateTo(0);
  }

  progress(value: number): void {
    if (this.disposed) {
      return;
    }
    const clamped = clamp(value);
    if (clamped > this.progressValue + 0.0001) {
      this.playbackDirection = 1;
    } else if (clamped < this.progressValue - 0.0001) {
      this.playbackDirection = -1;
    }
    const intro = figure2IntroProgress(clamped);
    const transition = figure2ProofTransitionProgress(clamped);
    const reveal = figure2ProofRevealProgress(clamped);
    const overlayOpacity = smoothStep(range01(reveal, 0.56, 0.95));
    const sample = sampleFigure2Proof(clamped);
    this.progressValue = clamped;
    applyLayerVisibility(this.context.from, sample.from);
    applyLayerVisibility(this.context.to, sample.to);
    this.elevation.elevate();
    this.render(intro, transition, reveal, overlayOpacity);
    if (!this.reportedTimelineReady && clamped >= 0.5) {
      this.reportedTimelineReady = true;
      this.context.reportMilestone({
        key: 'timelineReady',
        segment: this.context.segment.id,
        runId: this.context.runId,
        direction: this.context.direction,
        progress: clamped
      });
    }
  }

  jumpToEnd(direction: Direction): void {
    this.progress(direction === 1 ? 1 : 0);
  }

  sample(progress: number): Figure2ProofSample {
    return sampleFigure2Proof(progress);
  }

  dispose(): void {
    this.disposed = true;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }
    this.inkRenderer?.destroy();
    this.inkCanvas?.remove();
    this.proofTexture?.destroy();
    this.figureMaskCanvas?.remove();
    this.elevation.restore();
    this.context.to.element?.style.removeProperty('clip-path');
    this.context.to.element?.style.removeProperty('-webkit-clip-path');
    const toRoot = sceneRoot(this.context.to.element, 'figure2-proof-opening');
    toRoot?.removeAttribute('data-r4-proof-transition-active');
  }

  private render(intro: number, transition: number, reveal: number, overlayOpacity: number): void {
    const fromRoot = sceneRoot(this.context.from.element, 'figure2-animation');
    const toRoot = sceneRoot(this.context.to.element, 'figure2-proof-opening');
    const active = reveal > 0.002 && reveal < 0.998;
    const sceneBrightness = figure2ProofInkSceneBrightness(reveal);
    const reportedSceneBrightness = active ? sceneBrightness : reveal >= 0.998 ? 1 : sceneBrightness;
    const inkCanvasOpacity = figure2ProofInkCanvasOpacity(reveal);
    const sourceExitProgress = figure2ProofSourceExitProgress(reveal);
    renderFigure2AnimationProgress(fromRoot, intro, {
      proofProgress: sourceExitProgress,
      videoMode: figure2VideoModeForProofTransition(transition, this.playbackDirection)
    });
    this.proofTexture?.update(toRoot);
    updateFigureMaskCanvas(this.figureMaskCanvas, fromRoot, reveal);
    const textureCanvas = this.proofTexture?.canvas ?? null;
    const textureReady = textureCanvas?.dataset.inkTextureReady === 'true'
      && Number.parseFloat(textureCanvas.dataset.figure2ProofTextureAlpha ?? '0') > 0;
    if (this.inkCanvas && textureCanvas) {
      this.inkCanvas.dataset.inkTextureReady = textureCanvas.dataset.inkTextureReady ?? 'false';
      this.inkCanvas.dataset.figure2ProofTextureAlpha = textureCanvas.dataset.figure2ProofTextureAlpha ?? '0';
      this.inkCanvas.dataset.figure2ProofTextureRebuildCount = textureCanvas.dataset.figure2ProofTextureRebuildCount ?? '0';
      this.inkCanvas.dataset.figure2ProofTexture = textureCanvas.dataset.figure2ProofTexture ?? '';
    }
    const effectiveActive = active && textureReady;
    const copyReveal = reveal >= 0.998 ? 1 : figure2ProofCopyProgress(reveal);
    renderProofOpeningProgress(toRoot, copyReveal);
    toRoot?.style.setProperty('--r4-proof-overlay-opacity', overlayOpacity.toFixed(4));
    toRoot?.style.setProperty('--r4-proof-reveal-stop', `${(-12 + reveal * 122).toFixed(2)}%`);
    toRoot?.style.setProperty('--r4-proof-reveal-edge', `${(2 + reveal * 132).toFixed(2)}%`);
    toRoot?.setAttribute('data-figure2-proof-overlay-progress', reveal.toFixed(4));
    toRoot?.setAttribute('data-figure2-proof-copy-progress', copyReveal.toFixed(4));
    toRoot?.setAttribute('data-figure2-proof-scene-brightness', reportedSceneBrightness.toFixed(4));
    toRoot?.setAttribute('data-figure2-proof-ink-canvas-opacity', inkCanvasOpacity.toFixed(4));
    toRoot?.setAttribute('data-figure2-proof-reveal-stop', `${(-12 + reveal * 122).toFixed(2)}%`);
    toRoot?.setAttribute('data-figure2-retained-arch', 'true');
    if (effectiveActive) {
      toRoot?.setAttribute('data-r4-proof-transition-active', 'true');
    } else {
      toRoot?.removeAttribute('data-r4-proof-transition-active');
    }
    this.context.to.element?.setAttribute('data-r4-transition', 'figure2-proof-overlay-scene-ink');
    this.context.to.element?.setAttribute('data-r4-ink-active', String(effectiveActive));
    this.context.to.element?.setAttribute('data-r4-ink-progress', reveal.toFixed(4));
    this.context.to.element?.setAttribute('data-r4-clip-progress', reveal.toFixed(4));
    this.context.to.element?.setAttribute('data-figure2-intro-progress', intro.toFixed(4));
    this.context.to.element?.setAttribute('data-figure2-proof-transition-progress', transition.toFixed(4));
    this.context.to.element?.setAttribute('data-figure2-proof-source-exit-progress', sourceExitProgress.toFixed(4));
    this.context.to.element?.setAttribute('data-figure2-proof-ink-renderer', 'scene');
    this.context.to.element?.setAttribute('data-figure2-proof-ink-target', 'proof-opening-dom-scene');
    this.context.to.element?.setAttribute('data-figure2-proof-texture-ready-gate', String(textureReady));
    this.context.to.element?.setAttribute('data-figure2-proof-texture-alpha', textureCanvas?.dataset.figure2ProofTextureAlpha ?? '0');
    toRoot?.setAttribute('data-r4-transition', 'figure2-proof-overlay-scene-ink');
    toRoot?.setAttribute('data-r4-ink-active', String(effectiveActive));
    toRoot?.setAttribute('data-r4-ink-progress', reveal.toFixed(4));
    toRoot?.setAttribute('data-figure2-intro-progress', intro.toFixed(4));
    toRoot?.setAttribute('data-figure2-proof-transition-progress', transition.toFixed(4));
    toRoot?.setAttribute('data-figure2-proof-source-exit-progress', sourceExitProgress.toFixed(4));
    toRoot?.setAttribute('data-figure2-proof-ink-renderer', 'scene');
    toRoot?.setAttribute('data-figure2-proof-ink-target', 'proof-opening-dom-scene');
    toRoot?.setAttribute('data-figure2-proof-texture-ready-gate', String(textureReady));
    toRoot?.setAttribute('data-figure2-proof-texture-alpha', textureCanvas?.dataset.figure2ProofTextureAlpha ?? '0');
    this.inkRenderer?.render(reveal, effectiveActive ? reveal : 0, { sceneBrightness, perlinStrength: 0 });
    if (this.inkCanvas) {
      this.inkCanvas.dataset.r4InkActive = String(effectiveActive);
      this.inkCanvas.dataset.r4InkProgress = reveal.toFixed(4);
      if (effectiveActive) {
        this.inkCanvas.style.opacity = inkCanvasOpacity.toFixed(4);
      } else {
        this.inkCanvas.style.opacity = '0';
      }
      this.inkCanvas.dataset.figure2InkCanvasOpacity = effectiveActive ? inkCanvasOpacity.toFixed(4) : '0.0000';
    }
  }

  private animateTo(target: number): Promise<void> {
    const start = this.progressValue;
    const delta = target - start;
    const stagedPlayback = this.stagedPlaybackFor(start, target);
    const durationMs = this.context.prefersReducedMotion ? 0 : stagedPlayback.durationMs;
    if (delta === 0 || durationMs <= 0) {
      this.progress(target);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const startedAt = performance.now();
      const tick = (now: number) => {
        if (this.disposed) {
          resolve();
          return;
        }
        const elapsed = now - startedAt;
        const progress = Math.min(1, elapsed / durationMs);
        this.progress(stagedPlayback.progressAt(progress));
        if (progress >= 1) {
          resolve();
          return;
        }
        this.animationFrame = requestAnimationFrame(tick);
      };
      this.animationFrame = requestAnimationFrame(tick);
    });
  }

  private stagedPlaybackFor(start: number, target: number): { durationMs: number; progressAt: (elapsedRatio: number) => number } {
    const policy = this.context.segment.policy;
    if (policy.kind !== 'stagedSnap' || policy.stops.length === 0 || policy.playMs.length < 2) {
      const durationMs = this.context.segment.virtualDuration;
      return {
        durationMs,
        progressAt: (elapsedRatio) => start + (target - start) * elapsedRatio
      };
    }

    const stop = clamp(policy.stops[0] ?? FIGURE2_INTRO_END);
    const firstMs = Math.max(0, policy.playMs[0] ?? this.context.segment.virtualDuration * stop);
    const secondMs = Math.max(0, policy.playMs[1] ?? this.context.segment.virtualDuration * (1 - stop));
    const totalMs = firstMs + secondMs;
    if (totalMs <= 0 || Math.abs(start - target) < 0.001) {
      return {
        durationMs: 0,
        progressAt: () => target
      };
    }

    const fullForward = start <= 0.001 && target >= 0.999;
    const fullReverse = start >= 0.999 && target <= 0.001;
    if (!fullForward && !fullReverse) {
      return {
        durationMs: this.context.segment.virtualDuration,
        progressAt: (elapsedRatio) => start + (target - start) * elapsedRatio
      };
    }

    return {
      durationMs: totalMs,
      progressAt: (elapsedRatio) => {
        const elapsedMs = Math.min(totalMs, Math.max(0, elapsedRatio * totalMs));
        if (fullForward) {
          if (elapsedMs <= firstMs) {
            return stop * (elapsedMs / Math.max(1, firstMs));
          }
          return stop + (1 - stop) * ((elapsedMs - firstMs) / Math.max(1, secondMs));
        }
        if (elapsedMs <= secondMs) {
          return 1 - (1 - stop) * (elapsedMs / Math.max(1, secondMs));
        }
        return stop * (1 - ((elapsedMs - secondMs) / Math.max(1, firstMs)));
      }
    };
  }
}

export function createFigure2DistanceExpandTransition(options: { delayMs?: () => number } = {}): TransitionModule {
  return {
    id: 'figure2-distance-expand',
    requiredMilestones: requiredMilestonesFor('figure2-distance-expand'),
    mediaPlayback: mediaPlaybackFor('figure2-distance-expand') ?? [],
    reducedMotionFallback: (context) => {
      applyLayerVisibility(context.from, hiddenVisibility());
      applyLayerVisibility(context.to, holdVisibility(true));
      renderFigure2ProofTransitionProgress(sceneRoot(context.from.element, 'figure2-animation'), 1);
      renderProofOpeningProgress(sceneRoot(context.to.element, 'figure2-proof-opening'), 1);
      context.reportMilestone({
        key: 'timelineReady',
        segment: context.segment.id,
        runId: context.runId,
        direction: context.direction,
        progress: 1
      });
    },
    buildTimeline: async (context) => {
      const delay = options.delayMs?.() ?? 0;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      return new Figure2DistanceExpandTimeline(context);
    }
  };
}

export const figure2DistanceExpandTransition = createFigure2DistanceExpandTransition();
