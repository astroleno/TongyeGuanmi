type StarFieldRevealOptions = {
  canvas: HTMLCanvasElement;
  sourceUrl: string;
  autoplay?: boolean;
  config?: Partial<StarFieldRevealConfig>;
};

type StarFieldRevealConfig = {
  revealDurationMs: number;
  loopTransitionMs: number;
  noiseMaskWidth: number;
  highlight: {
    threshold: number;
    gamma: number;
    softness: number;
  };
  noise: {
    seed: number;
    scale: number;
    warpScale: number;
    warpAmount: number;
    phaseSpeed: number;
    driftX: number;
    driftY: number;
    warpSpeedX: number;
    warpSpeedY: number;
    thresholdLow: number;
    thresholdHigh: number;
  };
};

type RenderBackgroundOptions = {
  timeSeconds?: number;
  strength?: number;
  noiseFloor?: number;
};

const DEFAULT_CONFIG: StarFieldRevealConfig = {
  revealDurationMs: 3600,
  loopTransitionMs: 1400,
  noiseMaskWidth: 420,
  highlight: {
    threshold: 120,
    gamma: 3.05,
    softness: 23
  },
  noise: {
    seed: 42.7,
    scale: 3.8,
    warpScale: 2.1,
    warpAmount: .42,
    phaseSpeed: .46,
    driftX: .06,
    driftY: .34,
    warpSpeedX: .09,
    warpSpeedY: .08,
    thresholdLow: .45,
    thresholdHigh: .55
  }
};

export function initStarFieldReveal(options: StarFieldRevealOptions): StarFieldReveal {
  const reveal = new StarFieldReveal(options);
  reveal.init();
  return reveal;
}

export class StarFieldReveal {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D | null;
  readonly sourceUrl: string;
  readonly config: StarFieldRevealConfig;
  readonly autoplay: boolean;

  image: HTMLImageElement | null = null;
  sourceCanvas: HTMLCanvasElement | null = null;
  sourceData: ImageData | null = null;
  highlightCanvas: HTMLCanvasElement | null = null;
  dynamicHighlightCanvas: HTMLCanvasElement | null = null;
  noiseMaskCanvas: HTMLCanvasElement | null = null;
  rafId = 0;
  ready = false;

  constructor(options: StarFieldRevealOptions) {
    this.canvas = options.canvas;
    this.ctx = this.canvas.getContext('2d');
    this.sourceUrl = options.sourceUrl;
    this.config = mergeConfig(DEFAULT_CONFIG, options.config ?? {});
    this.autoplay = options.autoplay ?? true;
  }

  init(): void {
    if (!this.ctx || !this.sourceUrl) {
      return;
    }
    this.loadImage();
  }

  dispose(): void {
    window.cancelAnimationFrame(this.rafId);
  }

  renderBackground(options: RenderBackgroundOptions = {}): void {
    if (!this.ready || !this.ctx || !this.sourceCanvas) {
      return;
    }

    const timeSeconds = options.timeSeconds ?? performance.now() / 1000;
    const strength = options.strength ?? 1;
    const noiseFloor = options.noiseFloor ?? 0;

    this.clear();
    this.ctx.drawImage(this.sourceCanvas, 0, 0);
    this.renderNoiseOverlay(timeSeconds, strength, { noiseFloor });
  }

  private loadImage(): void {
    const image = new Image();
    image.decoding = 'async';
    image.addEventListener('load', () => {
      this.image = image;
      this.prepareSource();
      this.ready = true;
      if (this.autoplay) {
        this.renderBackground();
      }
    }, { once: true });
    image.src = this.sourceUrl;
  }

  private prepareSource(): void {
    if (!this.image) {
      return;
    }
    this.canvas.width = this.image.naturalWidth;
    this.canvas.height = this.image.naturalHeight;

    this.sourceCanvas = createCanvas(this.image.naturalWidth, this.image.naturalHeight);
    const sourceCtx = this.sourceCanvas.getContext('2d', { willReadFrequently: true });
    if (!sourceCtx) {
      return;
    }
    sourceCtx.drawImage(this.image, 0, 0);
    this.sourceData = sourceCtx.getImageData(0, 0, this.sourceCanvas.width, this.sourceCanvas.height);

    this.highlightCanvas = createCanvas(this.image.naturalWidth, this.image.naturalHeight);
    this.buildHighlightSource();

    this.dynamicHighlightCanvas = createCanvas(this.image.naturalWidth, this.image.naturalHeight);
    this.noiseMaskCanvas = createCanvas(
      this.config.noiseMaskWidth,
      Math.round(this.config.noiseMaskWidth * this.image.naturalHeight / this.image.naturalWidth)
    );
  }

  private renderNoiseOverlay(timeSeconds: number, strength: number, options: { noiseFloor?: number } = {}): void {
    if (!this.ctx || !this.dynamicHighlightCanvas) {
      return;
    }
    this.buildDynamicHighlight(timeSeconds, options);

    const passes = Math.max(1, Math.ceil(strength));
    const passStrength = strength / passes;

    for (let index = 0; index < passes; index += 1) {
      this.ctx.globalCompositeOperation = 'lighter';
      this.drawCanvasLayer(this.dynamicHighlightCanvas, {
        blur: 72,
        scale: 1.012,
        alpha: 1.08 * passStrength
      });
      this.drawCanvasLayer(this.dynamicHighlightCanvas, {
        blur: 26,
        scale: 1.004,
        alpha: .92 * passStrength
      });
      this.drawCanvasLayer(this.dynamicHighlightCanvas, {
        blur: 4,
        scale: 1,
        alpha: .62 * passStrength
      });

      this.ctx.globalCompositeOperation = 'screen';
      this.drawCanvasLayer(this.dynamicHighlightCanvas, {
        blur: 0,
        scale: 1,
        alpha: .52 * passStrength
      });
    }
    this.resetContext();
  }

  private buildHighlightSource(): void {
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
    const { threshold, gamma, softness } = this.config.highlight;

    for (let index = 0; index < src.length; index += 4) {
      const r = src[index] ?? 0;
      const g = src[index + 1] ?? 0;
      const b = src[index + 2] ?? 0;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const value = Math.max(r, g, b);
      const score = luma * .58 + value * .42;
      const normalized = clamp((score - threshold) / softness, 0, 1);
      const alpha = Math.pow(normalized, gamma);

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

  private buildDynamicHighlight(timeSeconds: number, options: { noiseFloor?: number } = {}): void {
    if (!this.noiseMaskCanvas || !this.dynamicHighlightCanvas || !this.highlightCanvas) {
      return;
    }
    const noiseCtx = this.noiseMaskCanvas.getContext('2d', { willReadFrequently: true });
    const dynamicCtx = this.dynamicHighlightCanvas.getContext('2d');
    if (!noiseCtx || !dynamicCtx) {
      return;
    }
    const mask = noiseCtx.createImageData(this.noiseMaskCanvas.width, this.noiseMaskCanvas.height);
    const data = mask.data;
    const width = this.noiseMaskCanvas.width;
    const height = this.noiseMaskCanvas.height;
    const { thresholdLow, thresholdHigh } = this.config.noise;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const nx = x / width;
        const ny = y / height;
        const field = this.animatedNoiseField(nx, ny, timeSeconds);
        const maskValue = smoothstep(thresholdLow, thresholdHigh, field);
        const maskAlpha = lerp(options.noiseFloor ?? 0, 1, maskValue);
        const index = (y * width + x) * 4;

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

  private animatedNoiseField(nx: number, ny: number, timeSeconds: number): number {
    const noise = this.config.noise;
    const warpX = noise2D(
      nx * noise.warpScale + timeSeconds * noise.warpSpeedX,
      ny * noise.warpScale - timeSeconds * noise.warpSpeedY,
      8.3
    ) - .5;
    const warpY = noise2D(
      nx * noise.warpScale - timeSeconds * noise.warpSpeedY,
      ny * noise.warpScale + timeSeconds * noise.warpSpeedX,
      14.9
    ) - .5;
    const phase = timeSeconds * noise.phaseSpeed;
    const seedIndex = Math.floor(phase);
    const seedMix = smoother(phase - seedIndex);
    const x = nx * noise.scale + warpX * noise.warpAmount + timeSeconds * noise.driftX;
    const y = ny * noise.scale + warpY * noise.warpAmount + timeSeconds * noise.driftY;
    const a = noise2D(x, y, noise.seed + seedIndex * 19.31);
    const b = noise2D(x, y, noise.seed + (seedIndex + 1) * 19.31);

    return lerp(a, b, seedMix);
  }

  private drawCanvasLayer(layerCanvas: HTMLCanvasElement, { blur, scale, alpha }: { blur: number; scale: number; alpha: number }): void {
    if (!this.ctx || alpha <= .002) {
      return;
    }
    const width = this.canvas.width;
    const height = this.canvas.height;
    const drawWidth = width * scale;
    const drawHeight = height * scale;
    const x = (width - drawWidth) / 2;
    const y = (height - drawHeight) / 2;

    this.ctx.globalAlpha = clamp(alpha, 0, 1);
    this.ctx.filter = `blur(${Math.max(0, blur)}px) brightness(1.18)`;
    this.ctx.drawImage(layerCanvas, x, y, drawWidth, drawHeight);
  }

  private clear(): void {
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private resetContext(): void {
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

function mergeConfig(base: StarFieldRevealConfig, override: Partial<StarFieldRevealConfig>): StarFieldRevealConfig {
  return {
    ...base,
    ...override,
    highlight: { ...base.highlight, ...(override.highlight ?? {}) },
    noise: { ...base.noise, ...(override.noise ?? {}) }
  };
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

function noise2D(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = smoother(xf);
  const v = smoother(yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);

  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

function hash2(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function smoother(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
