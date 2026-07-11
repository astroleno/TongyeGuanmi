const DPR_LIMIT = 0.625;
const SOURCE_SIZE = 1152;
const TAU = Math.PI * 2;
const FINAL_ROTATION = 120 * Math.PI / 180;
const OUTER_KALEIDOSCOPE_SEGMENTS = 16;
const MIN_RING_TEXTURE_SIZE = 320;
const MAX_RING_TEXTURE_SIZE = 512;
const STRUCTURAL_FRAME_INTERVAL_MS = 1000 / 24;

export const PATTERN_MOBILE_MAX_WIDTH = 760;
const DESKTOP_PATTERN_CENTER = Object.freeze({ x: 0.24, y: 0.55 });
const MOBILE_PATTERN_CENTER = Object.freeze({ x: 0.50, y: 0.58 });

export function patternCenterForViewport(viewportWidth: number): Readonly<{ x: number; y: number }> {
  return viewportWidth <= PATTERN_MOBILE_MAX_WIDTH
    ? MOBILE_PATTERN_CENTER
    : DESKTOP_PATTERN_CENTER;
}

export const PATTERN_BACKGROUND_IMAGE = new URL('../../../../assets/patterns/backgrounds/aged-mottled-background-16x9-4k.png', import.meta.url).href;

export const PATTERN_SOURCE_ART = {
  '02': new URL('../../../../assets/patterns/alpha-layers/pattern-layer-alpha-02.png', import.meta.url).href,
  '03': new URL('../../../../assets/patterns/alpha-layers/pattern-layer-alpha-03.png', import.meta.url).href,
  '04': new URL('../../../../assets/patterns/alpha-layers/pattern-layer-alpha-04.png', import.meta.url).href,
  '05': new URL('../../../../assets/patterns/alpha-layers/pattern-layer-alpha-05.png', import.meta.url).href,
  '06': new URL('../../../../assets/patterns/alpha-layers/pattern-layer-alpha-06.png', import.meta.url).href
} as const;

type LayerConfig = {
  id: '03' | '04';
  src: string;
  widthVmin: number;
  baseAngle: number;
  anchorX: number;
  anchorY: number;
  direction: number;
  duration: number;
  filter?: string;
};

type LoadedLayer = LayerConfig & {
  image: HTMLImageElement;
};

type BloomRing = {
  scale: number;
  endScale: number;
  rotation: number;
  spin: number;
  filter: string;
};

type RingCache = {
  canvas: HTMLCanvasElement;
  drawSize: number;
  rotationBase: number;
  spin: number;
};

type ObjectMetrics = {
  size: number;
  centerX: number;
  centerY: number;
};

export type PatternBloomSnapshot = {
  progress: number;
  centerXRatio: number;
  centerYRatio: number;
  mobileCenterXRatio: number;
  mobileCenterYRatio: number;
  fieldRotationDegrees: number;
  largestRingScale: number;
  compactRingScale: number;
};

const layerConfigs: readonly LayerConfig[] = [
  {
    id: '04',
    src: PATTERN_SOURCE_ART['04'],
    widthVmin: 1,
    baseAngle: 22.5,
    anchorX: 835.7,
    anchorY: 469.9,
    direction: 1,
    duration: 42,
    filter: 'brightness(0.86) contrast(1.06)'
  },
  {
    id: '03',
    src: PATTERN_SOURCE_ART['03'],
    widthVmin: 1.28,
    baseAngle: 0,
    anchorX: 834.3,
    anchorY: 476.8,
    direction: 1,
    duration: 42,
    filter: 'brightness(0.94) contrast(1.04)'
  }
];

const bloomRings: readonly BloomRing[] = [
  { scale: 4.86, endScale: 0.08, rotation: 11.25, spin: 1.34, filter: 'blur(8px) brightness(0.58) saturate(1.14) contrast(1.12)' },
  { scale: 4.04, endScale: 0.11, rotation: -22.5, spin: -1.18, filter: 'blur(6px) brightness(0.64) saturate(1.12) contrast(1.12)' },
  { scale: 3.16, endScale: 0.16, rotation: 0, spin: 1, filter: 'blur(4.25px) brightness(0.72) saturate(1.1) contrast(1.1)' },
  { scale: 2.38, endScale: 0.2, rotation: 22.5, spin: -0.84, filter: 'blur(2.6px) brightness(0.8) saturate(1.07) contrast(1.08)' },
  { scale: 1.74, endScale: 0.24, rotation: -11.25, spin: 0.72, filter: 'blur(1.25px) brightness(0.9) saturate(1.04) contrast(1.06)' },
  { scale: 1.24, endScale: 0.28, rotation: 11.25, spin: -0.58, filter: 'blur(0.35px) brightness(0.98) saturate(1.02) contrast(1.04)' }
];

const largestBloomRing = bloomRings[0] as BloomRing;
const compactBloomRing = bloomRings[bloomRings.length - 1] as BloomRing;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function interpolate(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const progress = clamp((value - edge0) / (edge1 - edge0));
  return progress * progress * (3 - 2 * progress);
}

function easeInOutCubic(value: number): number {
  const progress = clamp(value);
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function drawCenteredLayer(
  ctx: CanvasRenderingContext2D,
  layer: LoadedLayer,
  vmin: number,
  centerX: number,
  centerY: number,
  scale = 1,
  rotationOffset = 0
): void {
  if (!layer.widthVmin) {
    return;
  }
  const image = layer.image;
  const width = vmin * layer.widthVmin * scale;
  const height = width * (image.naturalHeight / image.naturalWidth);
  const imageScale = width / image.naturalWidth;
  const anchorX = (layer.anchorX ?? image.naturalWidth / 2) * imageScale;
  const anchorY = (layer.anchorY ?? image.naturalHeight / 2) * imageScale;
  const rotation = layer.baseAngle * Math.PI / 180 + rotationOffset;

  ctx.save();
  ctx.filter = layer.filter ?? 'none';
  ctx.translate(centerX, centerY);
  ctx.rotate(rotation);
  ctx.drawImage(image, -anchorX, -anchorY, width, height);
  ctx.restore();
}

export function patternBloomSnapshot(progress: number, rotationProgress = progress): PatternBloomSnapshot {
  const clamped = clamp(progress);
  const eased = easeInOutCubic(rotationProgress);
  const collapse = smoothstep(0.02, 1, clamped);
  const desktopCenter = patternCenterForViewport(PATTERN_MOBILE_MAX_WIDTH + 1);
  const mobileCenter = patternCenterForViewport(PATTERN_MOBILE_MAX_WIDTH);
  return {
    progress: clamped,
    centerXRatio: desktopCenter.x,
    centerYRatio: desktopCenter.y,
    mobileCenterXRatio: mobileCenter.x,
    mobileCenterYRatio: mobileCenter.y,
    fieldRotationDegrees: interpolate(120, 0, eased),
    largestRingScale: interpolate(largestBloomRing.scale, largestBloomRing.endScale, collapse),
    compactRingScale: interpolate(compactBloomRing.scale, compactBloomRing.endScale, collapse)
  };
}

export class PatternBloomRenderer {
  private readonly context: CanvasRenderingContext2D | null;
  private readonly petalCanvas = document.createElement('canvas');
  private readonly petalContext = this.petalCanvas.getContext('2d');
  private readonly ringCanvases = bloomRings.map(() => document.createElement('canvas'));
  private readonly ringWorkCanvas = document.createElement('canvas');
  private readonly ringWorkContext = this.ringWorkCanvas.getContext('2d');
  private width = 0;
  private height = 0;
  private dpr = 1;
  private textureSize = 0;
  private rafId = 0;
  private lastRenderedAt = -Infinity;
  private renderActive = false;
  private animateMotion = false;
  private framePending = false;
  private motionElapsedSeconds = 0;
  private motionStartedAt = 0;
  private progress = 1;
  private rotationProgress = 1;
  private layers: readonly LoadedLayer[] = [];
  private ringTextureSize = 0;
  private ringTextureIndex = 0;
  private frameRevision = 0;
  private destroyed = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.context = canvas.getContext('2d', { alpha: true });
  }

  async start(): Promise<void> {
    if (!this.context || !this.petalContext) {
      return;
    }

    const layers = await Promise.all(layerConfigs.map((layer) => loadImage(layer.src)));
    if (this.destroyed) {
      return;
    }

    this.layers = layerConfigs.map((layer, index) => {
      const image = layers[index];
      if (!image) {
        throw new Error(`Pattern bloom layer failed to load: ${layer.id}`);
      }
      return {
        ...layer,
        image
      };
    });
    this.buildSourceTexture();
    this.resize();
    this.requestRender();
  }

  setProgress(progress: number): void {
    const next = clamp(progress);
    if (Math.abs(next - this.progress) < 0.0001 && Math.abs(next - this.rotationProgress) < 0.0001) {
      return;
    }
    this.progress = next;
    this.rotationProgress = next;
    this.framePending = true;
    if (this.layers.length > 0 && this.renderActive) {
      this.requestRender();
    }
  }

  setFrameProgress(collapseProgress: number, rotationProgress = collapseProgress): void {
    const nextProgress = clamp(collapseProgress);
    const nextRotation = clamp(rotationProgress);
    if (Math.abs(nextProgress - this.progress) < 0.0001 && Math.abs(nextRotation - this.rotationProgress) < 0.0001) {
      return;
    }
    this.progress = nextProgress;
    this.rotationProgress = nextRotation;
    this.framePending = true;
    if (this.layers.length > 0 && this.renderActive) {
      this.requestRender();
    }
  }

  setMotionEnabled(enabled: boolean): void {
    this.setRenderActive(enabled, enabled);
  }

  setRenderActive(active: boolean, animate = active): void {
    if (this.destroyed) {
      return;
    }
    const nextAnimateMotion = active && animate;
    if (this.animateMotion && !nextAnimateMotion) {
      this.motionElapsedSeconds += Math.max(0, performance.now() - this.motionStartedAt) / 1000;
    } else if (!this.animateMotion && nextAnimateMotion) {
      this.motionStartedAt = performance.now();
    }
    const stateChanged = this.renderActive !== active || this.animateMotion !== nextAnimateMotion;
    this.renderActive = active;
    this.animateMotion = nextAnimateMotion;
    if (!stateChanged) {
      return;
    }
    if (active) {
      this.framePending = true;
      if (this.layers.length > 0) {
        this.requestRender();
      }
      return;
    }
    if (this.rafId) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  renderProgress(progress: number): void {
    this.progress = clamp(progress);
    this.rotationProgress = this.progress;
    const now = performance.now();
    this.renderFrame();
    this.lastRenderedAt = now;
  }

  destroy(): void {
    this.destroyed = true;
    if (this.rafId) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_LIMIT);
    const rect = this.canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, rect.width || window.innerWidth || 1);
    const cssHeight = Math.max(1, rect.height || window.innerHeight || 1);
    const width = Math.max(1, Math.round(cssWidth * dpr));
    const height = Math.max(1, Math.round(cssHeight * dpr));

    if (width !== this.width || height !== this.height || dpr !== this.dpr) {
      this.width = width;
      this.height = height;
      this.dpr = dpr;
      this.canvas.width = width;
      this.canvas.height = height;
    }

    const metrics = this.getObjectMetrics();
    const textureSize = Math.max(384, Math.min(720, Math.round(metrics.size)));
    if (textureSize !== this.textureSize) {
      this.textureSize = textureSize;
      this.ringTextureSize = 0;
      this.ringTextureIndex = 0;
    }
  }

  private getObjectMetrics(): ObjectMetrics {
    const center = patternCenterForViewport(this.width / this.dpr);
    const isMobile = this.width / this.dpr <= PATTERN_MOBILE_MAX_WIDTH;
    const vmin = Math.min(this.width, this.height);
    const displaySize = isMobile
      ? Math.min(vmin * 1.34, this.width * 1.12)
      : Math.min(vmin * 1.34, this.width * 0.96);
    return {
      size: displaySize,
      centerX: this.width * center.x,
      centerY: this.height * center.y
    };
  }

  private buildSourceTexture(): void {
    if (!this.petalContext) {
      return;
    }
    this.petalCanvas.width = SOURCE_SIZE;
    this.petalCanvas.height = SOURCE_SIZE;
    this.petalContext.clearRect(0, 0, SOURCE_SIZE, SOURCE_SIZE);

    for (const layer of this.layers) {
      drawCenteredLayer(this.petalContext, layer, SOURCE_SIZE, SOURCE_SIZE / 2, SOURCE_SIZE / 2, 0.9);
    }
    this.ringTextureSize = 0;
    this.ringTextureIndex = 0;
  }

  private scrubPhase(progress = this.rotationProgress): number {
    return clamp(progress) * 4.2;
  }

  private buildNextRingTexture(): void {
    if (!this.textureSize || this.ringTextureIndex >= bloomRings.length) {
      return;
    }
    const textureSize = Math.max(MIN_RING_TEXTURE_SIZE, Math.min(MAX_RING_TEXTURE_SIZE, Math.round(this.textureSize)));
    if (this.ringTextureSize !== textureSize) {
      this.ringTextureSize = textureSize;
      this.ringTextureIndex = 0;
    }
    const index = this.ringTextureIndex;
    const ring = bloomRings[index];
    const canvas = this.ringCanvases[index];
    const context = canvas?.getContext('2d');
    const workContext = this.ringWorkContext;
    this.ringTextureIndex += 1;
    if (!ring || !canvas || !context || !workContext) {
      return;
    }
    this.ringWorkCanvas.width = textureSize;
    this.ringWorkCanvas.height = textureSize;
    workContext.clearRect(0, 0, textureSize, textureSize);
    workContext.save();
    workContext.translate(textureSize / 2, textureSize / 2);
    this.drawOuterPetalKaleidoscope(workContext, textureSize, 0, 'none', 0, ring.spin);
    workContext.restore();
    canvas.width = textureSize;
    canvas.height = textureSize;
    context.clearRect(0, 0, textureSize, textureSize);
    context.save();
    context.filter = ring.filter;
    context.drawImage(this.ringWorkCanvas, 0, 0);
    context.restore();
  }

  private drawOuterPetalKaleidoscope(
    ctx: CanvasRenderingContext2D,
    drawSize: number,
    rotation: number,
    filter: string,
    phase: number,
    spin: number
  ): void {
    const wedge = TAU / OUTER_KALEIDOSCOPE_SEGMENTS;
    const radius = drawSize * 0.74;
    const sampleRotation = phase * 0.018 * spin;
    const sampleX = Math.cos(phase * 0.13 + spin) * drawSize * 0.012;
    const sampleY = Math.sin(phase * 0.11 - spin) * drawSize * 0.012;

    ctx.save();
    ctx.rotate(rotation);
    ctx.filter = filter;
    for (let index = 0; index < OUTER_KALEIDOSCOPE_SEGMENTS; index += 1) {
      ctx.save();
      ctx.rotate(index * wedge);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, -wedge / 2 - 0.003, wedge / 2 + 0.003);
      ctx.closePath();
      ctx.clip();
      if (index % 2 === 1) {
        ctx.scale(1, -1);
      }
      ctx.rotate(sampleRotation);
      ctx.drawImage(this.petalCanvas, -drawSize / 2 + sampleX, -drawSize / 2 + sampleY, drawSize, drawSize);
      ctx.restore();
    }
    ctx.restore();
  }

  private buildRingCache(progress: number, rotationProgress: number, metrics: ObjectMetrics): RingCache[] {
    const eased = easeInOutCubic(rotationProgress);
    const collapse = smoothstep(0.02, 1, progress);
    const fieldRotation = interpolate(FINAL_ROTATION, 0, eased);

    return bloomRings.flatMap((ring, index) => {
      const drawSize = metrics.size * interpolate(ring.scale, ring.endScale, collapse);
      const ringCanvas = this.ringCanvases[index];
      if (drawSize < 2 || !ringCanvas?.width || !ringCanvas.height) {
        return [];
      }
      return [{
        canvas: ringCanvas,
        drawSize,
        rotationBase: ring.rotation * Math.PI / 180 + fieldRotation * ring.spin,
        spin: ring.spin
      }];
    });
  }

  private drawPetalField(progress: number, rotationProgress: number, metrics: ObjectMetrics, phase: number): void {
    const context = this.context;
    if (!context) {
      return;
    }
    for (const ring of this.buildRingCache(progress, rotationProgress, metrics)) {
      const rotation = ring.rotationBase + phase * 0.028 * ring.spin;
      context.save();
      context.translate(metrics.centerX, metrics.centerY);
      context.rotate(rotation);
      context.drawImage(ring.canvas, -ring.drawSize / 2, -ring.drawSize / 2, ring.drawSize, ring.drawSize);
      context.restore();
    }
  }

  private motionPhase(now: number): number {
    const activeElapsed = this.animateMotion
      ? Math.max(0, now - this.motionStartedAt) / 1000
      : 0;
    return this.scrubPhase() + this.motionElapsedSeconds + activeElapsed;
  }

  private renderFrame(now = performance.now()): void {
    const context = this.context;
    if (!context || this.layers.length === 0) {
      return;
    }
    this.resize();
    const metrics = this.getObjectMetrics();
    const phase = this.motionPhase(now);
    context.clearRect(0, 0, this.width, this.height);
    this.drawPetalField(this.progress, this.rotationProgress, metrics, phase);
    this.frameRevision += 1;
    this.canvas.dataset.inkTextureReady = 'true';
    this.canvas.dataset.inkTextureRevision = String(this.frameRevision);
  }

  private requestRender(): void {
    if (this.destroyed || this.rafId) {
      return;
    }
    this.rafId = window.requestAnimationFrame((now) => {
      this.rafId = 0;
      const prewarming = this.ringTextureIndex < bloomRings.length;
      if (prewarming) {
        this.buildNextRingTexture();
      }
      const elapsed = now - this.lastRenderedAt;
      const structuralFrameDue = !Number.isFinite(this.lastRenderedAt) || elapsed >= STRUCTURAL_FRAME_INTERVAL_MS;
      const renderRequested = this.framePending || this.animateMotion;
      if (!prewarming && this.renderActive && renderRequested && structuralFrameDue) {
        this.renderFrame(now);
        this.framePending = false;
        this.lastRenderedAt = now;
      }
      if ((this.renderActive && (this.framePending || this.animateMotion)) || this.ringTextureIndex < bloomRings.length) {
        this.requestRender();
      }
    });
  }
}
