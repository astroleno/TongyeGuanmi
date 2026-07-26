type StarFieldRevealOptions = {
  canvas: HTMLCanvasElement;
  sourceUrl: string;
  autoplay?: boolean;
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
  highlight: {
    threshold: number;
    gamma: number;
    softness: number;
  };
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

type RenderBackgroundOptions = {
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
const OCTAVE_ROTATIONS = Object.freeze([
  Object.freeze({ cosine: 1, sine: 0 }),
  Object.freeze({ cosine: .7314, sine: .6820 }),
  Object.freeze({ cosine: -.2181, sine: .9759 }),
  Object.freeze({ cosine: -.9239, sine: .3827 }),
  Object.freeze({ cosine: -.5736, sine: -.8192 })
]);

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
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D | null;
  readonly sourceUrl: string;
  readonly config: StarFieldRevealConfig;
  readonly autoplay: boolean;
  readonly viewport: StarFieldRevealOptions['viewport'];

  image: HTMLImageElement | null = null;
  sourceCanvas: HTMLCanvasElement | null = null;
  sourceData: ImageData | null = null;
  highlightCanvas: HTMLCanvasElement | null = null;
  dynamicHighlightCanvas: HTMLCanvasElement | null = null;
  cameraHighlightCanvas: HTMLCanvasElement | null = null;
  noiseMaskCanvas: HTMLCanvasElement | null = null;
  rafId = 0;
  ready = false;

  constructor(options: StarFieldRevealOptions) {
    this.canvas = options.canvas;
    this.ctx = this.canvas.getContext('2d');
    this.sourceUrl = options.sourceUrl;
    this.config = mergeConfig(DEFAULT_CONFIG, options.config ?? {});
    this.autoplay = options.autoplay ?? true;
    this.viewport = options.viewport;
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
    const camera = options.camera ?? DEFAULT_CAMERA;

    this.resizeOutput();
    this.clear();
    if (options.drawSource !== false) {
      this.ctx.globalAlpha = clamp(options.sourceOpacity ?? 1, 0, 1);
      this.drawCoveredCanvas(this.sourceCanvas, camera);
      this.ctx.globalAlpha = 1;
    }
    this.renderNoiseOverlay(timeSeconds, strength, { noiseFloor }, camera);
  }

  private loadImage(): void {
    const image = new Image();
    image.crossOrigin = 'anonymous';
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
    this.sourceCanvas = createCanvas(this.image.naturalWidth, this.image.naturalHeight);
    const sourceCtx = this.sourceCanvas.getContext('2d');
    if (!sourceCtx) {
      return;
    }
    sourceCtx.drawImage(this.image, 0, 0);
    this.sourceData = sourceCtx.getImageData(0, 0, this.sourceCanvas.width, this.sourceCanvas.height);

    this.highlightCanvas = createCanvas(this.image.naturalWidth, this.image.naturalHeight);
    this.buildHighlightSource();

    this.dynamicHighlightCanvas = createCanvas(this.image.naturalWidth, this.image.naturalHeight);
    this.cameraHighlightCanvas = createCanvas(1, 1);
    this.noiseMaskCanvas = createCanvas(
      this.config.noiseMaskWidth,
      Math.round(this.config.noiseMaskWidth * this.image.naturalHeight / this.image.naturalWidth)
    );
    this.resizeOutput();
  }

  private renderNoiseOverlay(
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
    this.buildDynamicHighlight(timeSeconds, options);
    this.renderCameraOverlays(camera);

    const passes = Math.max(1, Math.ceil(strength));
    const passStrength = strength / passes;
    const glow = this.config.glow;

    for (let index = 0; index < passes; index += 1) {
      // Match the horizontal production treatment: Perlin only gates the
      // extracted bright pixels. The source plate itself never participates
      // in the noise field, so dark map regions remain stable and crisp.
      this.ctx.globalCompositeOperation = 'lighter';
      this.drawOutputGlow(this.cameraHighlightCanvas, glow.wideBlur, glow.wideAlpha * passStrength);
      this.drawOutputGlow(this.cameraHighlightCanvas, glow.mediumBlur, glow.mediumAlpha * passStrength);
      this.drawOutputGlow(this.cameraHighlightCanvas, glow.coreBlur, glow.coreAlpha * passStrength);
      this.ctx.globalCompositeOperation = 'screen';
      this.drawOutputGlow(
        this.cameraHighlightCanvas,
        glow.screenBlur,
        glow.screenAlpha * passStrength
      );
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
    const noiseCtx = this.noiseMaskCanvas.getContext('2d');
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
        const field = this.animatedNoiseField(nx, ny, timeSeconds, width / height);
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

  private animatedNoiseField(
    nx: number,
    ny: number,
    timeSeconds: number,
    aspectRatio: number
  ): number {
    const noise = this.config.noise;
    if (noise.profile === 'desktop-r5') {
      // Preserve the exact R5 desktop mask motion before the shared camera
      // rotates both source and highlight into the portrait viewport.
      const warpX = desktopNoise2D(
        nx * noise.warpScale + timeSeconds * noise.warpSpeedX,
        ny * noise.warpScale - timeSeconds * noise.warpSpeedY,
        8.3
      ) - .5;
      const warpY = desktopNoise2D(
        nx * noise.warpScale - timeSeconds * noise.warpSpeedY,
        ny * noise.warpScale + timeSeconds * noise.warpSpeedX,
        14.9
      ) - .5;
      const phase = timeSeconds * noise.phaseSpeed;
      const seedIndex = Math.floor(phase);
      const seedMix = smoother(phase - seedIndex);
      const x = nx * noise.scale + warpX * noise.warpAmount + timeSeconds * noise.driftX;
      const y = ny * noise.scale + warpY * noise.warpAmount + timeSeconds * noise.driftY;
      const a = desktopNoise2D(x, y, noise.seed + seedIndex * 19.31);
      const b = desktopNoise2D(x, y, noise.seed + (seedIndex + 1) * 19.31);

      return lerp(a, b, seedMix);
    }

    // Noise coordinates are source-pixel isotropic before the shared camera
    // rotates them. Normalized x/y alone made the field look like a regular
    // stretched grid on a 16:9 map.
    const px = nx * Math.max(.01, aspectRatio);
    const py = ny;
    const warpX = fractalPerlin2D(
      px * noise.warpScale + timeSeconds * noise.warpSpeedX,
      py * noise.warpScale - timeSeconds * noise.warpSpeedY,
      noise.seed + 17.3,
      2,
      2.03,
      .54
    ) - .5;
    const warpY = fractalPerlin2D(
      px * noise.warpScale - timeSeconds * noise.warpSpeedY,
      py * noise.warpScale + timeSeconds * noise.warpSpeedX,
      noise.seed + 61.7,
      2,
      2.11,
      .52
    ) - .5;
    const x = px * noise.scale + warpX * noise.warpAmount + timeSeconds * noise.driftX;
    const y = py * noise.scale + warpY * noise.warpAmount + timeSeconds * noise.driftY;
    const base = fractalPerlin2D(
      x,
      y,
      noise.seed,
      noise.octaves,
      noise.lacunarity,
      noise.gain
    );
    const broad = fractalPerlin2D(
      x * .43 - timeSeconds * .011,
      y * .43 + timeSeconds * .014,
      noise.seed + 101.9,
      3,
      1.97,
      .56
    );
    const ridgeSource = fractalPerlin2D(
      x * 1.31 + warpY * .38,
      y * 1.31 - warpX * .38,
      noise.seed + 233.1,
      2,
      2.17,
      .48
    );
    const ridge = 1 - Math.abs(ridgeSource * 2 - 1);

    return clamp(
      base * (1 - noise.ridgeMix - .24)
        + broad * .24
        + ridge * noise.ridgeMix,
      0,
      1
    );
  }

  private renderCameraOverlays(camera: Partial<StarFieldCamera>): void {
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
    this.drawCameraCanvasTo(
      highlightCtx,
      this.dynamicHighlightCanvas,
      this.cameraHighlightCanvas.width,
      this.cameraHighlightCanvas.height,
      camera
    );
  }

  private drawOutputGlow(layerCanvas: HTMLCanvasElement, blur: number, alpha: number): void {
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

  private drawCoveredCanvas(layerCanvas: HTMLCanvasElement, camera: Partial<StarFieldCamera>): void {
    if (!this.ctx) {
      return;
    }
    this.drawCameraCanvas(layerCanvas, camera);
  }

  private drawCameraCanvas(layerCanvas: HTMLCanvasElement, camera: Partial<StarFieldCamera>): void {
    if (!this.ctx) {
      return;
    }
    this.drawCameraCanvasTo(
      this.ctx,
      layerCanvas,
      this.canvas.width,
      this.canvas.height,
      camera
    );
  }

  private drawCameraCanvasTo(
    target: CanvasRenderingContext2D,
    layerCanvas: HTMLCanvasElement,
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

  private resizeOutput(): void {
    const requested = this.viewport?.() ?? null;
    const width = Math.max(
      1,
      Math.round(requested?.width || this.image?.naturalWidth || this.canvas.clientWidth || 1)
    );
    const height = Math.max(
      1,
      Math.round(requested?.height || this.image?.naturalHeight || this.canvas.clientHeight || 1)
    );
    if (this.canvas.width !== width) {
      this.canvas.width = width;
    }
    if (this.canvas.height !== height) {
      this.canvas.height = height;
    }
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

function resizeCanvas(canvas: HTMLCanvasElement, width: number, height: number): void {
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

function desktopNoise2D(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = smoother(xf);
  const v = smoother(yf);
  const a = desktopHash2(xi, yi, seed);
  const b = desktopHash2(xi + 1, yi, seed);
  const c = desktopHash2(xi, yi + 1, seed);
  const d = desktopHash2(xi + 1, yi + 1, seed);

  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

function desktopHash2(x: number, y: number, seed: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return value - Math.floor(value);
}

function perlin2D(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = smoother(xf);
  const v = smoother(yf);
  const top = lerp(
    gradientDot(xi, yi, xf, yf, seed),
    gradientDot(xi + 1, yi, xf - 1, yf, seed),
    u
  );
  const bottom = lerp(
    gradientDot(xi, yi + 1, xf, yf - 1, seed),
    gradientDot(xi + 1, yi + 1, xf - 1, yf - 1, seed),
    u
  );
  return clamp(.5 + lerp(top, bottom, v) * .72, 0, 1);
}

function gradientDot(
  gridX: number,
  gridY: number,
  offsetX: number,
  offsetY: number,
  seed: number
): number {
  const gradient = hashIndex(gridX, gridY, seed) & 7;
  switch (gradient) {
    case 0: return offsetX;
    case 1: return -offsetX;
    case 2: return offsetY;
    case 3: return -offsetY;
    case 4: return (offsetX + offsetY) * .7071;
    case 5: return (-offsetX + offsetY) * .7071;
    case 6: return (offsetX - offsetY) * .7071;
    default: return (-offsetX - offsetY) * .7071;
  }
}

function fractalPerlin2D(
  x: number,
  y: number,
  seed: number,
  octaves: number,
  lacunarity: number,
  gain: number
): number {
  let frequency = 1;
  let amplitude = 1;
  let sum = 0;
  let normalization = 0;
  const count = Math.max(1, Math.round(octaves));

  for (let octave = 0; octave < count; octave += 1) {
    const rotation = OCTAVE_ROTATIONS[octave % OCTAVE_ROTATIONS.length]!;
    const rotatedX = (x * rotation.cosine - y * rotation.sine) * frequency;
    const rotatedY = (x * rotation.sine + y * rotation.cosine) * frequency;
    sum += perlin2D(rotatedX, rotatedY, seed + octave * 47.17) * amplitude;
    normalization += amplitude;
    frequency *= lacunarity;
    amplitude *= gain;
  }

  return normalization > 0 ? sum / normalization : .5;
}

function hashIndex(x: number, y: number, seed: number): number {
  const seedInt = Math.floor(seed * 4096);
  let hash = Math.imul(x, 374_761_393)
    ^ Math.imul(y, 668_265_263)
    ^ Math.imul(seedInt, 1_442_695_041);
  hash = Math.imul(hash ^ (hash >>> 13), 1_274_126_177);
  return (hash ^ (hash >>> 16)) >>> 0;
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
