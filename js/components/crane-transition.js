import { createScrollProgressTrigger } from '../transitions/scroll-scene.js';
import {
  prepareScrubVideo,
  seekVideoToProgress,
  waitForVideoMetadata
} from '../transitions/video-scrub.js';

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

function clamp(value, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max);
}

function smoothStep(value) {
  const p = clamp(value);
  return p * p * (3 - 2 * p);
}

function range01(value, start, end) {
  return clamp((value - start) / Math.max(0.0001, end - start));
}

function stableProgress(value) {
  if (value < 0.002) return 0;
  if (value > 0.998) return 1;
  return clamp(value);
}

function acceleratedProgress(rawProgress) {
  const t = stableProgress(rawProgress);
  return clamp(0.78 * t + 0.22 * t * t);
}

export function createCraneTransitionScene(stage) {
  const cloudBack = stage.querySelector('.crane-layer--cloud-back');
  const cloudFrontSecond = stage.querySelector('.crane-layer--cloud-front-second');
  const cloudFront = stage.querySelector('.crane-layer--cloud-front');
  const archLayer = stage.querySelector('.crane-layer--arch');
  const figureVideo = stage.querySelector('[data-crane-figure-video]');
  const flockVideo = stage.querySelector('[data-crane-figure-front-video]');

  if (!cloudBack || !cloudFrontSecond || !cloudFront || !archLayer || !figureVideo || !flockVideo) {
    return null;
  }

  let destroyed = false;
  let progressTween = null;
  let gsapSetters = null;
  let nativeTickerStarted = false;
  let lastNativeRawProgress = 0;
  let lastRenderedProgress = -1;
  let lastRenderedMouseX = 999;
  let lastRenderedMouseY = 999;
  let transitionTarget = 0;
  let transitionLockDirection = 0;
  let transitionQueuedTarget = null;

  const cleanup = [];
  const playhead = { raw: 0 };
  const parallaxMouse = { x: 0, y: 0 };
  const nativeMouse = { targetX: 0, targetY: 0, x: 0, y: 0 };
  const currentFigurePosition = { ...FIGURE_POSITION };

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
    gsapSetters.archY(eased * downExitY);
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
    archLayer.style.transform = `translate3d(calc(-50% + ${mouseX * -0.002}px), ${eased * downExitY}px, 0)`;
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

    seekVideoToProgress(flockVideo, range01(time, FLOCK_START_SECONDS, FLOCK_END_SECONDS), {
      fallbackSeconds: VIDEO_DURATION_FALLBACK,
      endPaddingSeconds: 0.001,
      minDeltaSeconds: 0.008
    });
    seekVideoToProgress(figureVideo, range01(time, FIGURE_START_SECONDS, FIGURE_END_SECONDS), {
      fallbackSeconds: VIDEO_DURATION_FALLBACK,
      endPaddingSeconds: 0.001,
      minDeltaSeconds: 0.008
    });
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
    const gsap = window.gsap;
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

    if (!gsap || distance < 0.001) {
      playhead.raw = target;
      transitionLockDirection = 0;
      renderRawProgress(playhead.raw);
      return;
    }

    transitionLockDirection = direction || (target >= 0.5 ? 1 : -1);
    progressTween = gsap.to(playhead, {
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

  function startPointerParallax(gsap, reduceMotion) {
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

  function prepare() {
    prepareScrubVideo(figureVideo);
    prepareScrubVideo(flockVideo);
    renderRawProgress(0);
  }

  function waitForVideos() {
    return Promise.all([
      waitForVideoMetadata(figureVideo, { timeoutMs: 1300 }),
      waitForVideoMetadata(flockVideo, { timeoutMs: 1300 })
    ]);
  }

  function mountReducedMotion() {
    playhead.raw = 1;
    renderRawProgress(1);
    waitForVideos().then(() => {
      if (!destroyed) renderRawProgress(1);
    });
  }

  function mountGsap({ gsap, ScrollTrigger, reduceMotion }) {
    gsapSetters = createGsapSetters(gsap);
    startPointerParallax(gsap, reduceMotion);
    renderRawProgress(0);

    const scrollTrigger = createScrollProgressTrigger({
      ScrollTrigger,
      trigger: stage,
      start: 'top top',
      end: () => `+=${Math.max(1, window.innerHeight * TRANSITION_SCROLL_RANGE)}`,
      invalidateOnRefresh: true,
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
    cleanup.push(() => scrollTrigger.destroy());

    addWindowListener('resize', () => {
      lastRenderedProgress = -1;
      ScrollTrigger.refresh();
    }, { passive: true });

    return destroy;
  }

  function mountNativeFallback(reduceMotion = false) {
    startPointerParallax(null, reduceMotion);
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
    return destroy;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    progressTween?.kill?.();
    cleanup.splice(0).forEach((dispose) => dispose());
    figureVideo.pause();
    flockVideo.pause();
  }

  return {
    stage,
    prepare,
    waitForVideos,
    mountReducedMotion,
    mountGsap,
    mountNativeFallback,
    renderRawProgress,
    destroy
  };
}
