import type { PhoneSurfaceRole } from './phone-story-projector';

export type { PhoneSurfaceRole } from './phone-story-projector';

/** The projector is the only DOM writer; this module is a pure layer contract. */
export function phoneSurfaceRoleZIndex(role: PhoneSurfaceRole): 9 | 10 | 11 | 12 {
  switch (role) {
    case 'retained-under-stage':
    case 'retired':
      return 9;
    case 'fixed-current':
      return 10;
    case 'stable':
    case 'candidate-stable':
      return 11;
    case 'transition-source':
    case 'transition-receiver':
      return 12;
  }
}
