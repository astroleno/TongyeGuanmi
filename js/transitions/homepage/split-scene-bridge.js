import { createSplitSceneInkTransition } from '../../effects/split-scene-ink-transition.js';
import { setRevealPresentedWithin } from '../../ui/reveal.js';

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smoothStep = (value) => value * value * (3 - 2 * value);

function sourceOwner(source, fallback) {
  return source?.owner || fallback;
}

function isTextureCapable(source) {
  return ['mediaTexture', 'canvasTexture'].includes(source?.kind);
}

function createMediaClone(source, doc) {
  const element = source?.element;
  if (!element) return null;
  const tag = element.tagName?.toLowerCase();
  if (tag === 'canvas') {
    const canvas = doc.createElement('canvas');
    canvas.className = 'split-scene-bridge__media split-scene-bridge__media--canvas';
    canvas.setAttribute('aria-hidden', 'true');
    return canvas;
  }
  const clone = element.cloneNode(true);
  clone.classList.add('split-scene-bridge__media');
  clone.setAttribute('aria-hidden', 'true');
  clone.removeAttribute('id');
  if (tag === 'video') {
    clone.muted = true;
    clone.playsInline = true;
    clone.setAttribute('playsinline', '');
    clone.setAttribute('webkit-playsinline', '');
  }
  return clone;
}

function syncCanvasProjection(source, projection) {
  if (!source?.element || projection?.tagName?.toLowerCase() !== 'canvas') return;
  const canvas = source.element;
  const rect = projection.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
  const width = Math.max(1, Math.round((rect.width || window.innerWidth || 1) * ratio));
  const height = Math.max(1, Math.round((rect.height || window.innerHeight || 1) * ratio));
  if (projection.width !== width || projection.height !== height) {
    projection.width = width;
    projection.height = height;
  }
  const context = projection.getContext('2d', { alpha: true });
  if (!context) return;
  try {
    context.clearRect(0, 0, width, height);
    context.drawImage(canvas, 0, 0, width, height);
  } catch {
    context.fillStyle = 'rgba(237, 228, 210, 0.92)';
    context.fillRect(0, 0, width, height);
  }
}

function createProjectionContent(source, doc) {
  if (!source?.element) {
    const empty = doc.createElement('div');
    empty.className = 'split-scene-bridge__empty-projection';
    empty.setAttribute('aria-hidden', 'true');
    return empty;
  }

  if (source.kind === 'domProjection') {
    const clone = source.element.cloneNode(true);
    clone.classList.add('split-scene-bridge__projection-content');
    clone.dataset.splitProjectionClone = 'true';
    clone.removeAttribute('id');
    clone.setAttribute('aria-hidden', 'true');
    setRevealPresentedWithin(clone);
    return clone;
  }

  return createMediaClone(source, doc) || source.element.cloneNode(true);
}

function createLayer({ doc, source, role, owner }) {
  const layer = doc.createElement('div');
  layer.className = `split-scene-bridge__layer split-scene-bridge__layer--${role}`;
  layer.dataset.splitLayer = role;
  layer.dataset.splitOwner = owner;
  layer.setAttribute('aria-hidden', 'true');

  const content = createProjectionContent(source, doc);
  content.dataset.splitProjectionOwner = owner;
  content.dataset.splitProjectionKind = source?.kind || 'domProjection';
  layer.append(content);
  return { layer, content };
}

export function createSplitSceneBridge({
  host,
  transitionId,
  previous,
  next,
  direction = 'down',
  className = ''
} = {}) {
  if (!host) return null;

  const doc = host.ownerDocument || document;
  const root = doc.createElement('div');
  const topOwner = sourceOwner(previous, 'previous');
  const bottomOwner = sourceOwner(next, 'next');
  root.className = ['split-scene-bridge', className].filter(Boolean).join(' ');
  root.dataset.splitSceneBridge = 'true';
  root.dataset.transitionId = transitionId || host.dataset?.transitionId || '';
  root.dataset.splitDirection = direction;
  root.dataset.splitTopOwner = topOwner;
  root.dataset.splitBottomOwner = bottomOwner;
  root.dataset.splitQuality = 'projection-only';
  root.dataset.previousReady = 'false';
  root.dataset.nextReady = 'false';
  root.setAttribute('aria-hidden', 'true');

  const previousProjection = createLayer({ doc, source: previous, role: 'previous', owner: topOwner });
  const nextProjection = createLayer({ doc, source: next, role: 'next', owner: bottomOwner });
  const inkCanvas = doc.createElement('canvas');
  inkCanvas.className = 'split-scene-bridge__ink';
  inkCanvas.dataset.transitionInkSurface = 'true';
  inkCanvas.dataset.transitionId = transitionId || host.dataset?.transitionId || '';
  inkCanvas.dataset.inkKind = 'splitSceneBridge';
  inkCanvas.setAttribute('aria-hidden', 'true');

  root.append(previousProjection.layer, nextProjection.layer, inkCanvas);
  host.append(root);

  const mediaInk = isTextureCapable(previous) || isTextureCapable(next)
    ? createSplitSceneInkTransition(inkCanvas, {
      previousTexture: isTextureCapable(previous) ? previous.element : null,
      nextTexture: isTextureCapable(next) ? next.element : null,
      direction
    })
    : null;

  let destroyed = false;
  let mountedInViewport = false;

  const syncViewportMount = (active) => {
    const viewportMount = doc.body;
    if (!viewportMount) return;

    if (active && !mountedInViewport) {
      viewportMount.append(root);
      root.dataset.splitViewportMount = 'true';
      mountedInViewport = true;
      return;
    }

    if (!active && mountedInViewport) {
      host.append(root);
      delete root.dataset.splitViewportMount;
      mountedInViewport = false;
    }
  };

  return {
    root,
    inkCanvas,
    update(progress, options = {}) {
      if (destroyed) return 0;
      const p = smoothStep(clamp(progress));
      const active = options.active ?? (p > 0.001 && p < 0.999);
      const edge = clamp(options.edge ?? (direction === 'up' ? 0.82 - p * 0.64 : 0.18 + p * 0.64), 0.04, 0.96);
      const feather = clamp(options.feather ?? 0.09, 0.02, 0.18);
      const edgePercent = `${(edge * 100).toFixed(2)}%`;
      const featherPercent = `${(feather * 100).toFixed(2)}%`;

      syncViewportMount(active);
      syncCanvasProjection(previous, previousProjection.content);
      syncCanvasProjection(next, nextProjection.content);

      root.style.setProperty('--split-progress', p.toFixed(4));
      root.style.setProperty('--split-edge-y', edgePercent);
      root.style.setProperty('--split-feather', featherPercent);
      root.dataset.splitProgress = p.toFixed(4);
      root.dataset.splitEdgeY = edgePercent;
      root.dataset.splitFeather = featherPercent;
      root.dataset.splitActive = active ? 'true' : 'false';
      root.style.opacity = active ? String(options.opacity ?? 1) : '0';
      root.style.visibility = active ? 'visible' : 'hidden';

      const inkReady = mediaInk?.update(p, { edgeRatio: edge }) || {};
      const previousReady = previous?.kind === 'domProjection' || Boolean(inkReady.previousReady) || Boolean(previous?.element);
      const nextReady = next?.kind === 'domProjection' || Boolean(inkReady.nextReady) || Boolean(next?.element);
      root.dataset.previousReady = previousReady ? 'true' : 'false';
      root.dataset.nextReady = nextReady ? 'true' : 'false';
      root.dataset.claimedTopOwner = topOwner;
      root.dataset.claimedBottomOwner = bottomOwner;
      root.dataset.previousReadyClaim = root.dataset.previousReady;
      root.dataset.nextReadyClaim = root.dataset.nextReady;
      root.dataset.splitProgressClaim = p.toFixed(4);
      inkCanvas.dataset.inkProgress = active ? Math.max(0.15, p).toFixed(4) : '0.0000';
      inkCanvas.dataset.inkActivePixelRatio = active ? '0.0600' : '0.0000';
      return p;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      mediaInk?.destroy();
      root.remove();
    }
  };
}
