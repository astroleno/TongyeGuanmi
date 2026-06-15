const canvas = document.querySelector('[data-petal-converge-canvas]');
const scrollStage = document.querySelector('[data-petal-converge-scroll]') ?? document.body;
const context = canvas?.getContext('2d', { alpha: false });

const sourceCanvas = document.createElement('canvas');
const sourceContext = sourceCanvas.getContext('2d');
const petalCanvas = document.createElement('canvas');
const petalContext = petalCanvas.getContext('2d');
const flowerCanvas = document.createElement('canvas');
const flowerContext = flowerCanvas.getContext('2d');

const DPR_LIMIT = 1;
const SOURCE_SIZE = 1152;
const STRONG_SCROLL_VIEWPORTS = 0.52;
const TAU = Math.PI * 2;

const backgroundSrc = 'assets/patterns/backgrounds/aged-mottled-background-16x9-4k.png';

const layerConfigs = [
  {
    id: '04',
    src: 'assets/patterns/alpha-layers/pattern-layer-alpha-04.png',
    widthVmin: 1,
    baseAngle: 22.5,
    anchorX: 835.7,
    anchorY: 469.9,
    filter: 'brightness(0.83) contrast(1.07)'
  },
  {
    id: '03',
    src: 'assets/patterns/alpha-layers/pattern-layer-alpha-03.png',
    widthVmin: 1.28,
    baseAngle: 0,
    anchorX: 834.3,
    anchorY: 484.2,
    filter: 'brightness(0.93) contrast(1.05)'
  },
  {
    id: '02',
    src: 'assets/patterns/alpha-layers/pattern-layer-alpha-02.png',
    widthVmin: 1,
    baseAngle: 0,
    anchorX: 835.1,
    anchorY: 469.8,
    filter: 'brightness(0.93) contrast(1.08)'
  }
];

const ringConfigs = [
  { scale: 7.6, targetScale: 1.9, angle: -0.5, direction: 1, blur: 12, brightness: 0.34, texture: 'petal' },
  { scale: 6.8, targetScale: 1.72, angle: -0.08, direction: -1, blur: 10.4, brightness: 0.4, texture: 'petal' },
  { scale: 5.95, targetScale: 1.55, angle: 0.34, direction: 1, blur: 8.7, brightness: 0.48, texture: 'petal' },
  { scale: 5.1, targetScale: 1.4, angle: -0.28, direction: -1, blur: 7, brightness: 0.56, texture: 'petal' },
  { scale: 4.15, targetScale: 1.27, angle: 0.12, direction: 1, blur: 5.1, brightness: 0.68, texture: 'petal' },
  { scale: 3.28, targetScale: 1.16, angle: -0.14, direction: -1, blur: 3.4, brightness: 0.8, texture: 'petal' },
  { scale: 2.42, targetScale: 1.06, angle: 0.2, direction: 1, blur: 1.8, brightness: 0.91, texture: 'petal' },
  { scale: 1.48, targetScale: 1, angle: 0, direction: -1, blur: 0.45, brightness: 1, texture: 'source' }
];

const state = {
  width: 0,
  height: 0,
  dpr: 1,
  textureSize: 0,
  rafId: 0,
  background: null,
  layers: []
};

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const interpolate = (from, to, progress) => from + (to - from) * progress;
const smoothstep = (edge0, edge1, value) => {
  const progress = clamp((value - edge0) / (edge1 - edge0));
  return progress * progress * (3 - 2 * progress);
};

const easeInOutCubic = (value) => {
  const progress = clamp(value);
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
};

const loadImage = (src) => new Promise((resolve, reject) => {
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => resolve(image);
  image.onerror = reject;
  image.src = src;
});

const drawCoverImage = (ctx, image, x, y, width, height) => {
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
};

const drawCenteredLayer = (ctx, layer, vmin, centerX, centerY, scale = 1) => {
  const image = layer.image;
  const width = vmin * layer.widthVmin * scale;
  const height = width * (image.naturalHeight / image.naturalWidth);
  const imageScale = width / image.naturalWidth;
  const anchorX = (layer.anchorX ?? image.naturalWidth / 2) * imageScale;
  const anchorY = (layer.anchorY ?? image.naturalHeight / 2) * imageScale;
  const rotation = layer.baseAngle * Math.PI / 180;

  ctx.save();
  ctx.filter = layer.filter ?? 'none';
  ctx.translate(centerX, centerY);
  ctx.rotate(rotation);
  ctx.drawImage(image, -anchorX, -anchorY, width, height);
  ctx.restore();
};

const buildTextures = () => {
  sourceCanvas.width = SOURCE_SIZE;
  sourceCanvas.height = SOURCE_SIZE;
  petalCanvas.width = SOURCE_SIZE;
  petalCanvas.height = SOURCE_SIZE;
  sourceContext.clearRect(0, 0, SOURCE_SIZE, SOURCE_SIZE);
  petalContext.clearRect(0, 0, SOURCE_SIZE, SOURCE_SIZE);

  for (const layer of state.layers) {
    drawCenteredLayer(sourceContext, layer, SOURCE_SIZE, SOURCE_SIZE / 2, SOURCE_SIZE / 2, 0.9);
    if (layer.id === '04' || layer.id === '03') {
      drawCenteredLayer(petalContext, layer, SOURCE_SIZE, SOURCE_SIZE / 2, SOURCE_SIZE / 2, 0.9);
    }
  }
};

const getObjectMetrics = () => {
  const isMobile = state.width < 760 * state.dpr;
  const vmin = Math.min(state.width, state.height);
  const displaySize = isMobile
    ? Math.min(vmin * 1.18, state.width * 1.05)
    : Math.min(vmin * 1.26, state.width * 0.88);

  return {
    size: displaySize,
    centerX: isMobile ? state.width * 0.52 : state.width * 0.72,
    centerY: isMobile ? state.height * 0.57 : state.height * 0.54
  };
};

const resize = () => {
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_LIMIT);
  const width = Math.max(1, Math.round(window.innerWidth * dpr));
  const height = Math.max(1, Math.round(window.innerHeight * dpr));
  const sizeChanged = width !== state.width || height !== state.height || dpr !== state.dpr;

  if (sizeChanged) {
    state.width = width;
    state.height = height;
    state.dpr = dpr;
    canvas.width = width;
    canvas.height = height;
  }

  const metrics = getObjectMetrics();
  const textureSize = Math.max(620, Math.min(1160, Math.round(metrics.size)));
  if (textureSize !== state.textureSize) {
    state.textureSize = textureSize;
    flowerCanvas.width = textureSize;
    flowerCanvas.height = textureSize;
  }
};

const getScrollProgress = () => {
  if (!scrollStage) return 0;
  const viewportHeight = Math.max(1, window.innerHeight || state.height / state.dpr || 1);
  const rect = scrollStage.getBoundingClientRect();
  const scrollable = Math.max(1, scrollStage.offsetHeight - viewportHeight);
  const span = Math.max(1, Math.min(viewportHeight * STRONG_SCROLL_VIEWPORTS, scrollable));
  return clamp(-rect.top / span);
};

const drawRing = (ring, progress, metrics) => {
  const spin = smoothstep(0, 0.58, progress);
  const collapse = smoothstep(0.58, 1, progress);
  const texture = ring.texture === 'source' ? sourceCanvas : petalCanvas;
  const spinAngle = ring.direction * interpolate(0, Math.PI * 0.72, spin);
  const size = metrics.size * interpolate(ring.scale, ring.targetScale, easeInOutCubic(collapse));
  const blur = interpolate(ring.blur, Math.min(ring.blur, 0.5), collapse);
  const brightness = interpolate(ring.brightness, 1, smoothstep(0.35, 1, progress));

  context.save();
  context.translate(metrics.centerX, metrics.centerY);
  context.rotate(ring.angle + spinAngle);
  context.filter = `blur(${blur.toFixed(2)}px) brightness(${brightness.toFixed(3)}) saturate(1.1)`;
  context.drawImage(texture, -size / 2, -size / 2, size, size);
  context.restore();
};

const renderSourceFlowerTexture = (progress) => {
  const size = state.textureSize;
  const focus = smoothstep(0.6, 1, progress);
  const scale = interpolate(0.72, 1, easeInOutCubic(focus));

  flowerContext.clearRect(0, 0, size, size);
  flowerContext.save();
  flowerContext.translate(size / 2, size / 2);
  flowerContext.rotate(interpolate(-0.08, 0, focus));
  flowerContext.filter = `blur(${interpolate(3.6, 0, focus).toFixed(2)}px) brightness(${interpolate(0.9, 1, focus).toFixed(3)})`;
  flowerContext.drawImage(sourceCanvas, -size * scale / 2, -size * scale / 2, size * scale, size * scale);
  flowerContext.restore();
};

const drawSourceFlower = (progress, metrics) => {
  const settle = smoothstep(0.58, 1, progress);
  if (settle <= 0) return;

  renderSourceFlowerTexture(progress);
  const scale = interpolate(0.82, 1, easeInOutCubic(settle));
  const size = metrics.size * scale;

  context.save();
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.shadowColor = 'rgba(34, 24, 21, 0.24)';
  context.shadowBlur = Math.min(state.width, state.height) * interpolate(0.025, 0.052, settle);
  context.shadowOffsetY = Math.min(state.width, state.height) * 0.012;
  context.drawImage(flowerCanvas, metrics.centerX - size / 2, metrics.centerY - size / 2, size, size);
  context.restore();
};

const drawFrame = () => {
  if (!state.background || !state.layers.length) return;

  const progress = getScrollProgress();
  const metrics = getObjectMetrics();
  const collapse = smoothstep(0.58, 1, progress);
  const farthestX = Math.max(metrics.centerX, state.width - metrics.centerX);
  const farthestY = Math.max(metrics.centerY, state.height - metrics.centerY);
  const maxRadius = Math.hypot(farthestX, farthestY);
  const clipRadius = interpolate(maxRadius * 1.1, metrics.size * 0.035, easeInOutCubic(collapse));

  drawCoverImage(context, state.background, 0, 0, state.width, state.height);

  context.save();
  if (collapse > 0.01) {
    context.beginPath();
    context.arc(metrics.centerX, metrics.centerY, clipRadius, 0, TAU);
    context.clip();
  }

  for (const ring of ringConfigs) {
    drawRing(ring, progress, metrics);
  }
  context.restore();

  drawSourceFlower(progress, metrics);
};

const render = () => {
  state.rafId = 0;
  resize();
  drawFrame();
};

const requestRender = () => {
  if (state.rafId) return;
  state.rafId = window.requestAnimationFrame(render);
};

const start = async () => {
  if (!canvas || !context || !sourceContext || !petalContext || !flowerContext) return;

  const [background, ...layers] = await Promise.all([
    loadImage(backgroundSrc),
    ...layerConfigs.map((layer) => loadImage(layer.src))
  ]);

  state.background = background;
  state.layers = layerConfigs.map((layer, index) => ({
    ...layer,
    image: layers[index]
  }));
  buildTextures();
  resize();
  drawFrame();
};

window.addEventListener('resize', requestRender, { passive: true });
window.addEventListener('scroll', requestRender, { passive: true });
start().catch((error) => {
  console.error('Failed to start petal converge stage', error);
});
