import { initSmoothScroll } from './ui/smooth-scroll.js';

const CDN = {
  gsap: 'js/vendor/gsap.min.js',
  scrollTrigger: 'js/vendor/ScrollTrigger.min.js',
  lenis: 'js/vendor/lenis.min.js'
};

const TRANSITION_DURATION_SECONDS = 2;
const VIDEO_DURATION_FALLBACK = 4.04;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const smoothStep = (value) => value * value * (3 - 2 * value);

const root = document.documentElement;
const body = document.body;
const stage = document.querySelector('[data-ph-stage]');
const alphaVideo = document.querySelector('[data-ph-alpha-video]');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let scrollRuntime = { lenis: null };
let progressTween = null;
const playhead = { raw: 0 };

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
      if (!ok) script.remove();
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

async function loadRequiredLibraries() {
  if (!window.gsap) await loadScript(CDN.gsap);
  if (!window.ScrollTrigger) await loadScript(CDN.scrollTrigger);
  try {
    if (!window.Lenis) await loadScript(CDN.lenis);
  } catch (error) {
    console.warn('Lenis unavailable, keeping native scroll.', error);
  }
  if (!window.gsap || !window.ScrollTrigger) {
    throw new Error('GSAP ScrollTrigger unavailable.');
  }
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
    const timer = window.setTimeout(finish, 1200);
    video.addEventListener('loadedmetadata', finish, { once: true });
    video.addEventListener('canplay', finish, { once: true });
    video.addEventListener('error', finish, { once: true });
    video.load();
  });
}

function getVideoDuration(video) {
  return Number.isFinite(video?.duration) && video.duration > 0 ? video.duration : VIDEO_DURATION_FALLBACK;
}

function seekVideo(progress) {
  if (!alphaVideo || alphaVideo.readyState < 1) return;
  const duration = getVideoDuration(alphaVideo);
  const targetTime = Math.min(duration - 0.02, Math.max(0, progress * duration));
  if (Math.abs(alphaVideo.currentTime - targetTime) < 0.016) return;

  try {
    alphaVideo.currentTime = targetTime;
  } catch {
    // Metadata can settle a beat later on WebKit.
  }
}

function setProgress(progress) {
  const p = clamp(progress, 0, 1);
  root.style.setProperty('--ph-progress', p.toFixed(4));
  root.style.setProperty('--ph-video-opacity', (1 - smoothStep(clamp((p - 0.98) / 0.02, 0, 1))).toFixed(4));
  seekVideo(p);
}

function tweenToRawProgress(rawProgress) {
  const { gsap } = window;
  const target = clamp(rawProgress, 0, 1);
  const distance = Math.abs(target - playhead.raw);

  progressTween?.kill?.();
  progressTween = null;

  if (distance < 0.001) {
    playhead.raw = target;
    setProgress(playhead.raw);
    return;
  }

  progressTween = gsap.to(playhead, {
    raw: target,
    duration: Math.max(0.06, distance * TRANSITION_DURATION_SECONDS),
    ease: 'none',
    overwrite: true,
    onUpdate: () => setProgress(playhead.raw),
    onComplete: () => {
      playhead.raw = target;
      progressTween = null;
      setProgress(playhead.raw);
    }
  });
}

function resetTransition() {
  tweenToRawProgress(0);
}

async function init() {
  if (!stage || !alphaVideo) return;
  prepareVideo(alphaVideo);
  await waitForVideoMetadata(alphaVideo);

  if (reduceMotion) {
    playhead.raw = 1;
    setProgress(1);
    return;
  }

  await loadRequiredLibraries();
  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);

  scrollRuntime = initSmoothScroll({
    root,
    body,
    reduceMotion,
    options: {
      lerp: 0.08,
      wheelMultiplier: 0.82,
      syncTouch: false
    }
  });

  setProgress(0);

  ScrollTrigger.create({
    trigger: stage,
    start: 'top top',
    end: 'bottom bottom',
    invalidateOnRefresh: true,
    onUpdate: (self) => tweenToRawProgress(self.progress),
    onLeave: () => tweenToRawProgress(1),
    onLeaveBack: resetTransition
  });

  ScrollTrigger.refresh();
}

init().catch((error) => {
  console.warn('PH transition failed to initialize.', error);
  setProgress(0);
});

window.addEventListener('pagehide', () => {
  progressTween?.kill?.();
  scrollRuntime?.destroy?.();
});
