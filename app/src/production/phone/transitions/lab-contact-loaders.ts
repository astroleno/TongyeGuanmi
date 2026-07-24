import type {
  LabContactPhoneTransitionAdapterModule,
  LabContactTransitionId
} from '../lab-contact-types';
import { loadPhoneTransitionAdapter } from '../module-loaders';

/**
 * Compatibility boundary for v36. It deliberately delegates to the one
 * shared transition cache used by the formal PhoneStoryShell.
 */
export function loadLabContactPhoneTransitionAdapter(
  id: LabContactTransitionId
): Promise<LabContactPhoneTransitionAdapterModule> {
  return loadPhoneTransitionAdapter(id) as Promise<
    LabContactPhoneTransitionAdapterModule
  >;
}
