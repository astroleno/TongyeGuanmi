import { gsap } from 'gsap/gsap-core';
import type { PhoneMotionDriver } from './types';

type TransformState = {
  x: number;
  y: number;
  yPercent: number;
  scale: number;
};

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
    return gsap.quickTo(state, 'value', {
      ...vars,
      onUpdate() {
        transform[property] = state.value;
        applyTransform(target, transform);
      }
    });
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
    let tween: gsap.core.Tween | null = null;
    const animate = (shown: boolean) => {
      tween?.kill();
      tween = gsap.to(states, {
        y: shown ? 0 : 34,
        opacity: shown ? 1 : 0,
        duration: 0.5,
        ease: 'power2.out',
        stagger: shown ? 0.11 : 0,
        onUpdate: paint
      });
    };
    if (typeof IntersectionObserver === 'undefined') {
      animate(true);
      return () => tween?.kill();
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
      tween?.kill();
    };
  }
});
