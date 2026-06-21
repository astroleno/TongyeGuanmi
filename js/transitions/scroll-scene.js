import { initSmoothScroll } from '../ui/smooth-scroll.js';

export function createReduceMotionState(query = '(prefers-reduced-motion: reduce)') {
  return Boolean(window.matchMedia?.(query)?.matches);
}

export function initTransitionScrollRuntime({
  root = document.documentElement,
  body = document.body,
  reduceMotion = false,
  smoothOptions = {},
  gsap = window.gsap,
  ScrollTrigger = window.ScrollTrigger
} = {}) {
  if (!gsap || !ScrollTrigger) {
    throw new Error('Transition scroll runtime requires GSAP and ScrollTrigger.');
  }

  gsap.registerPlugin(ScrollTrigger);

  const scrollRuntime = initSmoothScroll({
    root,
    body,
    reduceMotion,
    options: smoothOptions
  });

  return {
    gsap,
    ScrollTrigger,
    scrollRuntime,
    destroy() {
      scrollRuntime?.destroy?.();
    }
  };
}

export function createScrollProgressTrigger({
  ScrollTrigger = window.ScrollTrigger,
  trigger,
  start = 'top top',
  end = 'bottom bottom',
  invalidateOnRefresh = true,
  onUpdate = () => {},
  onLeave = () => {},
  onEnterBack = () => {},
  onLeaveBack = () => {}
} = {}) {
  if (!ScrollTrigger || !trigger) {
    return {
      instance: null,
      destroy() {}
    };
  }

  const instance = ScrollTrigger.create({
    trigger,
    start,
    end,
    invalidateOnRefresh,
    onUpdate,
    onLeave,
    onEnterBack,
    onLeaveBack
  });

  return {
    instance,
    destroy() {
      instance?.kill?.();
    }
  };
}
