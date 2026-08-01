import {
  PH_FIGURE_END_SECONDS,
  phPlaybackProgress
} from '..';

/** Runtime-driven reverse playhead; it owns no timer, completion, or reports. */
export function phonePhReverseMediaTime(
  progress: number,
  duration = PH_FIGURE_END_SECONDS
): number {
  const endpoint = Number.isFinite(duration) && duration > 0
    ? Math.min(PH_FIGURE_END_SECONDS, duration)
    : PH_FIGURE_END_SECONDS;
  return phPlaybackProgress(Math.min(1, Math.max(0, progress))) * endpoint;
}

/**
 * Request the authored packed frame for a runtime-supplied reverse sample.
 * Readiness is still proved only by the packed compositor's physical draw.
 */
export function seekPhonePhReverseFrame(
  video: HTMLVideoElement | null,
  progress: number
): boolean {
  if (!video) return false;
  const target = phonePhReverseMediaTime(progress, video.duration);
  video.pause();
  if (Math.abs(video.currentTime - target) <= .002) return true;
  try {
    video.currentTime = target;
    return true;
  } catch {
    return false;
  }
}
