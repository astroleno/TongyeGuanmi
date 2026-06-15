const canvas = document.querySelector('[data-kaleidoscope-canvas]');
const context = canvas?.getContext('2d', { alpha: false });

const TAU = Math.PI * 2;
const SEGMENTS = 16;
const DPR_LIMIT = 1.25;

const backgroundSrc = 'assets/patterns/backgrounds/aged-mottled-background-16x9-4k.png';

const layerConfigs = [
  {
    id: '06',
    src: 'assets/patterns/alpha-layers/pattern-layer-alpha-06.png',
    mode: 'plain',
    widthVmin: 2.05,
    scale: 1.10,
    baseAngle: -5,
    direction: 1,
    duration: 60
  },
  {
    id: '05',
    src: 'assets/patterns/alpha-layers/pattern-layer-alpha-05.png',
    mode: 'plain',
    widthVmin: 1.28,
    scale: 1.15,
    baseAngle: 0,
    direction: -1,
    duration: 64
  },
  {
    id: '04',
    src: 'assets/patterns/alpha-layers/pattern-layer-alpha-04.png',
    mode: 'kaleidoscope',
    widthVmin: 1,
    scale: 1,
    baseAngle: 22.5,
    anchorX: 835.7,
    anchorY: 469.9,
    direction: 1,
    duration: 52
  },
  {
    id: '03',
    src: 'assets/patterns/alpha-layers/pattern-layer-alpha-03.png',
    mode: 'kaleidoscope',
    widthVmin: 1.28,
    scale: 1,
    baseAngle: 22.5,
    anchorX: 834.3,
    anchorY: 484.2,
    direction: -1,
    duration: 56
  },
  {
    id: '02',
    src: 'assets/patterns/alpha-layers/pattern-layer-alpha-02.png',
    mode: 'kaleidoscope',
    widthVmin: 1,
    scale: 1,
    baseAngle: 0,
    anchorX: 835.1,
    anchorY: 469.8,
    direction: 1,
    duration: 48
  }
];

const textureCanvas = document.createElement('canvas');
const textureContext = textureCanvas.getContext('2d');
const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

const state = {
  width: 0,
  height: 0,
  dpr: 1,
  textureSize: 0,
  startedAt: 0,
  background: null,
  layers: []
};

const loadImage = (src) => new Promise((resolve, reject) => {
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => resolve(image);
  image.onerror = reject;
  image.src = src;
});

const resize = () => {
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_LIMIT);
  const width = Math.max(1, Math.round(window.innerWidth * dpr));
  const height = Math.max(1, Math.round(window.innerHeight * dpr));

  if (width === state.width && height === state.height && dpr === state.dpr) return;

  state.width = width;
  state.height = height;
  state.dpr = dpr;
  canvas.width = width;
  canvas.height = height;

  const vmin = Math.min(width, height);
  state.textureSize = Math.ceil(Math.max(Math.hypot(width, height), vmin * 2.72));
  textureCanvas.width = state.textureSize;
  textureCanvas.height = state.textureSize;
};

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

const drawCenteredLayer = (ctx, layer, elapsed, vmin, centerX, centerY) => {
  const image = layer.image;
  const width = vmin * layer.widthVmin * layer.scale;
  const height = width * (image.naturalHeight / image.naturalWidth);
  const imageScale = width / image.naturalWidth;
  const anchorX = (layer.anchorX ?? image.naturalWidth / 2) * imageScale;
  const anchorY = (layer.anchorY ?? image.naturalHeight / 2) * imageScale;
  const rotation = (layer.baseAngle * Math.PI / 180) + layer.direction * (elapsed / layer.duration) * TAU;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(rotation);
  ctx.drawImage(image, -anchorX, -anchorY, width, height);
  ctx.restore();
};

const drawTexture = (elapsed) => {
  const size = state.textureSize;
  const vmin = Math.min(state.width, state.height);

  textureContext.clearRect(0, 0, size, size);

  for (const layer of state.layers) {
    if (layer.mode !== 'kaleidoscope') continue;
    drawCenteredLayer(textureContext, layer, elapsed, vmin, size / 2, size / 2);
  }
};

const drawPlainLayers = (elapsed) => {
  const vmin = Math.min(state.width, state.height);
  const cx = state.width / 2;
  const cy = state.height / 2;

  for (const layer of state.layers) {
    if (layer.mode !== 'plain') continue;
    drawCenteredLayer(context, layer, elapsed, vmin, cx, cy);
  }
};

const drawKaleidoscope = (elapsed) => {
  const { width, height, textureSize } = state;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.hypot(width, height) / 2 + Math.min(width, height) * 0.18;
  const wedge = TAU / SEGMENTS;
  const spin = elapsed * 0.035;
  const sampleRotation = elapsed * 0.055;
  const sampleX = Math.cos(elapsed * 0.17) * Math.min(width, height) * 0.035;
  const sampleY = Math.sin(elapsed * 0.13) * Math.min(width, height) * 0.035;

  context.clearRect(0, 0, width, height);
  drawCoverImage(context, state.background, 0, 0, width, height);
  drawPlainLayers(elapsed);

  context.save();
  context.translate(cx, cy);
  context.rotate(spin);

  for (let index = 0; index < SEGMENTS; index += 1) {
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
    context.drawImage(textureCanvas, -textureSize / 2 + sampleX, -textureSize / 2 + sampleY);
    context.restore();
  }

  context.restore();
};

const render = (now) => {
  resize();
  const elapsed = (now - state.startedAt) / 1000;
  drawTexture(elapsed);
  drawKaleidoscope(elapsed);

  if (!mediaQuery.matches) {
    window.requestAnimationFrame(render);
  }
};

const start = async () => {
  if (!canvas || !context || !textureContext) return;

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

  resize();
  render(state.startedAt);
};

window.addEventListener('resize', resize, { passive: true });
start().catch((error) => {
  console.error('Failed to start pattern kaleidoscope', error);
});
