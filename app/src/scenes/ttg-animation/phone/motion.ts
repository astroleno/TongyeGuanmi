import {
  INTRA_CHAPTER_DISSOLVE_MS,
  TTG_PLAYBACK_MS
} from '../../../story/timings';

export const PHONE_TTG_LAB_ANIMATION_STOP = TTG_PLAYBACK_MS
  / (TTG_PLAYBACK_MS + INTRA_CHAPTER_DISSOLVE_MS);

export const PHONE_TTG_LAB_DISSOLVE_MS = INTRA_CHAPTER_DISSOLVE_MS;
export const PHONE_TTG_REVERSE_FRAME_COUNT = 75;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Map TTG's decoder-owned media clock into the desktop TTG → Lab timeline. */
export function phoneTtgMediaChapterProgress(mediaProgress: number): number {
  return clamp(mediaProgress) * PHONE_TTG_LAB_ANIMATION_STOP;
}

/** The desktop handoff reserves its final 600 ms for the Lab dissolve. */
export function phoneTtgDissolveChapterProgress(
  dissolveProgress: number,
  direction: 1 | -1
): number {
  const progress = clamp(dissolveProgress);
  const distance = 1 - PHONE_TTG_LAB_ANIMATION_STOP;
  return direction === 1
    ? PHONE_TTG_LAB_ANIMATION_STOP + progress * distance
    : 1 - progress * distance;
}

/** Match the authored 30 fps source instead of issuing redundant 60 fps seeks. */
export function phoneTtgReverseFrameProgress(progress: number): number {
  const clamped = clamp(progress);
  if (clamped <= .001) return 0;
  if (clamped >= .999) return 1;
  const finalFrame = PHONE_TTG_REVERSE_FRAME_COUNT - 1;
  return Math.round(clamped * finalFrame) / finalFrame;
}
