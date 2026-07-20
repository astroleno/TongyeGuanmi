import { createPhoneInkAdapter } from './PhoneInkTransition';

export const PhoneStarMapAodTransition = createPhoneInkAdapter({
  id: 'portrait-star-aod-ink',
  field: { kind: 'horizontal', direction: 'bottom-to-top', seed: 'portrait-star-aod-r5' },
  canvasClassName: 'portrait-scroll-spike__ink',
  portraitInk: 'star-aod',
  grade: 'edge-bright'
});

export default PhoneStarMapAodTransition;
