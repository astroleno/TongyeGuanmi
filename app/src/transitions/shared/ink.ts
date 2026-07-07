import { applyLayerVisibility, hiddenVisibility, holdVisibility, smoothStep } from '../../pilot/visibility';
import type {
  Direction,
  LayerVisibilityState,
  SegmentId,
  SegmentTimelineHandle,
  TransitionContext,
  TransitionModule
} from '../../story/types';

export type InkOrigin = {
  x: number;
  y: number;
};

export type InkSegmentOptions = {
  id: SegmentId;
  origin: InkOrigin;
  delayMs?: (() => number) | undefined;
  renderFrom?: (root: HTMLElement | null, progress: number) => void;
  renderFromProgress?: 'remaining' | 'forward';
  renderTo?: (root: HTMLElement | null, progress: number) => void;
  rootSelector?: (scene: string) => string;
  transitionAttr?: string;
  stops?: readonly number[];
  reportTimelineReadyAt?: number;
};

type InkSample = {
  from: LayerVisibilityState;
  to: LayerVisibilityState;
};

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function defaultRootSelector(scene: string): string {
  return `[data-r4-scene="${scene}"], [data-r3-scene="${scene}"]`;
}

function sceneRoot(element: HTMLElement | null | undefined, scene: string, selector = defaultRootSelector): HTMLElement | null {
  return element?.querySelector<HTMLElement>(selector(scene)) ?? element ?? null;
}

function sampleInk(progress: number): InkSample {
  const p = smoothStep(progress);
  if (p >= 0.999) {
    return {
      from: hiddenVisibility(),
      to: holdVisibility(false)
    };
  }
  if (p <= 0.001) {
    return {
      from: holdVisibility(false),
      to: hiddenVisibility()
    };
  }
  return {
    from: holdVisibility(false),
    to: holdVisibility(false)
  };
}

function ensureCanvas(container: HTMLElement | null, id: SegmentId, origin: InkOrigin): HTMLCanvasElement | null {
  if (!container) {
    return null;
  }
  const existing = container.querySelector<HTMLCanvasElement>(`:scope > canvas[data-r4-ink-segment="${id}"]`);
  if (existing) {
    return existing;
  }
  const canvas = document.createElement('canvas');
  canvas.className = 'r4-ink-transition-canvas';
  canvas.dataset.r4InkSegment = id;
  canvas.dataset.inkOriginX = origin.x.toFixed(3);
  canvas.dataset.inkOriginY = origin.y.toFixed(3);
  canvas.setAttribute('aria-hidden', 'true');
  container.append(canvas);
  return canvas;
}

function renderInkCanvas(canvas: HTMLCanvasElement | null, progress: number, origin: InkOrigin): void {
  if (!canvas) {
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 1.35);
  const width = Math.max(1, Math.round((rect.width || window.innerWidth || 1) * ratio));
  const height = Math.max(1, Math.round((rect.height || window.innerHeight || 1) * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }
  const p = smoothStep(progress);
  canvas.style.visibility = p > 0.002 && p < 0.998 ? 'visible' : 'hidden';
  canvas.style.opacity = p > 0.002 && p < 0.998 ? '1' : '0';
  context.clearRect(0, 0, width, height);
  if (p <= 0.002 || p >= 0.998) {
    return;
  }

  const cx = origin.x * width;
  const cy = origin.y * height;
  const corners = [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height]
  ] as const;
  const maxRadius = Math.max(...corners.map(([x, y]) => Math.hypot(x - cx, y - cy)));
  const radius = maxRadius * (0.04 + p * 1.06);
  const edge = Math.max(18 * ratio, radius * 0.035);
  const gradient = context.createRadialGradient(cx, cy, Math.max(0, radius - edge * 2.2), cx, cy, radius + edge);
  gradient.addColorStop(0, 'rgba(4, 8, 7, 0.72)');
  gradient.addColorStop(0.72, 'rgba(8, 18, 14, 0.46)');
  gradient.addColorStop(0.88, 'rgba(183, 91, 52, 0.22)');
  gradient.addColorStop(1, 'rgba(4, 8, 7, 0)');
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(cx, cy, radius + edge, 0, Math.PI * 2);
  context.fill();

  context.globalCompositeOperation = 'screen';
  context.fillStyle = 'rgba(232, 213, 154, 0.12)';
  for (let index = 0; index < 44; index += 1) {
    const angle = index * 2.399963 + p * 1.7;
    const distance = radius * (0.82 + ((index * 37) % 17) / 100);
    const dotRadius = (2 + ((index * 19) % 9)) * ratio * (1 - Math.abs(p - 0.5) * 0.7);
    context.beginPath();
    context.arc(cx + Math.cos(angle) * distance, cy + Math.sin(angle) * distance, dotRadius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalCompositeOperation = 'source-over';
}

function applyClip(element: HTMLElement | null, progress: number, origin: InkOrigin): void {
  if (!element) {
    return;
  }
  const p = smoothStep(progress);
  if (p <= 0.001) {
    element.style.clipPath = `circle(0% at ${(origin.x * 100).toFixed(2)}% ${(origin.y * 100).toFixed(2)}%)`;
    element.style.setProperty('-webkit-clip-path', element.style.clipPath);
    return;
  }
  if (p >= 0.999) {
    element.style.clipPath = '';
    element.style.removeProperty('-webkit-clip-path');
    return;
  }
  const rect = element.getBoundingClientRect();
  const width = Math.max(1, rect.width || window.innerWidth || 1);
  const height = Math.max(1, rect.height || window.innerHeight || 1);
  const cx = origin.x * width;
  const cy = origin.y * height;
  const radiusPx = Math.max(
    Math.hypot(cx, cy),
    Math.hypot(width - cx, cy),
    Math.hypot(cx, height - cy),
    Math.hypot(width - cx, height - cy)
  ) * (0.04 + p * 1.06);
  const clip = `circle(${radiusPx.toFixed(2)}px at ${(origin.x * 100).toFixed(2)}% ${(origin.y * 100).toFixed(2)}%)`;
  element.style.clipPath = clip;
  element.style.setProperty('-webkit-clip-path', clip);
}

class InkSegmentTimeline implements SegmentTimelineHandle {
  readonly labels: Readonly<Record<string, number>>;
  readonly pauses: readonly string[];

  private progressValue = 0;
  private disposed = false;
  private animationFrame = 0;
  private readonly canvas: HTMLCanvasElement | null;

  constructor(
    private readonly context: TransitionContext,
    private readonly options: InkSegmentOptions
  ) {
    const stops = options.stops ?? [];
    this.labels = Object.fromEntries([
      ['start', 0],
      ['ink', 0.5],
      ...stops.map((stop, index) => [`stage:${index}`, stop] as const),
      ['end', 1]
    ]);
    this.pauses = stops.map((_, index) => `stage:${index}`);
    this.canvas = ensureCanvas(context.to.element, options.id, options.origin);
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
    const sample = sampleInk(clamped);
    this.progressValue = clamped;
    applyLayerVisibility(this.context.from, sample.from);
    applyLayerVisibility(this.context.to, sample.to);
    this.context.to.element?.setAttribute('data-r4-transition', this.options.transitionAttr ?? this.options.id);
    this.context.to.element?.setAttribute('data-r4-ink-active', String(clamped > 0.002 && clamped < 0.998));
    applyClip(this.context.to.element, clamped, this.options.origin);
    renderInkCanvas(this.canvas, clamped, this.options.origin);
    const fromProgress = this.options.renderFromProgress === 'forward' ? clamped : 1 - clamped;
    this.options.renderFrom?.(sceneRoot(this.context.from.element, this.context.from.scene, this.options.rootSelector), fromProgress);
    this.options.renderTo?.(sceneRoot(this.context.to.element, this.context.to.scene, this.options.rootSelector), clamped);
    if (this.options.reportTimelineReadyAt !== undefined && clamped >= this.options.reportTimelineReadyAt) {
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

  sample(progress: number): InkSample {
    return sampleInk(clamp(progress));
  }

  dispose(): void {
    this.disposed = true;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }
    this.canvas?.remove();
    this.context.to.element?.style.removeProperty('clip-path');
    this.context.to.element?.style.removeProperty('-webkit-clip-path');
  }

  private animateTo(target: number): Promise<void> {
    const start = this.progressValue;
    const delta = target - start;
    const durationMs = this.context.prefersReducedMotion ? 0 : this.context.segment.virtualDuration;
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
        this.progress(start + delta * progress);
        if (progress >= 1) {
          resolve();
          return;
        }
        this.animationFrame = requestAnimationFrame(tick);
      };
      this.animationFrame = requestAnimationFrame(tick);
    });
  }
}

export function createInkSegmentTransition(options: InkSegmentOptions): TransitionModule {
  return {
    id: options.id,
    requiredMilestones: ['targetReady', 'buildReady'],
    reducedMotionFallback: (context) => {
      applyLayerVisibility(context.from, hiddenVisibility());
      applyLayerVisibility(context.to, holdVisibility(true));
      options.renderFrom?.(
        sceneRoot(context.from.element, context.from.scene, options.rootSelector),
        options.renderFromProgress === 'forward' ? 1 : 0
      );
      options.renderTo?.(sceneRoot(context.to.element, context.to.scene, options.rootSelector), 1);
    },
    buildTimeline: async (context) => {
      const delay = options.delayMs?.() ?? 0;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      return new InkSegmentTimeline(context, options);
    }
  };
}
