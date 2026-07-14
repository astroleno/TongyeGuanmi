const DPR_LIMIT = 1;
const SOURCE_SIZE = 1152;
const TAU = Math.PI * 2;
const FINAL_ROTATION = 120 * Math.PI / 180;
const SOURCE_FLOWER_SCALE = 0.702;
const OUTER_KALEIDOSCOPE_SEGMENTS = 16;
const MIN_FLOWER_TEXTURE_SIZE = 640;
const MAX_FLOWER_TEXTURE_SIZE = 1180;
const MIN_RING_CACHE_SIZE = 320;
const MAX_RING_CACHE_SIZE = 1180;
const PATTERN_STRUCTURAL_PHASE = 4.2;
const STRUCTURAL_FRAME_INTERVAL_MS = 1000 / 24;

export const PATTERN_MOBILE_MAX_WIDTH = 760;
const DESKTOP_PATTERN_CENTER = Object.freeze({ x: 0.24, y: 0.55 });
const MOBILE_PATTERN_CENTER = Object.freeze({ x: 0.50, y: 0.58 });

export function patternCenterForViewport(viewportWidth: number): Readonly<{ x: number; y: number }> {
  return viewportWidth <= PATTERN_MOBILE_MAX_WIDTH
    ? MOBILE_PATTERN_CENTER
    : DESKTOP_PATTERN_CENTER;
}

export type PatternObjectMetrics = Readonly<{
  size: number;
  centerX: number;
  centerY: number;
}>;

export function patternObjectMetricsForViewport(
  width: number,
  height: number
): PatternObjectMetrics {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const center = patternCenterForViewport(safeWidth);
  const mobile = safeWidth <= PATTERN_MOBILE_MAX_WIDTH;
  const vmin = Math.min(safeWidth, safeHeight);
  const size = mobile
    ? Math.min(vmin * 1.34, safeWidth * 1.12)
    : Math.min(vmin * 1.34, safeWidth * 0.96);
  return {
    size,
    centerX: safeWidth * center.x,
    centerY: safeHeight * center.y
  };
}

export function patternFramePhases(
  collapseProgress: number,
  motionSeconds: number
): Readonly<{ ringStructuralPhase: number; liveMotionPhase: number }> {
  return {
    ringStructuralPhase: clamp(collapseProgress) * PATTERN_STRUCTURAL_PHASE,
    liveMotionPhase: Math.max(0, motionSeconds)
  };
}

export const PATTERN_BACKGROUND_IMAGE = new URL('../../../../assets/pattern-background.webp', import.meta.url).href;

export const PATTERN_SOURCE_ART = {
  '02': new URL('../../../../assets/patterns/alpha-layers/pattern-layer-alpha-02.webp', import.meta.url).href,
  '03': new URL('../../../../assets/patterns/alpha-layers/pattern-layer-alpha-03.webp', import.meta.url).href,
  '04': new URL('../../../../assets/patterns/alpha-layers/pattern-layer-alpha-04.webp', import.meta.url).href,
  '05': new URL('../../../../assets/patterns/alpha-layers/pattern-layer-alpha-05.webp', import.meta.url).href,
  '06': new URL('../../../../assets/patterns/alpha-layers/pattern-layer-alpha-06.webp', import.meta.url).href
} as const;

type PatternLayerId = keyof typeof PATTERN_SOURCE_ART;

type LayerConfig = {
  id: PatternLayerId;
  src: string;
  role: 'decor' | 'petal';
  widthVmin?: number;
  sizeRatio?: number;
  offsetX?: number;
  offsetY?: number;
  baseAngle: number;
  anchorX?: number;
  anchorY?: number;
  direction: number;
  duration: number;
  sourceScale?: number;
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
  startCanvas: HTMLCanvasElement;
  endCanvas: HTMLCanvasElement;
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
    id: '06',
    src: PATTERN_SOURCE_ART['06'],
    role: 'decor',
    sizeRatio: 1.12,
    offsetX: 0,
    offsetY: -0.03,
    baseAngle: -5,
    direction: 1,
    duration: 110
  },
  {
    id: '05',
    src: PATTERN_SOURCE_ART['05'],
    role: 'decor',
    sizeRatio: 0.66,
    offsetX: 0.03,
    offsetY: -0.02,
    baseAngle: 0,
    direction: 1,
    duration: 96
  },
  {
    id: '04',
    src: PATTERN_SOURCE_ART['04'],
    role: 'petal',
    widthVmin: 1,
    baseAngle: 22.5,
    anchorX: 835.7,
    anchorY: 469.9,
    direction: -1,
    duration: 42,
    filter: 'brightness(0.86) contrast(1.06)'
  },
  {
    id: '03',
    src: PATTERN_SOURCE_ART['03'],
    role: 'petal',
    widthVmin: 1.28,
    baseAngle: 0,
    anchorX: 834.3,
    anchorY: 476.8,
    direction: 1,
    duration: 42,
    filter: 'brightness(0.94) contrast(1.04)'
  },
  {
    id: '02',
    src: PATTERN_SOURCE_ART['02'],
    role: 'petal',
    widthVmin: 1,
    baseAngle: 0,
    anchorX: 835.1,
    anchorY: 463.8,
    direction: -1,
    duration: 76,
    sourceScale: 1.04,
    filter: 'brightness(0.92) contrast(1.08)'
  }
];

export function patternLayerIds(): readonly PatternLayerId[] {
  return layerConfigs.map((layer) => layer.id);
}

export function patternLayerDirections(): Readonly<Record<'02' | '03' | '04', number>> {
  return {
    '02': layerConfigs.find((layer) => layer.id === '02')?.direction ?? 0,
    '03': layerConfigs.find((layer) => layer.id === '03')?.direction ?? 0,
    '04': layerConfigs.find((layer) => layer.id === '04')?.direction ?? 0
  };
}

export function patternSourceFlowerScale(): number {
  return SOURCE_FLOWER_SCALE;
}

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
  if (progress <= 0) return from;
  if (progress >= 1) return to;
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

let patternLayerImagesPromise: Promise<readonly HTMLImageElement[]> | undefined;
let patternBackgroundPromise: Promise<HTMLImageElement> | undefined;

function loadPatternLayerImages(): Promise<readonly HTMLImageElement[]> {
  if (!patternLayerImagesPromise) {
    const promise = Promise.all(layerConfigs.map((layer) => loadImage(layer.src)));
    patternLayerImagesPromise = promise;
    void promise.catch(() => {
      if (patternLayerImagesPromise === promise) {
        patternLayerImagesPromise = undefined;
      }
    });
  }
  return patternLayerImagesPromise;
}

export async function preloadPatternAssets(): Promise<void> {
  if (!patternBackgroundPromise) {
    const promise = loadImage(PATTERN_BACKGROUND_IMAGE);
    patternBackgroundPromise = promise;
    void promise.catch(() => {
      if (patternBackgroundPromise === promise) {
        patternBackgroundPromise = undefined;
      }
    });
  }
  await Promise.all([loadPatternLayerImages(), patternBackgroundPromise]);
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
  private readonly flowerCanvas = document.createElement('canvas');
  private readonly flowerContext = this.flowerCanvas.getContext('2d');
  private readonly ringCanvases = bloomRings.map(() => document.createElement('canvas'));
  private readonly terminalRingCanvases = bloomRings.map(() => document.createElement('canvas'));
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
  private progress = 0;
  private rotationProgress = 0;
  private layers: readonly LoadedLayer[] = [];
  private ringTextureIndex = 0;
  private ringStructuralKey = '';
  private frameRevision = 0;
  private destroyed = false;
  private staticFrameRequested = false;
  private lastFlowerPhase = Number.NaN;
  private lastFlowerTextureSize = 0;
  private readyPromise: Promise<void> | undefined;
  private resolveReady: (() => void) | undefined;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.context = canvas.getContext('2d', { alpha: true });
    this.petalCanvas.dataset.patternTextureRole = 'petal-source';
    this.flowerCanvas.dataset.patternTextureRole = 'source-flower';
    for (const ringCanvas of this.ringCanvases) {
      ringCanvas.dataset.patternTextureRole = 'ring';
      ringCanvas.dataset.patternTextureEndpoint = 'start';
    }
    for (const ringCanvas of this.terminalRingCanvases) {
      ringCanvas.dataset.patternTextureRole = 'ring';
      ringCanvas.dataset.patternTextureEndpoint = 'end';
    }
  }

  async start(): Promise<void> {
    if (!this.context || !this.petalContext || !this.flowerContext) {
      return;
    }

    const layers = await loadPatternLayerImages();
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
    this.buildSourceTextures();
    this.resize();
    this.requestRender();
  }

  prepareStaticFrame(): Promise<void> {
    if (this.destroyed) {
      return Promise.resolve();
    }
    if (this.canvas.dataset.inkTextureReady === 'true') {
      return Promise.resolve();
    }
    if (!this.readyPromise) {
      this.readyPromise = new Promise((resolve) => {
        this.resolveReady = resolve;
      });
    }
    this.staticFrameRequested = true;
    this.requestRender();
    return this.readyPromise;
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
    this.staticFrameRequested = false;
    if (this.rafId) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.resolveReady?.();
    this.resolveReady = undefined;
    for (const canvas of [
      this.petalCanvas,
      this.flowerCanvas,
      ...this.ringCanvases,
      ...this.terminalRingCanvases
    ]) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_LIMIT);
    const rect = this.canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, rect.width || window.innerWidth || 1);
    const cssHeight = Math.max(1, rect.height || window.innerHeight || 1);
    const width = Math.max(1, Math.round(cssWidth * dpr));
    const height = Math.max(1, Math.round(cssHeight * dpr));

    const viewportChanged = width !== this.width || height !== this.height || dpr !== this.dpr;
    if (viewportChanged) {
      this.width = width;
      this.height = height;
      this.dpr = dpr;
      this.canvas.width = width;
      this.canvas.height = height;
      this.ringStructuralKey = '';
      this.ringTextureIndex = 0;
    }

    const metrics = this.getObjectMetrics();
    const textureSize = Math.max(
      MIN_FLOWER_TEXTURE_SIZE,
      Math.min(MAX_FLOWER_TEXTURE_SIZE, Math.round(metrics.size))
    );
    if (textureSize !== this.textureSize) {
      this.textureSize = textureSize;
      this.flowerCanvas.width = textureSize;
      this.flowerCanvas.height = textureSize;
      this.lastFlowerPhase = Number.NaN;
      this.lastFlowerTextureSize = 0;
      this.ringStructuralKey = '';
      this.ringTextureIndex = 0;
    }
  }

  private getObjectMetrics(): ObjectMetrics {
    const cssMetrics = patternObjectMetricsForViewport(
      this.width / this.dpr,
      this.height / this.dpr
    );
    return {
      size: cssMetrics.size * this.dpr,
      centerX: cssMetrics.centerX * this.dpr,
      centerY: cssMetrics.centerY * this.dpr
    };
  }

  private buildSourceTextures(): void {
    if (!this.petalContext) {
      return;
    }
    this.petalCanvas.width = SOURCE_SIZE;
    this.petalCanvas.height = SOURCE_SIZE;
    this.petalContext.clearRect(0, 0, SOURCE_SIZE, SOURCE_SIZE);

    for (const layer of this.layers) {
      if (layer.role === 'decor' || layer.id === '02') {
        continue;
      }
      drawCenteredLayer(this.petalContext, layer, SOURCE_SIZE, SOURCE_SIZE / 2, SOURCE_SIZE / 2, 0.9);
    }
    this.ringStructuralKey = '';
    this.ringTextureIndex = 0;
  }

  private renderSourceFlowerTexture(phase: number): void {
    const context = this.flowerContext;
    const size = this.textureSize;
    if (!context || size <= 0) {
      return;
    }
    if (
      this.lastFlowerTextureSize === size
      && Math.abs(this.lastFlowerPhase - phase) < 0.0001
    ) {
      return;
    }
    context.clearRect(0, 0, size, size);
    for (const layer of this.layers) {
      if (layer.role === 'decor') {
        continue;
      }
      const rotationOffset = layer.direction * (phase / layer.duration) * TAU;
      drawCenteredLayer(
        context,
        layer,
        size,
        size / 2,
        size / 2,
        SOURCE_FLOWER_SCALE * (layer.sourceScale ?? 1),
        rotationOffset
      );
    }
    this.lastFlowerPhase = phase;
    this.lastFlowerTextureSize = size;
  }

  private drawDecorLayers(phase: number, metrics: ObjectMetrics): void {
    const context = this.context;
    if (!context) {
      return;
    }
    for (const layer of this.layers) {
      if (layer.role !== 'decor' || !layer.sizeRatio) {
        continue;
      }
      const image = layer.image;
      const width = metrics.size * layer.sizeRatio;
      const height = width * (image.naturalHeight / image.naturalWidth);
      const imageScale = width / image.naturalWidth;
      const anchorX = (layer.anchorX ?? image.naturalWidth / 2) * imageScale;
      const anchorY = (layer.anchorY ?? image.naturalHeight / 2) * imageScale;
      const rotation = layer.baseAngle * Math.PI / 180
        + layer.direction * (phase / layer.duration) * TAU;
      context.save();
      context.translate(
        metrics.centerX + metrics.size * (layer.offsetX ?? 0),
        metrics.centerY + metrics.size * (layer.offsetY ?? 0)
      );
      context.rotate(rotation);
      context.drawImage(image, -anchorX, -anchorY, width, height);
      context.restore();
    }
  }

  private drawSourceFlower(phase: number, metrics: ObjectMetrics): void {
    const context = this.context;
    if (!context || !this.textureSize) {
      return;
    }
    this.renderSourceFlowerTexture(phase);
    context.save();
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.shadowColor = 'rgba(34, 24, 21, 0.24)';
    context.shadowBlur = Math.min(this.width, this.height) * 0.055;
    context.shadowOffsetY = Math.min(this.width, this.height) * 0.018;
    context.drawImage(
      this.flowerCanvas,
      metrics.centerX - metrics.size / 2,
      metrics.centerY - metrics.size / 2,
      metrics.size,
      metrics.size
    );
    context.restore();
  }

  private drawRingTexture(
    canvas: HTMLCanvasElement,
    index: number,
    structuralPhase: number,
    metrics: ObjectMetrics
  ): void {
    const ring = bloomRings[index];
    const context = canvas.getContext('2d');
    if (!ring || !context) {
      return;
    }

    const structuralProgress = clamp(
      structuralPhase / PATTERN_STRUCTURAL_PHASE
    );
    const collapse = smoothstep(0.02, 1, structuralProgress);
    const drawSize = metrics.size * interpolate(
      ring.scale,
      ring.endScale,
      collapse
    );
    const cacheSize = Math.max(
      MIN_RING_CACHE_SIZE,
      Math.min(MAX_RING_CACHE_SIZE, Math.round(drawSize))
    );
    if (canvas.width !== cacheSize || canvas.height !== cacheSize) {
      canvas.width = cacheSize;
      canvas.height = cacheSize;
    }
    context.clearRect(0, 0, cacheSize, cacheSize);
    context.save();
    context.translate(cacheSize / 2, cacheSize / 2);
    this.drawOuterPetalKaleidoscope(
      context,
      cacheSize,
      0,
      ring.filter,
      structuralPhase,
      ring.spin
    );
    context.restore();
  }

  private refreshRingTextures(
    _structuralPhase: number,
    metrics: ObjectMetrics
  ): void {
    const key = `endpoints:${Math.round(metrics.size)}`;
    if (
      key === this.ringStructuralKey
      && [...this.ringCanvases, ...this.terminalRingCanvases]
        .every((canvas) => canvas.width > 0)
    ) return;

    for (let index = 0; index < bloomRings.length; index += 1) {
      const startCanvas = this.ringCanvases[index];
      const endCanvas = this.terminalRingCanvases[index];
      if (startCanvas && endCanvas) {
        this.drawRingTexture(startCanvas, index, 0, metrics);
        this.drawRingTexture(endCanvas, index, PATTERN_STRUCTURAL_PHASE, metrics);
      }
    }
    this.ringTextureIndex = bloomRings.length * 2;
    this.ringStructuralKey = key;
  }

  private buildNextRingTexture(): void {
    const endpointCount = bloomRings.length * 2;
    if (!this.textureSize || this.ringTextureIndex >= endpointCount) return;
    const metrics = this.getObjectMetrics();
    const endpointIndex = this.ringTextureIndex;
    this.ringTextureIndex += 1;
    const terminal = endpointIndex >= bloomRings.length;
    const index = terminal ? endpointIndex - bloomRings.length : endpointIndex;
    const canvas = terminal
      ? this.terminalRingCanvases[index]
      : this.ringCanvases[index];
    if (canvas) {
      this.drawRingTexture(
        canvas,
        index,
        terminal ? PATTERN_STRUCTURAL_PHASE : 0,
        metrics
      );
    }
    if (this.ringTextureIndex === endpointCount) {
      this.ringStructuralKey = `endpoints:${Math.round(metrics.size)}`;
    }
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
      const startCanvas = this.ringCanvases[index];
      const endCanvas = this.terminalRingCanvases[index];
      if (
        drawSize < 2
        || !startCanvas?.width
        || !startCanvas.height
        || !endCanvas?.width
        || !endCanvas.height
      ) {
        return [];
      }
      return [{
        startCanvas,
        endCanvas,
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
    const endpointMix = smoothstep(0.02, 1, progress);
    for (const ring of this.buildRingCache(progress, rotationProgress, metrics)) {
      const rotation = ring.rotationBase + phase * 0.028 * ring.spin;
      context.save();
      context.translate(metrics.centerX, metrics.centerY);
      context.rotate(rotation);
      if (endpointMix < 0.999) {
        context.globalAlpha = 1 - endpointMix;
        context.drawImage(
          ring.startCanvas,
          -ring.drawSize / 2,
          -ring.drawSize / 2,
          ring.drawSize,
          ring.drawSize
        );
      }
      if (endpointMix > 0.001) {
        context.globalAlpha = endpointMix;
        context.drawImage(
          ring.endCanvas,
          -ring.drawSize / 2,
          -ring.drawSize / 2,
          ring.drawSize,
          ring.drawSize
        );
      }
      context.restore();
    }
  }

  private motionElapsed(now: number): number {
    const activeElapsed = this.animateMotion
      ? Math.max(0, now - this.motionStartedAt) / 1000
      : 0;
    return this.motionElapsedSeconds + activeElapsed;
  }

  private renderFrame(now = performance.now()): void {
    const context = this.context;
    if (!context || this.layers.length === 0) {
      return;
    }
    this.resize();
    const metrics = this.getObjectMetrics();
    const motionSeconds = this.motionElapsed(now);
    const phases = patternFramePhases(this.progress, motionSeconds);
    this.refreshRingTextures(phases.ringStructuralPhase, metrics);
    context.clearRect(0, 0, this.width, this.height);
    this.drawDecorLayers(phases.liveMotionPhase, metrics);
    this.drawPetalField(
      this.progress,
      this.rotationProgress,
      metrics,
      phases.liveMotionPhase
    );
    this.drawSourceFlower(phases.liveMotionPhase, metrics);
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
      const prewarming = this.ringTextureIndex < bloomRings.length * 2;
      if (prewarming) {
        this.buildNextRingTexture();
      }
      const elapsed = now - this.lastRenderedAt;
      const structuralFrameDue = !Number.isFinite(this.lastRenderedAt) || elapsed >= STRUCTURAL_FRAME_INTERVAL_MS;
      const renderRequested = this.framePending || this.animateMotion || this.staticFrameRequested;
      if (!prewarming && renderRequested && structuralFrameDue) {
        this.renderFrame(now);
        this.framePending = false;
        this.lastRenderedAt = now;
        if (this.staticFrameRequested) {
          this.staticFrameRequested = false;
          this.resolveReady?.();
          this.resolveReady = undefined;
        }
      }
      if (
        (this.renderActive && (this.framePending || this.animateMotion))
        || this.staticFrameRequested
        || this.ringTextureIndex < bloomRings.length * 2
      ) {
        this.requestRender();
      }
    });
  }
}
