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
    const tween = gsap.to(states, {
      y: 0,
      opacity: 1,
      duration: 0.5,
      ease: 'power2.out',
      stagger: 0.11,
      onUpdate: paint,
      scrollTrigger: {
        id: 'portrait-spike-reading-steps',
        trigger: target,
        start: 'top 84%',
        toggleActions: 'play none none reverse',
        invalidateOnRefresh: true
      }
    });
    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }
});
