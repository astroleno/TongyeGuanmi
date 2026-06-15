const canvas = document.querySelector('[data-mirror-stage-canvas], [data-bloom-canvas]');
const scrollStage = document.querySelector('[data-mirror-stage-scroll]') ?? document.querySelector('.bloom-page') ?? document.body;
const context = canvas?.getContext('2d', { alpha: false });

const sourceCanvas = document.createElement('canvas');
const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
const petalCanvas = document.createElement('canvas');
const petalContext = petalCanvas.getContext('2d');
const flowerCanvas = document.createElement('canvas');
const flowerContext = flowerCanvas.getContext('2d', { willReadFrequently: true });

const DPR_LIMIT = 1.25;
const SOURCE_SIZE = 1152;
const STRONG_SCROLL_VIEWPORTS = 0.42;
const TAU = Math.PI * 2;
const FINAL_ROTATION = 120 * Math.PI / 180;
const SOURCE_FLOWER_SCALE = 0.702;
const OUTER_KALEIDOSCOPE_SEGMENTS = 16;

const backgroundSrc = 'assets/patterns/backgrounds/aged-mottled-background-16x9-4k.png';

const layerConfigs = [
  {
    id: '06',
    src: 'assets/patterns/alpha-layers/pattern-layer-alpha-06.png',
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
    src: 'assets/patterns/alpha-layers/pattern-layer-alpha-05.png',
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
    src: 'assets/patterns/alpha-layers/pattern-layer-alpha-04.png',
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
    src: 'assets/patterns/alpha-layers/pattern-layer-alpha-03.png',
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
    src: 'assets/patterns/alpha-layers/pattern-layer-alpha-02.png',
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

const state = {
  width: 0,
  height: 0,
  dpr: 1,
  textureSize: 0,
  rafId: 0,
  startedAt: 0,
  background: null,
  layers: []
};
const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const interpolate = (from, to, progress) => from + (to - from) * progress;

const bloomRings = [
  {
    scale: 4.86,
    endScale: 0.08,
    rotation: 11.25,
    spin: 1.34,
    filter: 'blur(8px) brightness(0.58) saturate(1.14) contrast(1.12)'
  },
  {
    scale: 4.04,
    endScale: 0.11,
    rotation: -22.5,
    spin: -1.18,
    filter: 'blur(6px) brightness(0.64) saturate(1.12) contrast(1.12)'
  },
  {
    scale: 3.16,
    endScale: 0.16,
    rotation: 0,
    spin: 1,
    filter: 'blur(4.25px) brightness(0.72) saturate(1.1) contrast(1.1)'
  },
  {
    scale: 2.38,
    endScale: 0.2,
    rotation: 22.5,
    spin: -0.84,
    filter: 'blur(2.6px) brightness(0.8) saturate(1.07) contrast(1.08)'
  },
  {
    scale: 1.74,
    endScale: 0.24,
    rotation: -11.25,
    spin: 0.72,
    filter: 'blur(1.25px) brightness(0.9) saturate(1.04) contrast(1.06)'
  },
  {
    scale: 1.24,
    endScale: 0.28,
    rotation: 11.25,
    spin: -0.58,
    filter: 'blur(0.35px) brightness(0.98) saturate(1.02) contrast(1.04)'
  }
];

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

const drawCenteredLayer = (ctx, layer, vmin, centerX, centerY, scale = 1, rotationOffset = 0) => {
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
};

const buildSourceTexture = () => {
  sourceCanvas.width = SOURCE_SIZE;
  sourceCanvas.height = SOURCE_SIZE;
  petalCanvas.width = SOURCE_SIZE;
  petalCanvas.height = SOURCE_SIZE;
  sourceContext.clearRect(0, 0, SOURCE_SIZE, SOURCE_SIZE);
  petalContext.clearRect(0, 0, SOURCE_SIZE, SOURCE_SIZE);

  for (const layer of state.layers) {
    if (layer.role === 'decor') continue;
    drawCenteredLayer(sourceContext, layer, SOURCE_SIZE, SOURCE_SIZE / 2, SOURCE_SIZE / 2, 0.9);
    if (layer.id !== '02') {
      drawCenteredLayer(petalContext, layer, SOURCE_SIZE, SOURCE_SIZE / 2, SOURCE_SIZE / 2, 0.9);
    }
  }
};

const getObjectMetrics = () => {
  const isMobile = state.width < 760 * state.dpr;
  const vmin = Math.min(state.width, state.height);
  const displaySize = isMobile
    ? Math.min(vmin * 1.34, state.width * 1.12)
    : Math.min(vmin * 1.34, state.width * 0.96);

  return {
    size: displaySize,
    centerX: isMobile ? state.width * 0.42 : state.width * 0.28,
    centerY: isMobile ? state.height * 0.58 : state.height * 0.55
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
  const textureSize = Math.max(640, Math.min(1180, Math.round(metrics.size)));
  if (textureSize !== state.textureSize) {
    state.textureSize = textureSize;
    flowerCanvas.width = textureSize;
    flowerCanvas.height = textureSize;
  }

  return sizeChanged;
};

const getScrollProgress = () => {
  if (!scrollStage) return 0;
  const viewportHeight = Math.max(1, window.innerHeight || state.height / state.dpr || 1);
  const rect = scrollStage.getBoundingClientRect();
  const scrollable = Math.max(1, scrollStage.offsetHeight - viewportHeight);
  const span = Math.max(1, Math.min(viewportHeight * STRONG_SCROLL_VIEWPORTS, scrollable));
  const raw = -rect.top / span;
  return clamp(raw);
};

const renderSourceFlowerTexture = (elapsed) => {
  const size = state.textureSize;

  flowerContext.clearRect(0, 0, size, size);

  for (const layer of state.layers) {
    if (layer.role === 'decor') continue;
    const rotationOffset = (layer.direction ?? 0) * (elapsed / (layer.duration ?? 60)) * TAU;
    drawCenteredLayer(
      flowerContext,
      layer,
      size,
      size / 2,
      size / 2,
      SOURCE_FLOWER_SCALE * (layer.sourceScale ?? 1),
      rotationOffset
    );
  }
};

const drawDecorLayer = (layer, elapsed, metrics) => {
  const image = layer.image;
  const vmin = Math.min(state.width, state.height);
  const width = layer.sizeRatio
    ? metrics.size * layer.sizeRatio
    : vmin * layer.widthVmin * layer.scale;
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
};

const drawDecorLayers = (elapsed, metrics) => {
  for (const layer of state.layers) {
    if (layer.role !== 'decor') continue;
    drawDecorLayer(layer, elapsed, metrics);
  }
};

const drawOuterPetalKaleidoscope = (drawSize, rotation, filter, elapsed, spin) => {
  const wedge = TAU / OUTER_KALEIDOSCOPE_SEGMENTS;
  const radius = drawSize * 0.74;
  const sampleRotation = elapsed * 0.018 * spin;
  const sampleX = Math.cos(elapsed * 0.13 + spin) * drawSize * 0.012;
  const sampleY = Math.sin(elapsed * 0.11 - spin) * drawSize * 0.012;

  context.save();
  context.rotate(rotation);
  context.filter = filter;

  for (let index = 0; index < OUTER_KALEIDOSCOPE_SEGMENTS; index += 1) {
    context.save();
    context.rotate(index * wedge);
    context.beginPath();
    context.moveTo(0, 0);
    context.arc(0, 0, radius, -wedge / 2 - 0.003, wedge / 2 + 0.003);
    context.closePath();
    context.clip();

    if (index % 2 === 1) {
      context.scale(1, -1);
    }

    context.rotate(sampleRotation);
    context.drawImage(petalCanvas, -drawSize / 2 + sampleX, -drawSize / 2 + sampleY, drawSize, drawSize);
    context.restore();
  }

  context.restore();
};

const drawPetalField = (progress, metrics, elapsed) => {
  const eased = easeInOutCubic(progress);
  const collapse = smoothstep(0.02, 1, progress);
  const fieldRotation = interpolate(FINAL_ROTATION, 0, eased);

  for (const ring of bloomRings) {
    const drawSize = metrics.size * interpolate(ring.scale, ring.endScale, collapse);
    const rotation = ring.rotation * Math.PI / 180 + fieldRotation * ring.spin + elapsed * 0.028 * ring.spin;

    if (drawSize < 2) continue;

    context.save();
    context.translate(metrics.centerX, metrics.centerY);
    drawOuterPetalKaleidoscope(drawSize, rotation, ring.filter, elapsed, ring.spin);
    context.restore();
  }
};

const drawFrame = (now) => {
  const progress = getScrollProgress();
  const metrics = getObjectMetrics();
  const elapsed = Math.max(0, (now - state.startedAt) / 1000);

  drawCoverImage(context, state.background, 0, 0, state.width, state.height);
  drawDecorLayers(elapsed, metrics);
  drawPetalField(progress, metrics, elapsed);
  renderSourceFlowerTexture(elapsed);

  context.save();
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.shadowColor = 'rgba(34, 24, 21, 0.24)';
  context.shadowBlur = Math.min(state.width, state.height) * 0.055;
  context.shadowOffsetY = Math.min(state.width, state.height) * 0.018;
  context.drawImage(
    flowerCanvas,
    metrics.centerX - metrics.size / 2,
    metrics.centerY - metrics.size / 2,
    metrics.size,
    metrics.size
  );
  context.restore();
};

const render = (now) => {
  state.rafId = 0;
  resize();
  drawFrame(now);

  if (!mediaQuery.matches) {
    state.rafId = window.requestAnimationFrame(render);
  }
};

const requestRender = () => {
  if (state.rafId) return;
  state.rafId = window.requestAnimationFrame(render);
};

const start = async () => {
  if (!canvas || !context || !sourceContext || !flowerContext) return;

  const [background, ...layers] = await Promise.all([
    loadImage(backgroundSrc),
    ...layerConfigs.map((layer) => loadImage(layer.src))
  ]);

  state.background = background;
  state.layers = layerConfigs.map((layer, index) => ({
    ...layer,
    image: layers[index]
  }));
  state.startedAt = performance.now();

  buildSourceTexture();
  resize();
  render(state.startedAt);
};

window.addEventListener('resize', requestRender, { passive: true });
window.addEventListener('scroll', requestRender, { passive: true });
mediaQuery.addEventListener?.('change', requestRender);
start().catch((error) => {
  console.error('Failed to start mirror stage', error);
});
