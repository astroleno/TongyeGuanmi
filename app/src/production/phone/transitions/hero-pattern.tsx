import { createPhoneInkAdapter } from './PhoneInkTransition';

export const PhoneHeroPatternTransition = createPhoneInkAdapter({
  id: 'portrait-hero-pattern-ink',
  field: { kind: 'radial', origin: { x: 0.5, y: 0.44 }, seed: 'portrait-hero-pattern-r5' },
  canvasClassName: 'portrait-scroll-spike__ink',
  portraitInk: 'hero-pattern',
  grade: 'dark'
});

export default PhoneHeroPatternTransition;
