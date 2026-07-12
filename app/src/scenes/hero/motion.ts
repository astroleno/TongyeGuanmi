export const HERO_INTRO_DURATION_MS = 2_700;
export const HERO_TITLE_START_PROGRESS = 0.78;

export type HeroIntroSample = Readonly<{
  progress: number;
  titleActive: boolean;
  complete: boolean;
}>;

export type HeroIntroOptions = {
  render(sample: HeroIntroSample): void;
  reducedMotion?: boolean;
  onTitleActive?: () => void;
  onComplete?: () => void;
  now?: () => number;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (frameId: number) => void;
};

export type HeroParallaxSample = Readonly<{
  backX: number;
  backY: number;
  middleX: number;
  middleY: number;
  figureX: number;
  figureY: number;
}>;

export type HeroParallaxOptions = {
  reducedMotion?: boolean;
  eventTarget?: Window;
  viewport?: () => { width: number; height: number };
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (frameId: number) => void;
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function sampleHeroIntro(progress: number): HeroIntroSample {
  const clamped = clamp01(progress);
  return {
    progress: clamped,
    titleActive: clamped >= HERO_TITLE_START_PROGRESS,
    complete: clamped >= 1
  };
}

export function startHeroIntro(options: HeroIntroOptions): () => void {
  let disposed = false;
  let titleNotified = false;
  let completeNotified = false;
  let frameId: number | undefined;

  const render = (sample: HeroIntroSample) => {
    options.render(sample);
    if (sample.titleActive && !titleNotified) {
      titleNotified = true;
      options.onTitleActive?.();
    }
    if (sample.complete && !completeNotified) {
      completeNotified = true;
      options.onComplete?.();
    }
  };

  if (options.reducedMotion) {
    render(sampleHeroIntro(1));
    return () => {
      disposed = true;
    };
  }

  const requestFrame = options.requestFrame ?? window.requestAnimationFrame.bind(window);
  const cancelFrame = options.cancelFrame ?? window.cancelAnimationFrame.bind(window);
  const startedAt = options.now?.() ?? performance.now();
  render(sampleHeroIntro(0));
  const tick = (time: number) => {
    if (disposed) {
      return;
    }
    const sample = sampleHeroIntro((time - startedAt) / HERO_INTRO_DURATION_MS);
    render(sample);
    if (!sample.complete) {
      frameId = requestFrame(tick);
    }
  };
  frameId = requestFrame(tick);

  return () => {
    if (disposed) {
      return;
    }
    disposed = true;
    if (frameId !== undefined) {
      cancelFrame(frameId);
      frameId = undefined;
    }
  };
}

export function heroParallaxSample(pointerX: number, pointerY: number): HeroParallaxSample {
  return {
    backX: pointerX * 0.02,
    backY: pointerY * 0.02,
    middleX: pointerX * 0.04,
    middleY: pointerY * 0.04,
    figureX: pointerX * 0.06,
    figureY: pointerY * 0.06
  };
}

function applyHeroParallax(root: HTMLElement, sample: HeroParallaxSample): void {
  root.style.setProperty('--r4-hero-back-parallax-x', `${sample.backX.toFixed(2)}px`);
  root.style.setProperty('--r4-hero-back-parallax-y', `${sample.backY.toFixed(2)}px`);
  root.style.setProperty('--r4-hero-middle-parallax-x', `${sample.middleX.toFixed(2)}px`);
  root.style.setProperty('--r4-hero-middle-parallax-y', `${sample.middleY.toFixed(2)}px`);
  root.style.setProperty('--r4-hero-figure-parallax-x', `${sample.figureX.toFixed(2)}px`);
  root.style.setProperty('--r4-hero-figure-parallax-y', `${sample.figureY.toFixed(2)}px`);
}

const ZERO_PARALLAX = heroParallaxSample(0, 0);

export function attachHeroParallax(root: HTMLElement, options: HeroParallaxOptions = {}): () => void {
  applyHeroParallax(root, ZERO_PARALLAX);
  if (options.reducedMotion) {
    return () => undefined;
  }

  const eventTarget = options.eventTarget ?? window;
  const viewport = options.viewport ?? (() => ({ width: window.innerWidth, height: window.innerHeight }));
  const requestFrame = options.requestFrame ?? window.requestAnimationFrame.bind(window);
  const cancelFrame = options.cancelFrame ?? window.cancelAnimationFrame.bind(window);
  let disposed = false;
  let frameId: number | undefined;
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  let frameCount = 0;

  root.dataset.heroParallaxActive = 'true';

  const schedule = () => {
    if (!disposed && frameId === undefined) {
      frameId = requestFrame(tick);
    }
  };

  const tick = () => {
    frameId = undefined;
    if (disposed) {
      return;
    }
    currentX += (targetX - currentX) * 0.08;
    currentY += (targetY - currentY) * 0.08;
    frameCount += 1;
    root.dataset.heroParallaxFrame = String(frameCount);
    applyHeroParallax(root, heroParallaxSample(currentX, currentY));
    if (Math.abs(targetX - currentX) > 0.1 || Math.abs(targetY - currentY) > 0.1) {
      schedule();
    }
  };

  const onPointerMove = (event: Event) => {
    const pointer = event as PointerEvent;
    if (pointer.pointerType === 'touch') {
      return;
    }
    const { width, height } = viewport();
    targetX = pointer.clientX - width / 2;
    targetY = pointer.clientY - height / 2;
    schedule();
  };
  const onPointerLeave = () => {
    targetX = 0;
    targetY = 0;
    schedule();
  };

  eventTarget.addEventListener('pointermove', onPointerMove, { passive: true });
  eventTarget.addEventListener('pointerleave', onPointerLeave, { passive: true });

  return () => {
    if (disposed) {
      return;
    }
    disposed = true;
    eventTarget.removeEventListener('pointermove', onPointerMove);
    eventTarget.removeEventListener('pointerleave', onPointerLeave);
    if (frameId !== undefined) {
      cancelFrame(frameId);
      frameId = undefined;
    }
    applyHeroParallax(root, ZERO_PARALLAX);
    delete root.dataset.heroParallaxActive;
    delete root.dataset.heroParallaxFrame;
  };
}
