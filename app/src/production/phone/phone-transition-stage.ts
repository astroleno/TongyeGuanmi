import type { PhoneStageFrame } from './phone-stage-timeline';

type PhoneTransitionRenderer = Readonly<{
  render(progress: number): void;
}>;

export type PhoneStageTransitionRenderers = Readonly<{
  heroPattern: PhoneTransitionRenderer;
  patternStar: PhoneTransitionRenderer;
  starAod: PhoneTransitionRenderer;
}>;

/**
 * Adjacent ink adapters share scene endpoints. Inactive adapters must render
 * their terminal canvas state before scene ownership clears stale boundaries;
 * only the active adapter may write a boundary after ownership is committed.
 */
export function renderPhoneStageTransitions(
  frame: PhoneStageFrame,
  transitions: PhoneStageTransitionRenderers,
  commitOwnership: () => void
): void {
  if (frame.ownership.key === 'handoff-hero-pattern') {
    transitions.patternStar.render(frame.patternStarProgress);
    transitions.starAod.render(frame.starAodProgress);
    commitOwnership();
    transitions.heroPattern.render(frame.heroPatternProgress);
    return;
  }

  if (frame.ownership.key === 'handoff-pattern-star') {
    transitions.heroPattern.render(frame.heroPatternProgress);
    transitions.starAod.render(frame.starAodProgress);
    commitOwnership();
    transitions.patternStar.render(frame.patternStarProgress);
    return;
  }

  if (frame.ownership.key === 'handoff-star-aod') {
    transitions.heroPattern.render(frame.heroPatternProgress);
    transitions.patternStar.render(frame.patternStarProgress);
    commitOwnership();
    transitions.starAod.render(frame.starAodProgress);
    return;
  }

  transitions.heroPattern.render(frame.heroPatternProgress);
  transitions.patternStar.render(frame.patternStarProgress);
  transitions.starAod.render(frame.starAodProgress);
  commitOwnership();
}
