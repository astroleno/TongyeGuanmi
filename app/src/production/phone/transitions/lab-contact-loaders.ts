import type {
  LabContactPhoneTransitionAdapterModule,
  LabContactTransitionId
} from '../lab-contact-types';
import type { PhoneTransitionAdapterComponent } from '../types';

/**
 * Transition-side boundary for the Lab → Contact acceptance adapters.
 *
 * This keeps the shell registry independent of concrete story transitions
 * while preserving one lazy chunk per adapter.
 */
export function loadLabContactPhoneTransitionAdapter(
  id: LabContactTransitionId
): Promise<LabContactPhoneTransitionAdapterModule> {
  switch (id) {
    case 'lab-ph':
      return import('../../../transitions/lab-ph/phone').then(({
        PhoneLabPhTransition: Component
      }) => ({ id, Component: Component as unknown as PhoneTransitionAdapterComponent }));
    case 'ph-education':
      return import('../../../transitions/ph-education/phone').then(({
        PhonePhEducationTransition: Component
      }) => ({ id, Component: Component as unknown as PhoneTransitionAdapterComponent }));
    case 'education-crane':
      return import('../../../transitions/education-crane/phone').then(({
        PhoneEducationCraneTransition: Component
      }) => ({ id, Component: Component as unknown as PhoneTransitionAdapterComponent }));
    case 'crane-contact':
      return import('../../../transitions/crane-contact/phone').then(({
        PhoneCraneContactTransition: Component
      }) => ({ id, Component: Component as unknown as PhoneTransitionAdapterComponent }));
  }
}
