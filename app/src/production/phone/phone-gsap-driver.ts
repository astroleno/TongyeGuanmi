import { gsap } from 'gsap';
import type { PhoneHeroMotionDriver } from './types';

export const phoneHeroMotionDriver: PhoneHeroMotionDriver = Object.freeze({
  set(target, vars) {
    gsap.set(target, vars);
  },
  quickTo(target, property, vars) {
    return gsap.quickTo(target, property, vars);
  }
});
