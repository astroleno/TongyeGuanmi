import { loadTransitionLibraries } from './transitions/load-libraries.js';
import {
  createReduceMotionState,
  createScrollProgressTrigger,
  initTransitionScrollRuntime
} from './transitions/scroll-scene.js';
import {
  prepareScrubVideo,
  seekVideoToProgress,
  waitForVideoMetadata
} from './transitions/video-scrub.js';

const TRANSITION_DURATION_SECONDS = 2;
const VIDEO_DURATION_FALLBACK = 4.04;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const smoothStep = (value) => value * value * (3 - 2 * value);

const root = document.documentElement;
const body = document.body;
const stage = document.querySelector('[data-ph-stage]');
const alphaVideo = document.querySelector('[data-ph-alpha-video]');
const reduceMotion = createReduceMotionState();

let scrollScene = { destroy() {} };
let scrollTrigger = { destroy() {} };
let progressTween = null;
const playhead = { raw: 0 };

function setProgress(progress) {
  const p = clamp(progress, 0, 1);
  root.style.setProperty('--ph-progress', p.toFixed(4));
  root.style.setProperty('--ph-video-opacity', (1 - smoothStep(clamp((p - 0.98) / 0.02, 0, 1))).toFixed(4));
  seekVideoToProgress(alphaVideo, p, {
    fallbackSeconds: VIDEO_DURATION_FALLBACK,
    endPaddingSeconds: 0.02,
    minDeltaSeconds: 0.016
  });
}

function tweenToRawProgress(rawProgress) {
  const { gsap } = window;
  const target = clamp(rawProgress, 0, 1);
  const distance = Math.abs(target - playhead.raw);

  progressTween?.kill?.();
  progressTween = null;

  if (distance < 0.001 || !gsap) {
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

  prepareScrubVideo(alphaVideo);

  if (reduceMotion) {
    playhead.raw = 1;
    setProgress(1);
    waitForVideoMetadata(alphaVideo).then(() => setProgress(1));
    return;
  }

  await waitForVideoMetadata(alphaVideo);

  const { gsap, ScrollTrigger } = await loadTransitionLibraries();
  scrollScene = initTransitionScrollRuntime({
    root,
    body,
    reduceMotion,
    gsap,
    ScrollTrigger,
    smoothOptions: {
      lerp: 0.08,
      wheelMultiplier: 0.82,
      syncTouch: false
    }
  });

  setProgress(0);

  scrollTrigger = createScrollProgressTrigger({
    ScrollTrigger,
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
  scrollTrigger?.destroy?.();
  scrollScene?.destroy?.();
});
