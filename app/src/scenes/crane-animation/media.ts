import { CRANE_CONTACT_DURATION_MS } from '../../story/timings';

export const CRANE_FIGURE_MEDIA_KEY = 'crane-figure-motion';
export const CRANE_FLOCK_MEDIA_KEY = 'crane-flock-motion';
export const CRANE_PAPER_SRC = new URL('../../../../assets/crane-paper.webp', import.meta.url).href;
export const CRANE_CLOUD_BACK_SRC = new URL('../../../../assets/crane1_cloud2-alpha.webp', import.meta.url).href;
export const CRANE_ARCH_SRC = new URL('../../../../assets/crane1_arch-alpha.webp', import.meta.url).href;
export const CRANE_CLOUD_FRONT_SRC = new URL('../../../../assets/crane1_cloud1-alpha.webp', import.meta.url).href;
export const CRANE_CLOUD_FRONT_SECOND_SRC = new URL('../../../../assets/crane1_cloud-front2-alpha.webp', import.meta.url).href;
export const CRANE_FIGURE_VIDEO_SRC = new URL('../../../../assets/crane-figure-motion.webm', import.meta.url).href;
export const CRANE_FIGURE_HEVC_ALPHA_SRC = new URL('../../../../assets/crane-figure-motion-hevc-alpha.mp4', import.meta.url).href;
export const CRANE_FLOCK_VIDEO_SRC = new URL('../../../../assets/crane-flock-motion.webm', import.meta.url).href;
export const CRANE_FLOCK_HEVC_ALPHA_SRC = new URL('../../../../assets/crane-flock-motion-hevc-alpha.mp4', import.meta.url).href;

export const CRANE_VIDEO_END_SECONDS = 2.467;
export const CRANE_PLAYBACK_MS = CRANE_CONTACT_DURATION_MS;
export const CRANE_MEDIA_PLAYBACK_MS = 2500;
export const CRANE_TIMELINE_DURATION_SECONDS = CRANE_PLAYBACK_MS / 1000;
