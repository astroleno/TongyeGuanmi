import type { CopyCue } from './types';

/** Small runtime projection used by the phone Crane→Contact transition. */
export const CRANE_CONTACT_COPY_CUE = {
  targetScene: 'contact',
  atProgress: 0.8
} as const satisfies CopyCue;
