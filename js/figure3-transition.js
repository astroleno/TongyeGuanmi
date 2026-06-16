import { initSmoothScroll } from './ui/smooth-scroll.js';

const CDN = {
  gsap: 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js',
  scrollTrigger: 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js',
  lenis: 'https://cdn.jsdelivr.net/npm/lenis@1.3.23/dist/lenis.min.js'
};

const TRANSITION_DURATION_SECONDS = 2;
const VIDEO_DURATION_FALLBACK = 5.04;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const smoothStep = (value) => value * value * (3 - 2 * value);
const range01 = (value, start, end) => clamp((value - start) / (end - start), 0, 1);

const root = document.documentElement;
const body = document.body;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const scrollSection = document.querySelector('[data-fabric-scroll]');
const alphaVideo = document.querySelector('[data-fabric-alpha-video]');
const replay = document.querySelector('[data-fabric-replay]');

let scrollRuntime = { lenis: null };
let progressTween = null;
const playhead = { raw: 0 };

function acceleratedProgress(rawProgress) {
  const t = clamp(rawProgress, 0, 1);
  return clamp(0.78 * t + 0.22 * t * t, 0, 1);
}

function loadScript(src, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    let settled = false;
    const finish = (ok, value) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (!ok) script.remove();
      ok ? resolve(value) : reject(value);
    };
    const timer = window.setTimeout(() => finish(false, new Error(`Timed out loading ${src}`)), timeout);
    script.src = src;
    script.async = false;
    script.onload = () => finish(true);
    script.onerror = () => finish(false, new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function loadLibraries() {
  if (!window.gsap) await loadScript(CDN.gsap);
  if (!window.ScrollTrigger) await loadScript(CDN.scrollTrigger);
  try {
    if (!window.Lenis) await loadScript(CDN.lenis);
  } catch (error) {
    console.warn('Lenis unavailable, keeping native scroll.', error);
  }
  if (!window.gsap || !window.ScrollTrigger) {
    throw new Error('Required animation libraries are unavailable.');
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

function setProgress(progress) {
  const p = clamp(progress, 0, 1);
  const fill = smoothStep(range01(p, 0.86, 0.995));
  const videoOpacity = 1 - smoothStep(range01(p, 0.93, 1));
  const backdropSettle = smoothStep(range01(p, 0.06, 0.84));

  root.style.setProperty('--fabric-progress', p.toFixed(4));
  root.style.setProperty('--fabric-fill-opacity', fill.toFixed(4));
  root.style.setProperty('--fabric-video-opacity', videoOpacity.toFixed(4));
  root.style.setProperty('--fabric-backdrop-opacity', (1 - backdropSettle * 0.46).toFixed(4));
  root.style.setProperty('--fabric-backdrop-scale', (1.06 + backdropSettle * 0.08).toFixed(4));
  root.style.setProperty('--fabric-video-scale', (1.004 + p * 0.052).toFixed(4));
}

function renderRawProgress(rawProgress) {
  const visualProgress = acceleratedProgress(rawProgress);
  setProgress(visualProgress);
  seekVideo(visualProgress);
}

function tweenToRawProgress(rawProgress) {
  const { gsap } = window;
  const target = clamp(rawProgress, 0, 1);
  const distance = Math.abs(target - playhead.raw);

  progressTween?.kill?.();
  progressTween = null;

  if (distance < 0.001) {
    playhead.raw = target;
    renderRawProgress(playhead.raw);
    return;
  }

  progressTween = gsap.to(playhead, {
    raw: target,
    duration: Math.max(0.06, distance * TRANSITION_DURATION_SECONDS),
    ease: 'none',
    overwrite: true,
    onUpdate: () => renderRawProgress(playhead.raw),
    onComplete: () => {
      playhead.raw = target;
      progressTween = null;
      renderRawProgress(playhead.raw);
    }
  });
}

function resetTransition() {
  tweenToRawProgress(0);
}

async function init() {
  if (!scrollSection || !alphaVideo) return;
  prepareVideo(alphaVideo);
  await waitForVideoMetadata(alphaVideo);

  if (reduceMotion) {
    playhead.raw = 1;
    renderRawProgress(1);
    return;
  }

  await loadLibraries();
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

  renderRawProgress(0);

  ScrollTrigger.create({
    trigger: scrollSection,
    start: 'top top',
    end: () => `+=${Math.max(1, window.innerHeight * 0.2)}`,
    onUpdate: (self) => tweenToRawProgress(self.progress),
    onLeave: () => tweenToRawProgress(1),
    onLeaveBack: resetTransition
  });

  replay?.addEventListener('click', () => {
    resetTransition();
    if (scrollRuntime.lenis?.scrollTo) {
      scrollRuntime.lenis.scrollTo(0, { duration: 0.9 });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  ScrollTrigger.refresh();
}

init().catch((error) => {
  console.warn('Figure 3 transition test failed to initialize.', error);
  setProgress(0);
});
