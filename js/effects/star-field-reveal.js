const DEFAULT_CONFIG = {
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

export function initStarFieldReveal(options) {
  const reveal = new StarFieldReveal(options);
  reveal.init();
  return reveal;
}

class StarFieldReveal {
  constructor(options) {
    this.canvas = options.canvas;
    this.ctx = this.canvas?.getContext('2d');
    this.replayButton = options.replayButton;
    this.maskButton = options.maskButton;
    this.noiseButton = options.noiseButton;
    this.sourceUrl = options.sourceUrl;
    this.config = mergeConfig(DEFAULT_CONFIG, options.config || {});
    this.autoplay = options.autoplay ?? true;

    this.image = null;
    this.sourceCanvas = null;
    this.sourceData = null;
    this.highlightCanvas = null;
    this.dynamicHighlightCanvas = null;
    this.noiseMaskCanvas = null;
    this.rafId = 0;
    this.ready = false;
    this.showMask = false;
    this.showNoise = false;
  }

  init() {
    if (!this.canvas || !this.ctx || !this.sourceUrl) return;

    this.bindControls();
    this.loadImage();
  }

  dispose() {
    window.cancelAnimationFrame(this.rafId);
  }

  bindControls() {
    this.replayButton?.addEventListener('click', () => this.play());
    this.maskButton?.addEventListener('click', () => this.toggleMask());
    this.noiseButton?.addEventListener('click', () => this.toggleNoise());
  }

  loadImage() {
    const image = new Image();
    image.decoding = 'async';
    image.addEventListener('load', () => {
      this.image = image;
      this.prepareSource();
      this.ready = true;
      if (this.autoplay) this.play();
    }, { once: true });
    image.src = this.sourceUrl;
  }

  prepareSource() {
    this.canvas.width = this.image.naturalWidth;
    this.canvas.height = this.image.naturalHeight;

    this.sourceCanvas = createCanvas(this.image.naturalWidth, this.image.naturalHeight);
    const sourceCtx = this.sourceCanvas.getContext('2d', { willReadFrequently: true });
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

  play() {
    if (!this.image || !this.highlightCanvas) return;

    this.showMask = false;
    this.showNoise = false;
    this.maskButton?.setAttribute('aria-pressed', 'false');
    this.noiseButton?.setAttribute('aria-pressed', 'false');
    window.cancelAnimationFrame(this.rafId);

    const startedAt = performance.now();
    const frame = (now) => {
      const elapsed = now - startedAt;

      if (elapsed <= this.config.revealDurationMs) {
        this.renderEntrance(elapsed / this.config.revealDurationMs, elapsed / 1000);
      } else {
        const loopElapsed = elapsed - this.config.revealDurationMs;
        const loopBlend = lerp(.45, 1, smoothstep(0, this.config.loopTransitionMs, loopElapsed));
        this.renderLoop(elapsed / 1000, loopBlend);
      }

      this.rafId = window.requestAnimationFrame(frame);
    };

    this.rafId = window.requestAnimationFrame(frame);
  }

  toggleMask() {
    this.showMask = !this.showMask;
    this.showNoise = false;
    this.maskButton?.setAttribute('aria-pressed', String(this.showMask));
    this.noiseButton?.setAttribute('aria-pressed', 'false');

    window.cancelAnimationFrame(this.rafId);
    this.showMask ? this.renderMask() : this.play();
  }

  toggleNoise() {
    this.showNoise = !this.showNoise;
    this.showMask = false;
    this.noiseButton?.setAttribute('aria-pressed', String(this.showNoise));
    this.maskButton?.setAttribute('aria-pressed', 'false');

    window.cancelAnimationFrame(this.rafId);
    this.showNoise ? this.startNoisePreview() : this.play();
  }

  renderMask() {
    if (!this.highlightCanvas) return;

    this.clear();
    this.ctx.fillStyle = '#020403';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.globalCompositeOperation = 'screen';
    this.ctx.globalAlpha = 1;
    this.ctx.drawImage(this.highlightCanvas, 0, 0);
    this.resetContext();
  }

  startNoisePreview() {
    const frame = (now) => {
      if (!this.showNoise) return;
      this.renderNoiseField(now / 1000);
      this.rafId = window.requestAnimationFrame(frame);
    };

    this.rafId = window.requestAnimationFrame(frame);
  }

  renderNoiseField(timeSeconds) {
    if (!this.noiseMaskCanvas) return;

    this.buildDynamicHighlight(timeSeconds);
    this.clear();
    this.ctx.fillStyle = '#020403';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
    this.ctx.drawImage(this.noiseMaskCanvas, 0, 0, this.canvas.width, this.canvas.height);
    this.resetContext();
  }

  renderEntrance(t, timeSeconds) {
    const imageReveal = smoothstep(.2, .72, t);
    const starIgnite = smoothstep(0, .16, t);
    const resolve = smoothstep(.58, 1, t);
    const starStrength = lerp(.82, 1, starIgnite) * lerp(1, .45, resolve);
    const noiseFloor = lerp(.58, .08, smoothstep(.18, 1, t));

    this.clear();
    this.ctx.fillStyle = '#020403';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.globalAlpha = imageReveal;
    this.ctx.filter = `brightness(${lerp(.86, 1, imageReveal)}) saturate(${lerp(.9, 1, imageReveal)})`;
    this.ctx.drawImage(this.sourceCanvas, 0, 0);
    this.resetContext();

    this.renderNoiseOverlay(timeSeconds, starStrength, { noiseFloor });
  }

  renderLoop(timeSeconds, loopBlend) {
    const noiseFloor = lerp(.08, 0, smoothstep(.45, 1, loopBlend));
    this.renderBackground({ timeSeconds, strength: loopBlend, noiseFloor });
  }

  renderBackground(options = {}) {
    if (!this.ready) return;

    const timeSeconds = options.timeSeconds ?? performance.now() / 1000;
    const strength = options.strength ?? 1;
    const noiseFloor = options.noiseFloor ?? 0;

    this.clear();
    this.ctx.drawImage(this.sourceCanvas, 0, 0);
    this.renderNoiseOverlay(timeSeconds, strength, { noiseFloor });
  }

  renderNoiseOverlay(timeSeconds, strength, options = {}) {
    this.buildDynamicHighlight(timeSeconds, options);

    this.ctx.globalCompositeOperation = 'lighter';
    this.drawCanvasLayer(this.dynamicHighlightCanvas, {
      blur: 72,
      scale: 1.012,
      alpha: 1.08 * strength
    });
    this.drawCanvasLayer(this.dynamicHighlightCanvas, {
      blur: 26,
      scale: 1.004,
      alpha: .92 * strength
    });
    this.drawCanvasLayer(this.dynamicHighlightCanvas, {
      blur: 4,
      scale: 1,
      alpha: .62 * strength
    });

    this.ctx.globalCompositeOperation = 'screen';
    this.drawCanvasLayer(this.dynamicHighlightCanvas, {
      blur: 0,
      scale: 1,
      alpha: .52 * strength
    });
    this.resetContext();
  }

  buildHighlightSource() {
    const highlightCtx = this.highlightCanvas.getContext('2d');
    const output = highlightCtx.createImageData(this.sourceData.width, this.sourceData.height);
    const src = this.sourceData.data;
    const dst = output.data;
    const { threshold, gamma, softness } = this.config.highlight;

    for (let i = 0; i < src.length; i += 4) {
      const r = src[i];
      const g = src[i + 1];
      const b = src[i + 2];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const value = Math.max(r, g, b);
      const score = luma * .58 + value * .42;
      const normalized = clamp((score - threshold) / softness, 0, 1);
      const alpha = Math.pow(normalized, gamma);

      if (alpha <= .001) {
        dst[i + 3] = 0;
        continue;
      }

      dst[i] = 255;
      dst[i + 1] = Math.round(226 + alpha * 26);
      dst[i + 2] = Math.round(178 + alpha * 58);
      dst[i + 3] = Math.round(alpha * 255);
    }

    highlightCtx.putImageData(output, 0, 0);
  }

  buildDynamicHighlight(timeSeconds, options = {}) {
    const noiseCtx = this.noiseMaskCanvas.getContext('2d', { willReadFrequently: true });
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
        const mask = smoothstep(thresholdLow, thresholdHigh, field);
        const maskAlpha = lerp(options.noiseFloor || 0, 1, mask);
        const i = (y * width + x) * 4;

        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = Math.round(maskAlpha * 255);
      }
    }

    noiseCtx.putImageData(mask, 0, 0);

    const dynamicCtx = this.dynamicHighlightCanvas.getContext('2d');
    dynamicCtx.clearRect(0, 0, this.dynamicHighlightCanvas.width, this.dynamicHighlightCanvas.height);
    dynamicCtx.drawImage(this.highlightCanvas, 0, 0);
    dynamicCtx.globalCompositeOperation = 'destination-in';
    dynamicCtx.imageSmoothingEnabled = true;
    dynamicCtx.imageSmoothingQuality = 'high';
    dynamicCtx.drawImage(this.noiseMaskCanvas, 0, 0, this.dynamicHighlightCanvas.width, this.dynamicHighlightCanvas.height);
    dynamicCtx.globalCompositeOperation = 'source-over';
  }

  animatedNoiseField(nx, ny, timeSeconds) {
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

  drawCanvasLayer(layerCanvas, { blur, scale, alpha }) {
    if (alpha <= .002) return;

    const w = this.canvas.width;
    const h = this.canvas.height;
    const dw = w * scale;
    const dh = h * scale;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;

    this.ctx.globalAlpha = Math.max(0, alpha);
    this.ctx.filter = `blur(${Math.max(0, blur)}px) brightness(1.18)`;
    this.ctx.drawImage(layerCanvas, dx, dy, dw, dh);
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  resetContext() {
    this.ctx.filter = 'none';
    this.ctx.globalAlpha = 1;
    this.ctx.globalCompositeOperation = 'source-over';
  }
}

function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function mergeConfig(base, override) {
  return {
    ...base,
    ...override,
    highlight: { ...base.highlight, ...(override.highlight || {}) },
    noise: { ...base.noise, ...(override.noise || {}) }
  };
}

function smoothstep(edge0, edge1, value) {
  const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

function noise2D(x, y, seed) {
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

function hash2(x, y, seed) {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function smoother(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
