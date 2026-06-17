import { initSmoothScroll } from './ui/smooth-scroll.js';

const CDN = {
  gsap: 'js/vendor/gsap.min.js',
  scrollTrigger: 'js/vendor/ScrollTrigger.min.js',
  lenis: 'js/vendor/lenis.min.js'
};

const root = document.documentElement;
const page = document.body;
const stage = document.querySelector('[data-ph-stage]');
const backLayer = document.querySelector('.ph-layer--back');
const frontLayer = document.querySelector('.ph-layer--front');
const figureLayer = document.querySelector('.ph-layer--figure');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let scrollRuntime = null;
let progressState = { value: 0, target: 0 };
let gsapSetters = null;
let nativeTickerStarted = false;
let pointerParallaxBound = false;
let lastRenderedProgress = -1;
let lastRenderedMouseX = 999;
let lastRenderedMouseY = 999;

const parallaxMouse = { x: 0, y: 0 };
const nativeMouse = { targetX: 0, targetY: 0, x: 0, y: 0 };

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function smoothStep(value) {
  return value * value * (3 - 2 * value);
}

function stableProgress(value) {
  if (value < 0.002) return 0;
  if (value > 0.998) return 1;
  return clamp(value, 0, 1);
}

function loadScript(src, timeout = 10000) {
  return new Promise((resolve, reject) => {
    if ([...document.scripts].some((script) => script.src.endsWith(src))) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    let settled = false;
    const timer = window.setTimeout(() => finish(false, new Error(`Timed out loading ${src}`)), timeout);

    function finish(ok, value) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      ok ? resolve(value) : reject(value);
    }

    script.src = src;
    script.async = false;
    script.onload = () => finish(true);
    script.onerror = () => finish(false, new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function loadRequiredLibraries() {
  return Promise.resolve()
    .then(() => (window.gsap ? undefined : loadScript(CDN.gsap)))
    .then(() => (window.ScrollTrigger ? undefined : loadScript(CDN.scrollTrigger)))
    .then(() => (window.Lenis ? undefined : loadScript(CDN.lenis).catch((error) => {
      console.warn('Lenis unavailable, keeping native scroll.', error);
    })))
    .then(() => {
      if (!window.gsap || !window.ScrollTrigger) {
        throw new Error('GSAP ScrollTrigger unavailable.');
      }
    });
}

function createGsapSetters(gsap) {
  gsap.set([backLayer, frontLayer, figureLayer], {
    xPercent: -50,
    yPercent: 0,
    scale: 1,
    transformOrigin: '50% 86%',
    force3D: true
  });

  return {
    backX: gsap.quickSetter(backLayer, 'x', 'px'),
    backY: gsap.quickSetter(backLayer, 'y', 'px'),
    frontX: gsap.quickSetter(frontLayer, 'x', 'px'),
    frontY: gsap.quickSetter(frontLayer, 'y', 'px'),
    figureX: gsap.quickSetter(figureLayer, 'x', 'px'),
    figureY: gsap.quickSetter(figureLayer, 'y', 'px')
  };
}

function renderWithGsap(progress, mouseX, mouseY) {
  if (!gsapSetters) return;
  const p = stableProgress(progress);
  const eased = smoothStep(p);
  const downExitY = window.innerHeight * 1.26;

  gsapSetters.backX(mouseX * -0.002);
  gsapSetters.backY(mouseY * -0.001 + eased * downExitY * 0.30);

  gsapSetters.frontX(mouseX * -0.003);
  gsapSetters.frontY(mouseY * -0.001 + eased * downExitY * 1.00);

  gsapSetters.figureX(mouseX * -0.004);
  gsapSetters.figureY(mouseY * -0.002 + eased * downExitY * 0.86);
}

function renderNative(progress, mouseX, mouseY) {
  const p = stableProgress(progress);
  const eased = smoothStep(p);
  const downExitY = window.innerHeight * 1.26;

  backLayer.style.transform = `translate3d(calc(-50% + ${mouseX * -0.002}px), ${mouseY * -0.001 + eased * downExitY * 0.30}px, 0)`;
  frontLayer.style.transform = `translate3d(calc(-50% + ${mouseX * -0.003}px), ${mouseY * -0.001 + eased * downExitY * 1.00}px, 0)`;
  figureLayer.style.transform = `translate3d(calc(-50% + ${mouseX * -0.004}px), ${mouseY * -0.002 + eased * downExitY * 0.86}px, 0)`;
}

function renderScene(progress, mouseX, mouseY) {
  const p = stableProgress(progress);
  page.style.setProperty('--ph-progress', p.toFixed(4));
  root.style.setProperty('--ph-progress', p.toFixed(4));

  const changed = Math.abs(lastRenderedProgress - p) > 0.0005
    || Math.abs(lastRenderedMouseX - mouseX) > 0.10
    || Math.abs(lastRenderedMouseY - mouseY) > 0.10;
  if (!changed) return;

  lastRenderedProgress = p;
  lastRenderedMouseX = mouseX;
  lastRenderedMouseY = mouseY;

  if (gsapSetters) {
    renderWithGsap(p, mouseX, mouseY);
  } else {
    renderNative(p, mouseX, mouseY);
  }
}

function tickPh() {
  const diff = stableProgress(progressState.target) - progressState.value;
  progressState.value += diff * 0.20;
  renderScene(progressState.value, parallaxMouse.x, parallaxMouse.y);
}

function updateNativeProgress() {
  if (!stage) return;
  const rect = stage.getBoundingClientRect();
  const range = Math.max(1, rect.height - window.innerHeight);
  progressState.target = stableProgress(-rect.top / range);
}

function startPointerParallax(gsap) {
  if (pointerParallaxBound) return;
  pointerParallaxBound = true;

  if (gsap) {
    const parallaxToX = gsap.quickTo(parallaxMouse, 'x', { duration: 0.85, ease: 'power3.out' });
    const parallaxToY = gsap.quickTo(parallaxMouse, 'y', { duration: 0.85, ease: 'power3.out' });

    window.addEventListener('pointermove', (event) => {
      if (reduceMotion || event.pointerType === 'touch' || !stage) return;
      const rect = stage.getBoundingClientRect();
      if (rect.top > window.innerHeight || rect.bottom < 0) return;
      parallaxToX(event.clientX - window.innerWidth / 2);
      parallaxToY(event.clientY - window.innerHeight / 2);
    }, { passive: true });

    window.addEventListener('pointerleave', () => {
      parallaxToX(0);
      parallaxToY(0);
    }, { passive: true });
    return;
  }

  window.addEventListener('pointermove', (event) => {
    if (reduceMotion || event.pointerType === 'touch' || !stage) return;
    const rect = stage.getBoundingClientRect();
    if (rect.top > window.innerHeight || rect.bottom < 0) return;
    nativeMouse.targetX = event.clientX - window.innerWidth / 2;
    nativeMouse.targetY = event.clientY - window.innerHeight / 2;
  }, { passive: true });

  window.addEventListener('pointerleave', () => {
    nativeMouse.targetX = 0;
    nativeMouse.targetY = 0;
  }, { passive: true });
}

function initNativeFallback() {
  startPointerParallax(null);
  window.addEventListener('scroll', updateNativeProgress, { passive: true });
  window.addEventListener('resize', updateNativeProgress, { passive: true });

  if (!nativeTickerStarted) {
    nativeTickerStarted = true;
    const tick = () => {
      updateNativeProgress();
      nativeMouse.x += (nativeMouse.targetX - nativeMouse.x) * 0.10;
      nativeMouse.y += (nativeMouse.targetY - nativeMouse.y) * 0.10;
      parallaxMouse.x = nativeMouse.x;
      parallaxMouse.y = nativeMouse.y;
      tickPh();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  updateNativeProgress();
}

function initScrollTrigger() {
  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);
  gsap.ticker.lagSmoothing(0);
  ScrollTrigger.config({ ignoreMobileResize: true });

  startPointerParallax(gsap);
  gsapSetters = createGsapSetters(gsap);
  scrollRuntime = initSmoothScroll({
    root,
    body: document.body,
    reduceMotion
  });

  ScrollTrigger.create({
    trigger: stage,
    start: 'top top',
    end: 'bottom bottom',
    invalidateOnRefresh: true,
    onUpdate: (self) => {
      progressState.target = stableProgress(self.progress);
    },
    onRefresh: (self) => {
      progressState.target = stableProgress(self.progress);
    }
  });

  window.addEventListener('resize', () => {
    lastRenderedProgress = -1;
    ScrollTrigger.refresh();
  }, { passive: true });
  gsap.ticker.add(tickPh);
  tickPh();
  ScrollTrigger.refresh();
}

if (stage && backLayer && frontLayer && figureLayer) {
  if (reduceMotion) {
    renderScene(0, 0, 0);
  } else {
    loadRequiredLibraries()
      .then(initScrollTrigger)
      .catch((error) => {
        console.warn('Falling back to native scroll sync.', error);
        initNativeFallback();
      });
  }
}

window.addEventListener('pagehide', () => {
  scrollRuntime?.destroy?.();
});
