import { gsap } from 'gsap';
import type { PhoneMotionDriver } from './types';

export const phoneMotionDriver: PhoneMotionDriver = Object.freeze({
  set(target, vars) {
    gsap.set(target, vars);
  },
  quickTo(target, property, vars) {
    return gsap.quickTo(target, property, vars);
  },
  revealReadingSteps(target) {
    const tween = gsap.fromTo(
      Array.from(target.querySelectorAll<HTMLElement>('li')),
      { y: 34, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.5,
        ease: 'power2.out',
        stagger: 0.11,
        scrollTrigger: {
          id: 'portrait-spike-reading-steps',
          trigger: target,
          start: 'top 84%',
          toggleActions: 'play none none reverse',
          invalidateOnRefresh: true
        }
      }
    );
    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }
});
