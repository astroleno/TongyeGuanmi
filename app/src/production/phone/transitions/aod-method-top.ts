import { phoneAodMethodProgress } from '../aod-autoplay';

/** A named adapter even though its target is document-flow copy, not an Ink surface. */
export const phoneAodMethodTopTransition = {
  id: 'aod-method-top' as const,
  methodProgress: phoneAodMethodProgress
};

export default phoneAodMethodTopTransition;
