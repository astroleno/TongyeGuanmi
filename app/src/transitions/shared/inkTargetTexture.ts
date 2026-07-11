export type InkTargetTexture = {
  canvas: HTMLCanvasElement;
  get ready(): boolean;
  prepare(): Promise<boolean>;
  update(): void;
  destroy(): void;
};

type PaintRect = { left: number; top: number; width: number; height: number };
type ColorStop = { color: string; position: number };

const backgroundImages = new Map<string, Promise<HTMLImageElement | null>>();

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function splitTopLevel(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (character === ',' && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

function cssLength(value: string, total: number): number {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return 0;
  if (value.endsWith('%')) return total * numeric / 100;
  if (value.endsWith('vw')) return window.innerWidth * numeric / 100;
  if (value.endsWith('vh') || value.endsWith('svh') || value.endsWith('dvh')) return window.innerHeight * numeric / 100;
  if (value.endsWith('rem')) {
    return numeric * Number.parseFloat(getComputedStyle(document.documentElement).fontSize || '16');
  }
  return numeric;
}

function colorStops(parts: string[]): ColorStop[] {
  const raw = parts.map((part, index) => {
    const positions = part.match(/\s+(-?\d*\.?\d+)(%|px|rem)?(?:\s+(-?\d*\.?\d+)(%|px|rem)?)?\s*$/);
    const numeric = positions?.[3] ?? positions?.[1];
    const unit = positions?.[4] ?? positions?.[2];
    const explicit = numeric && unit === '%' ? Number(numeric) / 100 : null;
    const colorEnd = positions?.index ?? part.length;
    const candidate = part.slice(0, colorEnd).trim();
    return {
      color: candidate || part.trim(),
      position: explicit,
      index
    };
  });
  const last = Math.max(1, raw.length - 1);
  return raw.map((stop) => ({
    color: stop.color,
    position: clamp(stop.position ?? stop.index / last)
  }));
}

function addStops(gradient: CanvasGradient, stops: ColorStop[]): void {
  let previous = 0;
  for (const stop of stops) {
    const position = Math.max(previous, stop.position);
    try {
      gradient.addColorStop(position, stop.color);
      previous = position;
    } catch {
      // Ignore a browser-normalized stop that Canvas cannot parse.
    }
  }
}

function paintLinearGradient(
  context: CanvasRenderingContext2D,
  value: string,
  rect: PaintRect
): boolean {
  const body = value.slice(value.indexOf('(') + 1, -1);
  const parts = splitTopLevel(body);
  if (parts.length < 2) return false;
  let degrees = 180;
  if (/^-?\d*\.?\d+deg$/i.test(parts[0] ?? '')) {
    degrees = Number.parseFloat(parts.shift() ?? '180');
  } else if ((parts[0] ?? '').startsWith('to ')) {
    const direction = parts.shift() ?? '';
    if (direction.includes('right')) degrees = 90;
    if (direction.includes('left')) degrees = 270;
    if (direction.includes('top')) degrees = 0;
    if (direction.includes('bottom')) degrees = 180;
  }
  const radians = degrees * Math.PI / 180;
  const dx = Math.sin(radians);
  const dy = -Math.cos(radians);
  const half = Math.abs(rect.width * dx) * 0.5 + Math.abs(rect.height * dy) * 0.5;
  const centerX = rect.left + rect.width * 0.5;
  const centerY = rect.top + rect.height * 0.5;
  const gradient = context.createLinearGradient(
    centerX - dx * half,
    centerY - dy * half,
    centerX + dx * half,
    centerY + dy * half
  );
  addStops(gradient, colorStops(parts));
  context.fillStyle = gradient;
  context.fillRect(rect.left, rect.top, rect.width, rect.height);
  return true;
}

function paintRadialGradient(
  context: CanvasRenderingContext2D,
  value: string,
  rect: PaintRect
): boolean {
  const body = value.slice(value.indexOf('(') + 1, -1);
  const parts = splitTopLevel(body);
  if (parts.length < 2) return false;
  const descriptor = parts.shift() ?? '';
  const at = descriptor.match(/at\s+(-?\d*\.?\d+%?)\s+(-?\d*\.?\d+%?)/i);
  const centerX = rect.left + (at ? cssLength(at[1] ?? '50%', rect.width) : rect.width * 0.5);
  const centerY = rect.top + (at ? cssLength(at[2] ?? '50%', rect.height) : rect.height * 0.5);
  const radius = Math.max(rect.width, rect.height) * 0.72;
  const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
  addStops(gradient, colorStops(parts));
  context.fillStyle = gradient;
  context.fillRect(rect.left, rect.top, rect.width, rect.height);
  return true;
}

function backgroundImage(source: string): Promise<HTMLImageElement | null> {
  const absolute = new URL(source, document.baseURI).href;
  const cached = backgroundImages.get(absolute);
  if (cached) return cached;
  const pending = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = absolute;
  });
  backgroundImages.set(absolute, pending);
  return pending;
}

function extractUrls(value: string): string[] {
  return Array.from(value.matchAll(/url\((['"]?)(.*?)\1\)/g))
    .map((match) => match[2]?.trim() ?? '')
    .filter(Boolean);
}

function paintImageCover(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  rect: PaintRect,
  fit: string
): void {
  if (sourceWidth <= 0 || sourceHeight <= 0 || rect.width <= 0 || rect.height <= 0) return;
  if (fit === 'fill') {
    context.drawImage(image, rect.left, rect.top, rect.width, rect.height);
    return;
  }
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = rect.width / rect.height;
  const contain = fit === 'contain';
  const useWidth = contain ? sourceRatio > targetRatio : sourceRatio < targetRatio;
  const drawWidth = useWidth ? rect.width : rect.height * sourceRatio;
  const drawHeight = useWidth ? rect.width / sourceRatio : rect.height;
  const x = rect.left + (rect.width - drawWidth) * 0.5;
  const y = rect.top + (rect.height - drawHeight) * 0.5;
  context.drawImage(image, x, y, drawWidth, drawHeight);
}

function paintBackground(
  context: CanvasRenderingContext2D,
  style: CSSStyleDeclaration,
  rect: PaintRect,
  images: ReadonlyMap<string, HTMLImageElement>
): void {
  if (rect.width <= 0 || rect.height <= 0) return;
  if (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
    context.fillStyle = style.backgroundColor;
    context.fillRect(rect.left, rect.top, rect.width, rect.height);
  }
  const layers = splitTopLevel(style.backgroundImage || '').filter((layer) => layer !== 'none');
  for (const layer of layers.reverse()) {
    if (layer.startsWith('linear-gradient(') || layer.startsWith('repeating-linear-gradient(')) {
      paintLinearGradient(context, layer, rect);
      continue;
    }
    if (layer.startsWith('radial-gradient(') || layer.startsWith('repeating-radial-gradient(')) {
      paintRadialGradient(context, layer, rect);
      continue;
    }
    const url = extractUrls(layer)[0];
    const image = url ? images.get(new URL(url, document.baseURI).href) : null;
    if (image) {
      paintImageCover(context, image, image.naturalWidth, image.naturalHeight, rect, 'cover');
    }
  }
}

function elementRect(element: Element): PaintRect {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function paintBorders(context: CanvasRenderingContext2D, style: CSSStyleDeclaration, rect: PaintRect): void {
  const sides = [
    ['top', rect.left, rect.top, rect.width, Number.parseFloat(style.borderTopWidth)],
    ['bottom', rect.left, rect.top + rect.height - Number.parseFloat(style.borderBottomWidth), rect.width, Number.parseFloat(style.borderBottomWidth)],
    ['left', rect.left, rect.top, Number.parseFloat(style.borderLeftWidth), rect.height],
    ['right', rect.left + rect.width - Number.parseFloat(style.borderRightWidth), rect.top, Number.parseFloat(style.borderRightWidth), rect.height]
  ] as const;
  for (const [side, x, y, width, height] of sides) {
    if (!(width > 0 && height > 0) || style.getPropertyValue(`border-${side}-style`) === 'none') continue;
    context.fillStyle = style.getPropertyValue(`border-${side}-color`);
    context.fillRect(x, y, width, height);
  }
}

function applyInsetClip(context: CanvasRenderingContext2D, clipPath: string, rect: PaintRect): void {
  const match = clipPath.match(/^inset\((.*?)\)/);
  if (!match) return;
  const values = (match[1] ?? '').split(/\s+/).filter((value) => value && value !== 'round');
  const top = cssLength(values[0] ?? '0', rect.height);
  const right = cssLength(values[1] ?? values[0] ?? '0', rect.width);
  const bottom = cssLength(values[2] ?? values[0] ?? '0', rect.height);
  const left = cssLength(values[3] ?? values[1] ?? values[0] ?? '0', rect.width);
  context.beginPath();
  context.rect(rect.left + left, rect.top + top, Math.max(0, rect.width - left - right), Math.max(0, rect.height - top - bottom));
  context.clip();
}

function paintMedia(
  context: CanvasRenderingContext2D,
  element: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement,
  style: CSSStyleDeclaration,
  rect: PaintRect
): void {
  const isVideo = element instanceof HTMLVideoElement;
  const isImage = element instanceof HTMLImageElement;
  const width = isVideo ? element.videoWidth : isImage ? element.naturalWidth : element.width;
  const height = isVideo ? element.videoHeight : isImage ? element.naturalHeight : element.height;
  if (isVideo && element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
  if (isImage && !element.complete) return;
  if (width <= 0 || height <= 0) return;
  context.save();
  context.filter = style.filter === 'none' ? 'none' : style.filter;
  paintImageCover(context, element, width, height, rect, style.objectFit || 'fill');
  context.restore();
}

function paintText(
  context: CanvasRenderingContext2D,
  element: HTMLElement,
  style: CSSStyleDeclaration,
  alpha: number
): void {
  const documentRef = element.ownerDocument;
  context.save();
  context.globalAlpha = alpha;
  context.fillStyle = style.color;
  context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  context.textBaseline = 'alphabetic';
  if ('letterSpacing' in context) {
    (context as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = style.letterSpacing;
  }
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue;
    const range = documentRef.createRange();
    range.selectNodeContents(node);
    const rects = Array.from(range.getClientRects());
    range.detach();
    const characters = Array.from(node.textContent);
    let cursor = 0;
    for (let lineIndex = 0; lineIndex < rects.length && cursor < characters.length; lineIndex += 1) {
      const rect = rects[lineIndex];
      if (!rect || rect.width <= 0 || rect.height <= 0) continue;
      let end = characters.length;
      if (lineIndex < rects.length - 1) {
        let low = cursor + 1;
        let high = characters.length;
        while (low <= high) {
          const middle = Math.floor((low + high) * 0.5);
          const width = context.measureText(characters.slice(cursor, middle).join('')).width;
          if (width <= rect.width + 1) {
            low = middle + 1;
          } else {
            high = middle - 1;
          }
        }
        end = Math.max(cursor + 1, high);
      }
      const line = characters.slice(cursor, end).join('');
      cursor = end;
      if (!line.trim() || rect.bottom < 0 || rect.top > window.innerHeight) continue;
      const metrics = context.measureText(line);
      const ascent = metrics.actualBoundingBoxAscent || Number.parseFloat(style.fontSize) * 0.78;
      const descent = metrics.actualBoundingBoxDescent || Number.parseFloat(style.fontSize) * 0.18;
      const baseline = rect.top + Math.max(0, (rect.height - ascent - descent) * 0.5) + ascent;
      const rendered = style.textTransform === 'uppercase'
        ? line.toUpperCase()
        : style.textTransform === 'lowercase'
          ? line.toLowerCase()
          : line;
      context.fillText(rendered, rect.left, baseline);
    }
  }
  context.restore();
}

function stackingChildren(element: HTMLElement): HTMLElement[] {
  return Array.from(element.children)
    .filter((child): child is HTMLElement => child instanceof HTMLElement)
    .map((child, index) => ({ child, index, z: Number.parseFloat(getComputedStyle(child).zIndex) || 0 }))
    .sort((left, right) => left.z - right.z || left.index - right.index)
    .map(({ child }) => child);
}

function paintPseudo(
  context: CanvasRenderingContext2D,
  element: HTMLElement,
  pseudo: '::before' | '::after',
  rect: PaintRect,
  alpha: number,
  images: ReadonlyMap<string, HTMLImageElement>
): void {
  const style = getComputedStyle(element, pseudo);
  if (style.display === 'none' || style.content === 'none' || Number.parseFloat(style.opacity) <= 0) return;
  context.save();
  context.globalAlpha = alpha * (Number.parseFloat(style.opacity) || 1);
  context.globalCompositeOperation = style.mixBlendMode === 'normal' ? 'source-over' : style.mixBlendMode as GlobalCompositeOperation;
  paintBackground(context, style, rect, images);
  context.restore();
}

function paintElement(
  context: CanvasRenderingContext2D,
  element: HTMLElement,
  parentAlpha: number,
  images: ReadonlyMap<string, HTMLImageElement>,
  root: HTMLElement
): void {
  const style = getComputedStyle(element);
  if (style.display === 'none') return;
  const ownOpacity = element === root ? 1 : Number.parseFloat(style.opacity);
  const alpha = parentAlpha * (Number.isFinite(ownOpacity) ? ownOpacity : 1);
  if (alpha <= 0.001) return;
  const rect = elementRect(element);
  if (
    rect.width <= 0
    || rect.height <= 0
    || rect.left + rect.width < 0
    || rect.top + rect.height < 0
    || rect.left > window.innerWidth
    || rect.top > window.innerHeight
  ) return;

  context.save();
  context.globalAlpha = alpha;
  context.globalCompositeOperation = style.mixBlendMode === 'normal' ? 'source-over' : style.mixBlendMode as GlobalCompositeOperation;
  if (style.clipPath !== 'none') applyInsetClip(context, style.clipPath, rect);
  paintBackground(context, style, rect, images);
  paintBorders(context, style, rect);
  paintPseudo(context, element, '::before', rect, alpha, images);
  if (element instanceof HTMLCanvasElement || element instanceof HTMLImageElement || element instanceof HTMLVideoElement) {
    paintMedia(context, element, style, rect);
  } else {
    paintText(context, element, style, alpha);
    const clipsChildren = style.overflow === 'hidden' || style.overflowX === 'hidden' || style.overflowY === 'hidden' || style.overflow === 'clip';
    if (clipsChildren) {
      context.beginPath();
      context.rect(rect.left, rect.top, rect.width, rect.height);
      context.clip();
    }
    for (const child of stackingChildren(element)) {
      paintElement(context, child, alpha, images, root);
    }
  }
  paintPseudo(context, element, '::after', rect, alpha, images);
  context.restore();
}

async function loadBackgroundImages(root: HTMLElement): Promise<Map<string, HTMLImageElement>> {
  const urls = new Set<string>();
  for (const element of [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]) {
    for (const style of [getComputedStyle(element), getComputedStyle(element, '::before'), getComputedStyle(element, '::after')]) {
      for (const url of extractUrls(style.backgroundImage || '')) {
        urls.add(new URL(url, root.ownerDocument.baseURI).href);
      }
    }
  }
  const loaded = new Map<string, HTMLImageElement>();
  await Promise.all(Array.from(urls, async (url) => {
    const image = await backgroundImage(url);
    if (image) loaded.set(url, image);
  }));
  return loaded;
}

export function createInkTargetTexture(root: HTMLElement | null | undefined): InkTargetTexture | null {
  if (
    !root
    || typeof document === 'undefined'
    || typeof window === 'undefined'
    || typeof root.getBoundingClientRect !== 'function'
  ) {
    return null;
  }
  const canvas = root.ownerDocument.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) return null;

  let destroyed = false;
  let ready = false;
  let revision = 0;
  let capturedWidth = 0;
  let capturedHeight = 0;
  let pending: Promise<boolean> | null = null;

  const prepare = async (): Promise<boolean> => {
    if (destroyed) return false;
    const width = Math.max(1, window.innerWidth || root.getBoundingClientRect().width || 1);
    const height = Math.max(1, window.innerHeight || root.getBoundingClientRect().height || 1);
    if (ready && width === capturedWidth && height === capturedHeight) return true;
    if (pending) return pending;
    pending = (async () => {
      const startedAt = performance.now();
      try {
        await root.ownerDocument.fonts?.ready;
        const images = await loadBackgroundImages(root);
        if (destroyed) return false;
        const ratio = Math.min(window.devicePixelRatio || 1, 1);
        canvas.width = Math.max(1, Math.round(width * ratio));
        canvas.height = Math.max(1, Math.round(height * ratio));
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, width, height);
        paintElement(context, root, 1, images, root);
        capturedWidth = width;
        capturedHeight = height;
        revision += 1;
        ready = true;
        canvas.dataset.inkTextureReady = 'true';
        canvas.dataset.inkTextureRevision = String(revision);
        canvas.dataset.r4InkTargetCapture = 'painted-dom-scene';
        canvas.dataset.r4InkTargetCaptureMs = (performance.now() - startedAt).toFixed(1);
        delete canvas.dataset.r4InkTargetError;
        return true;
      } catch (error) {
        ready = false;
        canvas.dataset.inkTextureReady = 'false';
        canvas.dataset.r4InkTargetError = error instanceof Error ? error.message : String(error);
        return false;
      } finally {
        pending = null;
      }
    })();
    return pending;
  };

  return {
    canvas,
    get ready() {
      return ready;
    },
    prepare,
    update() {
      if (destroyed) return;
      if (!ready || window.innerWidth !== capturedWidth || window.innerHeight !== capturedHeight) {
        void prepare();
      }
    },
    destroy() {
      destroyed = true;
      ready = false;
      canvas.dataset.inkTextureReady = 'false';
      canvas.width = 0;
      canvas.height = 0;
    }
  };
}
