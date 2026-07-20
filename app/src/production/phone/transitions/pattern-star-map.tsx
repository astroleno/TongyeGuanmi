import { createPhoneInkAdapter } from './PhoneInkTransition';

export const PhonePatternStarMapTransition = createPhoneInkAdapter({
  id: 'portrait-pattern-star-ink',
  field: { kind: 'radial', origin: { x: 0.5, y: 0.28 }, seed: 'portrait-pattern-star-r5' },
  canvasClassName: 'portrait-scroll-spike__ink',
  portraitInk: 'pattern-star',
  grade: 'dark'
});

export default PhonePatternStarMapTransition;
