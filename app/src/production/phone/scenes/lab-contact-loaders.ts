import type {
  LabContactPhoneSceneAdapterModule,
  LabContactSceneId
} from '../lab-contact-types';
import type { PhoneSceneAdapterComponent } from '../types';

/**
 * Scene-side boundary for the Lab → Contact acceptance adapters.
 *
 * `module-loaders.ts` remains a shell registry: scene chunks live behind this
 * adapter boundary so neither the desktop entry nor the phone shell imports
 * any of these production scene implementations eagerly.
 */
export function loadLabContactPhoneSceneAdapter(
  id: LabContactSceneId
): Promise<LabContactPhoneSceneAdapterModule> {
  switch (id) {
    case 'lab':
      return import('../../../scenes/lab/phone/PhoneLab').then(({ PhoneLab: Component }) => ({
        id,
        Component: Component as unknown as PhoneSceneAdapterComponent
      }));
    case 'ph-animation':
      return import('../../../scenes/ph-animation/phone/PhonePh').then(({ PhonePh: Component }) => ({
        id,
        Component: Component as unknown as PhoneSceneAdapterComponent
      }));
    case 'education':
      return import('../../../scenes/education/phone/PhoneEducation').then(({
        PhoneEducation: Component
      }) => ({
        id,
        Component: Component as unknown as PhoneSceneAdapterComponent
      }));
    case 'crane-animation':
      return import('../../../scenes/crane-animation/phone/PhoneCrane').then(({
        PhoneCrane: Component
      }) => ({
        id,
        Component: Component as unknown as PhoneSceneAdapterComponent
      }));
    case 'contact':
      return import('../../../scenes/contact/phone/PhoneContact').then(({
        PhoneContact: Component
      }) => ({
        id,
        Component: Component as unknown as PhoneSceneAdapterComponent
      }));
  }
}
