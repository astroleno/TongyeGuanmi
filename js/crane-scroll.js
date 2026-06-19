import { initSmoothScroll } from './ui/smooth-scroll.js';

const CDN = {
  gsap: 'js/vendor/gsap.min.js',
  scrollTrigger: 'js/vendor/ScrollTrigger.min.js',
  lenis: 'js/vendor/lenis.min.js'
};

const TRANSITION_DURATION_SECONDS = 3.5;
const TRANSITION_SCROLL_RANGE = 0.2;
const TRANSITION_TRIGGER_PROGRESS = 0.015;
const VIDEO_DURATION_FALLBACK = 2.5;
const TIMELINE_DURATION_SECONDS = 3.5;
const FLOCK_START_SECONDS = 0;
const FLOCK_END_SECONDS = 2.5;
const FIGURE_START_SECONDS = 0.5;
const FIGURE_FULLSCREEN_SECONDS = FIGURE_START_SECONDS + 1;
const FIGURE_END_SECONDS = FIGURE_START_SECONDS + VIDEO_DURATION_FALLBACK;
const FIGURE_POSITION = { x: 0, y: 198, scale: 0.8 };

const root = document.documentElement;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const scenes = new Set();

let librariesPromise = null;
let smoothRuntime = null;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function smoothStep(value) {
  return value * value * (3 - 2 * value);
}

function range01(value, start, end) {
  return clamp((value - start) / Math.max(0.0001, end - start), 0, 1);
}

function stableProgress(value) {
  if (value < 0.002) return 0;
  if (value > 0.998) return 1;
  return clamp(value, 0, 1);
}

function acceleratedProgress(rawProgress) {
  const t = stableProgress(rawProgress);
  return clamp(0.78 * t + 0.22 * t * t, 0, 1);
}

function prepareVideo(video) {
  if (!video) return;
  video.muted = true;
  video.loop = false;
  video.autoplay = false;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.pause();
  video.load();
}

function waitForVideoMetadata(video) {
  if (!video || video.readyState >= 1) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.removeEventListener('loadedmetadata', finish);
      video.removeEventListener('canplay', finish);
      video.removeEventListener('error', finish);
      resolve();
    };
    const timer = window.setTimeout(finish, 1300);
    video.addEventListener('loadedmetadata', finish, { once: true });
    video.addEventListener('canplay', finish, { once: true });
    video.addEventListener('error', finish, { once: true });
    video.load();
  });
}

function getVideoDuration(video) {
  return Number.isFinite(video?.duration) && video.duration > 0
    ? video.duration
    : VIDEO_DURATION_FALLBACK;
}

function seekVideo(video, progress) {
  if (!video || video.readyState < 1) return;
  const duration = getVideoDuration(video);
  const p = stableProgress(progress);
  const targetTime = p >= 1
    ? Math.max(0, duration - 0.001)
    : Math.min(Math.max(0, p * duration), Math.max(0, duration - 0.001));
  const threshold = p >= 0.998 || p <= 0.002 ? 0.004 : 0.016;
  if (Math.abs(video.currentTime - targetTime) < threshold) return;

  try {
    video.currentTime = targetTime;
  } catch {
    // Video metadata can settle a beat later on WebKit.
  }
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
  if (librariesPromise) return librariesPromise;

  librariesPromise = Promise.resolve()
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

  return librariesPromise;
}

function getSmoothRuntime() {
  if (!smoothRuntime) {
    smoothRuntime = initSmoothScroll({
      root,
      body: document.body,
      reduceMotion,
      options: {
        lerp: 0.08,
        wheelMultiplier: 0.82,
        syncTouch: false
      }
    });
  }
  return smoothRuntime;
}

export function initCraneScene(stage) {
  if (!stage) return null;
  if (stage.__craneScene) return stage.__craneScene;

  const cloudBack = stage.querySelector('.crane-layer--cloud-back');
  const cloudFrontSecond = stage.querySelector('.crane-layer--cloud-front-second');
  const cloudFront = stage.querySelector('.crane-layer--cloud-front');
  const archLayer = stage.querySelector('.crane-layer--arch');
  const figureVideo = stage.querySelector('[data-crane-figure-video]');
  const flockVideo = stage.querySelector('[data-crane-figure-front-video]');

  if (!cloudBack || !cloudFrontSecond || !cloudFront || !archLayer || !figureVideo || !flockVideo) {
    return null;
  }

  let progressTween = null;
  let gsapSetters = null;
  let nativeTickerStarted = false;
  let pointerParallaxBound = false;
  let lastNativeRawProgress = 0;
  let lastRenderedProgress = -1;
  let lastRenderedMouseX = 999;
  let lastRenderedMouseY = 999;
  let transitionTarget = 0;
  let transitionLockDirection = 0;
  let transitionQueuedTarget = null;
  let scrollTrigger = null;
  let destroyed = false;

  const cleanup = [];
  const currentFigurePosition = { ...FIGURE_POSITION };
  const playhead = { raw: 0 };
  const parallaxMouse = { x: 0, y: 0 };
  const nativeMouse = { targetX: 0, targetY: 0, x: 0, y: 0 };

  function setVar(name, value) {
    stage.style.setProperty(name, value);
  }

  function addWindowListener(type, listener, options) {
    window.addEventListener(type, listener, options);
    cleanup.push(() => window.removeEventListener(type, listener, options));
  }

  function createGsapSetters(gsap) {
    gsap.set([cloudBack, archLayer, cloudFrontSecond, cloudFront], {
      xPercent: -50,
      yPercent: 0,
      scale: 1,
      transformOrigin: '50% 100%',
      force3D: true
    });

    return {
      cloudBackX: gsap.quickSetter(cloudBack, 'x', 'px'),
      cloudBackY: gsap.quickSetter(cloudBack, 'y', 'px'),
      cloudFrontSecondX: gsap.quickSetter(cloudFrontSecond, 'x', 'px'),
      cloudFrontSecondY: gsap.quickSetter(cloudFrontSecond, 'y', 'px'),
      cloudFrontX: gsap.quickSetter(cloudFront, 'x', 'px'),
      cloudFrontY: gsap.quickSetter(cloudFront, 'y', 'px'),
      archX: gsap.quickSetter(archLayer, 'x', 'px'),
      archY: gsap.quickSetter(archLayer, 'y', 'px')
    };
  }

  function renderWithGsap(progress, mouseX, mouseY) {
    if (!gsapSetters) return;
    const p = stableProgress(progress);
    const eased = smoothStep(range01(p, 0.08, 0.78));
    const downExitY = window.innerHeight * 1.38;

    gsapSetters.cloudBackX(mouseX * -0.003);
    gsapSetters.cloudBackY(mouseY * -0.002 + eased * downExitY * 0.82);

    gsapSetters.archX(mouseX * -0.002);
    gsapSetters.archY(eased * downExitY * 1.00);

    gsapSetters.cloudFrontSecondX(mouseX * -0.002);
    gsapSetters.cloudFrontSecondY(mouseY * -0.001 + eased * downExitY * 1.28);

    gsapSetters.cloudFrontX(mouseX * -0.002);
    gsapSetters.cloudFrontY(mouseY * -0.001 + eased * downExitY * 1.14);
  }

  function renderNative(progress, mouseX, mouseY) {
    const p = stableProgress(progress);
    const eased = smoothStep(range01(p, 0.08, 0.78));
    const downExitY = window.innerHeight * 1.38;
    cloudBack.style.transform = `translate3d(calc(-50% + ${mouseX * -0.003}px), ${mouseY * -0.002 + eased * downExitY * 0.82}px, 0)`;
    archLayer.style.transform = `translate3d(calc(-50% + ${mouseX * -0.002}px), ${eased * downExitY * 1.00}px, 0)`;
    cloudFrontSecond.style.transform = `translate3d(calc(-50% + ${mouseX * -0.002}px), ${mouseY * -0.001 + eased * downExitY * 1.28}px, 0)`;
    cloudFront.style.transform = `translate3d(calc(-50% + ${mouseX * -0.002}px), ${mouseY * -0.001 + eased * downExitY * 1.14}px, 0)`;
  }

  function renderVideoTransition(progress) {
    const p = stableProgress(progress);
    const time = p * TIMELINE_DURATION_SECONDS;
    const grow = smoothStep(range01(time, FIGURE_START_SECONDS, FIGURE_FULLSCREEN_SECONDS));
    const reveal = smoothStep(range01(time, FIGURE_START_SECONDS + 0.05, FIGURE_START_SECONDS + 0.70));
    const unmask = smoothStep(range01(time, FIGURE_START_SECONDS + 0.12, FIGURE_START_SECONDS + 1.05));
    const flockOpacity = 1 - smoothStep(range01(time, FLOCK_END_SECONDS - 0.24, FLOCK_END_SECONDS));
    const figureX = currentFigurePosition.x * (1 - grow);
    const figureY = currentFigurePosition.y * (1 - grow);
    const scale = currentFigurePosition.scale + (1 - currentFigurePosition.scale) * grow;
    const clipBottom = (1 - unmask) * 42;

    setVar('--crane-video-scale', scale.toFixed(4));
    setVar('--crane-figure-x', `${figureX.toFixed(1)}px`);
    setVar('--crane-figure-base-y', `${figureY.toFixed(1)}px`);
    setVar('--crane-video-y', '0px');
    setVar('--crane-video-opacity', reveal.toFixed(4));
    setVar('--crane-video-clip-bottom', `${clipBottom.toFixed(2)}%`);
    setVar('--crane-flock-opacity', flockOpacity.toFixed(4));
    setVar('--crane-flock-y', '0px');
  }

  function seekVideos(progress) {
    const p = stableProgress(progress);
    const time = p * TIMELINE_DURATION_SECONDS;
    seekVideo(flockVideo, range01(time, FLOCK_START_SECONDS, FLOCK_END_SECONDS));
    seekVideo(figureVideo, range01(time, FIGURE_START_SECONDS, FIGURE_END_SECONDS));
  }

  function renderScene(progress, mouseX, mouseY) {
    const p = stableProgress(progress);
    setVar('--crane-progress', p.toFixed(4));
    renderVideoTransition(p);

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

  function renderRawProgress(rawProgress) {
    const visualProgress = acceleratedProgress(rawProgress);
    renderScene(visualProgress, parallaxMouse.x, parallaxMouse.y);
    seekVideos(visualProgress);
  }

  function tweenToRawProgress(rawProgress) {
    const target = stableProgress(rawProgress);
    const distance = Math.abs(target - playhead.raw);
    const direction = target > playhead.raw ? 1 : target < playhead.raw ? -1 : 0;

    if (progressTween && target === transitionTarget) {
      transitionQueuedTarget = null;
      return;
    }

    if (transitionLockDirection && direction && direction !== transitionLockDirection) {
      transitionQueuedTarget = target;
      return;
    }

    progressTween?.kill?.();
    progressTween = null;
    transitionTarget = target;
    transitionQueuedTarget = null;

    if (!window.gsap || distance < 0.001) {
      playhead.raw = target;
      transitionLockDirection = 0;
      renderRawProgress(playhead.raw);
      return;
    }

    transitionLockDirection = direction || (target >= 0.5 ? 1 : -1);
    progressTween = window.gsap.to(playhead, {
      raw: target,
      duration: Math.max(0.06, distance * TRANSITION_DURATION_SECONDS),
      ease: 'none',
      overwrite: true,
      onUpdate: () => renderRawProgress(playhead.raw),
      onComplete: () => {
        playhead.raw = target;
        progressTween = null;
        transitionLockDirection = 0;
        renderRawProgress(playhead.raw);
        if (transitionQueuedTarget !== null && Math.abs(transitionQueuedTarget - playhead.raw) > 0.001) {
          const queuedTarget = transitionQueuedTarget;
          transitionQueuedTarget = null;
          tweenToRawProgress(queuedTarget);
        }
      }
    });
  }

  function resetTransition() {
    tweenToRawProgress(0);
  }

  function updateNativeProgress() {
    const rect = stage.getBoundingClientRect();
    const range = Math.max(1, window.innerHeight * TRANSITION_SCROLL_RANGE);
    const rawProgress = -rect.top / range;
    const p = stableProgress(rawProgress);
    const direction = rawProgress >= lastNativeRawProgress ? 1 : -1;
    lastNativeRawProgress = rawProgress;

    if (direction > 0 && p >= TRANSITION_TRIGGER_PROGRESS) {
      tweenToRawProgress(1);
    } else if (direction < 0 && p <= 1 - TRANSITION_TRIGGER_PROGRESS) {
      tweenToRawProgress(0);
    }
  }

  function startPointerParallax(gsap) {
    if (pointerParallaxBound) return;
    pointerParallaxBound = true;

    if (gsap) {
      const parallaxToX = gsap.quickTo(parallaxMouse, 'x', { duration: 0.85, ease: 'power3.out' });
      const parallaxToY = gsap.quickTo(parallaxMouse, 'y', { duration: 0.85, ease: 'power3.out' });

      addWindowListener('pointermove', (event) => {
        if (reduceMotion || event.pointerType === 'touch') return;
        const rect = stage.getBoundingClientRect();
        if (rect.top > window.innerHeight || rect.bottom < 0) return;
        parallaxToX(event.clientX - window.innerWidth / 2);
        parallaxToY(event.clientY - window.innerHeight / 2);
      }, { passive: true });

      addWindowListener('pointerleave', () => {
        parallaxToX(0);
        parallaxToY(0);
      }, { passive: true });
      return;
    }

    addWindowListener('pointermove', (event) => {
      if (reduceMotion || event.pointerType === 'touch') return;
      const rect = stage.getBoundingClientRect();
      if (rect.top > window.innerHeight || rect.bottom < 0) return;
      nativeMouse.targetX = event.clientX - window.innerWidth / 2;
      nativeMouse.targetY = event.clientY - window.innerHeight / 2;
    }, { passive: true });

    addWindowListener('pointerleave', () => {
      nativeMouse.targetX = 0;
      nativeMouse.targetY = 0;
    }, { passive: true });
  }

  function initNativeFallback() {
    startPointerParallax(null);
    addWindowListener('scroll', updateNativeProgress, { passive: true });
    addWindowListener('resize', updateNativeProgress, { passive: true });

    if (!nativeTickerStarted) {
      nativeTickerStarted = true;
      const tick = () => {
        if (destroyed) return;
        updateNativeProgress();
        nativeMouse.x += (nativeMouse.targetX - nativeMouse.x) * 0.10;
        nativeMouse.y += (nativeMouse.targetY - nativeMouse.y) * 0.10;
        parallaxMouse.x = nativeMouse.x;
        parallaxMouse.y = nativeMouse.y;
        renderScene(acceleratedProgress(playhead.raw), parallaxMouse.x, parallaxMouse.y);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
    updateNativeProgress();
  }

  function initScrollTrigger() {
    const { gsap, ScrollTrigger } = window;
    gsap.registerPlugin(ScrollTrigger);

    getSmoothRuntime();
    gsapSetters = createGsapSetters(gsap);
    startPointerParallax(gsap);
    renderRawProgress(0);

    scrollTrigger = ScrollTrigger.create({
      trigger: stage,
      start: 'top top',
      end: () => `+=${Math.max(1, window.innerHeight * TRANSITION_SCROLL_RANGE)}`,
      onUpdate: (self) => {
        if (self.direction > 0 && self.progress >= TRANSITION_TRIGGER_PROGRESS) {
          tweenToRawProgress(1);
        } else if (self.direction < 0 && self.progress <= TRANSITION_TRIGGER_PROGRESS) {
          resetTransition();
        }
      },
      onLeave: () => tweenToRawProgress(1),
      onEnterBack: resetTransition,
      onLeaveBack: resetTransition
    });

    addWindowListener('resize', () => {
      lastRenderedProgress = -1;
      ScrollTrigger.refresh();
    }, { passive: true });

    ScrollTrigger.refresh();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    progressTween?.kill?.();
    scrollTrigger?.kill?.();
    cleanup.splice(0).forEach((dispose) => dispose());
    scenes.delete(scene);
    if (stage.__craneScene === scene) {
      delete stage.__craneScene;
    }
  }

  const scene = { destroy, renderRawProgress };
  stage.__craneScene = scene;
  scenes.add(scene);

  prepareVideo(figureVideo);
  prepareVideo(flockVideo);
  const videosReady = Promise.all([
    waitForVideoMetadata(figureVideo),
    waitForVideoMetadata(flockVideo)
  ]);

  if (reduceMotion) {
    videosReady.then(() => {
      if (destroyed) return;
      playhead.raw = 1;
      renderRawProgress(1);
    });
  } else {
    Promise.all([loadRequiredLibraries(), videosReady])
      .then(() => {
        if (!destroyed) initScrollTrigger();
      })
      .catch((error) => {
        if (destroyed) return;
        console.warn('Falling back to native crane scroll sync.', error);
        initNativeFallback();
      });
  }

  return scene;
}

document.querySelectorAll('[data-crane-stage]').forEach((stage) => initCraneScene(stage));

window.addEventListener('pagehide', () => {
  [...scenes].forEach((scene) => scene.destroy());
  smoothRuntime?.destroy?.();
  smoothRuntime = null;
});
