import type {
  LabContactPhoneSceneAdapterModule,
  LabContactSceneId
} from '../lab-contact-types';
import { loadPhoneSceneAdapter } from '../module-loaders';

/**
 * Compatibility boundary for the isolated v36 acceptance shell. The shared
 * phone loader owns every literal import, resolved module and retry cache.
 */
export function loadLabContactPhoneSceneAdapter(
  id: LabContactSceneId
): Promise<LabContactPhoneSceneAdapterModule> {
  return loadPhoneSceneAdapter(id) as Promise<LabContactPhoneSceneAdapterModule>;
}
