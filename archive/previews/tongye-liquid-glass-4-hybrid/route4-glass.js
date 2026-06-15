(() => {
  'use strict';

  const FILTER_ID = 'route4-liquid-glass-filter';
  const REFERENCE_URL = '/reference/liquid_glass.tsx';
  const GLASS_SELECTOR = '.hybrid-glass';
  const REFRACT_CLASS = 'hybrid-glass__refract';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  async function installLiquidGlassFilter() {
    if (document.getElementById(FILTER_ID)) {
      document.documentElement.classList.add('has-liquid-glass-filter');
      installRefractLayers();
      return;
    }

    try {
      const response = await fetch(REFERENCE_URL, { cache: 'no-store' });
      if (!response.ok) return;

      const source = await response.text();
      const match = /const\s+WEBP_DISPLACEMENT_MAP\s*=\s*"([^"]+)"/.exec(source);
      if (!match) return;

      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('width', '0');
      svg.setAttribute('height', '0');
      svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;';

      const filter = document.createElementNS(ns, 'filter');
      filter.setAttribute('id', FILTER_ID);
      filter.setAttribute('primitiveUnits', 'objectBoundingBox');

      const image = document.createElementNS(ns, 'feImage');
      image.setAttribute('result', 'map');
      image.setAttribute('width', '100%');
      image.setAttribute('height', '100%');
      image.setAttribute('x', '0');
      image.setAttribute('y', '0');
      image.setAttribute('href', match[1]);
      image.setAttribute('preserveAspectRatio', 'none');

      const blur = document.createElementNS(ns, 'feGaussianBlur');
      blur.setAttribute('in', 'SourceGraphic');
      blur.setAttribute('stdDeviation', '0.01');
      blur.setAttribute('result', 'blur');

      const displacement = document.createElementNS(ns, 'feDisplacementMap');
      displacement.setAttribute('in', 'blur');
      displacement.setAttribute('in2', 'map');
      displacement.setAttribute('scale', '0.5');
      displacement.setAttribute('xChannelSelector', 'R');
      displacement.setAttribute('yChannelSelector', 'G');

      filter.append(image, blur, displacement);
      svg.append(filter);
      document.body.prepend(svg);
      document.documentElement.classList.add('has-liquid-glass-filter');
      installRefractLayers();
    } catch {
      document.documentElement.classList.remove('has-liquid-glass-filter');
    }
  }

  function installRefractLayers() {
    document.querySelectorAll(GLASS_SELECTOR).forEach((el) => {
      if (el.querySelector(`:scope > .${REFRACT_CLASS}`)) return;

      const layer = document.createElement('span');
      layer.className = REFRACT_CLASS;
      layer.setAttribute('aria-hidden', 'true');
      el.prepend(layer);
    });
  }

  function attachScrollBackdrop() {
    let raf = 0;

    const write = () => {
      raf = 0;
      const y = window.scrollY || 0;
      document.documentElement.style.setProperty('--material-shift', `${(-y * 0.075).toFixed(1)}px`);
      document.documentElement.style.setProperty('--material-counter-shift', `${(y * 0.045).toFixed(1)}px`);
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(write);
    };

    write();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
  }

  function init() {
    installLiquidGlassFilter();

    if (!reduceMotion) {
      attachScrollBackdrop();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
