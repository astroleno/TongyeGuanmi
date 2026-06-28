const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function canDrawElement(element) {
  if (!element) return false;
  const tag = element.tagName?.toLowerCase();
  if (tag === 'canvas') return element.width > 0 && element.height > 0;
  if (tag === 'img') return element.complete && element.naturalWidth > 0;
  if (tag === 'video') return element.readyState >= 2;
  return false;
}

function drawElementCover(context, element, width, height) {
  if (!canDrawElement(element)) return false;
  try {
    const sourceWidth = element.videoWidth || element.naturalWidth || element.width;
    const sourceHeight = element.videoHeight || element.naturalHeight || element.height;
    if (!sourceWidth || !sourceHeight) return false;

    const scale = Math.max(width / sourceWidth, height / sourceHeight);
    const targetWidth = sourceWidth * scale;
    const targetHeight = sourceHeight * scale;
    const x = (width - targetWidth) / 2;
    const y = (height - targetHeight) / 2;
    context.drawImage(element, x, y, targetWidth, targetHeight);
    return true;
  } catch {
    return false;
  }
}

function drawFallback(context, width, height, role) {
  const gradient = context.createLinearGradient(0, 0, 0, height);
  if (role === 'previous') {
    gradient.addColorStop(0, 'rgba(20, 30, 27, 0.96)');
    gradient.addColorStop(1, 'rgba(54, 48, 35, 0.92)');
  } else {
    gradient.addColorStop(0, 'rgba(237, 228, 210, 0.96)');
    gradient.addColorStop(1, 'rgba(222, 212, 190, 0.98)');
  }
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

function resizeCanvas(canvas, maxDevicePixelRatio) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, maxDevicePixelRatio);
  const width = Math.max(1, Math.round((rect.width || window.innerWidth || 1) * ratio));
  const height = Math.max(1, Math.round((rect.height || window.innerHeight || 1) * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height, ratio };
}

export function createSplitSceneInkTransition(canvas, {
  previousTexture = null,
  nextTexture = null,
  direction = 'down',
  seed = 1,
  maxDevicePixelRatio = 1.5
} = {}) {
  const context = canvas?.getContext?.('2d', { alpha: true });
  let destroyed = false;

  const api = {
    update(progress, options = {}) {
      if (!canvas || !context || destroyed) return { previousReady: false, nextReady: false };

      const p = clamp(progress);
      const { width, height } = resizeCanvas(canvas, maxDevicePixelRatio);
      const edgeY = Math.round(height * clamp(options.edgeRatio ?? (0.18 + p * 0.64), 0.02, 0.98));
      const feather = Math.max(8, Math.round(height * 0.055));

      context.clearRect(0, 0, width, height);
      context.save();
      context.beginPath();
      context.rect(0, 0, width, edgeY + feather);
      context.clip();
      const previousReady = drawElementCover(context, previousTexture, width, height);
      if (!previousReady) drawFallback(context, width, height, 'previous');
      context.restore();

      context.save();
      context.beginPath();
      context.rect(0, Math.max(0, edgeY - feather), width, height);
      context.clip();
      const nextReady = drawElementCover(context, nextTexture, width, height);
      if (!nextReady) drawFallback(context, width, height, 'next');
      context.restore();

      const inkSeed = (Number(seed) || 1) * 19.17;
      const wave = Math.sin((p + inkSeed) * Math.PI * 2) * feather * 0.16;
      const gradient = context.createLinearGradient(0, edgeY - feather, 0, edgeY + feather);
      gradient.addColorStop(0, 'rgba(8, 11, 10, 0)');
      gradient.addColorStop(0.46, direction === 'up' ? 'rgba(237, 228, 210, 0.56)' : 'rgba(11, 17, 15, 0.62)');
      gradient.addColorStop(0.54, direction === 'up' ? 'rgba(11, 17, 15, 0.50)' : 'rgba(237, 228, 210, 0.58)');
      gradient.addColorStop(1, 'rgba(8, 11, 10, 0)');
      context.fillStyle = gradient;
      context.beginPath();
      context.moveTo(0, edgeY - feather + wave);
      context.bezierCurveTo(width * 0.28, edgeY - feather * 0.65, width * 0.62, edgeY + feather * 0.48, width, edgeY - feather * 0.18);
      context.lineTo(width, edgeY + feather);
      context.bezierCurveTo(width * 0.66, edgeY + feather * 0.42, width * 0.34, edgeY - feather * 0.28, 0, edgeY + feather * 0.68);
      context.closePath();
      context.fill();

      canvas.dataset.splitInkProgress = p.toFixed(4);
      canvas.dataset.splitInkEdgeY = `${((edgeY / height) * 100).toFixed(2)}%`;
      canvas.dataset.inkTextureReady = previousReady || nextReady ? 'true' : 'false';
      return { previousReady, nextReady };
    },
    resize() {
      if (!canvas || !context || destroyed) return;
      resizeCanvas(canvas, maxDevicePixelRatio);
    },
    destroy() {
      destroyed = true;
      if (canvas && context) context.clearRect(0, 0, canvas.width || 0, canvas.height || 0);
    }
  };

  api.resize();
  return api;
}
