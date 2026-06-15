const canvas = document.querySelector('[data-bloom-model-canvas]');
const context = canvas?.getContext('2d', { alpha: false });

const TAU = Math.PI * 2;
const DPR_LIMIT = 1.25;
const SOURCE_PATTERN_SCALE = 0.90;
const backgroundSrc = 'assets/patterns/backgrounds/aged-mottled-background-16x9-4k.png';

const layerConfigs = [
  {
    id: '04',
    src: 'assets/patterns/alpha-layers/pattern-layer-alpha-04.png',
    widthVmin: 1,
    baseAngle: 22.5,
    anchorX: 835.7,
    anchorY: 469.9,
    direction: 1,
    motionRate: 1
  },
  {
    id: '03',
    src: 'assets/patterns/alpha-layers/pattern-layer-alpha-03.png',
    widthVmin: 1.28,
    baseAngle: 0,
    anchorX: 834.3,
    anchorY: 484.2,
    direction: -1,
    motionRate: 1
  },
  {
    id: '02',
    src: 'assets/patterns/alpha-layers/pattern-layer-alpha-02.png',
    widthVmin: 1,
    baseAngle: 0,
    anchorX: 835.1,
    anchorY: 469.8,
    direction: 1,
    motionRate: 2
  }
];

const sourceCanvas = document.createElement('canvas');
const sourceContext = sourceCanvas.getContext('2d');

const state = {
  width: 0,
  height: 0,
  dpr: 1,
  sourceSize: 0,
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

  if (width === state.width && height === state.height && dpr === state.dpr) return false;

  state.width = width;
  state.height = height;
  state.dpr = dpr;
  canvas.width = width;
  canvas.height = height;

  const vmin = Math.min(width, height);
  state.sourceSize = Math.ceil(Math.max(Math.hypot(width, height), vmin * 2.5));
  sourceCanvas.width = state.sourceSize;
  sourceCanvas.height = state.sourceSize;

  return true;
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

const drawCenteredLayer = (ctx, layer, turn, vmin, centerX, centerY, scale, extraAngle, filter = 'none') => {
  const image = layer.image;
  const width = vmin * layer.widthVmin * scale;
  const height = width * (image.naturalHeight / image.naturalWidth);
  const imageScale = width / image.naturalWidth;
  const anchorX = (layer.anchorX ?? image.naturalWidth / 2) * imageScale;
  const anchorY = (layer.anchorY ?? image.naturalHeight / 2) * imageScale;
  const rotation = ((layer.baseAngle + extraAngle) * Math.PI / 180) + layer.direction * turn * layer.motionRate * TAU;

  ctx.save();
  ctx.filter = filter;
  ctx.translate(centerX, centerY);
  ctx.rotate(rotation);
  ctx.drawImage(image, -anchorX, -anchorY, width, height);
  ctx.restore();
};

const drawOriginalPattern = (ctx, turn, vmin, centerX, centerY, scale = 1) => {
  const [outerPetal, middlePetal, centerSeal] = state.layers;
  const sourceLayers = [
    [outerPetal, 0, 'brightness(0.86) contrast(1.06)'],
    [middlePetal, 0, 'brightness(0.94) contrast(1.04)'],
    [centerSeal, 0, 'brightness(0.92) contrast(1.08)']
  ];

  for (const [layer, angle, filter] of sourceLayers) {
    drawCenteredLayer(ctx, layer, turn, vmin, centerX, centerY, scale, angle, filter);
  }
};

const getCloseProgress = (turn) => Math.min(Math.max(turn, 0), 1);

const interpolate = (from, to, progress) => from + (to - from) * progress;

const drawPetalTexture = (turn) => {
  const size = state.sourceSize;
  const vmin = Math.min(state.width, state.height);
  const [outerPetal, middlePetal, centerSeal] = state.layers;
  const centerX = size / 2;
  const centerY = size / 2;
  const closeProgress = getCloseProgress(turn);
  const unfold = 1 - closeProgress;
  const baseLayers = [
    [outerPetal, 1.10, 10, 'brightness(0.58) contrast(1.18)'],
    [middlePetal, 0.96, 17, 'brightness(0.88) contrast(1.10)'],
    [centerSeal, 1.02, 4, 'brightness(0.94) contrast(1.08)']
  ];

  sourceContext.clearRect(0, 0, size, size);

  for (const [layer, scale, angle, filter] of baseLayers) {
    drawCenteredLayer(sourceContext, layer, turn, vmin, centerX, centerY, scale, angle, filter);
  }

  if (unfold < 0.015) return;

  const bridgeLayers = [
    [outerPetal, 1.10, 1.34, 10, 0, 'brightness(0.48) contrast(1.22)'],
    [middlePetal, 0.96, 1.20, 17, -9, 'brightness(0.72) contrast(1.14)'],
    [middlePetal, 0.96, 0.78, 17, -13, 'brightness(1.02) contrast(1.06)'],
    [centerSeal, 1.02, 0.56, 4, -11, 'brightness(0.82) contrast(1.14)']
  ];

  for (const [layer, fromScale, toScale, fromAngle, toAngle, filter] of bridgeLayers) {
    drawCenteredLayer(
      sourceContext,
      layer,
      turn,
      vmin,
      centerX,
      centerY,
      interpolate(fromScale, toScale, unfold),
      interpolate(fromAngle, toAngle, unfold),
      filter
    );
  }
};

const drawKaleidoscope = (turn) => {
  const { width, height } = state;
  const vmin = Math.min(width, height);
  const focusX = width / 2;
  const focusY = height / 2;
  const radius = vmin * 0.44;
  const segments = 14;
  const wedge = TAU / segments;
  const sourceScale = 0.68;
  const drawSize = state.sourceSize * sourceScale;
  const driftX = 0;
  const driftY = 0;

  context.save();
  context.translate(focusX, focusY);
  context.rotate(turn * TAU);

  for (let index = 0; index < segments; index += 1) {
    context.save();
    context.rotate(index * wedge);
    context.beginPath();
    context.moveTo(0, 0);
    context.arc(0, 0, radius, -wedge / 2 - 0.002, wedge / 2 + 0.002);
    context.closePath();
    context.clip();

    if (index % 2 === 1) {
      context.scale(1, -1);
    }

    context.rotate(-turn * TAU);
    context.drawImage(sourceCanvas, -drawSize / 2 + driftX, -drawSize / 2 + driftY, drawSize, drawSize);
    context.restore();
  }

  context.restore();
};

const render = () => {
  resize();
  drawCoverImage(context, state.background, 0, 0, state.width, state.height);
  drawOriginalPattern(context, 0, Math.min(state.width, state.height), state.width / 2, state.height / 2, SOURCE_PATTERN_SCALE);
};

const start = async () => {
  if (!canvas || !context || !sourceContext) return;

  const [background, ...layers] = await Promise.all([
    loadImage(backgroundSrc),
    ...layerConfigs.map((layer) => loadImage(layer.src))
  ]);

  state.background = background;
  state.layers = layerConfigs.map((layer, index) => ({
    ...layer,
    image: layers[index]
  }));

  render();
};

window.addEventListener('resize', render, { passive: true });
start().catch((error) => {
  console.error('Failed to render bloom model image', error);
});
