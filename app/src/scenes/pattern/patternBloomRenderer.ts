const DPR_LIMIT = 1.25;
const SOURCE_SIZE = 1152;
const TAU = Math.PI * 2;
const FINAL_ROTATION = 120 * Math.PI / 180;
const SOURCE_FLOWER_SCALE = 0.702;
const OUTER_KALEIDOSCOPE_SEGMENTS = 16;
const MAX_RING_CACHE_SIZE = 1800;

const BACKGROUND = new URL('../../../../assets/patterns/backgrounds/aged-mottled-background-16x9-4k.png', import.meta.url).href;

type LayerConfig = {
  id: string;
  src: string;
  role?: 'decor';
  sizeRatio?: number;
  offsetX?: number;
  offsetY?: number;
  widthVmin?: number;
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
    id: '06',
    src: new URL('../../../../assets/patterns/alpha-layers/pattern-layer-alpha-06.png', import.meta.url).href,
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
    src: new URL('../../../../assets/patterns/alpha-layers/pattern-layer-alpha-05.png', import.meta.url).href,
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
    src: new URL('../../../../assets/patterns/alpha-layers/pattern-layer-alpha-04.png', import.meta.url).href,
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
    src: new URL('../../../../assets/patterns/alpha-layers/pattern-layer-alpha-03.png', import.meta.url).href,
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
    src: new URL('../../../../assets/patterns/alpha-layers/pattern-layer-alpha-02.png', import.meta.url).href,
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

function drawCoverImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number): void {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const frameRatio = width / height;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;
  let sourceX = 0;
  let sourceY = 0;

  if (imageRatio > frameRatio) {
    sourceWidth = sourceHeight * frameRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = sourceWidth / frameRatio;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  }

  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
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

export function patternBloomSnapshot(progress: number): PatternBloomSnapshot {
  const clamped = clamp(progress);
  const eased = easeInOutCubic(clamped);
  const collapse = smoothstep(0.02, 1, clamped);
  return {
    progress: clamped,
    centerXRatio: 0.24,
    centerYRatio: 0.55,
    mobileCenterXRatio: 0.50,
    mobileCenterYRatio: 0.58,
    fieldRotationDegrees: interpolate(120, 0, eased),
    largestRingScale: interpolate(largestBloomRing.scale, largestBloomRing.endScale, collapse),
    compactRingScale: interpolate(compactBloomRing.scale, compactBloomRing.endScale, collapse)
  };
}

export class PatternBloomRenderer {
  private readonly context: CanvasRenderingContext2D | null;
  private readonly sourceCanvas = document.createElement('canvas');
  private readonly sourceContext = this.sourceCanvas.getContext('2d', { willReadFrequently: true });
  private readonly petalCanvas = document.createElement('canvas');
  private readonly petalContext = this.petalCanvas.getContext('2d');
  private readonly flowerCanvas = document.createElement('canvas');
  private readonly flowerContext = this.flowerCanvas.getContext('2d', { willReadFrequently: true });
  private width = 0;
  private height = 0;
  private dpr = 1;
  private textureSize = 0;
  private rafId = 0;
  private startedAt = 0;
  private progress = 1;
  private background: HTMLImageElement | null = null;
  private layers: readonly LoadedLayer[] = [];
  private ringCacheKey = '';
  private ringCache: RingCache[] = [];
  private destroyed = false;
  private readonly mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.context = canvas.getContext('2d', { alpha: false });
  }

  async start(): Promise<void> {
    if (!this.context || !this.sourceContext || !this.petalContext || !this.flowerContext) {
      return;
    }

    const [background, ...layers] = await Promise.all([
      loadImage(BACKGROUND),
      ...layerConfigs.map((layer) => loadImage(layer.src))
    ]);
    if (this.destroyed) {
      return;
    }

    this.background = background;
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
    this.startedAt = performance.now();
    this.buildSourceTexture();
    this.renderFrame(this.startedAt);
    if (!this.mediaQuery.matches) {
      this.queueRender();
    }
  }

  setProgress(progress: number): void {
    this.progress = clamp(progress);
    this.requestRender();
  }

  renderProgress(progress: number, now = performance.now()): void {
    this.progress = clamp(progress);
    this.renderFrame(now);
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
      this.ringCacheKey = '';
    }

    const metrics = this.getObjectMetrics();
    const textureSize = Math.max(640, Math.min(1180, Math.round(metrics.size)));
    if (textureSize !== this.textureSize) {
      this.textureSize = textureSize;
      this.flowerCanvas.width = textureSize;
      this.flowerCanvas.height = textureSize;
      this.ringCacheKey = '';
    }
  }

  private getObjectMetrics(): ObjectMetrics {
    const isMobile = this.width < 760 * this.dpr;
    const vmin = Math.min(this.width, this.height);
    const displaySize = isMobile
      ? Math.min(vmin * 1.34, this.width * 1.12)
      : Math.min(vmin * 1.34, this.width * 0.96);
    return {
      size: displaySize,
      centerX: this.width * (isMobile ? 0.50 : 0.24),
      centerY: this.height * (isMobile ? 0.58 : 0.55)
    };
  }

  private buildSourceTexture(): void {
    if (!this.sourceContext || !this.petalContext) {
      return;
    }
    this.sourceCanvas.width = SOURCE_SIZE;
    this.sourceCanvas.height = SOURCE_SIZE;
    this.petalCanvas.width = SOURCE_SIZE;
    this.petalCanvas.height = SOURCE_SIZE;
    this.sourceContext.clearRect(0, 0, SOURCE_SIZE, SOURCE_SIZE);
    this.petalContext.clearRect(0, 0, SOURCE_SIZE, SOURCE_SIZE);

    for (const layer of this.layers) {
      if (layer.role === 'decor') {
        continue;
      }
      drawCenteredLayer(this.sourceContext, layer, SOURCE_SIZE, SOURCE_SIZE / 2, SOURCE_SIZE / 2, 0.9);
      if (layer.id !== '02') {
        drawCenteredLayer(this.petalContext, layer, SOURCE_SIZE, SOURCE_SIZE / 2, SOURCE_SIZE / 2, 0.9);
      }
    }
    this.ringCacheKey = '';
    this.ringCache = [];
  }

  private renderSourceFlowerTexture(elapsed: number): void {
    if (!this.flowerContext) {
      return;
    }
    const size = this.textureSize;
    this.flowerContext.clearRect(0, 0, size, size);
    for (const layer of this.layers) {
      if (layer.role === 'decor') {
        continue;
      }
      const rotationOffset = (layer.direction ?? 0) * (elapsed / (layer.duration ?? 60)) * TAU;
      drawCenteredLayer(
        this.flowerContext,
        layer,
        size,
        size / 2,
        size / 2,
        SOURCE_FLOWER_SCALE * (layer.sourceScale ?? 1),
        rotationOffset
      );
    }
  }

  private drawDecorLayers(elapsed: number, metrics: ObjectMetrics): void {
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
      const rotation = (layer.baseAngle * Math.PI / 180) + layer.direction * (elapsed / layer.duration) * TAU;

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

  private drawOuterPetalKaleidoscope(
    ctx: CanvasRenderingContext2D,
    drawSize: number,
    rotation: number,
    filter: string,
    elapsed: number,
    spin: number
  ): void {
    const wedge = TAU / OUTER_KALEIDOSCOPE_SEGMENTS;
    const radius = drawSize * 0.74;
    const sampleRotation = elapsed * 0.018 * spin;
    const sampleX = Math.cos(elapsed * 0.13 + spin) * drawSize * 0.012;
    const sampleY = Math.sin(elapsed * 0.11 - spin) * drawSize * 0.012;

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

  private buildRingCache(progress: number, metrics: ObjectMetrics): RingCache[] {
    const cacheKey = [Math.round(progress * 160), Math.round(metrics.size), this.textureSize].join(':');
    if (cacheKey === this.ringCacheKey) {
      return this.ringCache;
    }

    const eased = easeInOutCubic(progress);
    const collapse = smoothstep(0.02, 1, progress);
    const fieldRotation = interpolate(FINAL_ROTATION, 0, eased);

    this.ringCacheKey = cacheKey;
    this.ringCache = bloomRings.flatMap((ring) => {
      const drawSize = metrics.size * interpolate(ring.scale, ring.endScale, collapse);
      if (drawSize < 2) {
        return [];
      }
      const cacheSize = Math.max(320, Math.min(MAX_RING_CACHE_SIZE, Math.round(drawSize)));
      const ringCanvas = document.createElement('canvas');
      const ringContext = ringCanvas.getContext('2d');
      if (!ringContext) {
        return [];
      }
      ringCanvas.width = cacheSize;
      ringCanvas.height = cacheSize;
      ringContext.save();
      ringContext.translate(cacheSize / 2, cacheSize / 2);
      this.drawOuterPetalKaleidoscope(ringContext, cacheSize, 0, ring.filter, progress * 4.2, ring.spin);
      ringContext.restore();
      return [{
        canvas: ringCanvas,
        drawSize,
        rotationBase: ring.rotation * Math.PI / 180 + fieldRotation * ring.spin,
        spin: ring.spin
      }];
    });
    return this.ringCache;
  }

  private drawPetalField(progress: number, metrics: ObjectMetrics, elapsed: number): void {
    const context = this.context;
    if (!context) {
      return;
    }
    for (const ring of this.buildRingCache(progress, metrics)) {
      const rotation = ring.rotationBase + elapsed * 0.028 * ring.spin;
      context.save();
      context.translate(metrics.centerX, metrics.centerY);
      context.rotate(rotation);
      context.drawImage(ring.canvas, -ring.drawSize / 2, -ring.drawSize / 2, ring.drawSize, ring.drawSize);
      context.restore();
    }
  }

  private renderFrame(now: number): void {
    const context = this.context;
    if (!context || !this.background || this.layers.length === 0) {
      return;
    }
    this.resize();
    const metrics = this.getObjectMetrics();
    const elapsed = Math.max(0, (now - this.startedAt) / 1000);
    drawCoverImage(context, this.background, 0, 0, this.width, this.height);
    this.drawDecorLayers(elapsed, metrics);
    this.drawPetalField(this.progress, metrics, elapsed);
    this.renderSourceFlowerTexture(elapsed);

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

  private requestRender(): void {
    if (this.destroyed || this.rafId) {
      return;
    }
    this.rafId = window.requestAnimationFrame((now) => {
      this.rafId = 0;
      this.renderFrame(now);
    });
  }

  private queueRender(): void {
    if (this.destroyed) {
      return;
    }
    this.rafId = window.requestAnimationFrame((now) => {
      this.rafId = 0;
      this.renderFrame(now);
      if (!this.mediaQuery.matches) {
        this.queueRender();
      }
    });
  }
}
