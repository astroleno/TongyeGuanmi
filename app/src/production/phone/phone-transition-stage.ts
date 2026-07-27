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
 * Adjacent ink adapters share scene endpoints. This function only renders
 * adapter frames; the snapshot projector alone assigns surface roles.
 */
export function renderPhoneStageTransitions(
  frame: PhoneStageFrame,
  transitions: PhoneStageTransitionRenderers
): void {
  if (frame.ownership.key === 'handoff-hero-pattern') {
    transitions.patternStar.render(frame.patternStarProgress);
    transitions.starAod.render(frame.starAodProgress);
    transitions.heroPattern.render(frame.heroPatternProgress);
    return;
  }

  if (frame.ownership.key === 'handoff-pattern-star') {
    transitions.heroPattern.render(frame.heroPatternProgress);
    transitions.starAod.render(frame.starAodProgress);
    transitions.patternStar.render(frame.patternStarProgress);
    return;
  }

  if (frame.ownership.key === 'handoff-star-aod') {
    transitions.heroPattern.render(frame.heroPatternProgress);
    transitions.patternStar.render(frame.patternStarProgress);
    transitions.starAod.render(frame.starAodProgress);
    return;
  }

  transitions.heroPattern.render(frame.heroPatternProgress);
  transitions.patternStar.render(frame.patternStarProgress);
  transitions.starAod.render(frame.starAodProgress);
}
