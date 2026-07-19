import { PhoneStoryShell } from '../phone/PhoneStoryShell';

/**
 * `?v=16` remains a thin physical-device characterization route while Units
 * 0–6 migrate. It intentionally owns no scene markup, media, or scroll state.
 */
export function PortraitScrollSpike() {
  return <PhoneStoryShell validationMode="v16" />;
}
