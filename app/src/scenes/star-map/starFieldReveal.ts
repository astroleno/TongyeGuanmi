export type StarHighlightSource = 'extract' | 'precomputed-alpha';

export type StarHighlightConfig = Readonly<{
  threshold: number;
  gamma: number;
  softness: number;
}>;

type StarCanvas = HTMLCanvasElement | OffscreenCanvas;
type StarContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export type StarFieldRevealOptions = {
  canvas: StarCanvas;
  createCanvas?: (width: number, height: number) => StarCanvas;
  sourceUrl: string;
  autoplay?: boolean;
  createNoiseFrame: StarNoiseFrameFactory;
  /**
   * 'extract' (default) derives the highlight layer from the source luminance
   * via the threshold/gamma/softness curve. 'precomputed-alpha' trusts the
   * source image's own alpha channel as the highlight layer, for assets that
   * were baked offline — the extraction curve is skipped entirely.
   */
  highlightSource?: StarHighlightSource;
  config?: Partial<StarFieldRevealConfig>;
  /**
   * Optional presentation viewport. The source and Perlin layers are both
   * cover-fitted into this exact pixel box, avoiding a CSS-stretched source
   * with a separately-scaled dynamic overlay on portrait screens.
   */
  viewport?: () => Readonly<{ width: number; height: number }> | null | undefined;
};

type StarFieldRevealConfig = {
  revealDurationMs: number;
  loopTransitionMs: number;
  noiseMaskWidth: number;
  highlight: StarHighlightConfig;
  glow: {
    wideBlur: number;
    mediumBlur: number;
    coreBlur: number;
    screenBlur: number;
    wideAlpha: number;
    mediumAlpha: number;
    coreAlpha: number;
    screenAlpha: number;
  };
  noise: {
    profile: 'gradient-fbm' | 'desktop-r5';
    seed: number;
    scale: number;
    warpScale: number;
    warpAmount: number;
    phaseSpeed: number;
    driftX: number;
    driftY: number;
    warpSpeedX: number;
    warpSpeedY: number;
    octaves: number;
    lacunarity: number;
    gain: number;
    ridgeMix: number;
    thresholdLow: number;
    thresholdHigh: number;
  };
};

export type StarNoiseConfig = StarFieldRevealConfig['noise'];
export type StarNoiseFrameFactory = (
  noise: StarNoiseConfig, timeSeconds: number, aspectRatio: number
) => (nx: number, ny: number) => number;

export type StarFieldCamera = Readonly<{
  /** Clockwise degrees applied to both the source map and its Perlin layer. */
  rotationDegrees: number;
  /** Uniform camera zoom. A non-uniform scale is never permitted here. */
  zoom: number;
}>;

export type StarFieldCoverTransform = Readonly<{
  rotationRadians: number;
  scale: number;
  rotatedWidth: number;
  rotatedHeight: number;
}>;

export type RenderBackgroundOptions = {
  timeSeconds?: number;
  strength?: number;
  noiseFloor?: number;
  camera?: Partial<StarFieldCamera>;
  drawSource?: boolean;
  sourceOpacity?: number;
};

const DEFAULT_CAMERA: StarFieldCamera = Object.freeze({
  rotationDegrees: 0,
  zoom: 1
});
const HIGHLIGHT_OUTPUT_SCALE = 1;

export function starHighlightAlphaAt(
  source: Uint8ClampedArray,
  offset: number,
  mode: StarHighlightSource,
  config: StarHighlightConfig
): number {
  if (mode === 'precomputed-alpha') {
    return (source[offset + 3] ?? 0) / 255;
  }

  const r = source[offset] ?? 0;
  const g = source[offset + 1] ?? 0;
  const b = source[offset + 2] ?? 0;
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const value = Math.max(r, g, b);
  const score = luma * .58 + value * .42;
  const normalized = clamp((score - config.threshold) / config.softness, 0, 1);
  return Math.pow(normalized, config.gamma);
}

/**
 * Derives one uniform cover transform for every raster that belongs to the
 * Star Map. This is deliberately shared by the static map and the generated
 * Perlin highlight so a portrait camera can rotate the horizontal source
 * without introducing stretch or layer drift.
 */
export function starFieldCoverTransform(
  sourceWidth: number,
  sourceHeight: number,
  outputWidth: number,
  outputHeight: number,
  camera: Partial<StarFieldCamera> = {}
): StarFieldCoverTransform {
  const width = Math.max(1, sourceWidth);
  const height = Math.max(1, sourceHeight);
  const viewportWidth = Math.max(1, outputWidth);
  const viewportHeight = Math.max(1, outputHeight);
  const rotationDegrees = Number.isFinite(camera.rotationDegrees)
    ? camera.rotationDegrees ?? DEFAULT_CAMERA.rotationDegrees
    : DEFAULT_CAMERA.rotationDegrees;
  const zoom = Math.max(.01, Number.isFinite(camera.zoom) ? camera.zoom ?? DEFAULT_CAMERA.zoom : DEFAULT_CAMERA.zoom);
  const rotationRadians = rotationDegrees * Math.PI / 180;
  const cosine = Math.abs(Math.cos(rotationRadians));
  const sine = Math.abs(Math.sin(rotationRadians));
  const rotatedWidth = width * cosine + height * sine;
  const rotatedHeight = width * sine + height * cosine;

  return {
    rotationRadians,
    scale: Math.max(viewportWidth / rotatedWidth, viewportHeight / rotatedHeight) * zoom,
    rotatedWidth,
    rotatedHeight
  };
}

const DEFAULT_CONFIG: StarFieldRevealConfig = {
  revealDurationMs: 3600,
  loopTransitionMs: 1400,
  noiseMaskWidth: 192,
  highlight: {
    threshold: 120,
    gamma: 3.05,
    softness: 23
  },
  glow: {
    wideBlur: 72,
    mediumBlur: 26,
    coreBlur: 4,
    screenBlur: 0,
    wideAlpha: 1.08,
    mediumAlpha: .92,
    coreAlpha: .62,
    screenAlpha: .52
  },
  noise: {
    profile: 'gradient-fbm',
    seed: 42.7,
    scale: 2.72,
    warpScale: 1.34,
    warpAmount: .86,
    phaseSpeed: .46,
    driftX: .028,
    driftY: .052,
    warpSpeedX: .031,
    warpSpeedY: .026,
    octaves: 4,
    lacunarity: 2.07,
    gain: .51,
    ridgeMix: .17,
    thresholdLow: .41,
    thresholdHigh: .64
  }
};

export function initStarFieldReveal(options: StarFieldRevealOptions): StarFieldReveal {
  const reveal = new StarFieldReveal(options);
  reveal.init();
  return reveal;
}

export class StarFieldReveal {
  readonly canvas: StarCanvas;
  readonly ctx: StarContext | null;
  readonly sourceUrl: string;
  readonly highlightSource: StarHighlightSource;
  readonly config: StarFieldRevealConfig;
  readonly autoplay: boolean;
  readonly viewport: StarFieldRevealOptions['viewport'];
  readonly createNoiseFrame: StarNoiseFrameFactory;

  image: HTMLImageElement | null = null;
  sourceCanvas: StarCanvas | null = null;
  sourceData: ImageData | null = null;
  highlightCanvas: StarCanvas | null = null;
  dynamicHighlightCanvas: StarCanvas | null = null;
  cameraHighlightCanvas: StarCanvas | null = null;
  noiseMaskCanvas: StarCanvas | null = null;
  #sourceWidth = 0;
  #sourceHeight = 0;
  readonly createCanvas: (width: number, height: number) => StarCanvas;
  ready = false;
  #disposed = false;
  #pendingImage: HTMLImageElement | null = null;
  #noisePixels: ImageData | null = null;

  constructor(options: StarFieldRevealOptions) {
    this.canvas = options.canvas;
    this.ctx = this.canvas.getContext('2d');
    this.sourceUrl = options.sourceUrl;
    this.highlightSource = options.highlightSource ?? 'extract';
    this.config = mergeConfig(DEFAULT_CONFIG, options.config ?? {});
    this.autoplay = options.autoplay ?? true;
    this.viewport = options.viewport;
    this.createNoiseFrame = options.createNoiseFrame;
    this.createCanvas = options.createCanvas ?? createCanvas;
  }

  init(): void {
    if (!this.ctx || !this.sourceUrl) {
      return;
    }
    this.#loadImage();
  }

  dispose(): void {
    this.#disposed = true;
    if (this.#pendingImage) this.#pendingImage.src = '';
    this.#pendingImage = null;
    this.ready = false;
    this.image = null;
    this.sourceData = null;
    this.#noisePixels = null;
    for (const canvas of [this.sourceCanvas, this.highlightCanvas, this.dynamicHighlightCanvas,
      this.cameraHighlightCanvas, this.noiseMaskCanvas]) {
      if (canvas) { canvas.width = 0; canvas.height = 0; }
    }
    this.sourceCanvas = this.highlightCanvas = this.dynamicHighlightCanvas = null;
    this.cameraHighlightCanvas = this.noiseMaskCanvas = null;
  }

  renderBackground(options: RenderBackgroundOptions = {}): void {
    if (!this.ready || !this.ctx || !this.sourceCanvas) {
      return;
    }

    const timeSeconds = options.timeSeconds ?? performance.now() / 1000;
    const strength = options.strength ?? 1;
    const noiseFloor = options.noiseFloor ?? 0;
    const camera = options.camera ?? DEFAULT_CAMERA;

    this.#resizeOutput();
    this.#clear();
    if (options.drawSource !== false) {
      this.ctx.globalAlpha = clamp(options.sourceOpacity ?? 1, 0, 1);
      this.#drawCoveredCanvas(this.sourceCanvas, camera);
      this.ctx.globalAlpha = 1;
    }
    this.#renderNoiseOverlay(timeSeconds, strength, { noiseFloor }, camera);
  }

  #loadImage(): void {
    const image = new Image();
    this.#pendingImage = image;
    image.crossOrigin = 'anonymous';
    image.addEventListener('load', () => {
      if (this.#disposed) return;
      this.#pendingImage = null;
      this.image = image;
      this.prepareSource(image);
      if (this.autoplay) this.renderBackground();
    }, { once: true });
    image.src = this.sourceUrl;
  }

  prepareSource(image: HTMLImageElement | ImageBitmap): void {
    const sourceWidth = 'naturalWidth' in image ? image.naturalWidth : image.width;
    const sourceHeight = 'naturalHeight' in image ? image.naturalHeight : image.height;
    this.#sourceWidth = sourceWidth;
    this.#sourceHeight = sourceHeight;
    this.sourceCanvas = this.createCanvas(sourceWidth, sourceHeight);
    const sourceCtx = this.sourceCanvas.getContext('2d', { willReadFrequently: true });
    if (!sourceCtx) return;
    sourceCtx.drawImage(image, 0, 0);
    this.sourceData = sourceCtx.getImageData(0, 0, this.sourceCanvas.width, this.sourceCanvas.height);

    this.highlightCanvas = this.createCanvas(sourceWidth, sourceHeight);
    this.#buildHighlightSource();
    this.sourceData = null;

    this.dynamicHighlightCanvas = this.createCanvas(sourceWidth, sourceHeight);
    this.cameraHighlightCanvas = this.createCanvas(1, 1);
    this.noiseMaskCanvas = this.createCanvas(
      this.config.noiseMaskWidth,
      Math.round(this.config.noiseMaskWidth * sourceHeight / sourceWidth)
    );
    this.#resizeOutput();
    this.ready = true;
  }

  #renderNoiseOverlay(
    timeSeconds: number,
    strength: number,
    options: { noiseFloor?: number } = {},
    camera: Partial<StarFieldCamera> = DEFAULT_CAMERA
  ): void {
    if (
      !this.ctx
      || !this.dynamicHighlightCanvas
      || !this.cameraHighlightCanvas
    ) {
      return;
    }
    this.#buildDynamicHighlight(timeSeconds, options);
    this.#renderCameraOverlays(camera);

    const passes = Math.max(1, Math.ceil(strength));
    const passStrength = strength / passes;
    const glow = this.config.glow;

    for (let index = 0; index < passes; index += 1) {
      // Match the horizontal production treatment: Perlin only gates the
      // extracted bright pixels. The source plate itself never participates
      // in the noise field, so dark map regions remain stable and crisp.
      this.ctx.globalCompositeOperation = 'lighter';
      this.#drawOutputGlow(this.cameraHighlightCanvas, glow.wideBlur, glow.wideAlpha * passStrength);
      this.#drawOutputGlow(this.cameraHighlightCanvas, glow.mediumBlur, glow.mediumAlpha * passStrength);
      this.#drawOutputGlow(this.cameraHighlightCanvas, glow.coreBlur, glow.coreAlpha * passStrength);
      this.ctx.globalCompositeOperation = 'screen';
      this.#drawOutputGlow(
        this.cameraHighlightCanvas,
        glow.screenBlur,
        glow.screenAlpha * passStrength
      );
    }
    this.#resetContext();
  }

  #buildHighlightSource(): void {
    if (!this.highlightCanvas || !this.sourceData) {
      return;
    }
    const highlightCtx = this.highlightCanvas.getContext('2d');
    if (!highlightCtx) {
      return;
    }
    const output = highlightCtx.createImageData(this.sourceData.width, this.sourceData.height);
    const src = this.sourceData.data;
    const dst = output.data;
    for (let index = 0; index < src.length; index += 4) {
      const alpha = starHighlightAlphaAt(
        src, index, this.highlightSource, this.config.highlight
      );

      if (alpha <= .001) {
        dst[index + 3] = 0;
        continue;
      }

      dst[index] = 255;
      dst[index + 1] = Math.round(226 + alpha * 26);
      dst[index + 2] = Math.round(178 + alpha * 58);
      dst[index + 3] = Math.round(alpha * 255);
    }

    highlightCtx.putImageData(output, 0, 0);
  }

  #buildDynamicHighlight(timeSeconds: number, options: { noiseFloor?: number } = {}): void {
    if (!this.noiseMaskCanvas || !this.dynamicHighlightCanvas || !this.highlightCanvas) {
      return;
    }
    const noiseCtx = this.noiseMaskCanvas.getContext('2d', { willReadFrequently: true });
    const dynamicCtx = this.dynamicHighlightCanvas.getContext('2d');
    if (!noiseCtx || !dynamicCtx) {
      return;
    }
    const mask = this.#noisePixels ??= noiseCtx.createImageData(this.noiseMaskCanvas.width, this.noiseMaskCanvas.height);
    const data = mask.data;
    const width = this.noiseMaskCanvas.width;
    const height = this.noiseMaskCanvas.height;
    const { thresholdLow, thresholdHigh } = this.config.noise;
    const noiseField = this.createNoiseFrame(this.config.noise, timeSeconds, width / height);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const nx = x / width;
        const ny = y / height;
        const field = noiseField(nx, ny);
        const maskValue = smoothstep(thresholdLow, thresholdHigh, field);
        const maskAlpha = lerp(options.noiseFloor ?? 0, 1, maskValue);
        const index = (y * width + x) * 4;

        // destination-in reads the mask alpha only. Keep RGB neutral so the
        // mask can never tint the highlight on browser canvas fallbacks.
        data[index] = 255;
        data[index + 1] = 255;
        data[index + 2] = 255;
        data[index + 3] = Math.round(maskAlpha * 255);
      }
    }

    noiseCtx.putImageData(mask, 0, 0);

    dynamicCtx.clearRect(0, 0, this.dynamicHighlightCanvas.width, this.dynamicHighlightCanvas.height);
    dynamicCtx.drawImage(this.highlightCanvas, 0, 0);
    dynamicCtx.globalCompositeOperation = 'destination-in';
    dynamicCtx.imageSmoothingEnabled = true;
    dynamicCtx.imageSmoothingQuality = 'high';
    dynamicCtx.drawImage(this.noiseMaskCanvas, 0, 0, this.dynamicHighlightCanvas.width, this.dynamicHighlightCanvas.height);
    dynamicCtx.globalCompositeOperation = 'source-over';
  }


  #renderCameraOverlays(camera: Partial<StarFieldCamera>): void {
    if (
      !this.cameraHighlightCanvas
      || !this.dynamicHighlightCanvas
    ) {
      return;
    }
    const outputWidth = Math.max(1, Math.round(this.canvas.width * HIGHLIGHT_OUTPUT_SCALE));
    const outputHeight = Math.max(1, Math.round(this.canvas.height * HIGHLIGHT_OUTPUT_SCALE));
    resizeCanvas(
      this.cameraHighlightCanvas,
      outputWidth,
      outputHeight
    );
    const highlightCtx = this.cameraHighlightCanvas.getContext('2d');
    if (!highlightCtx) {
      return;
    }
    highlightCtx.clearRect(0, 0, this.cameraHighlightCanvas.width, this.cameraHighlightCanvas.height);
    this.#drawCameraCanvasTo(
      highlightCtx,
      this.dynamicHighlightCanvas,
      this.cameraHighlightCanvas.width,
      this.cameraHighlightCanvas.height,
      camera
    );
  }

  #drawOutputGlow(layerCanvas: StarCanvas, blur: number, alpha: number): void {
    if (!this.ctx || alpha <= .002) {
      return;
    }

    this.ctx.save();
    this.ctx.globalAlpha = clamp(alpha, 0, 1);
    // Keep the desktop R5 luminance response. Portrait-specific softness is
    // expressed through the configured blur radii, not a global plate filter.
    this.ctx.filter = `blur(${Math.max(0, blur)}px) brightness(1.18)`;
    this.ctx.drawImage(layerCanvas, 0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
  }

  #drawCoveredCanvas(layerCanvas: StarCanvas, camera: Partial<StarFieldCamera>): void {
    if (!this.ctx) {
      return;
    }
    this.#drawCameraCanvas(layerCanvas, camera);
  }

  #drawCameraCanvas(layerCanvas: StarCanvas, camera: Partial<StarFieldCamera>): void {
    if (!this.ctx) {
      return;
    }
    this.#drawCameraCanvasTo(
      this.ctx,
      layerCanvas,
      this.canvas.width,
      this.canvas.height,
      camera
    );
  }

  #drawCameraCanvasTo(
    target: StarContext,
    layerCanvas: StarCanvas,
    outputWidth: number,
    outputHeight: number,
    camera: Partial<StarFieldCamera>
  ): void {
    const transform = starFieldCoverTransform(
      layerCanvas.width,
      layerCanvas.height,
      outputWidth,
      outputHeight,
      camera
    );
    target.save();
    target.imageSmoothingEnabled = true;
    target.imageSmoothingQuality = 'high';
    target.translate(outputWidth / 2, outputHeight / 2);
    target.rotate(transform.rotationRadians);
    // One scalar is shared by x and y. Overflow is clipped by the output
    // canvas; the source is never resized non-uniformly to fit portrait.
    target.scale(transform.scale, transform.scale);
    target.drawImage(layerCanvas, -layerCanvas.width / 2, -layerCanvas.height / 2);
    target.restore();
  }

  #resizeOutput(): void {
    const requested = this.viewport?.() ?? null;
    const width = Math.max(
      1,
      Math.round(requested?.width || this.#sourceWidth || ('clientWidth' in this.canvas ? this.canvas.clientWidth : this.canvas.width) || 1)
    );
    const height = Math.max(
      1,
      Math.round(requested?.height || this.#sourceHeight || ('clientHeight' in this.canvas ? this.canvas.clientHeight : this.canvas.height) || 1)
    );
    if (this.canvas.width !== width) {
      this.canvas.width = width;
    }
    if (this.canvas.height !== height) {
      this.canvas.height = height;
    }
  }

  #clear(): void {
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  #resetContext(): void {
    if (!this.ctx) {
      return;
    }
    this.ctx.filter = 'none';
    this.ctx.globalAlpha = 1;
    this.ctx.globalCompositeOperation = 'source-over';
  }
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function resizeCanvas(canvas: StarCanvas, width: number, height: number): void {
  if (canvas.width !== width) {
    canvas.width = width;
  }
  if (canvas.height !== height) {
    canvas.height = height;
  }
}

function mergeConfig(base: StarFieldRevealConfig, override: Partial<StarFieldRevealConfig>): StarFieldRevealConfig {
  return {
    ...base,
    ...override,
    highlight: { ...base.highlight, ...(override.highlight ?? {}) },
    glow: { ...base.glow, ...(override.glow ?? {}) },
    noise: { ...base.noise, ...(override.noise ?? {}) }
  };
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}


function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
