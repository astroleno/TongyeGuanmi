import {
  PH_FIGURE_END_SECONDS,
  phPlaybackProgress
} from '..';

/** Pure reverse media-time mapping retained for frame-map diagnostics. */
export function phonePhReverseMediaTime(
  progress: number,
  duration = PH_FIGURE_END_SECONDS
): number {
  const endpoint = Number.isFinite(duration) && duration > 0
    ? Math.min(PH_FIGURE_END_SECONDS, duration)
    : PH_FIGURE_END_SECONDS;
  return phPlaybackProgress(Math.min(1, Math.max(0, progress))) * endpoint;
}
