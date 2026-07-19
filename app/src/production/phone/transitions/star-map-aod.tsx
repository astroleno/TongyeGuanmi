import { createPhoneInkAdapter } from './PhoneInkTransition';

export const PhoneStarMapAodTransition = createPhoneInkAdapter({
  id: 'phone-star-map-aod-ink',
  field: { kind: 'horizontal', direction: 'bottom-to-top', seed: 'phone-star-map-aod-r5' },
  grade: 'edge-bright'
});

export default PhoneStarMapAodTransition;
