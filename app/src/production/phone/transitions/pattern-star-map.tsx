import { createPhoneInkAdapter } from './PhoneInkTransition';

export const PhonePatternStarMapTransition = createPhoneInkAdapter({
  id: 'phone-pattern-star-map-ink',
  field: { kind: 'radial', origin: { x: 0.5, y: 0.28 }, seed: 'phone-pattern-star-map-r5' },
  grade: 'dark'
});

export default PhonePatternStarMapTransition;
