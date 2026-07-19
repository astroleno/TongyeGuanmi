import { createPhoneInkAdapter } from './PhoneInkTransition';

export const PhoneHeroPatternTransition = createPhoneInkAdapter({
  id: 'phone-hero-pattern-ink',
  field: { kind: 'radial', origin: { x: 0.5, y: 0.44 }, seed: 'phone-hero-pattern-r5' },
  grade: 'dark'
});

export default PhoneHeroPatternTransition;
