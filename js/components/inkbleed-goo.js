import { getInkPointerDiffusion } from '../effects/ink-pointer-diffusion.js';

export const INKBLEED_GOO_SETTINGS = Object.freeze({
  mainRadius: 0,
  secondaryRadius: 35,
  invert: true,
  blurAmount: 10,
  leftChokerOffset: -10,
  rightChokerOffset: 10,
  gooBlur: 6,
  threshold: 40,
  cutoff: -15,
  follow: .3,
  intensityFollow: .25
});

export const INKBLEED_RADIAL_LAYERS = Object.freeze([
  Object.freeze({ name: 'far', radius: 1.18, inkBlur: 1, offset: 2, gooBlur: 1 }),
  Object.freeze({ name: 'middle', radius: .86, inkBlur: 4, offset: 5, gooBlur: 3 }),
  Object.freeze({ name: 'core', radius: .52, inkBlur: 8, offset: 8, gooBlur: 5 })
]);

let filterInstance = 0;

export function createGooFilterMarkup(id, { gooBlur = INKBLEED_GOO_SETTINGS.gooBlur } = {}) {
  const { threshold, cutoff } = INKBLEED_GOO_SETTINGS;
  return `
    <svg class="inkbleed-goo__filters" aria-hidden="true" focusable="false">
      <defs>
        <filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="${gooBlur}" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="1 0 0 0 0
                    0 1 0 0 0
                    0 0 1 0 0
                    0 0 0 ${threshold} ${cutoff}"
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>
  `;
}

export function createInkMasks() {
  const { mainRadius, secondaryRadius, invert } = INKBLEED_GOO_SETTINGS;
  const innerPct = (mainRadius / secondaryRadius) * 100;
  const point = 'var(--mx, -9999px) var(--my, -9999px)';
  const radius = `calc(${secondaryRadius}px * var(--spot-on, 0))`;

  return {
    sharp: invert
      ? `radial-gradient(circle ${radius} at ${point}, transparent 0%, transparent ${innerPct}%, rgba(0,0,0,1) 100%)`
      : `radial-gradient(circle ${radius} at ${point}, rgba(0,0,0,1) 0%, rgba(0,0,0,1) ${innerPct}%, transparent 100%)`,
    spot: invert
      ? `radial-gradient(circle ${radius} at ${point}, rgba(0,0,0,1) 0%, rgba(0,0,0,1) ${innerPct}%, transparent 100%)`
      : `radial-gradient(circle ${radius} at ${point}, transparent 0%, transparent ${innerPct}%, rgba(0,0,0,1) 100%)`
  };
}

export const INKBLEED_DROP_LOBES = Object.freeze([
  Object.freeze({ x: 0, y: 0, width: .78, height: .66 }),
  Object.freeze({ x: .52, y: -.30, width: .50, height: .35 }),
  Object.freeze({ x: -.45, y: .38, width: .36, height: .66 }),
  Object.freeze({ x: .18, y: .56, width: .62, height: .28 })
]);

export function createInkDropMask({ radius = 1 } = {}) {
  const pointX = 'var(--mx, -9999px)';
  const pointY = 'var(--my, -9999px)';
  const spotRadius = `calc(${INKBLEED_GOO_SETTINGS.secondaryRadius}px * var(--spot-on, 0) * ${radius})`;

  return INKBLEED_DROP_LOBES.map((lobe) => {
    const width = `calc(${spotRadius} * ${lobe.width})`;
    const height = `calc(${spotRadius} * ${lobe.height})`;
    const x = offsetMaskCoordinate(pointX, spotRadius, lobe.x);
    const y = offsetMaskCoordinate(pointY, spotRadius, lobe.y);
    return `radial-gradient(ellipse ${width} ${height} at ${x} ${y}, rgba(0,0,0,1) 0%, rgba(0,0,0,1) calc(${width} - 1px), transparent ${width})`;
  }).join(', ');
}

export function mountInkbleedGoo({ host, reducedMotion = false } = {}) {
  if (!(host instanceof HTMLElement)) return null;

  const text = host.textContent?.trim();
  if (!text || reducedMotion) {
    host.dataset.inkbleedState = 'static';
    return null;
  }

  const isGlyphAnchored = host.dataset.inkbleedVariant === 'glyph-anchored';

  const content = document.createElement('span');
  content.className = 'inkbleed-goo__content';
  content.setAttribute('aria-label', text);
  const diffusion = getInkPointerDiffusion();
  const usesPointerDiffusion = diffusion.available;
  const filters = [];
  const liquidLayers = [];

  if (!usesPointerDiffusion) {
    const filterPrefix = `inkbleed-native-${++filterInstance}`;
    const filterHost = document.createElement('span');
    filterHost.innerHTML = INKBLEED_RADIAL_LAYERS.map((layer) => (
      createGooFilterMarkup(`${filterPrefix}-${layer.name}`, { gooBlur: layer.gooBlur })
    )).join('');
    filters.push(...filterHost.children);
    INKBLEED_RADIAL_LAYERS.forEach((layer) => {
      const liquid = document.createElement('span');
      liquid.className = `inkbleed-goo__liquid inkbleed-goo__liquid--${layer.name}`;
      const filterId = `${filterPrefix}-${layer.name}`;
      liquid.style.filter = `url(#${filterId})`;
      liquidLayers.push({ layer, liquid, mask: createInkDropMask({ radius: layer.radius }) });
    });
  }

  const characters = [];
  for (const character of Array.from(text)) {
    const wrap = document.createElement('span');
    wrap.className = 'inkbleed-goo__char';

    const base = createLayer(character, 'inkbleed-goo__base');
    wrap.append(base);
    content.append(wrap);

    const layers = liquidLayers.map(({ layer, liquid, mask }) => {
      const liquidWrap = document.createElement('span');
      liquidWrap.className = 'inkbleed-goo__liquid-char';
      const sizer = createLayer(character, 'inkbleed-goo__sizer', true);
      const blur = createLayer(character, 'inkbleed-goo__blur', true);
      const left = createLayer(character, 'inkbleed-goo__choker inkbleed-goo__choker--left', true);
      const right = createLayer(character, 'inkbleed-goo__choker inkbleed-goo__choker--right', true);

      blur.style.filter = `blur(${layer.inkBlur}px)`;
      left.style.left = `${-layer.offset}px`;
      right.style.left = `${layer.offset}px`;
      setMask(blur, mask);
      setMask(left, mask);
      setMask(right, mask);
      liquidWrap.append(sizer, blur, left, right);

      liquid.append(liquidWrap);
      return { layer, liquidWrap, blur, left, right };
    });

    characters.push({ wrap, layers });
  }
  if (!usesPointerDiffusion) liquidLayers.forEach(({ liquid }) => content.append(liquid));

  host.textContent = '';
  host.append(...filters, content);
  host.classList.add('is-inkbleed-goo-ready');
  host.dataset.inkbleedState = 'ready';
  host.dataset.inkbleedRenderer = usesPointerDiffusion
    ? (isGlyphAnchored ? 'glyph-diffusion' : 'diffusion')
    : 'goo';

  let metrics = [];
  const measure = () => {
    metrics = characters.map(({ wrap }) => {
      const bounds = wrap.getBoundingClientRect();
      return {
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height
      };
    });
  };

  const tracksCharacterBounds = !usesPointerDiffusion || isGlyphAnchored;
  const resizeObserver = !tracksCharacterBounds || typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver(measure);
  if (tracksCharacterBounds) {
    resizeObserver?.observe(content);
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    document.fonts?.ready?.then(measure).catch(() => undefined);
    measure();
  }

  const target = { x: -9999, y: -9999, on: 0 };
  const smooth = { x: -9999, y: -9999, on: 0 };
  let gestureSeed = 0;
  let frame = 0;

  const render = () => {
    const intensity = getIntensity(host);
    content.style.setProperty('--spot-on', (smooth.on * intensity).toFixed(3));

    if (usesPointerDiffusion) {
      const activeCharacterIndexes = isGlyphAnchored
        ? getNeighborCharacterIndexes(metrics, smooth.x, smooth.y)
        : [];
      if (isGlyphAnchored && activeCharacterIndexes.length === 0) {
        diffusion.hide(host);
        return;
      }
      diffusion.render({
        host,
        text,
        clientX: smooth.x,
        clientY: smooth.y,
        strength: clamp((smooth.on * intensity) / 1.5, 0, 1),
        activeCharacterIndexes,
        gestureSeed,
        freezePattern: isGlyphAnchored
      });
      return;
    }

    characters.forEach(({ wrap, layers }, index) => {
      const metric = metrics[index];
      if (!metric || metric.width === 0 || metric.height === 0) return;

      const localX = smooth.x - metric.left;
      const localY = smooth.y - metric.top;
      wrap.style.setProperty('--mx', `${localX.toFixed(1)}px`);
      wrap.style.setProperty('--my', `${localY.toFixed(1)}px`);

      layers.forEach(({ layer, liquidWrap, blur, left, right }) => {
        liquidWrap.style.setProperty('--mx', `${localX.toFixed(1)}px`);
        liquidWrap.style.setProperty('--my', `${localY.toFixed(1)}px`);
        blur.style.setProperty('--mx', `${localX.toFixed(1)}px`);
        blur.style.setProperty('--my', `${localY.toFixed(1)}px`);
        left.style.setProperty('--mx', `${(localX + layer.offset).toFixed(1)}px`);
        left.style.setProperty('--my', `${localY.toFixed(1)}px`);
        right.style.setProperty('--mx', `${(localX - layer.offset).toFixed(1)}px`);
        right.style.setProperty('--my', `${localY.toFixed(1)}px`);
      });
    });
  };

  const tick = () => {
    smooth.x += (target.x - smooth.x) * INKBLEED_GOO_SETTINGS.follow;
    smooth.y += (target.y - smooth.y) * INKBLEED_GOO_SETTINGS.follow;
    smooth.on += (target.on - smooth.on) * INKBLEED_GOO_SETTINGS.intensityFollow;
    render();

    const settled = Math.abs(target.x - smooth.x) < .4
      && Math.abs(target.y - smooth.y) < .4
      && Math.abs(target.on - smooth.on) < .005;
    if (settled && target.on === 0) {
      smooth.on = 0;
      render();
      frame = 0;
      return;
    }
    frame = requestAnimationFrame(tick);
  };

  const start = () => {
    if (!frame) frame = requestAnimationFrame(tick);
  };

  return {
    setPointer(clientX, clientY, strength = 1) {
      if (target.on === 0) {
        smooth.x = clientX;
        smooth.y = clientY;
        gestureSeed = createGestureSeed();
      }
      target.x = clientX;
      target.y = clientY;
      target.on = clamp(strength, 0, 1);
      start();
    },
    release() {
      target.on = 0;
      start();
    },
    destroy() {
      if (frame) cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      if (tracksCharacterBounds) {
        window.removeEventListener('scroll', measure);
        window.removeEventListener('resize', measure);
      }
      diffusion.destroy(host);
      host.textContent = text;
      host.classList.remove('is-inkbleed-goo-ready');
      host.dataset.inkbleedState = 'static';
    }
  };
}

function getNearestCharacterIndex(metrics, x, y) {
  let nearestIndex = -1;
  let nearestDistance = Infinity;

  metrics.forEach((metric, index) => {
    if (!metric || metric.width <= 0 || metric.height <= 0) return;
    const centerX = metric.left + metric.width * .5;
    const centerY = metric.top + metric.height * .5;
    const horizontal = x - centerX;
    const vertical = (y - centerY) * .55;
    const distance = horizontal * horizontal + vertical * vertical;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}

function getNeighborCharacterIndexes(metrics, x, y) {
  const activeIndex = getNearestCharacterIndex(metrics, x, y);
  if (activeIndex < 0) return [];

  return [activeIndex - 1, activeIndex, activeIndex + 1]
    .filter((index) => index >= 0 && index < metrics.length);
}

function createGestureSeed() {
  return Math.random() * 8192;
}

function createLayer(character, className, hidden = false) {
  const layer = document.createElement('span');
  layer.className = className;
  layer.textContent = character;
  if (hidden) layer.setAttribute('aria-hidden', 'true');
  return layer;
}

function setMask(element, mask) {
  element.style.maskImage = mask;
  element.style.webkitMaskImage = mask;
}

function offsetMaskCoordinate(point, radius, offset) {
  if (offset === 0) return point;
  const operator = offset > 0 ? '+' : '-';
  return `calc(${point} ${operator} calc(${radius} * ${Math.abs(offset)}))`;
}

function getIntensity(host) {
  const value = Number(host.dataset.inkbleedIntensity ?? 25);
  return clamp(value, 0, 100) / 16.67;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
