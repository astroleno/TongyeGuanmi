import {
  CRANE_TIMELINE_DURATION_SECONDS,
  CRANE_VIDEO_END_SECONDS
} from '../media';

const FIGURE_START_SECONDS = .5;
const FLOCK_END_SECONDS = 2.5;
const FLOCK_TERMINAL_PROGRESS = (CRANE_VIDEO_END_SECONDS - .08) / CRANE_VIDEO_END_SECONDS;

function clamp(value: number): number { return Math.min(1, Math.max(0, value)); }

/** The desktop figure starts at 0.5s and owns the rest of the 3s timeline. */
export const PHONE_CRANE_FIGURE_MEDIA_SECONDS = Math.max(
  .001,
  CRANE_TIMELINE_DURATION_SECONDS - FIGURE_START_SECONDS
);
/** Desktop plays the safe 2.467s endpoint across the authored 2.5s lane. */
export const PHONE_CRANE_FIGURE_PLAYBACK_RATE = (
  CRANE_VIDEO_END_SECONDS / PHONE_CRANE_FIGURE_MEDIA_SECONDS
);
/** Desktop stretches the shared safe endpoint across the 2.5s flock lane. */
export const PHONE_CRANE_FLOCK_MEDIA_SECONDS = FLOCK_END_SECONDS;
export const PHONE_CRANE_FLOCK_PLAYBACK_RATE = (
  CRANE_VIDEO_END_SECONDS / PHONE_CRANE_FLOCK_MEDIA_SECONDS
);

export function phoneCraneTimelineProgressForFigureMediaProgress(
  rawProgress: number
): number {
  return clamp(
    (FIGURE_START_SECONDS
      + clamp(rawProgress) * PHONE_CRANE_FIGURE_MEDIA_SECONDS)
      / CRANE_TIMELINE_DURATION_SECONDS
  );
}

export function phoneCraneTimelineProgressForFlockMediaProgress(
  rawProgress: number
): number {
  return clamp(
    clamp(rawProgress)
      * PHONE_CRANE_FLOCK_MEDIA_SECONDS
      / CRANE_TIMELINE_DURATION_SECONDS
  );
}

export type PhoneCraneMediaProgress = Readonly<{
  figure: number;
  flock: number;
}>;

/** Pure authored timeline → decoder-lane projection used in both directions. */
export function phoneCraneMediaProgressForTimeline(
  rawProgress: number
): PhoneCraneMediaProgress {
  const authoredSeconds = clamp(rawProgress) * CRANE_TIMELINE_DURATION_SECONDS;
  return {
    figure: clamp(
      (authoredSeconds - FIGURE_START_SECONDS) / PHONE_CRANE_FIGURE_MEDIA_SECONDS
    ),
    flock: clamp(authoredSeconds / PHONE_CRANE_FLOCK_MEDIA_SECONDS)
  };
}

/** Keep the authored camera behind the latest current-generation Canvas pair. */
export function phoneCranePresentedTimelineProgress(
  rawDesired: number,
  direction: 1 | -1,
  figureMedia: number | null,
  flockMedia: number | null,
  rawCurrent: number
): number {
  const desired = clamp(rawDesired);
  const current = clamp(rawCurrent);
  const figureRequired = desired > FIGURE_START_SECONDS / CRANE_TIMELINE_DURATION_SECONDS;
  const flockRequired = direction === 1 ? flockMedia === null || flockMedia < FLOCK_TERMINAL_PROGRESS : desired < FLOCK_END_SECONDS / CRANE_TIMELINE_DURATION_SECONDS;
  if ((figureRequired && figureMedia === null) || (flockRequired && flockMedia === null)) {
    return current;
  }
  const gates = [desired];
  if (figureRequired) gates.push(phoneCraneTimelineProgressForFigureMediaProgress(figureMedia!));
  if (flockRequired) gates.push(phoneCraneTimelineProgressForFlockMediaProgress(flockMedia!));
  const presented = direction === 1 ? Math.min(...gates) : Math.max(...gates);
  return direction === 1 ? Math.max(current, presented) : Math.min(current, presented);
}

function seekVideo(video: HTMLVideoElement | null, progress: number): boolean {
  if (!video) return false;
  video.pause();
  const target = clamp(progress) * CRANE_VIDEO_END_SECONDS;
  if (Math.abs(video.currentTime - target) <= .002) return true;
  try {
    video.currentTime = target;
    return true;
  } catch {
    return false;
  }
}

/** Runtime-driven reverse sampling; readiness still requires both Canvas draws. */
export function seekPhoneCraneReverseFrames(
  figure: HTMLVideoElement | null,
  flock: HTMLVideoElement | null,
  progress: number
): boolean {
  const media = phoneCraneMediaProgressForTimeline(progress);
  return seekVideo(figure, media.figure) && seekVideo(flock, media.flock);
}
