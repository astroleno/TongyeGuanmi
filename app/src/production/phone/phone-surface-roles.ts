import {
  phoneLayerForSurfaceRole,
  phonePresentationLayerZIndex,
  type PhoneSurfaceRole
} from './phone-presentation-layers';

export type { PhoneSurfaceRole } from './phone-presentation-layers';

/** The projector is the only DOM writer; this module is a pure layer contract. */
export function phoneSurfaceRoleZIndex(role: PhoneSurfaceRole): number {
  return phonePresentationLayerZIndex(phoneLayerForSurfaceRole(role));
}
