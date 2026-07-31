import type { PhoneMotionDriver } from './types';

type TransformState = {
  x: number;
  y: number;
  yPercent: number;
  scale: number;
};

type PhoneFrameTween = Readonly<{ cancel(): void }>;

function requestPhoneFrame(callback: FrameRequestCallback): number {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    return globalThis.requestAnimationFrame(callback);
  }
  return globalThis.setTimeout(() => callback(Date.now()), 16) as unknown as number;
}

function cancelPhoneFrame(frame: number | null): void {
  if (frame === null) return;
  if (typeof globalThis.cancelAnimationFrame === 'function') {
    globalThis.cancelAnimationFrame(frame);
  } else {
    globalThis.clearTimeout(frame);
  }
}

function easeOut(progress: number, ease: string): number {
  const clamped = Math.min(1, Math.max(0, progress));
  const match = /^power([2-4])\.out$/.exec(ease);
  const power = match ? Number(match[1]) : 1;
  return 1 - (1 - clamped) ** power;
}

function animateFrame(
  durationMs: number,
  render: (progress: number) => void
): PhoneFrameTween {
  let frame: number | null = null;
  let startedAt: number | null = null;
  let cancelled = false;
  const step = (now: number) => {
    if (cancelled) return;
    startedAt ??= now;
    const progress = durationMs <= 0
      ? 1
      : Math.min(1, (now - startedAt) / durationMs);
    render(progress);
    if (progress < 1) frame = requestPhoneFrame(step);
    else frame = null;
  };
  frame = requestPhoneFrame(step);
  return {
    cancel() {
      cancelled = true;
      cancelPhoneFrame(frame);
      frame = null;
    }
  };
}

const transforms = new WeakMap<HTMLElement, TransformState>();

function transformState(target: HTMLElement): TransformState {
  let state = transforms.get(target);
  if (!state) {
    state = { x: 0, y: 0, yPercent: 0, scale: 1 };
    transforms.set(target, state);
  }
  return state;
}

function applyTransform(target: HTMLElement, state: TransformState): void {
  target.style.translate =
    `${state.x}px calc(${state.y}px + ${state.yPercent}%)`;
  target.style.scale = String(state.scale);
}

function setStyles(
  target: HTMLElement,
  vars: Readonly<Record<string, string | number>>
): void {
  const state = transformState(target);
  let transformChanged = false;
  for (const [property, value] of Object.entries(vars)) {
    if (
      property === 'x'
      || property === 'y'
      || property === 'yPercent'
      || property === 'scale'
    ) {
      state[property] = Number(value);
      transformChanged = true;
    } else if (property === 'autoAlpha') {
      target.style.opacity = String(value);
      target.style.visibility = Number(value) > 0 ? 'visible' : 'hidden';
    } else if (property === 'opacity' || property === 'filter') {
      target.style[property] = String(value);
    }
  }
  if (transformChanged) applyTransform(target, state);
}

export const phoneMotionDriver: PhoneMotionDriver = Object.freeze({
  set: setStyles,
  quickTo(target, property, vars) {
    const transform = transformState(target);
    const state = { value: transform[property] };
    let tween: PhoneFrameTween | null = null;
    return (value) => {
      tween?.cancel();
      const start = state.value;
      tween = animateFrame(vars.duration * 1000, (progress) => {
        const eased = easeOut(progress, vars.ease);
        state.value = start + (value - start) * eased;
        transform[property] = state.value;
        applyTransform(target, transform);
      });
    };
  },
  revealReadingSteps(target) {
    const elements = Array.from(target.querySelectorAll<HTMLElement>('li'));
    const states = elements.map(() => ({ y: 34, opacity: 0 }));
    const paint = () => {
      elements.forEach((element, index) => {
        const state = states[index]!;
        element.style.translate = `0 ${state.y}px`;
        element.style.opacity = String(state.opacity);
      });
    };
    paint();
    let tween: PhoneFrameTween | null = null;
    const animate = (shown: boolean) => {
      tween?.cancel();
      const start = states.map(({ y, opacity }) => ({ y, opacity }));
      const staggerMs = shown ? 110 : 0;
      tween = animateFrame(500 + Math.max(0, elements.length - 1) * staggerMs, (progress) => {
        const elapsed = progress * (500 + Math.max(0, elements.length - 1) * staggerMs);
        states.forEach((state, index) => {
          const local = easeOut(Math.min(1, Math.max(0, (elapsed - index * staggerMs) / 500)), 'power2.out');
          state.y = start[index]!.y + ((shown ? 0 : 34) - start[index]!.y) * local;
          state.opacity = start[index]!.opacity + ((shown ? 1 : 0) - start[index]!.opacity) * local;
        });
        paint();
      });
    };
    if (typeof IntersectionObserver === 'undefined') {
      animate(true);
      return () => tween?.cancel();
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      if (entry.isIntersecting) {
        animate(true);
      } else if (entry.boundingClientRect.top > window.innerHeight * .84) {
        animate(false);
      }
    }, { rootMargin: '0px 0px -16%' });
    observer.observe(target);
    return () => {
      observer.disconnect();
      tween?.cancel();
    };
  }
});
