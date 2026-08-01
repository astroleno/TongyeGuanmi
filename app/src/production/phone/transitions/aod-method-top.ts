export const PHONE_AOD_METHOD_START_PROGRESS = 0.8;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * The authored handoff maps the final AOD fifth to Method's entrance. This
 * belongs to the transition contract, so the presentation plane can read the
 * same cue without importing the media playback implementation.
 */
export function phoneAodMethodProgress(aodProgress: number): number {
  return clamp(
    (clamp(aodProgress) - PHONE_AOD_METHOD_START_PROGRESS)
      / (1 - PHONE_AOD_METHOD_START_PROGRESS)
  );
}

/** A named adapter even though its target is document-flow copy, not an Ink surface. */
export const phoneAodMethodTopTransition = {
  id: 'aod-method-top' as const,
  methodProgress: phoneAodMethodProgress
};

export default phoneAodMethodTopTransition;
